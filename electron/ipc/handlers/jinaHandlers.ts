/** @fileoverview Jina API key and request IPC handlers (jinaApiKey:*,
 *  jina:request). */

import {
  deleteJinaApiKey,
  getJinaApiKey,
  isJinaApiKeyConfigured,
  setJinaApiKey,
} from "../../services/secureStore";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { JINA_MAX_RESPONSE_BYTES } from "../../../src/shared/limits";
import {
  FetchBodyTooLargeError,
  parseJsonOrNull,
  readBoundedFetchBody,
} from "../../../src/shared/readBoundedFetchBody";
import {
  screenResponseBody,
  safetyBlockBodyFromResponseScreen,
} from "../../../src/shared/safety";
import { checkLocalFamilyGuard } from "../../services/guardPipeline";
import { getRuntimeLocalFamilySafeModeEnabled } from "../../services/runtimeSafetySettings";
import { registerIpcChannel } from "./common";

const JINA_ALLOWED_FORWARD_HEADERS = new Set([
  "accept",
  "x-return-format",
  "x-with-generated-alt",
  "x-with-iframe",
  "x-target-selector",
  "x-wait-for-selector",
  "x-timeout",
  "x-no-cache",
  "x-retain-images",
  "x-with-links-summary",
  "x-with-images-summary",
  "x-token-budget",
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

export function registerJinaHandlers(): void {
  registerIpcChannel("jinaApiKey:isConfigured", (_event, profileId?: string) => isJinaApiKeyConfigured(profileId));

  registerIpcChannel("jinaApiKey:set", (_event, payload: unknown) => {
    const { key, profileId } = typeof payload === "object" && payload !== null && "key" in payload ? payload as { key: unknown, profileId?: string } : { key: payload, profileId: undefined };
    try {
      const trimmed = typeof key === "string" ? key.trim() : "";
      if (!trimmed) throw new Error("Enter a Jina API key before saving.");
      if (trimmed.length > 512) throw new Error("Jina API key is too long.");
      setJinaApiKey(trimmed, profileId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("jinaApiKey:delete", (_event, profileId?: string) => {
    try {
      deleteJinaApiKey(profileId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("jina:request", async (_event, input: unknown) => {
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
          return { ok: false, status: 451, body: safetyBlockBodyFromResponseScreen(bodyScreen) };
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

  registerIpcChannel("jinaApiKey:test", async () => {
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
}
