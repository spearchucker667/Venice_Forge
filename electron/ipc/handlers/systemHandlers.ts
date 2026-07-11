/** @fileoverview Miscellaneous system IPC handlers (app info, diagnostics,
 *  proxy scraping, chat/conversation vault operations). */

import { app } from "electron";
import path from "path";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { ConversationRecordV1 } from "../../../src/types/conversationVault";
import type { Conversation } from "../../../src/types/conversation";
import { isPrivateHostname } from "../../utils/urlSecurity";
import {
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
} from "../../services/chatStorage";
import { emitSyncPacket, emitSyncTombstone } from "../../services/syncBridge";
import { getLastApiError, getLogsDir, logError, openLogsFolder } from "../../services/logger";
import { getSecureStoreStatus, isApiKeyConfigured } from "../../services/secureStore";
import {
  screenResponseBody,
  safetyBlockBodyFromResponseScreen,
} from "../../../src/shared/safety";
import { checkLocalFamilyGuard } from "../../services/guardPipeline";
import { getRuntimeLocalFamilySafeModeEnabled } from "../../services/runtimeSafetySettings";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { VENICE_MAX_BODY_BYTES } from "../../../src/shared/limits";

const IPC_PAYLOAD_TOO_LARGE = "Conversation payload is too large.";
import { registerIpcChannel } from "./common";
import { validateMutationOrigin } from "../validation";

interface LookupResult {
  address: string;
  family: number;
}

/** Parses a delete/archive payload from the renderer. Accepts the shape
 *  `{ id, origin }` introduced in Task 6 and defaults missing origins to
 *  `"local-user"` for back-compat.
 *  @returns A tuple `[error, payload]` where exactly one entry is defined. */
function parseDeletePayload(raw: unknown): [string, null] | [null, { id: string; origin: import("../../../src/types/sync").MutationOrigin }] {
  if (!raw || typeof raw !== "object") {
    return ["Invalid payload", null];
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string" || p.id.length === 0) {
    return ["Invalid id", null];
  }
  try {
    const origin = validateMutationOrigin(p.origin);
    return [null, { id: p.id, origin }];
  } catch (err) {
    return [err instanceof Error ? err.message : "Invalid origin", null];
  }
}

/** Extracts and validates an optional mutation origin from a save payload.
 *  Defaults missing origins to `"local-user"` for back-compat. */
function parseSaveOrigin(raw: unknown): import("../../../src/types/sync").MutationOrigin {
  if (!raw || typeof raw !== "object") return "local-user";
  const p = raw as Record<string, unknown>;
  try {
    return validateMutationOrigin(p.origin);
  } catch {
    return "local-user";
  }
}

export function registerSystemHandlers(): void {
  registerIpcChannel("app:proxyScrape", async (_event, url: unknown) => {
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

      if (parsed.protocol !== "https:") {
        return { ok: false, error: "Only https URLs are allowed" };
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
        return { ok: false, status: 451, body: safetyBlockBodyFromResponseScreen(bodyScreen) };
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

  registerIpcChannel("app:getVersion", () => app.getVersion());

  registerIpcChannel("app:isEncryptionAvailable", () => getSecureStoreStatus().encryptionAvailable);

  registerIpcChannel("app:getDiagnostics", () => {
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

  registerIpcChannel("app:openLogsFolder", () => openLogsFolder());

  registerIpcChannel("chat:list", async () => {
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
  registerIpcChannel("chat:listPage", async (_event, params: unknown) => {
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

  registerIpcChannel("chat:get", async (_event, id: unknown) => {
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

  registerIpcChannel("chat:save", async (_event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object") {
        return { ok: false, error: "Invalid payload" };
      }
      const p = payload as Record<string, unknown>;
      if (!p.conversation || typeof p.conversation !== "object") {
        return { ok: false, error: "Missing conversation" };
      }
      const conversation = p.conversation as Conversation;
      const payloadBytes = Buffer.byteLength(JSON.stringify(conversation), "utf8");
      if (payloadBytes > VENICE_MAX_BODY_BYTES) {
        logError("chat:save rejected: payload too large", `${payloadBytes} bytes`);
        return { ok: false, error: IPC_PAYLOAD_TOO_LARGE };
      }
      const result = await saveConversation(conversation);
      if (result.ok) {
        const origin = parseSaveOrigin(payload);
        await emitSyncPacket("conversations", conversation.id, conversation, origin);
      }
      return result;
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:save failed", message);
      return { ok: false, error: message };
    }
  });

  registerIpcChannel("chat:delete", async (_event, payload: unknown) => {
    try {
      const [error, parsed] = parseDeletePayload(payload);
      if (error || !parsed) {
        return { ok: false, error: error ?? "Invalid payload" };
      }
      const { id, origin } = parsed;
      if (id.length > 128) {
        return { ok: false, error: "Invalid conversation id" };
      }
      const result = await deleteConversation(id);
      if (result.ok) {
        await emitSyncTombstone("conversations", id, origin);
      }
      return result;
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:delete failed", message);
      return { ok: false, error: message };
    }
  });

  registerIpcChannel("conversations:list", async (_event, filter: unknown) => {
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
      const { listConversations } = await import("../../services/conversationVault");
      const records = await listConversations(cleanFilter);
      return { ok: true, records };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err), records: [] };
    }
  });

  registerIpcChannel("conversations:get", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string" || id.length > 128 || id.includes("\0")) {
        return { ok: false, error: "Invalid conversation id" };
      }
      const { getConversation } = await import("../../services/conversationVault");
      const record = await getConversation(id);
      return { ok: true, record };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("conversations:save", async (_event, record: unknown) => {
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
      const payloadBytes = Buffer.byteLength(JSON.stringify(rec), "utf8");
      if (payloadBytes > VENICE_MAX_BODY_BYTES) {
        logError("conversations:save rejected: payload too large", `${payloadBytes} bytes`);
        return { ok: false, error: IPC_PAYLOAD_TOO_LARGE };
      }
      const { saveConversation } = await import("../../services/conversationVault");
      const result = await saveConversation(rec);
      if (result.ok) {
        const origin = parseSaveOrigin(record);
        await emitSyncPacket("conversations", rec.id, rec, origin);
      }
      return result;
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("conversations:delete", async (_event, payload: unknown) => {
    try {
      const [error, parsed] = parseDeletePayload(payload);
      if (error || !parsed) {
        return { ok: false, error: error ?? "Invalid payload" };
      }
      const { id, origin } = parsed;
      if (id.length > 128 || id.includes("\0") || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(id)) {
        return { ok: false, error: "Invalid conversation id" };
      }
      const { deleteConversation } = await import("../../services/conversationVault");
      const result = await deleteConversation(id);
      if (result.ok) {
        await emitSyncTombstone("conversations", id, origin);
      }
      return result;
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("conversations:archive", async (_event, payload: unknown) => {
    try {
      const [error, parsed] = parseDeletePayload(payload);
      if (error || !parsed) {
        return { ok: false, error: error ?? "Invalid payload" };
      }
      const { id } = parsed;
      if (id.length > 128 || id.includes("\0") || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(id)) {
        return { ok: false, error: "Invalid conversation id" };
      }
      const { archiveConversation } = await import("../../services/conversationVault");
      return await archiveConversation(id);
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("conversations:search", async (_event, query: unknown, options: unknown) => {
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
      const { searchIndex } = await import("../../services/memoryPuller");
      const results = await searchIndex(query, cleanOpts);
      return { ok: true, results };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("conversations:pullContext", async (_event, input: unknown) => {
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
        excludeConversationIds?: string[];
        characterId?: string;
      } = { message: inp.message };
      cleanInput.maxItems = Math.min(50, Math.max(1, typeof inp.maxItems === "number" && Number.isFinite(inp.maxItems) ? inp.maxItems : 5));
      cleanInput.maxTokens = Math.min(8192, Math.max(1, typeof inp.maxTokens === "number" && Number.isFinite(inp.maxTokens) ? inp.maxTokens : 1200));
      if (typeof inp.includeArchived === "boolean") cleanInput.includeArchived = inp.includeArchived;
      if (Array.isArray(inp.excludeConversationIds)) {
        cleanInput.excludeConversationIds = inp.excludeConversationIds
          .filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9_.-]{1,128}$/.test(id))
          .slice(0, 50);
      }
      if (typeof inp.characterId === "string" && inp.characterId.length > 0 && /^[a-zA-Z0-9_.-]{1,128}$/.test(inp.characterId)) {
        cleanInput.characterId = inp.characterId;
      }

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

      const { pullContext } = await import("../../services/memoryPuller");
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

  registerIpcChannel("conversations:rebuildIndex", async () => {
    try {
      const { rebuildIndex } = await import("../../services/memoryPuller");
      const itemsIndexed = await rebuildIndex();
      return { ok: true, itemsIndexed };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("conversations:migrateLegacyHistory", async () => {
    try {
      const { migrateLegacyHistory } = await import("../../services/vaultMigration");
      return await migrateLegacyHistory();
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("conversations:detectLegacyHistory", async () => {
    try {
      const { detectLegacyHistory } = await import("../../services/vaultMigration");
      return await detectLegacyHistory();
    } catch {
      return false;
    }
  });
}
