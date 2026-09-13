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
import { getProfileSessionId } from "../../services/profileSession";
import { getRuntimeLocalFamilySafeModeEnabled } from "../../services/runtimeSafetySettings";
import { registerPrivilegedIpcChannel } from "./common";
import {
  publishInspectorRequest,
  publishInspectorCompletion,
} from "../../services/inspectorTelemetry";

function jinaEndpointTag(parsedUrl: URL): "/jina/reader" | "/jina/search" {
  return parsedUrl.hostname === "s.jina.ai" ? "/jina/search" : "/jina/reader";
}

type JinaRequestResponse = {
  ok: boolean;
  status: number;
  body?: unknown;
  contentType?: string;
  error?: string;
};

type JinaRunResult =
  | { kind: "fail"; status: number; error: string; endpoint: "/jina/reader" | "/jina/search"; body?: unknown }
  | { kind: "ok"; endpoint: "/jina/reader" | "/jina/search"; status: number; bytes: number; response: JinaRequestResponse };


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
  registerPrivilegedIpcChannel("jinaApiKey:isConfigured", (event, _profileId?: unknown) => {
    try {
      return isJinaApiKeyConfigured(getProfileSessionId(event.sender));
    } catch {
      return false;
    }
  }, { rateLimitedResponse: () => false });

  registerPrivilegedIpcChannel("jinaApiKey:set", (event, payload: unknown) => {
    const { key } = typeof payload === "object" && payload !== null && "key" in payload ? payload as { key: unknown, profileId?: unknown } : { key: payload };
    try {
      const validId = getProfileSessionId(event.sender);
      const trimmed = typeof key === "string" ? key.trim() : "";
      if (!trimmed) throw new Error("Enter a Jina API key before saving.");
      if (trimmed.length > 512) throw new Error("Jina API key is too long.");
      setJinaApiKey(trimmed, validId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("jinaApiKey:delete", (event, _profileId?: unknown) => {
    try {
      deleteJinaApiKey(getProfileSessionId(event.sender));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  /* INSPECTOR_TELEMETRY_JINA_WIRED */
  registerPrivilegedIpcChannel("jina:request", async (event, input: unknown) => {
    const startedAt = Date.now();
    const eventId = publishInspectorRequest({
      source: "main-research",
      transport: "jina",
      endpoint: "/jina/pending",
      method: "GET",
    });
    try {
      const run = await runJinaRequest(event, input);
      if (run.kind === "fail") {
        publishInspectorCompletion({
          source: "main-research",
          transport: "jina",
          endpoint: run.endpoint,
          method: "GET",
          summaries: { durationMs: Date.now() - startedAt },
          eventId,
          status: run.status,
          error: run.error,
        });
        return {
          ok: false,
          status: run.status,
          ...(run.body !== undefined ? { body: run.body } : {}),
          ...(run.error ? { error: run.error } : {}),
        };
      }
      publishInspectorCompletion({
        source: "main-research",
        transport: "jina",
        endpoint: run.endpoint,
        method: "GET",
        summaries: { bytes: run.bytes, durationMs: Date.now() - startedAt },
        eventId,
        status: run.status,
        ...(run.response.error ? { error: run.response.error } : {}),
      });
      return run.response;
    } catch (err) {
      publishInspectorCompletion({
        source: "main-research",
        transport: "jina",
        endpoint: "/jina/reader",
        method: "GET",
        summaries: { durationMs: Date.now() - startedAt },
        eventId,
        error: redactErrorMessage(err),
      });
      if (err instanceof FetchBodyTooLargeError) {
        return { ok: false, status: 413, error: "Jina response exceeded the 2 MiB limit." };
      }
      return { ok: false, status: 0, error: redactErrorMessage(err) };
    }
  });

  async function runJinaRequest(
    event: import("electron").IpcMainInvokeEvent,
    input: unknown,
  ): Promise<JinaRunResult> {
    try {
      const request = input as { url?: unknown; headers?: unknown; timeoutMs?: unknown; profileId?: unknown };
      if (typeof request.url !== "string") {
        return { kind: "fail", status: 400, error: "Missing Jina request URL.", endpoint: "/jina/reader" };
      }

      const parsed = new URL(request.url);
      const allowedHosts = ["r.jina.ai", "s.jina.ai"];
      if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname)) {
        return {
          kind: "fail",
          status: 403,
          error: "Only Jina Reader/Search HTTPS endpoints are allowed.",
          endpoint: "/jina/reader",
        };
      }

      const decision = checkLocalFamilyGuard(
        { endpoint: request.url, method: "GET", text: decodeURIComponent(request.url), source: "ipc" },
      );
      if (decision) {
        return { kind: "fail", status: 451, error: decision.body.error, endpoint: jinaEndpointTag(parsed), body: decision.body };
      }

      const headers = sanitizeJinaForwardHeaders(request.headers);

      // Provider-use credential selection is main-process authoritative.
      const validProfileId = getProfileSessionId(event.sender);
      const jinaKey = (() => { try { return getJinaApiKey(validProfileId); } catch { return null; } })();
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

        const serialized = typeof body === "string" ? body : JSON.stringify(body ?? "");
        const bodyScreen = screenResponseBody(
          serialized,
          { endpoint: request.url, method: "GET", source: "ipc" },
          getRuntimeLocalFamilySafeModeEnabled(),
        );
        if (!bodyScreen.allowed) {
          const safetyBlock = safetyBlockBodyFromResponseScreen(bodyScreen);
          return {
            kind: "fail",
            status: 451,
            error: safetyBlock.error,
            endpoint: jinaEndpointTag(parsed),
            body: safetyBlock,
          };
        }

        const responseObj: JinaRequestResponse = {
          ok: response.ok,
          status: response.status,
          body,
          contentType,
          error: response.ok ? undefined : `Jina returned ${response.status}`,
        };
        return {
          kind: "ok",
          endpoint: jinaEndpointTag(parsed),
          status: response.status,
          bytes: rawBody.length,
          response: responseObj,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      if (err instanceof FetchBodyTooLargeError) {
        return {
          kind: "fail",
          status: 413,
          error: "Jina response exceeded the 2 MiB limit.",
          endpoint: "/jina/reader",
        };
      }
      return {
        kind: "fail",
        status: 0,
        error: redactErrorMessage(err),
        endpoint: "/jina/reader",
      };
    }
  };


  

  registerPrivilegedIpcChannel("jinaApiKey:test", async (event, _profileId?: unknown) => {
    const validProfileId = getProfileSessionId(event.sender);
    const jinaKey = (() => {
      try {
        return getJinaApiKey(validProfileId);
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
