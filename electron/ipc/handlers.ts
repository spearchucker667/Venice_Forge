/** @fileoverview Registers IPC handlers for Venice API requests, API key
 *  management, file dialogs, and application diagnostics. */

import { app, dialog, ipcMain, type WebContents } from "electron";
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
}
