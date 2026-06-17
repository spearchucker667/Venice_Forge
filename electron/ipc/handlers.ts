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
import { abortVeniceRequest, readResponseError } from "../services/veniceClient";
import {
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
} from "../services/chatStorage";
import { validateApiKeyInput, validateVeniceIpcRequest } from "./validation";
import { redactErrorMessage } from "../../src/shared/redaction";
import { registerUpdateHandlers } from "./updates";
import { registerRpIpcHandlers } from "./rpHandlers";
import {
  exportMedia,
  generateMediaThumb,
  importMediaFromPath,
  readMediaMeta,
  revealMediaInFolder,
} from "../services/mediaService";
import {
  clearCharacterImageCache,
  getCachedCharacterImage,
  getCharacterImageCacheInventory,
} from "../services/characterImageCache";
import { JINA_MAX_RESPONSE_BYTES, VENICE_MAX_BODY_BYTES } from "../../src/shared/limits";
import { FetchBodyTooLargeError, parseJsonOrNull, readBoundedFetchBody } from "../../src/shared/readBoundedFetchBody";
import { SafetyGuardBlockedError, screenResponseBody } from "../../src/shared/safety";
import { performGuardedVeniceRequest, checkLocalFamilyGuard } from "../services/guardPipeline";
import { getRuntimeLocalFamilySafeModeEnabled } from "../services/runtimeSafetySettings";
import type { Conversation } from "../../src/types/conversation";
import { registerConfigIpcHandlers } from "./configHandlers";
import type { ApiConnectivityFailureKind, ApiConnectivityStatus } from "../../src/types/api-connectivity";

/** Maximum size in bytes for JSON import and export files. */
const MAX_JSON_FILE_BYTES = VENICE_MAX_BODY_BYTES;
const JINA_ALLOWED_FORWARD_HEADERS = new Set([
  "accept",
  "x-return-format",
  "x-with-generated-alt",
  "x-with-iframe",
  "x-target-selector",
  "x-wait-for-selector",
  "x-timeout",
]);
const JINA_BLOCKED_FORWARD_HEADER_PATTERNS = [
  /^authorization$/i,
  /^x-jina-api-key$/i,
  /^host$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^forwarded$/i,
  /^x-forwarded-/i,
  /^content-length$/i,
  /^transfer-encoding$/i,
  /^connection$/i,
  /^proxy-/i,
  /^origin$/i,
  /^referer$/i,
];

function sanitizeJinaForwardHeaders(input: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return headers;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalized = key.trim().toLowerCase();
    if (!normalized || typeof value !== "string") continue;
    if (JINA_BLOCKED_FORWARD_HEADER_PATTERNS.some((pattern) => pattern.test(normalized))) continue;
    if (!JINA_ALLOWED_FORWARD_HEADERS.has(normalized)) continue;
    headers[normalized] = value;
  }
  return headers;
}

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
function connectivityFailure(
  kind: ApiConnectivityFailureKind,
  safeMessage: string,
  options: { statusCode?: number; retryable?: boolean } = {},
): ApiConnectivityStatus {
  return {
    ok: false,
    kind,
    checkedAt: new Date().toISOString(),
    statusCode: options.statusCode,
    safeMessage,
    retryable: options.retryable ?? false,
  };
}

function classifyConnectivityFailure(status: number, message: string): ApiConnectivityStatus {
  if (status === 401 || status === 403) {
    return connectivityFailure(
      "invalid-api-key",
      "API key was found, but Venice rejected it. Re-enter the key in Config.",
      { statusCode: status },
    );
  }
  if ([408, 429, 500, 502, 503, 504].includes(status)) {
    return connectivityFailure(
      "venice-error",
      "Venice returned an error response. Try again or check provider status.",
      { statusCode: status, retryable: true },
    );
  }
  return connectivityFailure(
    "catalog-failure",
    message || "Model catalog failed to load from Venice. Chat may still work if a model is already selected.",
    { statusCode: status, retryable: status >= 500 },
  );
}

async function testVeniceConnection(): Promise<{ ok: boolean; status?: number; message: string; connectivity: ApiConnectivityStatus }> {
  if (!isApiKeyConfigured()) {
    return {
      ok: false,
      message: "No API key configured.",
      connectivity: connectivityFailure(
        "missing-api-key",
        "API key is missing. Open Config and add a Venice API key.",
      ),
    };
  }
  try {
    const guarded = await performGuardedVeniceRequest({ endpoint: "/models", method: "GET" });
    const response = guarded.kind === "blocked"
      ? { ok: false, status: 451, statusText: "Blocked by Family Safe Mode", headers: {}, body: { error: guarded.block.body.error }, contentType: "application/json" }
      : guarded.response;
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        message: "Connection successful",
        connectivity: {
          ok: true,
          kind: "verified",
          checkedAt: new Date().toISOString(),
          statusCode: response.status,
          endpoint: "models",
        },
      };
    }
    const message = readResponseError(response);
    return {
      ok: false,
      status: response.status,
      message,
      connectivity: classifyConnectivityFailure(response.status, message),
    };
  } catch (err) {
    const message = redactErrorMessage(err);
    return {
      ok: false,
      status: 0,
      message,
      connectivity: connectivityFailure(
        /ipc|bridge|preload/i.test(message) ? "bridge-unavailable" : "network-failure",
        /ipc|bridge|preload/i.test(message)
          ? "Desktop bridge is unavailable. Restart the app or use web dev mode."
          : "Network request failed before Venice responded. Check connection, proxy, VPN, or firewall.",
        { statusCode: 0, retryable: true },
      ),
    };
  }
}

/** Registers all IPC handlers used by the renderer process. */
export function registerIpcHandlers(): void {
  registerUpdateHandlers();

  ipcMain.handle("venice:request", async (_event, input: unknown) => {
    try {
      // Validate first so the guard sees a typed endpoint/method/payload.
      const request = validateVeniceIpcRequest(input);
      const result = await performGuardedVeniceRequest(request);
      if (result.kind === "blocked") return result.block;
      return result.response;
    } catch (err) {
      if (err instanceof SafetyGuardBlockedError) {
        return {
          ok: false,
          status: 451,
          statusText: "Blocked by Family Safe Mode",
          headers: {} as Record<string, never>,
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
        headers: {} as Record<string, never>,
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
      if (!request.signalId) {
        request.signalId = crypto.randomUUID();
      }
      const result = await performGuardedVeniceRequest(request, {
        onDelta: (chunk) => {
          safeSendToRenderer(event.sender, "venice:streamDelta", {
            signalId: request.signalId,
            delta: chunk.content,
            reasoning: chunk.reasoning,
          });
        },
      });
      if (result.kind === "blocked") return result.block;
      return result.response;
    } catch (err) {
      if (err instanceof SafetyGuardBlockedError) {
        return {
          ok: false,
          status: 451,
          statusText: "Blocked by Family Safe Mode",
          headers: {} as Record<string, never>,
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
        headers: {} as Record<string, never>,
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

      const decision = checkLocalFamilyGuard(
        { endpoint: request.url, method: "GET", text: decodeURIComponent(request.url), source: "ipc" },
      );
      if (decision) return { ok: false, status: 451, error: decision.body.error };

      const headers = sanitizeJinaForwardHeaders(request.headers);

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
        const rawBody = await readBoundedFetchBody(response, JINA_MAX_RESPONSE_BYTES);
        const body = contentType.includes("application/json") ? parseJsonOrNull(rawBody) : rawBody;

        // P0/P1-015: screen the returned body through the local Family Safe
        // Mode guard using the main-process runtime snapshot. The renderer-
        // supplied `localFamilySafeModeEnabled` is intentionally NOT consulted
        // here — only the canonical main-process snapshot is authoritative.
        const serialized = typeof body === "string" ? body : JSON.stringify(body ?? "");
        const bodyScreen = screenResponseBody(
          serialized,
          { endpoint: request.url, method: "GET", source: "ipc" },
          getRuntimeLocalFamilySafeModeEnabled(),
        );
        if (!bodyScreen.allowed) {
          return { ok: false, status: 451, error: bodyScreen.userMessage };
        }

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
      if (err instanceof FetchBodyTooLargeError) {
        return { ok: false, status: 413, error: "Jina response exceeded the 2 MiB limit." };
      }
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

      const decision = checkLocalFamilyGuard(
        { endpoint: url, method: "GET", text: decodeURIComponent(url), source: "ipc" },
      );
      if (decision) return { ok: false, error: decision.body.error };

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

      // P0/P1-015: screen the returned body through the local Family Safe
      // Mode guard using the main-process runtime snapshot. The URL was
      // already screened above; this closes the request-side gap by also
      // gating the body content the renderer would otherwise receive.
      const bodyScreen = screenResponseBody(
        scrapeResult.body,
        { endpoint: url, method: "GET", source: "scrape" },
        getRuntimeLocalFamilySafeModeEnabled(),
      );
      if (!bodyScreen.allowed) {
        return { ok: false, error: bodyScreen.userMessage };
      }

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
  ipcMain.handle("app:isEncryptionAvailable", () => getSecureStoreStatus().encryptionAvailable);
  ipcMain.handle("app:getDiagnostics", () => {
    const secureStore = getSecureStoreStatus();
    return {
      isDesktop: true,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      userDataPath: path.basename(app.getPath("userData")),
      logsPath: path.basename(getLogsDir()),
      storageMode: secureStore.mode,
      secureStorageAvailable: secureStore.encryptionAvailable,
      securePrefsCorrupted: secureStore.corrupted,
      securePrefsError: secureStore.error ? redactErrorMessage(secureStore.error) : null,
      apiKeyConfigured: isApiKeyConfigured(),
      transport: "direct-ipc",
      lastApiError: getLastApiError() ? redactErrorMessage(getLastApiError()) : "",
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

  ipcMain.handle("app:readLocalFile", async () => {
    try {
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
  ipcMain.handle("app:media:export", async (_event, input: unknown) => {
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
  ipcMain.handle("app:media:import", async (_event, input: unknown) => {
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
  ipcMain.handle("app:media:reveal", async (_event, input: unknown) => {
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
  ipcMain.handle("app:media:meta", async (_event, input: unknown) => {
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
  ipcMain.handle("app:media:thumb", async (_event, input: unknown) => {
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
  ipcMain.handle("app:characterImage:get", async (_event, input: unknown) => {
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

  ipcMain.handle("app:characterImage:clearCache", async () => {
    try {
      const result = await clearCharacterImageCache();
      if (!result.ok) return { ok: false, error: redactErrorMessage(result.error) };
      return { ok: true, deletedCount: result.deletedCount };
    } catch (err) {
      return { ok: false, deletedCount: 0, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("app:characterImage:inventory", async () => {
    try {
      const inventory = await getCharacterImageCacheInventory();
      return { ok: true, ...inventory };
    } catch (err) {
      return { ok: false, count: 0, totalBytes: 0, error: redactErrorMessage(err) };
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
      if (rec.id.length > 128 || rec.id.includes("\0") || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(rec.id)) {
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
      if (typeof id !== "string" || id.length > 128 || id.includes("\0") || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(id)) {
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
      if (typeof id !== "string" || id.length > 128 || id.includes("\0") || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(id)) {
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
      const decision = checkLocalFamilyGuard({
        endpoint: "/chat/completions",
        method: "POST",
        payload: { messages: [{ role: "user", content: cleanInput.message }] },
        source: "chat"
      });
      if (decision) {
        return {
          ok: false,
          error: decision.body.error,
          context: { injectedText: "", facts: [], summaries: [], tokenEstimate: 0 }
        };
      }

      const { pullContext } = await import("../services/memoryPuller");
      const context = await pullContext(cleanInput);

      // SAFETY Stage 2: Screen retrieved memory context before returning it to the renderer
      if (context.injectedText) {
        const contextDecision = checkLocalFamilyGuard({
          endpoint: "/chat/completions",
          method: "POST",
          payload: { messages: [{ role: "user", content: context.injectedText }] },
          source: "chat"
        });
        if (contextDecision) {
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

  registerConfigIpcHandlers();

  // ── Character Roleplay Studio (local-first) ──
  // See `electron/ipc/rpHandlers.ts` for the channel set:
  //   characterCards:{list,get,save,delete}
  //   personas:{list,get,save,delete}
  //   lorebooks:{list,get,save,delete}
  //   rpChats:{list,get,save,delete}
  //   rpAssets:{list,get,save,delete}
  // Synchronous import — handler registration must complete before this
  // function returns so the renderer never sees a "no handler" rejection
  // when the user clicks into the RP tab immediately on launch.
  registerRpIpcHandlers();
}
