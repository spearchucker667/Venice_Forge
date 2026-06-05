/** @fileoverview Registers IPC handlers for Venice API requests, API key
 *  management, file dialogs, and application diagnostics. */

import { app, dialog, ipcMain, shell, type WebContents } from "electron";
import type { ConversationRecordV1 } from "../../src/types/conversationVault";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";

interface LookupResult {
  address: string;
  family: number;
}
import { isPrivateHostname } from "../utils/urlSecurity";
import {
  deleteApiKey,
  deleteJinaApiKey,
  getJinaApiKey,
  getSecureStoreStatus,
  isApiKeyConfigured,
  isJinaApiKeyConfigured,
  setApiKey,
  setJinaApiKey,
} from "../services/secureStore";
import { getLastApiError, getLogsDir, logError, openLogsFolder } from "../services/logger";
import { abortVeniceRequest, performVeniceRequest, readResponseError } from "../services/veniceClient";
import {
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
} from "../services/chatStorage";
import { validateApiKeyInput, validateVeniceIpcRequest } from "./validation";
import { redactErrorMessage } from "../../src/services/redaction";
import { registerUpdateHandlers } from "./updates";
import { VENICE_MAX_BODY_BYTES } from "../../src/shared/limits";
import { assessChildExploitationSafety, recordDecision, SafetyGuardBlockedError } from "../../src/shared/safety";
import type { Conversation } from "../../src/types/conversation";
import {
  exportConfigTemplate,
  getPaths,
  getSanitizedConfig,
  getStatus as getConfigStatus,
  initializeConfig,
  loadMergedThemes,
  openConfigFolder,
  reloadConfig,
  resetSecureStoreKeys,
  writeSanitizedConfig,
} from "../services/configService";

/** Maximum size in bytes for JSON import and export files. */
const MAX_JSON_FILE_BYTES = VENICE_MAX_BODY_BYTES;

/** Safely sends a payload to a renderer process, returning false if the
 *  WebContents has already been destroyed.
 */
function safeSendToRenderer(sender: WebContents, channel: string, payload: unknown): boolean {
  if (sender.isDestroyed()) return false;
  try { sender.send(channel, payload); return true; } catch { return false; }
}

/** Tests connectivity to the Venice API using the stored API key.
 *  @returns A result object indicating success or failure with a message.
 */
async function testVeniceConnection(): Promise<{ ok: boolean; status?: number; message: string }> {
  if (!isApiKeyConfigured()) {
    return { ok: false, message: "No API key configured." };
  }
  try {
    const response = await performVeniceRequest({ endpoint: "/models", method: "GET" });
    return {
      ok: response.ok,
      status: response.status,
      message: response.ok ? "Connection successful" : readResponseError(response),
    };
  } catch (err) {
    return { ok: false, status: 0, message: redactErrorMessage(err) };
  }
}

/** Registers all IPC handlers used by the renderer process. */
export function registerIpcHandlers(): void {
  registerUpdateHandlers();

  ipcMain.handle("venice:request", async (_event, input: unknown) => {
    try {
      const request = validateVeniceIpcRequest(input);
      const decision = assessChildExploitationSafety({ endpoint: request.endpoint, method: request.method, payload: request.body, source: "ipc" });
      recordDecision(decision);
      if (!decision.allow || decision.action === "block") {
        return {
          ok: false,
          status: 451,
          statusText: "Blocked by local safety guard",
          headers: {},
          body: {
            error: decision.userMessage,
            reasonCode: decision.reasonCode,
            category: decision.category,
            severity: decision.severity,
          },
          contentType: "application/json",
        };
      }
      return await performVeniceRequest(request);
    } catch (err) {
      if (err instanceof SafetyGuardBlockedError) {
        return {
          ok: false,
          status: 451,
          statusText: "Blocked by local safety guard",
          headers: {},
          body: {
            error: err.decision.userMessage,
            reasonCode: err.decision.reasonCode,
            category: err.decision.category,
            severity: err.decision.severity,
          },
          contentType: "application/json",
        };
      }
      const message = redactErrorMessage(err);
      logError("Venice IPC request failed", message);
      return {
        ok: false,
        status: 0,
        statusText: "Local transport error",
        headers: {},
        body: { error: message },
        contentType: "application/json",
      };
    }
  });

  ipcMain.handle("venice:streamChat", async (event, input: unknown) => {
    try {
      const request = validateVeniceIpcRequest(input);
      if (request.endpoint !== "/chat/completions" || request.method !== "POST") {
        throw new Error("Streaming is only available for POST /chat/completions.");
      }
      const decision = assessChildExploitationSafety({ endpoint: request.endpoint, method: request.method, payload: request.body, source: "ipc" });
      recordDecision(decision);
      if (!decision.allow || decision.action === "block") {
        return {
          ok: false,
          status: 451,
          statusText: "Blocked by local safety guard",
          headers: {},
          body: {
            error: decision.userMessage,
            reasonCode: decision.reasonCode,
            category: decision.category,
            severity: decision.severity,
          },
          contentType: "application/json",
        };
      }
      if (!request.signalId) {
        request.signalId = crypto.randomUUID();
      }
      return await performVeniceRequest(request, {
        onDelta: (chunk) => {
          safeSendToRenderer(event.sender, "venice:streamDelta", {
            signalId: request.signalId,
            delta: chunk.content,
            reasoning: chunk.reasoning,
          });
        },
      });
    } catch (err) {
      if (err instanceof SafetyGuardBlockedError) {
        return {
          ok: false,
          status: 451,
          statusText: "Blocked by local safety guard",
          headers: {},
          body: {
            error: err.decision.userMessage,
            reasonCode: err.decision.reasonCode,
            category: err.decision.category,
            severity: err.decision.severity,
          },
          contentType: "application/json",
        };
      }
      const message = redactErrorMessage(err);
      logError("Venice stream request failed", message);
      return {
        ok: false,
        status: 0,
        statusText: "Local transport error",
        headers: {},
        body: { error: message },
        contentType: "application/json",
      };
    }
  });

  ipcMain.handle("venice:abort", (_event, signalId: unknown) => {
    if (typeof signalId !== "string" || signalId.length > 128) return { ok: false };
    return abortVeniceRequest(signalId);
  });

  ipcMain.handle("apiKey:isConfigured", () => isApiKeyConfigured());

  ipcMain.handle("apiKey:set", (_event, key: unknown) => {
    try {
      const trimmed = validateApiKeyInput(key);
      setApiKey(trimmed);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("apiKey:delete", () => {
    try {
      deleteApiKey();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("apiKey:test", () => testVeniceConnection());

  ipcMain.handle("jinaApiKey:isConfigured", () => isJinaApiKeyConfigured());

  ipcMain.handle("jinaApiKey:set", (_event, key: unknown) => {
    try {
      const trimmed = typeof key === "string" ? key.trim() : "";
      if (!trimmed) throw new Error("Enter a Jina API key before saving.");
      if (trimmed.length > 512) throw new Error("Jina API key is too long.");
      setJinaApiKey(trimmed);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("jinaApiKey:delete", () => {
    try {
      deleteJinaApiKey();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("jina:request", async (_event, input: unknown) => {
    try {
      const request = input as { url?: unknown; headers?: unknown; timeoutMs?: unknown };
      if (typeof request.url !== "string") {
        return { ok: false, status: 400, error: "Missing Jina request URL." };
      }

      const parsed = new URL(request.url);
      const allowedHosts = ["r.jina.ai", "s.jina.ai"];
      if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname)) {
        return { ok: false, status: 403, error: "Only Jina Reader/Search HTTPS endpoints are allowed." };
      }

      const decision = assessChildExploitationSafety({ endpoint: request.url, method: "GET", text: decodeURIComponent(request.url), source: "ipc" });
      recordDecision(decision);
      if (!decision.allow || decision.action === "block") {
        return {
          ok: false,
          status: 451,
          error: decision.userMessage,
        };
      }

      const headers: Record<string, string> = {};
      if (request.headers && typeof request.headers === "object" && !Array.isArray(request.headers)) {
        for (const [key, value] of Object.entries(request.headers as Record<string, unknown>)) {
          if (typeof value === "string" && !/^authorization$/i.test(key)) {
            headers[key] = value;
          }
        }
      }

      const jinaKey = (() => { try { return getJinaApiKey(); } catch { return null; } })();
      if (jinaKey) headers["Authorization"] = `Bearer ${jinaKey}`;

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        typeof request.timeoutMs === "number" && request.timeoutMs > 0
          ? Math.min(request.timeoutMs, 180000)
          : 30000
      );

      try {
        const response = await fetch(parsed.toString(), {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") || "";
        const body = contentType.includes("application/json")
          ? await response.json().catch(() => null)
          : await response.text();

        return {
          ok: response.ok,
          status: response.status,
          body,
          contentType,
          error: response.ok ? undefined : `Jina returned ${response.status}`,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      return { ok: false, status: 0, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("jinaApiKey:test", async () => {
    const jinaKey = (() => {
      try {
        return getJinaApiKey();
      } catch { return null; }
    })();
    try {
      const headers: Record<string, string> = {};
      if (jinaKey) headers["Authorization"] = `Bearer ${jinaKey}`;
      const response = await fetch("https://r.jina.ai/https://example.com", { headers, method: "GET" });
      return {
        ok: response.ok,
        status: response.status,
        message: response.ok ? "Jina connection successful" : `Jina returned ${response.status}`,
      };
    } catch (err) {
      return { ok: false, status: 0, message: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("app:proxyScrape", async (_event, url: unknown) => {
    try {
      if (typeof url !== "string") {
        return { ok: false, error: "Missing or invalid URL" };
      }

      const decision = assessChildExploitationSafety({ endpoint: url, method: "GET", text: decodeURIComponent(url), source: "ipc" });
      recordDecision(decision);
      if (!decision.allow || decision.action === "block") {
        return { ok: false, error: decision.userMessage };
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { ok: false, error: "Invalid URL format" };
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, error: "Only http/https allowed" };
      }

      if (isPrivateHostname(parsed.hostname)) {
        return { ok: false, error: "Access to private hostnames blocked" };
      }

      let lookupResults: LookupResult[];
      try {
        // SECURITY: use { all: true, verbatim: true } to enumerate every A/AAAA
        // record. A hostname with a public A record and a private AAAA record
        // would otherwise be reachable by clients on networks that prefer AAAA
        // (most modern OSes) and bypass the private-IP check on the A.
        lookupResults = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
      } catch {
        return { ok: false, error: "DNS lookup failed" };
      }

      for (const r of lookupResults) {
        if (isPrivateHostname(r.address)) {
          return { ok: false, error: "Access to private IPs blocked" };
        }
      }
      const lookupResult = lookupResults[0];

      const scrapeResult = await new Promise<{
        status: number;
        finalUrl: string;
        contentType: string;
        body: string;
      }>((resolve, reject) => {
        const client = parsed.protocol === "https:" ? https : http;
        const request = client.request(
          {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || undefined,
            path: `${parsed.pathname}${parsed.search}`,
            method: "GET",
            timeout: 15000,
            headers: {
              Accept: "text/html, text/plain, application/xhtml+xml, application/json",
              Host: parsed.host,
            },
            lookup: (_hostname, _options, callback) => {
              callback(null, lookupResult.address, lookupResult.family);
            },
          },
          (response) => {
            const status = response.statusCode || 0;
            if (status >= 300 && status < 400) {
              response.destroy();
              reject(new Error("Redirects are blocked by SSRF protection."));
              return;
            }

            const contentType = String(response.headers["content-type"] || "");
            const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/xhtml+xml", "application/json"];
            const allowed = ALLOWED_CONTENT_TYPES.some((t) => contentType.toLowerCase().includes(t));
            if (!allowed) {
              response.destroy();
              reject(new Error("Content-Type not allowed"));
              return;
            }

            const chunks: Buffer[] = [];
            let bytesRead = 0;
            const maxBytes = 2 * 1024 * 1024;

            response.on("data", (chunk: Buffer) => {
              bytesRead += chunk.length;
              if (bytesRead > maxBytes) {
                response.destroy(new Error("Response too large"));
                return;
              }
              chunks.push(chunk);
            });

            response.on("end", () => {
              resolve({
                status,
                finalUrl: url,
                contentType,
                body: Buffer.concat(chunks).toString("utf-8"),
              });
            });
          }
        );

        request.on("timeout", () => request.destroy(new Error("Request timed out")));
        request.on("error", reject);
        request.end();
      });

      return {
        ok: true,
        data: {
          url,
          finalUrl: scrapeResult.finalUrl,
          contentType: scrapeResult.contentType,
          body: scrapeResult.body,
        }
      };

    } catch (err) {
      if (err instanceof Error && (err.name === "AbortError" || err.message === "Request timed out")) {
        return { ok: false, error: "Request timed out" };
      }
      return { ok: false, error: err instanceof Error ? err.message : "Scrape failed" };
    }
  });

  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("app:getDataPath", () => app.getPath("userData"));
  ipcMain.handle("app:isEncryptionAvailable", () => getSecureStoreStatus().encryptionAvailable);
  ipcMain.handle("app:getDiagnostics", () => {
    const secureStore = getSecureStoreStatus();
    return {
      isDesktop: true,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      userDataPath: app.getPath("userData"),
      logsPath: getLogsDir(),
      storageMode: secureStore.mode,
      secureStorageAvailable: secureStore.encryptionAvailable,
      securePrefsCorrupted: secureStore.corrupted,
      securePrefsError: secureStore.error,
      apiKeyConfigured: isApiKeyConfigured(),
      transport: "direct-ipc",
      lastApiError: getLastApiError(),
    };
  });
  ipcMain.handle("app:openLogsFolder", () => openLogsFolder());
  ipcMain.handle("app:openConversationsFolder", async () => {
    const { CONVERSATIONS_DIR } = await import("../services/conversationVault");
    await shell.openPath(CONVERSATIONS_DIR);
    return { ok: true };
  });

  ipcMain.handle("app:saveJsonFile", async (_event, data: unknown, defaultPath: unknown) => {
    try {
      if (typeof data !== "string") throw new Error("Export data must be a string.");
      if (Buffer.byteLength(data, "utf-8") > MAX_JSON_FILE_BYTES) {
        throw new Error("Export data is too large.");
      }
      const sanitizedFilename = path.basename(
        typeof defaultPath === "string" ? defaultPath : "venice-forge-export.json"
      );
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

  ipcMain.handle("app:saveYamlFile", async (_event, data: unknown, defaultPath: unknown) => {
    try {
      if (typeof data !== "string") throw new Error("Export data must be a string.");
      if (Buffer.byteLength(data, "utf-8") > MAX_JSON_FILE_BYTES) {
        throw new Error("Export data is too large.");
      }
      const sanitizedFilename = path.basename(
        typeof defaultPath === "string" ? defaultPath : "theme.yaml"
      );
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

  ipcMain.handle("app:saveRoutedImage", async (_event, base64Data: unknown, filename: unknown, subfolder: unknown) => {
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

      const targetDir = path.join(resolvedBase, cleanSub);
      const targetPath = path.join(targetDir, cleanFilename);

      const relative = path.relative(resolvedBase, targetPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Path traversal detected.");
      }

      const rawData = base64Data.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(rawData, "base64");

      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(targetPath, buffer);

      return { ok: true, filePath: targetPath };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("app:loadYamlFile", async () => {
    try {
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
        const data = await fs.readFile(result.filePaths[0], "utf-8");
        return { ok: true, canceled: false, data };
      } finally {
        await fd.close();
      }
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("app:loadJsonFile", async () => {
    try {
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

  ipcMain.handle("app:readLocalFile", async (_event, filePath: unknown) => {
    try {
      if (typeof filePath !== "string" || filePath.length > 4096 || filePath.includes("\0")) {
        return { ok: false, error: "Invalid file path." };
      }
      // Resolve symlinks and normalize the path; path.resolve() already strips ".." segments
      // so a post-resolve includes("..") check is always false and provides no protection.
      // Restrict reads to paths under Downloads or Documents to prevent exfiltration of
      // sensitive files (SSH keys, shell history, secure storage, etc.).
      let resolved: string;
      try {
        resolved = await fs.realpath(path.resolve(filePath));
      } catch {
        return { ok: false, error: "File not found." };
      }
      const allowedDirs = [app.getPath("downloads"), app.getPath("documents")];
      const isAllowed = allowedDirs.some((dir) => {
        if (!dir) return false;
        return resolved === dir || resolved.startsWith(dir + path.sep);
      });
      if (!isAllowed) {
        return { ok: false, error: "File must be inside Downloads or Documents." };
      }
      // Open first, then fstat the same file descriptor to prevent TOCTOU between
      // the stat and read calls (a symlink or file swap between those steps is blocked).
      const MAX_TEXT_ATTACHMENT_BYTES = 256 * 1024;
      let fh: Awaited<ReturnType<typeof fs.open>> | null = null;
      try {
        fh = await fs.open(resolved, "r");
        const stat = await fh.stat();
        if (!stat.isFile()) {
          return { ok: false, error: "Not a regular file." };
        }
        if (stat.size > MAX_TEXT_ATTACHMENT_BYTES) {
          return { ok: false, error: `File too large (${stat.size} bytes). Max: ${MAX_TEXT_ATTACHMENT_BYTES} bytes.` };
        }
        const content = await fh.readFile({ encoding: "utf-8" });
        return { ok: true, content };
      } finally {
        await fh?.close().catch(() => undefined);
      }
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("chat:list", async () => {
    try {
      const result = await listConversations();
      // listConversations returns either Conversation[] (back-compat) or
      // { conversations, truncated, totalScanned } when the on-disk scan
      // was capped. Surface the envelope to the renderer so it can prompt
      // the user to archive old chats.
      if (Array.isArray(result)) {
        return { ok: true, conversations: result, truncated: false, totalScanned: result.length };
      }
      return { ok: true, ...result };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:list failed", message);
      return { ok: false, error: message, conversations: [], truncated: false, totalScanned: 0 };
    }
  });

  // VERIFY-008 regression guard (T14): server-side paginated listing. The
  // legacy chat:list handler is unbounded; this new channel accepts an
  // { offset, limit } object and returns the conversation-list envelope
  // directly (no back-compat shim). The renderer should call this when
  // a chat:list result has `truncated: true` to fetch subsequent pages.
  ipcMain.handle("chat:listPage", async (_event, params: unknown) => {
    try {
      const offset = typeof params === "object" && params !== null && "offset" in params
        ? Number((params as { offset: unknown }).offset)
        : 0;
      const limit = typeof params === "object" && params !== null && "limit" in params
        ? Number((params as { limit: unknown }).limit)
        : 200;
      if (!Number.isFinite(offset) || offset < 0) {
        return { ok: false, error: "Invalid offset", conversations: [], truncated: false, totalScanned: 0, offset: 0, count: 0 };
      }
      if (!Number.isFinite(limit) || limit < 1) {
        return { ok: false, error: "Invalid limit", conversations: [], truncated: false, totalScanned: 0, offset: 0, count: 0 };
      }
      const result = await listConversations({ offset, limit });
      // listConversations({...}) always returns the envelope.
      const envelope = Array.isArray(result)
        ? { conversations: result, truncated: false, totalScanned: result.length, offset, count: result.length }
        : result;
      return { ok: true, ...envelope };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:listPage failed", message);
      return { ok: false, error: message, conversations: [], truncated: false, totalScanned: 0, offset: 0, count: 0 };
    }
  });

  ipcMain.handle("chat:get", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string" || id.length > 128) {
        return { ok: false, error: "Invalid conversation id", conversation: null };
      }
      const conversation = await getConversation(id);
      return { ok: true, conversation };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:get failed", message);
      return { ok: false, error: message, conversation: null };
    }
  });

  ipcMain.handle("chat:save", async (_event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object") {
        return { ok: false, error: "Invalid payload" };
      }
      const p = payload as Record<string, unknown>;
      if (!p.conversation || typeof p.conversation !== "object") {
        return { ok: false, error: "Missing conversation" };
      }
      const result = await saveConversation(p.conversation as Conversation);
      return result;
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:save failed", message);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("chat:delete", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string" || id.length > 128) {
        return { ok: false, error: "Invalid conversation id" };
      }
      return await deleteConversation(id);
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:delete failed", message);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("conversations:list", async (_event, filter: unknown) => {
    try {
      const cleanFilter: {
        archived?: boolean;
        pinned?: boolean;
        model?: string;
        dateFrom?: number;
        dateTo?: number;
        tags?: string[];
      } = {};
      if (filter && typeof filter === "object") {
        const f = filter as Record<string, unknown>;
        if (typeof f.archived === "boolean") cleanFilter.archived = f.archived;
        if (typeof f.pinned === "boolean") cleanFilter.pinned = f.pinned;
        if (typeof f.model === "string") cleanFilter.model = f.model;
        if (typeof f.dateFrom === "number") cleanFilter.dateFrom = f.dateFrom;
        if (typeof f.dateTo === "number") cleanFilter.dateTo = f.dateTo;
        if (Array.isArray(f.tags)) {
          cleanFilter.tags = f.tags.filter((t): t is string => typeof t === "string");
        }
      }
      const { listConversations } = await import("../services/conversationVault");
      const records = await listConversations(cleanFilter);
      return { ok: true, records };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err), records: [] };
    }
  });

  ipcMain.handle("conversations:get", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string" || id.length > 128 || id.includes("\0")) {
        return { ok: false, error: "Invalid conversation id" };
      }
      const { getConversation } = await import("../services/conversationVault");
      const record = await getConversation(id);
      return { ok: true, record };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("conversations:save", async (_event, record: unknown) => {
    try {
      if (!record || typeof record !== "object") {
        return { ok: false, error: "Invalid record structure" };
      }
      const rec = record as ConversationRecordV1;
      if (rec.version !== 1 || typeof rec.id !== "string") {
        return { ok: false, error: "Invalid record structure" };
      }
      if (rec.id.length > 128 || rec.id.includes("\0")) {
        return { ok: false, error: "Invalid record id" };
      }
      const { saveConversation } = await import("../services/conversationVault");
      return await saveConversation(rec);
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("conversations:delete", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string" || id.length > 128 || id.includes("\0")) {
        return { ok: false, error: "Invalid conversation id" };
      }
      const { deleteConversation } = await import("../services/conversationVault");
      return await deleteConversation(id);
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("conversations:archive", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string" || id.length > 128 || id.includes("\0")) {
        return { ok: false, error: "Invalid conversation id" };
      }
      const { archiveConversation } = await import("../services/conversationVault");
      return await archiveConversation(id);
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("conversations:search", async (_event, query: unknown, options: unknown) => {
    try {
      if (typeof query !== "string" || query.length > 1024) {
        return { ok: false, error: "Invalid query" };
      }
      const cleanOpts: { limit?: number; includeArchived?: boolean } = {};
      if (options && typeof options === "object") {
        const opt = options as Record<string, unknown>;
        if (typeof opt.limit === "number") cleanOpts.limit = opt.limit;
        if (typeof opt.includeArchived === "boolean") cleanOpts.includeArchived = opt.includeArchived;
      }
      const { searchIndex } = await import("../services/memoryPuller");
      const results = await searchIndex(query, cleanOpts);
      return { ok: true, results };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("conversations:pullContext", async (_event, input: unknown) => {
    try {
      if (!input || typeof input !== "object") {
        return { ok: false, error: "Invalid input" };
      }
      const inp = input as Record<string, unknown>;
      if (typeof inp.message !== "string") {
        return { ok: false, error: "Invalid input" };
      }
      const cleanInput: {
        message: string;
        maxItems?: number;
        maxTokens?: number;
        includeArchived?: boolean;
      } = { message: inp.message };
      if (typeof inp.maxItems === "number") cleanInput.maxItems = inp.maxItems;
      if (typeof inp.maxTokens === "number") cleanInput.maxTokens = inp.maxTokens;
      if (typeof inp.includeArchived === "boolean") cleanInput.includeArchived = inp.includeArchived;

      // SAFETY Stage 1: Screen user prompt message before searching memory
      const decision = assessChildExploitationSafety({
        endpoint: "/chat/completions",
        method: "POST",
        payload: { messages: [{ role: "user", content: cleanInput.message }] },
        source: "chat"
      });
      recordDecision(decision);
      if (!decision.allow || decision.action === "block") {
        return {
          ok: false,
          error: "Safety check blocked the memory search request.",
          context: { injectedText: "", facts: [], summaries: [], tokenEstimate: 0 }
        };
      }

      const { pullContext } = await import("../services/memoryPuller");
      const context = await pullContext(cleanInput);

      // SAFETY Stage 2: Screen retrieved memory context before returning it to the renderer
      if (context.injectedText) {
        const contextDecision = assessChildExploitationSafety({
          endpoint: "/chat/completions",
          method: "POST",
          payload: { messages: [{ role: "user", content: context.injectedText }] },
          source: "chat"
        });
        recordDecision(contextDecision);
        if (!contextDecision.allow || contextDecision.action === "block") {
          return {
            ok: true,
            context: { injectedText: "", facts: [], summaries: [], tokenEstimate: 0 }
          };
        }
      }

      return { ok: true, context };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("conversations:rebuildIndex", async () => {
    try {
      const { rebuildIndex } = await import("../services/memoryPuller");
      const itemsIndexed = await rebuildIndex();
      return { ok: true, itemsIndexed };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("conversations:migrateLegacyHistory", async () => {
    try {
      const { migrateLegacyHistory } = await import("../services/vaultMigration");
      return await migrateLegacyHistory();
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("conversations:detectLegacyHistory", async () => {
    try {
      const { detectLegacyHistory } = await import("../services/vaultMigration");
      return await detectLegacyHistory();
    } catch {
      return false;
    }
  });

  // ── Config (local master YAML) ──
  // SECURITY: The renderer never receives raw API keys. The sanitized view
  // exposes only booleans indicating key presence. The `writeSanitized` path
  // refuses to persist plaintext keys — it only updates non-secret values.

  ipcMain.handle("config:get", () => {
    try {
      return { ok: true, payload: getSanitizedConfig() };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:getStatus", () => {
    try {
      return { ok: true, status: getConfigStatus(), paths: getPaths() };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:reload", async () => {
    try {
      const status = await reloadConfig();
      return { ok: true, status };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:initialize", async () => {
    try {
      const status = await initializeConfig();
      return { ok: true, status };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:openFolder", async () => {
    try {
      return await openConfigFolder();
    } catch (err) {
      return { ok: false, path: "", error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:writeSanitized", async (_event, patch: unknown) => {
    try {
      return await writeSanitizedConfig(patch);
    } catch (err) {
      return { ok: false, redactedFields: [], error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:exportTemplate", async (_event, targetPath: unknown) => {
    try {
      if (typeof targetPath !== "string" || targetPath.length === 0) {
        return { ok: false, error: "Export target path is required." };
      }
      return await exportConfigTemplate(targetPath);
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:loadMergedThemes", async () => {
    try {
      return { ok: true, ...(await loadMergedThemes()) };
    } catch (err) {
      return { ok: false, themes: {}, warnings: [], error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:resetSecureStoreKeys", () => {
    try {
      const removed = resetSecureStoreKeys();
      return { ok: true, removed };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });
}
