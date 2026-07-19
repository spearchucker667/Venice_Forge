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
import { VENICE_API_HOST, VENICE_API_BASE_PATH, VENICE_API_TIMEOUT_MS } from "../../src/shared/apiConfig";
import { resolveProviderRoute, type ProviderRouteSelection } from "./providerAdapters";
import { getProviderSettings } from "./providerSettingsStore";

/** Maximum non-streaming Venice response body size we will buffer in memory. */
const MAX_VENICE_RESPONSE_BYTES = 25 * 1024 * 1024;

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

/** Extracts the text and reasoning delta from a server-sent event data payload.
 *  @param data The raw SSE data line.
 *  @returns The extracted content and reasoning delta, if any.
 */
/** Result of extracting a delta from an SSE data payload. */
export interface StreamDelta {
  content: string;
  reasoning: string;
  /** True when the data was a JSON object with a recognizable delta shape. */
  parsed: boolean;
  /** True when JSON.parse failed and the raw data was returned as content. */
  malformed: boolean;
  /** Raw data when malformed (useful for diagnostics; never forwarded to renderer). */
  rawData?: string;
  /** The upstream provider's unique request ID, typically present on the first chunk. */
  providerRequestId?: string;
  tool_calls?: Array<{ index: number; id?: string; type?: 'function'; function?: { name?: string; arguments?: string } }>;
  finish_reason?: string | null;
  usage?: Record<string, unknown>;
}

/** Result of parsing an SSE buffer. */
export interface SseParseResult {
  buffer: string;
  text: string;
  malformedFrameCount: number;
  malformedSamples: string[];
}

/**
 * Extracts the text and reasoning delta from a server-sent event data payload.
 *
 *  - Returns `{ parsed: true, malformed: false, ... }` on a recognizable
 *    JSON object that carries a real delta.
 *  - Returns `{ parsed: true, malformed: true, rawData }` for a JSON
 *    object that is an *error frame* (e.g. `{"error": "rate_limited"}` or
 *    OpenAI-style `{"type":"error","error":{...}}`). These have no
 *    recognisable delta and must be surfaced, not silently dropped.
 *  - Returns `{ parsed: false, malformed: true, rawData }` on a JSON
 *    parse error so the caller can log/diagnose the frame.
 *  - The renderer never sees `rawData` (it may contain provider error
 *    text or partial API keys); it is only retained for the in-process
 *    bridge diagnostics path.
 */
export function extractStreamDelta(data: string): StreamDelta {
  if (!data) return { content: "", reasoning: "", parsed: false, malformed: false };
  if (data === "[DONE]") return { content: "", reasoning: "", parsed: true, malformed: false };
  try {
    const json = JSON.parse(data);
    if (json && typeof json === "object") {
      // Provider error frame: OpenAI-style `{ type: "error", error: { ... } }`
      // or simpler `{ error: "..." }` shapes. No recognisable delta
      // payload — surface to the diagnostic path so we don't silently
      // hide rate-limit / quota / upstream-error signals from the user.
      const isErrorFrame =
        (typeof json.type === "string" && json.type.toLowerCase() === "error") ||
        json.error !== undefined;
      const content = json?.choices?.[0]?.delta?.content ??
                      json?.choices?.[0]?.message?.content ??
                      json?.choices?.[0]?.text ??
                      "";
      const reasoning = json?.choices?.[0]?.delta?.reasoning_content ??
                        json?.choices?.[0]?.message?.reasoning_content ??
                        "";
      const providerRequestId = json?.id;
      const tool_calls = json?.choices?.[0]?.delta?.tool_calls;
      const finish_reason = json?.choices?.[0]?.finish_reason;
      const usage = json?.usage;
      if (isErrorFrame && !content && !reasoning) {
        return { content: "", reasoning: "", providerRequestId, parsed: true, malformed: true, rawData: data };
      }
      return { content, reasoning, providerRequestId, tool_calls, finish_reason, usage, parsed: true, malformed: false };
    }
    return { content: "", reasoning: "", parsed: true, malformed: false };
  } catch {
    return { content: "", reasoning: "", parsed: false, malformed: true, rawData: data };
  }
}

/**
 * Parses SSE-formatted lines and invokes a callback for each text delta.
 *
 *  - Skips comment lines (lines starting with ":").
 *  - Recognizes `event:`, `id:`, `retry:` lines but does not surface them.
 *  - Joins multiple consecutive `data:` lines in the same event with
 *    newlines (SSE spec).
 *  - Recognizes `[DONE]` as a stream terminator.
 *  - Counts malformed JSON frames and provider error frames in the
 *    returned `malformedFrameCount` so the caller can decide whether to
 *    log / surface a warning.
 *  - Dispatches any pending partial event at end-of-buffer so the next
 *    call receives a clean accumulator.
 *  - The function is *pure*: malformed frames do not throw, and the
 *    callback is only invoked for deltas that carry real content.
 *
 *  @param buffer The accumulated SSE buffer.
 *  @param onDelta Callback invoked for each valid delta. Receives
 *                 `{ content, reasoning }` only — the `parsed` /
 *                 `malformed` flags are intentionally not surfaced to
 *                 keep the streaming API stable for existing callers.
 *  @param onMalformed Optional callback invoked once per malformed
 *                     frame with the raw data, for diagnostics.
 *  @returns The remaining unparsed buffer, concatenated text, and
 *           malformed-frame diagnostics.
 */
export function parseSseLines(
  buffer: string,
  onDelta: (chunk: { content: string; reasoning: string; providerRequestId?: string; usage?: Record<string, unknown>; tool_calls?: Array<{ index: number; id?: string; type?: 'function'; function?: { name?: string; arguments?: string } }>; finish_reason?: string | null }) => void,
  onMalformed?: (rawData: string) => void,
  customExtractStreamDelta?: (data: string) => StreamDelta,
): SseParseResult {
  const lines = buffer.split(/\r?\n/);
  const tail = lines.pop() ?? "";
  let text = "";
  let malformedFrameCount = 0;
  const malformedSamples: string[] = [];
  // SSE events are separated by blank lines; we accumulate data: lines
  // until we see a blank line (or end-of-buffer), then dispatch the
  // concatenated payload.
  let dataLines: string[] = [];
  const dispatch = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    dataLines = [];
    const extractFn = customExtractStreamDelta || extractStreamDelta;
    const delta = extractFn(data);
    if (delta.malformed) {
      malformedFrameCount++;
      if (malformedSamples.length < 5) {
        malformedSamples.push(delta.rawData?.slice(0, 200) ?? "");
      }
      try {
        onMalformed?.(delta.rawData ?? "");
      } catch {
        // diagnostics callback threw — never let it kill the stream.
      }
      return;
    }
    if (delta.content || delta.reasoning || delta.providerRequestId || delta.tool_calls || delta.finish_reason !== undefined || delta.usage) {
      text += delta.content;
      // Preserve the existing onDelta contract: only `{ content, reasoning, providerRequestId, tool_calls, finish_reason, usage }`.
      onDelta({ content: delta.content, reasoning: delta.reasoning, providerRequestId: delta.providerRequestId, tool_calls: delta.tool_calls, finish_reason: delta.finish_reason, usage: delta.usage });
    }
  };
  for (const line of lines) {
    if (line === "") {
      // Blank line = event boundary. Dispatch any accumulated data.
      dispatch();
      continue;
    }
    if (line.startsWith(":")) {
      // Comment line; ignore per SSE spec.
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.replace(/^data:\s*/, ""));
      continue;
    }
    // event:, id:, retry: — recognized but not surfaced for chat-completions.
    // We still need to reset the data accumulator on a new event type to
    // avoid joining across event boundaries.
    if (line.startsWith("event:") || line.startsWith("id:") || line.startsWith("retry:")) {
      dataLines = [];
      continue;
    }
    // Unknown line shape — ignore per SSE spec.
  }
  // If the input ended without a blank-line boundary, dispatch the
  // partial event now so its content is not silently held in the
  // accumulator and lost across calls. The remaining tail is the last
  // incomplete line (no \n at the end of buffer).
  dispatch();
  return { buffer: tail, text, malformedFrameCount, malformedSamples };
}

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

  for (const providerId of providersToTry) {
    let hasStartedStreaming = false;
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

    const req = https.request(
      {
        hostname,
        path,
        method: request.method,
        headers,
        timeout: VENICE_API_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        const responseHeaders = sanitizeHeaders(res.headers);
        const contentType = String(res.headers["content-type"] || "");
        let sseBuffer = "";
        let streamText = "";

        res.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes >= MAX_VENICE_RESPONSE_BYTES) {
            req.destroy(new Error("Response too large"));
            return;
          }

          if (options.onDelta && contentType.includes("event-stream") && res.statusCode && res.statusCode < 400) {
            sseBuffer += chunk.toString("utf-8");
            const parsed = parseSseLines(
              sseBuffer,
              options.onDelta,
              (raw) => {
                // SECURITY: redact any leaked secret-like values before logging.
                const redacted = redactErrorMessage(raw);
                logError("Malformed SSE frame from Venice upstream", { raw: redacted });
              },
              route?.extractStreamDelta
            );
            sseBuffer = parsed.buffer;
            streamText += parsed.text;
          } else {
            chunks.push(chunk);
          }
        });

        res.on("end", () => {
          if (options.onDelta && sseBuffer) {
            const parsed = parseSseLines(`${sseBuffer}\n`, options.onDelta, (raw) => {
              const redacted = redactErrorMessage(raw);
              logError("Malformed SSE frame from Venice upstream (tail)", { raw: redacted });
            }, route?.extractStreamDelta);
            streamText += parsed.text;
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
  if (top) return typeof top === "object" ? JSON.stringify(top) : String(top);
  // Venice DetailedError (Zod): { details: { _errors?: string[], field?: { _errors: string[] } } }
  const details = body.details;
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
