/** @fileoverview File-system and local-file IPC handlers (save/load dialogs,
 *  media import/export, character image cache, etc.). */

import { app, dialog, shell } from "electron";
import fs from "fs/promises";
import path from "path";
import { VENICE_MAX_BODY_BYTES } from "../../../src/shared/limits";
import { redactErrorMessage } from "../../../src/shared/redaction";
import {
  exportMedia,
  generateMediaThumb,
  importMediaFromPath,
  readMediaMeta,
  revealMediaInFolder,
} from "../../services/mediaService";
import {
  clearCharacterImageCache,
  getCachedCharacterImage,
  getCharacterImageCacheInventory,
} from "../../services/characterImageCache";
import { registerIpcChannel } from "./common";

/** Maximum size in bytes for JSON import and export files. */
const MAX_JSON_FILE_BYTES = VENICE_MAX_BODY_BYTES;

const ROUTED_IMAGE_EXTENSIONS_BY_MIME: Record<string, readonly string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

function parseRoutedImageDataUrl(value: string): { mime: string | null; rawBase64: string } | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(value.trim());
  if (!match) return { mime: null, rawBase64: value };
  const mime = match[1].toLowerCase();
  if (!Object.hasOwn(ROUTED_IMAGE_EXTENSIONS_BY_MIME, mime)) return null;
  return { mime, rawBase64: match[2] };
}

function decodeStrictRoutedBase64(value: string): Buffer | null {
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const buffer = Buffer.from(compact, "base64");
  if (buffer.length === 0 || buffer.toString("base64") !== compact) return null;
  return buffer;
}

function sniffRoutedImageContentType(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";
  return null;
}

function validateRoutedImageData(base64Data: string, ext: string): { ok: true; buffer: Buffer } | { ok: false; error: string } {
  const parsed = parseRoutedImageDataUrl(base64Data);
  if (!parsed) return { ok: false, error: "Image data URL MIME type is not supported." };
  const buffer = decodeStrictRoutedBase64(parsed.rawBase64);
  if (!buffer) return { ok: false, error: "Image data is not valid base64." };
  const contentType = sniffRoutedImageContentType(buffer);
  if (!contentType) return { ok: false, error: "Decoded payload is not a supported image." };
  if (parsed.mime && parsed.mime !== contentType) {
    return { ok: false, error: "Image data URL MIME type does not match decoded bytes." };
  }
  if (!ROUTED_IMAGE_EXTENSIONS_BY_MIME[contentType]?.includes(ext)) {
    return { ok: false, error: "Filename extension does not match decoded image type." };
  }
  return { ok: true, buffer };
}

/** Safe image extensions for the saveRoutedImage IPC handler.
 *  Executable, script, archive, document, and video extensions are rejected.
 */
const SAVE_ROUTED_IMAGE_ALLOWED_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".webp",
]);
const SAVE_ROUTED_IMAGE_BLOCKED_EXTS = new Set([
  ".exe", ".bat", ".cmd", ".ps1", ".sh", ".js", ".mjs", ".cjs",
  ".app", ".dmg", ".zip", ".7z", ".pdf", ".html", ".htm",
]);

export function registerFileHandlers(): void {
  registerIpcChannel("app:saveJsonFile", async (_event, data: unknown, defaultPath: unknown) => {
    try {
      if (typeof data !== "string") throw new Error("Export data must be a string.");
      if (Buffer.byteLength(data, "utf-8") > MAX_JSON_FILE_BYTES) {
        throw new Error("Export data is too large.");
      }
      const sanitizedFilename = path.basename(
        typeof defaultPath === "string" ? defaultPath : "venice-forge-export.json"
      );
      // verify-no-native-dialogs: allow — intentional save dialog for export
      const result = await dialog.showSaveDialog({
        title: "Export Venice Forge data",
        defaultPath: sanitizedFilename,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      await fs.writeFile(result.filePath, data, { encoding: "utf-8", mode: 0o600 });
      return { ok: true, canceled: false };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("app:saveYamlFile", async (_event, data: unknown, defaultPath: unknown) => {
    try {
      if (typeof data !== "string") throw new Error("Export data must be a string.");
      if (Buffer.byteLength(data, "utf-8") > MAX_JSON_FILE_BYTES) {
        throw new Error("Export data is too large.");
      }
      const sanitizedFilename = path.basename(
        typeof defaultPath === "string" ? defaultPath : "theme.yaml"
      );
      // verify-no-native-dialogs: allow — intentional save dialog for theme export
      const result = await dialog.showSaveDialog({
        title: "Export Venice Forge theme",
        defaultPath: sanitizedFilename,
        filters: [{ name: "YAML", extensions: ["yaml", "yml"] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      await fs.writeFile(result.filePath, data, { encoding: "utf-8", mode: 0o600 });
      return { ok: true, canceled: false };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("app:saveRoutedImage", async (_event, base64Data: unknown, filename: unknown, subfolder: unknown) => {
    try {
      if (typeof base64Data !== "string") throw new Error("Image data must be a string.");
      if (typeof filename !== "string") throw new Error("Filename must be a string.");
      if (typeof subfolder !== "string") throw new Error("Subfolder must be a string.");

      const dataSize = base64Data.length;
      if (dataSize > 50 * 1024 * 1024 * 1.37) {
        throw new Error("Image data is too large.");
      }

      const baseDir = path.join(app.getPath("pictures"), "Venice Forge");
      const resolvedBase = path.resolve(baseDir);

      const cleanSub = subfolder.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!cleanSub || cleanSub === ".." || cleanSub === ".") {
        throw new Error("Invalid subfolder name.");
      }
      const cleanFilename = path.basename(filename).replace(/[^a-zA-Z0-9_.-]/g, "_");

      const ext = path.extname(cleanFilename).toLowerCase();
      if (SAVE_ROUTED_IMAGE_BLOCKED_EXTS.has(ext)) {
        throw new Error(`Extension "${ext}" is not allowed for security reasons.`);
      }
      if (!SAVE_ROUTED_IMAGE_ALLOWED_EXTS.has(ext)) {
        throw new Error(`Extension "${ext}" is not in the allowed list. Use: ${[...SAVE_ROUTED_IMAGE_ALLOWED_EXTS].join(", ")}.`);
      }

      const targetDir = path.join(resolvedBase, cleanSub);
      const targetPath = path.join(targetDir, cleanFilename);

      const relative = path.relative(resolvedBase, targetPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Path traversal detected.");
      }

      const validated = validateRoutedImageData(base64Data, ext);
      if (!validated.ok) throw new Error(validated.error);

      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(targetPath, validated.buffer);

      return { ok: true, filePath: targetPath };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("app:loadYamlFile", async () => {
    try {
      // verify-no-native-dialogs: allow — intentional open dialog for theme import
      const result = await dialog.showOpenDialog({
        title: "Import Venice Forge theme",
        filters: [{ name: "YAML", extensions: ["yaml", "yml"] }],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths[0]) return { ok: true, canceled: true };
      const fd = await fs.open(result.filePaths[0], "r");
      try {
        const fstat = await fd.stat();
        if (fstat.size > MAX_JSON_FILE_BYTES) {
          throw new Error("Import file is too large.");
        }
        const data = await fd.readFile({ encoding: "utf-8" });
        return { ok: true, canceled: false, data };
      } finally {
        await fd.close();
      }
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("app:loadJsonFile", async () => {
    try {
      // verify-no-native-dialogs: allow — intentional open dialog for data import
      const result = await dialog.showOpenDialog({
        title: "Import Venice Forge data",
        filters: [{ name: "JSON", extensions: ["json"] }],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths[0]) return { ok: true, canceled: true };
      const fd = await fs.open(result.filePaths[0], "r");
      try {
        const fstat = await fd.stat();
        if (fstat.size > MAX_JSON_FILE_BYTES) {
          throw new Error("Import file is too large.");
        }
        const data = await fd.readFile({ encoding: "utf-8" });
        return { ok: true, canceled: false, data };
      } finally {
        await fd.close();
      }
    } catch (err) {
      return { ok: false, canceled: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("app:readLocalFile", async () => {
    try {
      // verify-no-native-dialogs: allow — intentional open dialog for text attachment
      const result = await dialog.showOpenDialog({
        title: "Import text attachment",
        properties: ["openFile"],
        filters: [
          { name: "Text attachments", extensions: ["txt", "md", "json", "csv", "yaml", "yml"] },
        ],
      });
      if (result.canceled || !result.filePaths[0]) return { ok: true, canceled: true };

      const selected = result.filePaths[0];
      const base = path.basename(selected);
      if (base.startsWith(".")) return { ok: false, error: "Hidden files are not importable." };

      const ext = path.extname(base).toLowerCase();
      if (!new Set([".txt", ".md", ".json", ".csv", ".yaml", ".yml"]).has(ext)) {
        return { ok: false, error: "Unsupported attachment type." };
      }

      // Open first, then fstat the same file descriptor to prevent TOCTOU between
      // the stat and read calls (a symlink or file swap between those steps is blocked).
      const MAX_TEXT_ATTACHMENT_BYTES = 256 * 1024;
      let fh: Awaited<ReturnType<typeof fs.open>> | null = null;
      try {
        fh = await fs.open(selected, "r");
        const stat = await fh.stat();
        if (!stat.isFile()) {
          return { ok: false, error: "Not a regular file." };
        }
        if (stat.size > MAX_TEXT_ATTACHMENT_BYTES) {
          return { ok: false, error: `File too large (${stat.size} bytes). Max: ${MAX_TEXT_ATTACHMENT_BYTES} bytes.` };
        }
        const content = await fh.readFile({ encoding: "utf-8" });
        return { ok: true, content, filename: base };
      } finally {
        await fh?.close().catch(() => undefined);
      }
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  // Media Studio: export a base64-encoded image to disk. The destination
  // directory is hard-locked to <Pictures>/Venice Forge/<subfolder>/, with
  // both the subfolder slug and filename sanitized and traversal-checked.
  registerIpcChannel("app:media:export", async (_event, input: unknown) => {
    try {
      if (!input || typeof input !== "object") {
        return { ok: false, error: "Export payload must be an object." };
      }
      const record = input as Record<string, unknown>;
      const result = await exportMedia({
        base64Data: typeof record.base64Data === "string" ? record.base64Data : "",
        filename: typeof record.filename === "string" ? record.filename : "",
        subfolder: typeof record.subfolder === "string" ? record.subfolder : undefined,
        dryRun: record.dryRun === true,
      });
      if (!result.ok) return { ok: false, error: redactErrorMessage(result.error) };
      return { ok: true, filePath: result.filePath, canceled: result.canceled };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  // Media Studio: read a file from an allowlisted directory (Downloads,
  // Documents, Desktop, or Pictures/Venice Forge) and return it as a
  // data URL plus metadata. The renderer uses this to import a previously
  // generated image that was not saved to IDB.
  registerIpcChannel("app:media:import", async (_event, input: unknown) => {
    try {
      if (!input || typeof input !== "object") {
        return { ok: false, error: "Import payload must be an object." };
      }
      const record = input as Record<string, unknown>;
      const result = await importMediaFromPath({
        filePath: typeof record.filePath === "string" ? record.filePath : "",
      });
      if (!result.ok) return { ok: false, error: redactErrorMessage(result.error) };
      return {
        ok: true,
        canceled: result.canceled ?? false,
        dataUrl: result.dataUrl,
        filePath: result.filePath,
        filename: result.filename,
        bytes: result.bytes,
        contentType: result.contentType,
      };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  // Media Studio: reveal a file in the OS file manager. The path must be
  // inside one of the reveal-safe base directories (Pictures/Venice Forge,
  // Desktop, Downloads, Documents, or the userData thumb cache).
  registerIpcChannel("app:media:reveal", async (_event, input: unknown) => {
    try {
      if (!input || typeof input !== "object") {
        return { ok: false, error: "Reveal payload must be an object." };
      }
      const record = input as Record<string, unknown>;
      const result = await revealMediaInFolder({
        filePath: typeof record.filePath === "string" ? record.filePath : "",
      });
      if (!result.ok) return { ok: false, error: redactErrorMessage(result.error) };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  // Media Studio: filesystem metadata for a reveal-safe path. The renderer
  // uses this to display the on-disk file size / modification time and to
  // confirm the file is still present after an export.
  registerIpcChannel("app:media:meta", async (_event, input: unknown) => {
    try {
      if (!input || typeof input !== "object") {
        return { ok: false, error: "Meta payload must be an object." };
      }
      const record = input as Record<string, unknown>;
      const result = await readMediaMeta({
        filePath: typeof record.filePath === "string" ? record.filePath : "",
      });
      if (!result.ok) return { ok: false, error: redactErrorMessage(result.error) };
      return {
        ok: true,
        filePath: result.filePath,
        bytes: result.bytes,
        mtime: result.mtime,
        isFile: result.isFile,
      };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  // Media Studio: generate (or return cached) thumbnail for a sha256-keyed
  // image. Returns a file:// URL the renderer can drop into an <img> src.
  registerIpcChannel("app:media:thumb", async (_event, input: unknown) => {
    try {
      if (!input || typeof input !== "object") {
        return { ok: false, error: "Thumb payload must be an object." };
      }
      const record = input as Record<string, unknown>;
      const result = await generateMediaThumb({
        sha256: typeof record.sha256 === "string" ? record.sha256 : "",
        source: typeof record.source === "string" ? record.source : "",
        maxDimension: typeof record.maxDimension === "number" ? record.maxDimension : undefined,
      });
      if (!result.ok) return { ok: false, error: redactErrorMessage(result.error) };
      return { ok: true, filePath: result.filePath, url: result.url };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  // Character avatar image cache: fetch and cache a Venice character photo
  // and return a file:// URL. The renderer never loads remote URLs directly.
  registerIpcChannel("app:characterImage:get", async (_event, input: unknown) => {
    try {
      let url = "";
      if (typeof input === "string") {
        url = input;
      } else if (input && typeof input === "object") {
        const record = input as Record<string, unknown>;
        if (typeof record.url === "string") {
          url = record.url;
        }
      }
      if (!url) return { ok: false, error: "Missing image URL." };
      const result = await getCachedCharacterImage(url);
      if (!result.ok) return { ok: false, error: redactErrorMessage(result.error) };
      return { ok: true, url: result.url, contentType: result.contentType, bytes: result.bytes };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("app:characterImage:clearCache", async () => {
    try {
      const result = await clearCharacterImageCache();
      if (!result.ok) return { ok: false, error: redactErrorMessage(result.error) };
      return { ok: true, deletedCount: result.deletedCount };
    } catch (err) {
      return { ok: false, deletedCount: 0, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("app:characterImage:inventory", async () => {
    try {
      const inventory = await getCharacterImageCacheInventory();
      return { ok: true, ...inventory };
    } catch (err) {
      return { ok: false, count: 0, totalBytes: 0, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("app:openConversationsFolder", async () => {
    const { CONVERSATIONS_DIR } = await import("../../services/conversationVault");
    await shell.openPath(CONVERSATIONS_DIR);
    return { ok: true };
  });
}
