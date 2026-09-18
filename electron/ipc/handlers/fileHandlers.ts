/** @fileoverview File-system and local-file IPC handlers (save/load dialogs,
 *  media import/export, character image cache, etc.). */

import { BrowserWindow, dialog, shell } from "electron";
import fs from "fs/promises";
import path from "path";
import { VENICE_MAX_BODY_BYTES } from "../../../src/shared/limits";
import { redactErrorMessage } from "../../../src/shared/redaction";
import {
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
import { registerPrivilegedIpcChannel } from "./common";
import { getProfileSessionId } from "../../services/profileSession";
import { getCustomProtocolCapabilityManager } from "../../services/customProtocolCapabilities";
import {
  exportMediaBatchAs,
  saveDataUrlAs,
  saveGeneratedMediaAs,
  saveGeneratedMediaBytesAs,
  type BulkExportItem,
} from "../../services/generatedMediaExport";
import {
  classifyGeneratedMediaPersistenceError,
  persistGeneratedMedia,
} from "../../services/generatedMediaStore";
import {
  getGeneratedMediaRecovery,
  retainGeneratedMediaForRecovery,
  retryGeneratedMediaRecovery,
} from "../../services/generatedMediaRecoveryQueue";

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

export function registerFileHandlers(): void {
  registerPrivilegedIpcChannel(
    "app:media:issueCapabilityUrl",
    async (event, input: unknown) => {
      try {
        if (!input || typeof input !== "object") {
          return { ok: false, error: "Invalid capability request." };
        }
        const rec = input as Record<string, unknown>;
        const scheme = rec.scheme;
        const objectId = rec.objectId;
        const resourceUrl = rec.resourceUrl;
        if (scheme !== "venice-media" && scheme !== "venice-tts" && scheme !== "venice-character-cache") {
          return { ok: false, error: "Unsupported capability scheme." };
        }
        if (typeof objectId !== "string" || !/^[a-f0-9]{64}$/.test(objectId)) {
          return { ok: false, error: "Invalid capability object id." };
        }
        const profileId = getProfileSessionId(event.sender);
        const issued = getCustomProtocolCapabilityManager().issue({
          scheme,
          objectId,
          profileId,
          sessionId: String(event.sender.id),
          resourceUrl: typeof resourceUrl === "string" ? resourceUrl : undefined,
        });
        return { ok: true, url: issued.url };
      } catch (err) {
        return { ok: false, error: redactErrorMessage(err) };
      }
    },
    { requireMainFrame: true },
  );

  registerPrivilegedIpcChannel("app:media:persist-generated-image", async (event, input: unknown) => {
    let validatedBytes: Buffer | undefined;
    let validatedMime: string | undefined;
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) {
        return { ok: false, error: "Generated image persistence sender was rejected." };
      }
      if (!input || typeof input !== "object") {
        return { ok: false, error: "Generated image persistence payload was invalid." };
      }
      const dataUrl = (input as Record<string, unknown>).dataUrl;
      if (typeof dataUrl !== "string") {
        return { ok: false, error: "Generated image data must be a base64 data URL." };
      }
      if (dataUrl.length > 50 * 1024 * 1024 * 1.37) {
        return { ok: false, error: "Generated image data is too large." };
      }
      const parsed = parseRoutedImageDataUrl(dataUrl);
      if (!parsed?.mime) {
        return { ok: false, error: "Generated image data URL was invalid or unsupported." };
      }
      const bytes = decodeStrictRoutedBase64(parsed.rawBase64);
      if (!bytes || sniffRoutedImageContentType(bytes) !== parsed.mime) {
        return { ok: false, error: "Generated image bytes did not match the declared content type." };
      }
      validatedBytes = bytes;
      validatedMime = parsed.mime;
      const media = await persistGeneratedMedia(bytes, parsed.mime);
      return { ok: true, media };
    } catch (error) {
      const failure = classifyGeneratedMediaPersistenceError(error);
      const retained = validatedBytes && validatedMime && failure.kind !== "invalid-media"
        ? retainGeneratedMediaForRecovery(validatedBytes, validatedMime)
        : null;
      return {
        ok: false,
        error: failure.message,
        errorKind: failure.kind,
        retryable: failure.retryable,
        recoveryId: retained?.recoveryId,
      };
    }
  });

  registerPrivilegedIpcChannel("app:media:retry-generated-image", async (event, input: unknown) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) {
        return { ok: false, error: "Generated image recovery sender was rejected." };
      }
      const recoveryId = input && typeof input === "object"
        ? (input as Record<string, unknown>).recoveryId
        : undefined;
      if (typeof recoveryId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recoveryId)) {
        return { ok: false, error: "Generated image recovery ID was invalid." };
      }
      const media = await retryGeneratedMediaRecovery(recoveryId);
      return { ok: true, media };
    } catch (error) {
      const failure = classifyGeneratedMediaPersistenceError(error);
      return { ok: false, error: failure.message, errorKind: failure.kind, retryable: failure.retryable };
    }
  });

  registerPrivilegedIpcChannel("app:media:save-generated-recovery", async (event, input: unknown) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) {
        return { ok: false, canceled: false, error: "Generated image recovery export sender was rejected." };
      }
      const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
      const recoveryId = typeof record.recoveryId === "string" ? record.recoveryId : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recoveryId)) {
        return { ok: false, canceled: false, error: "Generated image recovery ID was invalid." };
      }
      const recovery = getGeneratedMediaRecovery(recoveryId);
      if (!recovery) return { ok: false, canceled: false, error: "Generated image recovery data expired or is unavailable." };
      return await saveGeneratedMediaBytesAs({
        bytes: recovery.bytes,
        mimeType: recovery.mimeType,
        suggestedName: typeof record.suggestedName === "string" ? record.suggestedName : undefined,
      });
    } catch (error) {
      return { ok: false, canceled: false, error: redactErrorMessage(error) };
    }
  });

  registerPrivilegedIpcChannel("app:media:save-generated", async (event, input: unknown) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) {
        return { ok: false, canceled: false, error: "Generated media export sender was rejected." };
      }
      if (!input || typeof input !== "object") {
        return { ok: false, canceled: false, error: "Generated media export payload was invalid." };
      }
      const record = input as Record<string, unknown>;
      const result = await saveGeneratedMediaAs({
        mediaId: typeof record.mediaId === "string" ? record.mediaId : "",
        suggestedName: typeof record.suggestedName === "string" ? record.suggestedName : undefined,
      });
      return result;
    } catch (err) {
      return { ok: false, canceled: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("app:media:save-data-url", async (event, input: unknown) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) {
        return { ok: false, canceled: false, error: "Save Data URL sender was rejected." };
      }
      if (!input || typeof input !== "object") {
        return { ok: false, canceled: false, error: "Save Data URL payload was invalid." };
      }
      const record = input as Record<string, unknown>;
      return await saveDataUrlAs({
        dataUrl: typeof record.dataUrl === "string" ? record.dataUrl : "",
        suggestedName: typeof record.suggestedName === "string" ? record.suggestedName : undefined,
      });
    } catch (err) {
      return { ok: false, canceled: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("app:media:export-files", async (event, input: unknown) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) {
        return { ok: false, canceled: false, succeeded: [], failed: [], error: "Export files sender was rejected." };
      }
      if (!input || typeof input !== "object") {
        return { ok: false, canceled: false, succeeded: [], failed: [], error: "Export files payload was invalid." };
      }
      const record = input as Record<string, unknown>;
      const rawItems = record.items;
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return { ok: true, canceled: false, succeeded: [], failed: [] };
      }
      const items: BulkExportItem[] = rawItems.map((raw: unknown) => {
        const it = (raw ?? {}) as Record<string, unknown>;
        return {
          itemId: typeof it.itemId === "string" ? it.itemId : "",
          mediaId: typeof it.mediaId === "string" ? it.mediaId : undefined,
          dataUrl: typeof it.dataUrl === "string" ? it.dataUrl : undefined,
          mimeType: typeof it.mimeType === "string" ? it.mimeType : undefined,
          suggestedName: typeof it.suggestedName === "string" ? it.suggestedName : "venice-forge-export",
        };
      });
      return await exportMediaBatchAs({ items, ownerWindow: owner });
    } catch (err) {
      return { ok: false, canceled: false, succeeded: [], failed: [], error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel(
    "app:saveJsonFile",
    async (_event, data: unknown, defaultPath: unknown) => {
    try {
      if (typeof data !== "string") throw new Error("Export data must be a string.");
      if (Buffer.byteLength(data, "utf-8") > MAX_JSON_FILE_BYTES) {
        throw new Error("Export data is too large.");
      }
      // Strip any redundant trailing extension so macOS doesn't double-tag the
      // file in the save dialog (e.g. `venice-forge-2026-08-26.vfbackup.json`
      // → `venice-forge-2026-08-26.vfbackup`). The dialog also enforces a
      // single canonical extension below, so this is purely cosmetic — the
      // file's contents are unaffected.
      const requested =
        typeof defaultPath === "string" ? defaultPath : "venice-forge-export.json";
      let sanitizedFilename = path.basename(requested);
      if (sanitizedFilename.toLowerCase().endsWith(".vfbackup.json")) {
        sanitizedFilename = sanitizedFilename.slice(0, -".json".length);
      }
      const ext = path.extname(sanitizedFilename).slice(1) || "json";
      const filterName = ext === "vfbackup" ? "Venice Forge Backup" : "JSON";
      // verify-no-native-dialogs: allow — intentional save dialog for export
      const result = await dialog.showSaveDialog({
        title: "Export Venice Forge data",
        defaultPath: sanitizedFilename,
        filters: [{ name: filterName, extensions: [ext] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      await fs.writeFile(result.filePath, data, { encoding: "utf-8", mode: 0o600 });
      return { ok: true, canceled: false, filePath: result.filePath };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
    },
    { requireMainFrame: true },
  );

  registerPrivilegedIpcChannel("app:saveYamlFile", async (_event, data: unknown, defaultPath: unknown) => {
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
  }, { requireMainFrame: true });

  registerPrivilegedIpcChannel("app:loadYamlFile", async () => {
    try {
      // verify-no-native-dialogs: allow — intentional open dialog for theme import
      const result = await dialog.showOpenDialog({
        title: "Import Venice Forge theme",
        filters: [{ name: "YAML", extensions: ["yaml", "yml"] }],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
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
  }, { requireMainFrame: true });

  registerPrivilegedIpcChannel("app:loadJsonFile", async () => {
    try {
      // verify-no-native-dialogs: allow — intentional open dialog for data import
      const result = await dialog.showOpenDialog({
        title: "Import Venice Forge data",
        filters: [
          { name: "Venice Forge Data", extensions: ["json", "vfbackup"] }
        ],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
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
  }, { requireMainFrame: true });


  // Media Studio: read a file from an allowlisted directory (Downloads,
  // Documents, Desktop, or Pictures/Venice Forge) and return it as a
  // data URL plus metadata. The renderer uses this to import a previously
  // generated image that was not saved to IDB.
  registerPrivilegedIpcChannel("app:media:import", async (_event, input: unknown) => {
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
  registerPrivilegedIpcChannel("app:media:reveal", async (_event, input: unknown) => {
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
  registerPrivilegedIpcChannel("app:media:meta", async (_event, input: unknown) => {
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
  registerPrivilegedIpcChannel("app:media:thumb", async (_event, input: unknown) => {
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
  registerPrivilegedIpcChannel("app:characterImage:get", async (event, input: unknown) => {
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
      let playableUrl = result.url;
      const cacheMatch = typeof playableUrl === "string" ? /^venice-character-cache:\/\/([a-f0-9]{64})$/i.exec(playableUrl) : null;
      if (cacheMatch) {
        try {
          playableUrl = getCustomProtocolCapabilityManager().issue({
            scheme: "venice-character-cache",
            objectId: cacheMatch[1],
            profileId: getProfileSessionId(event.sender),
            sessionId: String(event.sender.id),
            resourceUrl: playableUrl,
          }).url;
        } catch {
          /* keep stable URL if issue fails; protocol will 403 originless */
        }
      }
      return { ok: true, url: playableUrl, contentType: result.detectedFormat, bytes: result.bytes };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("app:characterImage:clearCache", async () => {
    try {
      const result = await clearCharacterImageCache();
      if (!result.ok) return { ok: false, error: redactErrorMessage(result.error) };
      return { ok: true, deletedCount: result.deletedCount };
    } catch (err) {
      return { ok: false, deletedCount: 0, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("app:characterImage:inventory", async () => {
    try {
      const inventory = await getCharacterImageCacheInventory();
      return { ok: true, ...inventory };
    } catch (err) {
      return { ok: false, count: 0, totalBytes: 0, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("app:openConversationsFolder", async (event) => {
    const { getProfileConversationsDir } = await import("../../services/conversationVault");
    await shell.openPath(getProfileConversationsDir(getProfileSessionId(event.sender)));
    return { ok: true };
  });
}
