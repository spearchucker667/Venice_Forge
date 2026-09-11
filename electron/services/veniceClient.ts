/** @fileoverview Performs HTTPS requests to the Venice API from the Electron
 *  main process, including streaming chat and multipart form data support. */

import crypto from "crypto";
import https from "https";
import { app } from "electron";
import type { IncomingHttpHeaders } from "http";
import { getApiKey } from "./secureStore";
import { logError, setLastApiError } from "./logger";
import { redactErrorMessage } from "../../src/shared/redaction";
import { validateVeniceIpcRequest } from "../ipc/validation";
import { VENICE_API_HOST, VENICE_API_BASE_PATH, VENICE_API_TIMEOUT_MS, VENICE_API_STREAM_TIMEOUT_MS } from "../../src/shared/apiConfig";
import { resolveProviderRoute, type ProviderRouteSelection } from "./providerAdapters";
import { getProviderSettings } from "./providerSettingsStore";
import {
  SseDecoder,
  applyStreamSseEvent,
  extractStreamDelta as sharedExtractStreamDelta,
  type SseEvent,
  type StreamDelta as SharedStreamDelta,
} from "../../src/shared/sseStreamDecoder";

/** Maximum non-streaming Venice response body size we will buffer in memory. */
const MAX_VENICE_RESPONSE_BYTES = 25 * 1024 * 1024;

/** Maximum delay honored from a single Retry-After response, in milliseconds.
 *  Larger upstream values are clamped to this cap so a misbehaving peer
 *  cannot indefinitely stall the user. */
export const MAX_RETRY_AFTER_MS = 30_000;

/** Per-attempt jitter window (±20% by default). Applied symmetrically so the
 *  average delay equals the upstream-suggested value. */
export const RETRY_AFTER_JITTER_FRACTION = 0.2;

/** Parses a Retry-After header value into the milliseconds-from-now delay.
 *  Returns null if the header is absent, malformed, or represents a past
 *  time. Supports both the delta-seconds form (`120`) and the RFC 7231
 *  HTTP-date form (`Wed, 21 Oct 2026 07:28:00 GMT`).
 *  @param value The raw Retry-After header value.
 *  @param now Override for the current epoch millis (used by tests).
 *  @returns The delay in milliseconds, or null when the value cannot be honored.
 */
export function parseRetryAfterMs(
  value: string | undefined,
  now: number = Date.now(),
): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // RFC 7231 delta-seconds: one or more digits, optional fractional part.
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.round(seconds * 1000);
  }
  // RFC 7231 IMF-fixdate HTTP-date form: e.g. `Wed, 21 Oct 2026 07:28:00 GMT`.
  // The trailing `GMT` is the strongest signal that this is an HTTP-date
  // rather than a free-form string that Node's lenient Date.parse would
  // otherwise interpret (e.g. "abc 123" or "-5"). We also require a
  // recognizable day-of-week prefix to reject inputs that merely happen to
  // contain "GMT" by coincidence.
  if (
    !/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+\d{2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT$/i.test(trimmed)
  ) {
    return null;
  }
  const when = Date.parse(trimmed);
  if (!Number.isFinite(when)) return null;
  return Math.max(0, when - now);
}

/** Applies a symmetric jitter window around the requested delay and clamps to
 *  the maximum Retry-After cap after jitter. Exported for testability.
 *  @param delayMs The base delay in milliseconds (>= 0).
 *  @param jitterFraction Half-width of the jitter window (0..1).
 *  @param capMs The upper bound for the jittered delay.
 *  @param random Math.random-compatible source (overridden in tests).
 *  @returns The jittered, capped delay in milliseconds.
 */
export function computeJitteredDelay(
  delayMs: number,
  jitterFraction: number = RETRY_AFTER_JITTER_FRACTION,
  capMs: number = MAX_RETRY_AFTER_MS,
  random: () => number = Math.random,
): number {
  if (!Number.isFinite(delayMs) || delayMs <= 0) return 0;
  const safeFraction = Math.max(0, Math.min(1, jitterFraction));
  const offset = delayMs * safeFraction * (random() * 2 - 1);
  const jittered = Math.max(0, Math.round(delayMs + offset));
  return Math.min(jittered, capMs);
}

/** Sleeps for the requested delay, aborting early if `signal` fires. Rejects
 *  with the signal's reason when aborted, otherwise resolves on timeout.
 *  @param ms The delay in milliseconds.
 *  @param signal Optional AbortSignal that interrupts the wait.
 */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("abortableDelay aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("abortableDelay aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Tracks active requests so they can be aborted by signal ID. */
const activeRequests = new Map<string, { destroy: () => void }>();
export const MAX_CONCURRENT_VENICE_REQUESTS = 10;
let activeVeniceRequests = 0;
const veniceQueue: Array<() => void> = [];

async function acquireVeniceSlot(): Promise<() => void> {
  if (activeVeniceRequests < MAX_CONCURRENT_VENICE_REQUESTS) {
    activeVeniceRequests += 1;
    return releaseVeniceSlot;
  }
  await new Promise<void>((resolve) => veniceQueue.push(resolve));
  activeVeniceRequests += 1;
  return releaseVeniceSlot;
}

function releaseVeniceSlot(): void {
  activeVeniceRequests = Math.max(0, activeVeniceRequests - 1);
  const next = veniceQueue.shift();
  if (next) next();
}

export function getVeniceConcurrencyStateForTests(): { active: number; queued: number } {
  return { active: activeVeniceRequests, queued: veniceQueue.length };
}

/** Describes a single entry within a serialized FormData payload. */
interface SerializedFormDataEntry {
  name: string;
  value: string;
  filename?: string;
  type?: string;
  _isFile?: boolean;
}

/** Describes a FormData object serialized from the renderer for multipart upload. */
interface SerializedFormData {
  _isSerializedFormData: true;
  entries: SerializedFormDataEntry[];
}

/** Removes carriage returns, newlines, and quotes from a multipart token.
 *  @param value The raw token string.
 *  @returns A sanitized token safe for multipart headers.
 */
export function sanitizeMultipartToken(value: string): string {
  let result = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code >= 0 && code <= 31) || code === 127 || char === '"' || char === "\\") {
      continue;
    }
    result += char;
  }
  return result.trim();
}

/** Validates and normalizes a multipart content-type string.
 *  @param value The raw content-type value.
 *  @returns A valid MIME type or application/octet-stream fallback.
 */
export function sanitizeMultipartContentType(value: string | undefined): string {
  const sanitized = sanitizeMultipartToken(value || "");
  return /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(sanitized)
    ? sanitized
    : "application/octet-stream";
}

/** Builds a multipart form-data body from a serialized FormData description.
 *  @param serialized The serialized FormData structure.
 *  @returns The assembled body buffer and boundary string.
 */
export function buildMultipartBody(serialized: SerializedFormData): { body: Buffer; boundary: string } {
  const boundary = `----VeniceForgeBoundary${crypto.randomBytes(16).toString("hex")}`;
  const parts: Buffer[] = [];

  for (const entry of serialized.entries) {
    parts.push(Buffer.from(`--${boundary}\r\n`));
    if (entry._isFile && entry.filename) {
      const safeName = sanitizeMultipartToken(entry.name);
      const safeFilename = sanitizeMultipartToken(entry.filename);
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${safeName}"; filename="${safeFilename}"\r\n`));
      parts.push(Buffer.from(`Content-Type: ${sanitizeMultipartContentType(entry.type)}\r\n\r\n`));
      parts.push(Buffer.from(entry.value, "base64"));
    } else {
      const safeName = sanitizeMultipartToken(entry.name);
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${safeName}"\r\n\r\n`));
      parts.push(Buffer.from(entry.value, "utf-8"));
    }
    parts.push(Buffer.from(`\r\n`));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

/** Describes the standard shape of a Venice API response returned to the renderer. */
export interface VeniceIpcResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  contentType: string;
}

/** Strips sensitive headers from an incoming HTTP response.
 *  @param headers The raw response headers.
 *  @returns A sanitized record of safe headers.
 */
function sanitizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|cookie|set-cookie/i.test(key)) continue;
    if (Array.isArray(value)) result[key] = value.join(", ");
    else if (typeof value === "string") result[key] = value;
  }
  return result;
}

/** Parses an HTTP response body based on its content-type.
 *  @param buffer The raw response bytes.
 *  @param contentType The declared content-type header.
 *  @returns Parsed JSON, plain text, or base64-encoded data.
 */
function parseBody(buffer: Buffer, contentType: string): unknown {
  const text = buffer.toString("utf-8");
  if (contentType.includes("application/json")) {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { text: "Venice returned malformed JSON." };
    }
  }
  if (contentType.startsWith("text/") || contentType.includes("event-stream")) return text;
  return { dataBase64: buffer.toString("base64") };
}

/** The electron main process re-exports the shared OpenAI-compatible delta
 *  contract so `providerAdapters` and existing tests keep their stable API.
 *  The canonical implementation lives in
 *  `src/shared/sseStreamDecoder.ts` (shared with the Web transport). */
export type StreamDelta = SharedStreamDelta;

export const extractStreamDelta: typeof sharedExtractStreamDelta = sharedExtractStreamDelta;

/** Aborts an active Venice request by its signal ID.
 *  @param signalId The unique identifier for the active request.
 *  @returns An object indicating whether an active request was found and destroyed.
 */
export function abortVeniceRequest(signalId: string): { ok: boolean } {
  const active = activeRequests.get(signalId);
  if (!active) return { ok: false };
  active.destroy();
  activeRequests.delete(signalId);
  return { ok: true };
}

/** Sends a validated Venice API request and returns the parsed response.
 *  @param rawRequest The raw request payload to validate and send.
 *  @param options Optional callbacks for streaming deltas.
 *  @returns A promise resolving with the Venice API response.
 */
export async function performVeniceRequest(
  rawRequest: unknown,
  options: { onDelta?: (chunk: { content: string; reasoning: string; providerRequestId?: string; usage?: Record<string, unknown>; tool_calls?: Array<{ index: number; id?: string; type?: 'function'; function?: { name?: string; arguments?: string } }>; finish_reason?: string | null }) => void; body?: unknown } = {}
): Promise<VeniceIpcResponse> {
  const request = validateVeniceIpcRequest(rawRequest);
  // Renderer-provided fallbackConfig is retained only for wire compatibility.
  // Consent, ordering, and provider-native models are main-process authority.
  const fallbackConfig = getProviderSettings(request.profileId);
  const originalModel = typeof (request.body as Record<string, unknown>)?.model === 'string'
    ? (request.body as Record<string, unknown>).model as string : null;

  // If the request targets a specific provider via prefix (e.g. together:...), don't auto-fallback.
  const isExplicitProvider = originalModel && originalModel.includes(':');

  const providersToTry = ['venice'];
  if (!isExplicitProvider && fallbackConfig.autoFallbackEnabled && originalModel) {
    const extra = fallbackConfig.fallbackOrdering.filter((providerId) =>
      fallbackConfig.enabledProviders[providerId] === true &&
      typeof fallbackConfig.nativeFallbackModels[providerId] === "string"
    );
    providersToTry.push(...extra);
  }

  let lastResponse: VeniceIpcResponse | null = null;
  let lastError: Error | null = null;

  const requestSignal = (request as { signal?: AbortSignal }).signal;

  for (const providerId of providersToTry) {
    let hasStartedStreaming = false;
    // VF-AUD-20260831-P2-008: at most one Retry-After-aware retry per provider.
    // 5xx/408/other retryable errors fall through to the next provider without
    // an extra per-provider retry; the cross-provider fallback chain is the
    // primary resilience path for non-429 failures.
    try {
      const currentRequest = request;
      let providerSelection: ProviderRouteSelection | undefined;

      // Automatic fallback must use a provider-native model, never a Venice model id.
      if (providerId !== 'venice' && originalModel) {
        const nativeModel = fallbackConfig.nativeFallbackModels[providerId as keyof typeof fallbackConfig.nativeFallbackModels];
        if (!nativeModel) continue;
        providerSelection = { providerId, model: nativeModel };
      }

      const wrappedOptions = {
        ...options,
        onDelta: options.onDelta ? (chunk: Parameters<Exclude<typeof options.onDelta, undefined>>[0]) => {
          hasStartedStreaming = true;
          options.onDelta!(chunk);
        } : undefined
      };

      const response = await performSingleVeniceRequest(currentRequest, wrappedOptions, providerSelection);
      lastResponse = response;

      // If the adapter reported that this provider does not support the requested
      // endpoint (e.g. a chat-only provider receiving an image request), skip it
      // and continue to the next provider in the chain. This is not a terminal
      // failure — it just means the provider is incompatible with this request.
      const responseBody = response.body as Record<string, unknown> | null;
      if (
        !response.ok &&
        responseBody?._adapterNotSupported === true &&
        providerId !== 'venice'
      ) {
        logError(`Provider ${providerId} does not support this endpoint, skipping in fallback chain.`);
        continue;
      }

      // Error policy: Only fallback on 5xx or rate limits (429), or 408 Timeout.
      if (response.ok || ![408, 429, 500, 502, 503, 504].includes(response.status)) {
        return response; // Success, or a client error (e.g. 400 Bad Request, 401 Auth) that shouldn't be retried
      }

      if (hasStartedStreaming) {
        logError(`Provider ${providerId} failed with ${response.status} after stream started, cannot fallback.`);
        return response;
      }

      // VF-AUD-20260831-P2-008: 429 with a parseable Retry-After header
      // triggers a single bounded, jittered delay followed by one retry on
      // the same provider. If the retry also fails, we fall through to the
      // next provider in the chain. The delay respects the request signal.
      if (response.status === 429) {
        const retryAfterMs = parseRetryAfterMs(response.headers["retry-after"]);
        if (retryAfterMs !== null) {
          const delayMs = computeJitteredDelay(retryAfterMs);
          if (delayMs > 0) {
            try {
              await abortableDelay(delayMs, requestSignal);
            } catch (err) {
              // Aborted during the Retry-After wait — surface the abort.
              throw err instanceof Error ? err : new Error(String(err));
            }
          }
          logError(`Provider ${providerId} returned 429 with Retry-After=${response.headers["retry-after"]}; retrying once after ${delayMs}ms.`);
          // Re-enter the inner try so a single retry attempt runs against
          // the same provider. We intentionally do not loop here because
          // a second 429 should fall through to the next provider.
          try {
            const retried = await performSingleVeniceRequest(currentRequest, wrappedOptions, providerSelection);
            lastResponse = retried;
            if (retried.ok) return retried;
            // Non-OK retry: return the latest response so the caller can
            // inspect the post-retry status without further fallback
            // exhausting the user's patience.
            logError(`Provider ${providerId} retry after Retry-After returned ${retried.status}.`);
            return retried;
          } catch (innerErr) {
            if (innerErr instanceof Error && innerErr.message === "Request aborted") {
              throw innerErr;
            }
            logError(`Provider ${providerId} retry after Retry-After threw.`, innerErr);
            lastError = innerErr as Error;
            continue;
          }
        }
      }

      // If we got here, it's a retryable error.
      logError(`Provider ${providerId} failed with ${response.status}, attempting fallback if available.`);
    } catch (err) {
      lastError = err as Error;
      // Network errors (fetch failed, aborted, etc)
      // We only fallback if it's not a user abort and we haven't started streaming
      if (err instanceof Error && err.message === "Request aborted") {
        throw err;
      }
      if (hasStartedStreaming) {
        logError(`Provider ${providerId} failed after stream started, cannot fallback.`, err);
        throw err;
      }
      logError(`Provider ${providerId} network error, attempting fallback if available.`, err);
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error("All fallback providers failed");
}

async function performSingleVeniceRequest(
  request: ReturnType<typeof validateVeniceIpcRequest>,
  options: { onDelta?: (chunk: { content: string; reasoning: string; providerRequestId?: string; usage?: Record<string, unknown>; tool_calls?: Array<{ index: number; id?: string; type?: 'function'; function?: { name?: string; arguments?: string } }>; finish_reason?: string | null }) => void; body?: unknown } = {},
  providerSelection?: ProviderRouteSelection,
): Promise<VeniceIpcResponse> {

  // Check if this request should be routed to a fallback provider
  const fallbackRouteResult = resolveProviderRoute(request as unknown as Record<string, unknown>, request.profileId, providerSelection);
  if (fallbackRouteResult && fallbackRouteResult.error) {
    return {
      ok: false,
      status: 400,
      statusText: "Bad Request",
      headers: {},
      // _adapterNotSupported signals the outer fallback loop to skip this
      // provider and continue to the next one, rather than surfacing the
      // error to the caller as a terminal failure.
      body: { error: fallbackRouteResult.error, _adapterNotSupported: fallbackRouteResult.unsupported === true },
      contentType: "application/json",
    };
  }

  const route = fallbackRouteResult?.route;
  const isFallback = !!route;

  const apiKey = isFallback ? undefined : getApiKey(request.profileId);
  if (!isFallback && !apiKey) {
    return {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: {},
      body: { error: "Venice API key is not configured. Add it in Settings." },
      contentType: "application/json",
    };
  }

  const release = await acquireVeniceSlot();

  return new Promise<VeniceIpcResponse>((resolve, reject) => {
    let bodyText: string | Buffer | undefined;
    let contentTypeOverride: string | undefined;

    try {
      // Detect serialized FormData from the renderer and rebuild multipart body.
      const serializedForm = request.body as SerializedFormData | undefined;
      if (serializedForm && typeof serializedForm === "object" && serializedForm._isSerializedFormData) {
        const { body, boundary } = buildMultipartBody(serializedForm);
        bodyText = body;
        contentTypeOverride = `multipart/form-data; boundary=${boundary}`;
      } else {
        const bodyObj = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : null;
        const requestBody = route && route.transformBody && bodyObj && typeof bodyObj.model === 'string'
            ? route.transformBody(
                bodyObj,
                providerSelection?.model ?? bodyObj.model.split(':').slice(1).join(':'),
              )
            : request.body;
        bodyText = requestBody === undefined ? undefined : JSON.stringify(requestBody);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError("Failed to prepare request body", redactErrorMessage(message));
      reject(new Error(`Failed to prepare request: ${redactErrorMessage(message)}`));
      return;
    }

    const hostname = route ? route.host : VENICE_API_HOST;
    const path = route ? route.path : `${VENICE_API_BASE_PATH}${request.endpoint}`;

    const headers: Record<string, string | number> = {
      ...request.headers,
      ...(route ? route.headers : {
        Authorization: `Bearer ${apiKey}`
      }),
      "User-Agent": `VeniceForge/${app.getVersion()}`,
    };

    if (bodyText !== undefined) {
      headers["Content-Type"] = contentTypeOverride || headers["Content-Type"] || "application/json";
      headers["Content-Length"] = Buffer.isBuffer(bodyText) ? bodyText.length : Buffer.byteLength(bodyText);
    }

    const isSseStream = Boolean(options.onDelta);
    const req = https.request(
      {
        hostname,
        path,
        method: request.method,
        headers,
        timeout: isSseStream ? VENICE_API_STREAM_TIMEOUT_MS : VENICE_API_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        const responseHeaders = sanitizeHeaders(res.headers);
        const contentType = String(res.headers["content-type"] || "");
        // Shared incremental SSE decoder: blank-line framing, multiline
        // data: joining, streaming UTF-8, typed decode errors, EOF flush.
        // The same decoder drives the Web transport so both emit identical
        // events/errors for identical byte streams.
        let sseDecoder: SseDecoder | undefined;
        let streamText = "";
        let streamTerminalError: string | undefined;

        const onDelta = options.onDelta;
        const consumeSseEvents = (events: SseEvent[]) => {
          if (!onDelta) return;
          for (const event of events) {
            const outcome = applyStreamSseEvent(event, {
              onDelta,
              ...(route?.extractStreamDelta
                ? { extractFn: route.extractStreamDelta }
                : {}),
            });
            streamText += outcome.text;
            if (outcome.malformed) {
              // SECURITY: redact any leaked secret-like values before
              // logging; the raw frame never reaches the renderer.
              const redacted = redactErrorMessage(
                outcome.errorMessage || outcome.rawData || "unknown frame",
              );
              logError("Malformed SSE frame from Venice upstream", {
                raw: redacted,
              });
              if (outcome.errorMessage && !streamTerminalError) {
                streamTerminalError = outcome.errorMessage;
              }
            }
          }
        };

        res.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes >= MAX_VENICE_RESPONSE_BYTES) {
            req.destroy(new Error("Response too large"));
            return;
          }

          if (contentType.includes("event-stream") && res.statusCode && res.statusCode < 400) {
            if (!sseDecoder) sseDecoder = new SseDecoder();
            let events: SseEvent[];
            try {
              events = sseDecoder.push(chunk);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              logError("SseDecodeError from Venice upstream", {
                raw: redactErrorMessage(message),
              });
              req.destroy(new Error("Venice returned invalid stream data."));
              return;
            }
            consumeSseEvents(events);
          } else {
            chunks.push(chunk);
          }
        });

        res.on("end", () => {
          if (sseDecoder) {
            let events: SseEvent[] = [];
            try {
              events = sseDecoder.flush();
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              logError("SseDecodeError from Venice upstream (tail)", {
                raw: redactErrorMessage(message),
              });
              resolve({
                ok: false,
                status: 0,
                statusText: "Stream Error",
                headers: responseHeaders,
                body: { error: "Venice stream ended with a truncated data sequence." },
                contentType,
              });
              return;
            }
            consumeSseEvents(events);
          }
          if (streamTerminalError) {
            resolve({
              ok: false,
              status: 502,
              statusText: "Bad Gateway",
              headers: responseHeaders,
              body: { error: streamTerminalError },
              contentType,
            });
            return;
          }
          const buffer = Buffer.concat(chunks);
          let body =
            options.onDelta && contentType.includes("event-stream") && res.statusCode && res.statusCode < 400
              ? { text: streamText }
              : parseBody(buffer, contentType);

          if (route?.transformResponse && typeof body === 'object' && body !== null) {
            body = route.transformResponse(body);
          }
          resolve({
            ok: !!res.statusCode && res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            statusText: res.statusMessage || "",
            headers: responseHeaders,
            body,
            contentType,
          });
        });

        res.on("error", (err) => {
          setLastApiError("Venice response stream error.");
          logError("Venice response stream error", err);
          reject(new Error("Venice response stream error."));
        });
      }
    );

    const cleanup = () => {
      if (request.signalId) activeRequests.delete(request.signalId);
    };

    if (request.signalId) {
      const previous = activeRequests.get(request.signalId);
      if (previous) {
        previous.destroy();
      }
      activeRequests.set(request.signalId, {
        destroy: () => req.destroy(new Error("Request aborted")),
      });
    }

    // P1-SAFETY-ABORT-RESIDUAL: forward direct AbortSignal if provided (in addition to signalId/IPC path)
    const maybeSignal = (request as { signal?: AbortSignal }).signal;
    if (maybeSignal) {
      if (maybeSignal.aborted) {
        req.destroy(new Error("Request aborted"));
      } else {
        maybeSignal.addEventListener("abort", () => req.destroy(new Error("Request aborted")), { once: true });
      }
    }

    req.on("error", (err) => {
      const message =
        err.message === "Request aborted"
          ? "Request aborted"
          : err.message === "Response too large"
          ? "Venice response exceeded the local safety limit."
          : "Failed to reach Venice API.";
      if (message !== "Request aborted") {
        setLastApiError(message);
        logError("Venice API request failed", err);
      }
      reject(new Error(message));
    });
    req.on("timeout", () => {
      req.destroy(new Error("Connection timed out"));
    });
    req.on("close", cleanup);

    if (bodyText !== undefined) req.write(bodyText);
    req.end();
  }).finally(release).then((response) => {
    if (!response.ok) setLastApiError(readResponseError(response));
    return response;
  });
}

/** Extracts a human-readable error message from a Venice API response.
 *  @param response The Venice response to inspect.
 *  @returns The most specific error message available.
 */
export function readResponseError(response: VeniceIpcResponse): string {
  const body = response.body && typeof response.body === "object"
    ? (response.body as Record<string, unknown>)
    : {};
  const error = body.error;
  const top =
    error && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : error || body.message;
  if (top) {
    const primary = typeof top === "object" ? JSON.stringify(top) : String(top);
    const details = body.details;
    if (typeof details === "string") {
      const detail = details.trim();
      if (detail && !primary.includes(detail)) return `${primary}: ${detail}`;
    }
    return primary;
  }
  // Venice DetailedError (Zod): { details: { _errors?: string[], field?: { _errors: string[] } } }
  const details = body.details;
  if (typeof details === "string" && details.trim()) return details.trim();
  if (details && typeof details === "object") {
    const detailRecord = details as Record<string, unknown>;
    if (Array.isArray(detailRecord._errors) && detailRecord._errors.length) return String(detailRecord._errors[0]);
    for (const key of Object.keys(detailRecord)) {
      if (key === "_errors") continue;
      const field = detailRecord[key];
      const errs =
        field && typeof field === "object"
          ? (field as { _errors?: unknown })._errors
          : undefined;
      if (Array.isArray(errs) && errs.length) return `${key}: ${String(errs[0])}`;
    }
    return "Request validation failed";
  }
  return String(body.detail || response.statusText || `HTTP ${response.status}`);
}
