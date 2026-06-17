/** @fileoverview Single entry point for all Venice API calls from the renderer. */

// Code Owner: fayeblade (@spearchucker667)
import { DIAG_HEADER_NAMES } from "../constants/venice";
import { PROXY_BASE_PATH } from "../shared/apiConfig";
import { desktopVenice, isElectron } from "./desktopBridge";
import type { VeniceForgeResponse } from "../types/desktop";
import type { DiagnosticsEntry } from "../types/venice";
import type { AppDispatch } from "../types/app";
import { MIB, VENICE_MAX_RAW_UPLOAD_BYTES, VENICE_MAX_SERIALIZED_UPLOAD_BYTES } from "../shared/limits";
import { redactErrorMessage } from "../shared/redaction";
import { maybeRunLocalFamilyGuard, previewLocalFamilyGuard, SafetyGuardBlockedError } from "../shared/safety";
import {
  buildInspectorTelemetryPatch,
  deriveGuardOutcome,
  maskInspectorHeaders,
  sanitizeInspectorPayload,
  type InspectorSafetyDecision,
} from "./inspectorTelemetry";
import { useInspectorStore } from "../stores/inspector-store";
import { useSettingsStore } from "../stores/settings-store";

export type { InspectorSafetyDecision };

/**
 * Returns a non-mutating preview of the local Family Safe Mode decision for
 * inspector logging. In Electron mode the renderer is NEVER authoritative —
 * the main-process IPC handler is. In web mode the renderer's local
 * classifier is the only enforcement, so we evaluate it via the
 * `previewLocalFamilyGuard` helper (which runs the rule engine but does
 * NOT call `recordDecision`).
 *
 * The shape returned is always one of the three `InspectorSafetyDecision`
 * variants above, so the inspector UI can render every state without
 * resorting to `null`.
 */
function getSafetyDecisionForLog(
  endpoint: string,
  method: string,
  payload: unknown,
): { decision: InspectorSafetyDecision; previewDurationMs: number } {
  const previewStartedAt = Date.now();
  if (isElectron()) {
    return {
      decision: { layer: "local-family-safe-mode", mode: "electron-main-authoritative", action: "deferred" },
      previewDurationMs: Date.now() - previewStartedAt,
    };
  }
  if (method !== "POST" || payload === undefined) {
    return {
      decision: { layer: "local-family-safe-mode", mode: "electron-main-authoritative", action: "deferred" },
      previewDurationMs: Date.now() - previewStartedAt,
    };
  }
  // Web mode: the renderer is the only enforcement layer. Use the
  // non-mutating preview so we never double-count.
  const decision = previewLocalFamilyGuard(
    { endpoint, method, payload, source: "venice-client" },
    useSettingsStore.getState().localFamilySafeModeEnabled,
  );
  const previewDurationMs = Date.now() - previewStartedAt;
  if (decision.allowed && decision.skipped) {
    return {
      decision: {
        layer: "local-family-safe-mode",
        mode: "adult",
        action: "skipped",
        reasonCode: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
      },
      previewDurationMs,
    };
  }
  if (!decision.allowed) {
    return {
      decision: {
        layer: "local-family-safe-mode",
        mode: "family",
        action: "block",
        reasonCode: decision.reason,
      },
      previewDurationMs,
    };
  }
  return {
    decision: { layer: "local-family-safe-mode", mode: "family", action: "allow" },
    previewDurationMs,
  };
}

/** Maximum raw upload file size accepted by the renderer. */
export const MAX_RAW_UPLOAD_BYTES = VENICE_MAX_RAW_UPLOAD_BYTES;

/** Maximum serialized upload size accepted over IPC. */
export const MAX_SERIALIZED_UPLOAD_BYTES = VENICE_MAX_SERIALIZED_UPLOAD_BYTES;

/** In-flight request deduplication map (API-004). */
const inFlight = new Map<string, Promise<{ data: unknown; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }>>();

// Clear in-flight map on navigation to prevent promise leaks (BUG-013).
const cleanupInFlightUnloadListener = (() => {
  const handler = () => inFlight.clear();
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", handler);
  }
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", handler);
    }
  };
})();

/** Exported for test cleanup only. */
export { cleanupInFlightUnloadListener };

/**
 * Generates a deduplication key from request parameters.
 * @param endpoint The API endpoint.
 * @param method The HTTP method.
 * @param body The request body.
 * @returns A string key suitable for deduplicating identical requests.
 */
/** @internal exported for testing */
export function dedupeKey(endpoint: string, method: string, body: unknown): string {
  let bodyHash = "";
  if (body !== undefined && body !== null) {
    try {
      bodyHash = JSON.stringify(body);
    } catch {
      // Circular or otherwise unserialisable body — skip deduplication
      bodyHash = `[unhashable-${Date.now()}-${Math.random()}]`;
    }
  }
  return `${method} ${endpoint} ${bodyHash}`;
}

/**
 * Returns the current timestamp as an ISO 8601 string.
 * @returns The current time in ISO format.
 */
function nowIso() {
  return new Date().toISOString();
}

import { sleep, createTimeoutSignal } from "../utils/timeout";

/**
 * Calculates an exponential backoff delay for a given retry attempt.
 * @param attempt The current retry attempt number (0-indexed).
 * @param baseMs The base delay in milliseconds.
 * @param maxMs The maximum delay cap in milliseconds.
 * @returns The computed backoff delay.
 */
function calculateBackoff(attempt: number, baseMs = 1000, maxMs = 8000): number {
  return Math.min(baseMs * Math.pow(2, attempt), maxMs);
}

/**
 * Checks whether a number resembles a Unix timestamp (seconds since epoch).
 * @param n The number to evaluate.
 * @returns True if the value looks like a Unix timestamp.
 */
function looksLikeUnixTimestamp(n: number) {
  return Number.isFinite(n) && n > 1000000000 && n < 9999999999;
}

/**
 * Extracts known diagnostic headers from a response object.
 * @param response The fetch Response to inspect.
 * @returns A record of header names to their string values.
 */
function parseDiagnosticsHeaders(response: Response) {
  const headers: Record<string, string> = {};
  DIAG_HEADER_NAMES.forEach((name) => {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  });
  return headers;
}

/**
 * Serialized entry type for Form Data payload.
 */
interface SerializedFormDataEntry {
  name: string;
  value: string;
  filename?: string;
  type?: string;
  _isFile?: boolean;
}

/**
 * Serialized FormData type.
 */
interface SerializedFormData {
  _isSerializedFormData: boolean;
  entries: SerializedFormDataEntry[];
}

/**
 * Extracts the model identifier from request or response payloads.
 * @param requestBody The request body.
 * @param responseBody The parsed response body.
 * @returns The model identifier if found, otherwise null.
 */
function findModelRecursively(obj: unknown, depth = 3): string | null {
  if (!obj || typeof obj !== "object" || depth === 0) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findModelRecursively(item, depth - 1);
      if (found) return found;
    }
  } else {
    const record = obj as Record<string, unknown>;
    if (typeof record.model === "string") return record.model;
    for (const val of Object.values(record)) {
      const found = findModelRecursively(val, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

export function extractModelName(requestBody: unknown, responseBody: unknown): string | null {
  if (responseBody && typeof responseBody === "object") {
    const resp = responseBody as Record<string, unknown>;
    if (typeof resp.model === "string") return resp.model;
  }
  if (requestBody) {
    const req = requestBody as Record<string, unknown>;
    if (typeof req.get === "function") {
      const val = (req.get as (key: string) => unknown)("model");
      if (typeof val === "string") return val;
    }
    if (typeof req === "object") {
      if (req._isSerializedFormData && Array.isArray(req.entries)) {
        const entry = req.entries.find((e: unknown) => {
          const item = e as Record<string, unknown>;
          return item && item.name === "model";
        }) as Record<string, unknown> | undefined;
        if (entry && typeof entry.value === "string") return entry.value;
      }
    }
  }
  
  return findModelRecursively(responseBody) || findModelRecursively(requestBody);
}

/** Input fields for summarizing diagnostics. */
export interface SummarizeDiagnosticsInput {
  endpoint: string;
  method: string;
  status?: number | string | null;
  ok?: boolean;
  headers?: Record<string, string>;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  model?: string | null;
}

/**
 * Summarizes request metadata into a diagnostic snapshot.
 * @param params The raw request and response fields.
 * @returns A normalized diagnostics object with latency and header info.
 */
export function summarizeDiagnostics({
  endpoint,
  method,
  status,
  ok,
  headers,
  error,
  startedAt,
  endedAt,
  model,
}: SummarizeDiagnosticsInput): Partial<DiagnosticsEntry> {
  return {
    endpoint,
    method,
    status: status ?? null,
    ok: !!ok,
    error: error || "",
    startedAt,
    endedAt,
    latencyMs:
      startedAt && endedAt
        ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
        : null,
    headers: headers || {},
    model: model || null,
  };
}

/**
 * Normalizes an HTTP error status and raw message into a user-friendly string.
 * @param status The HTTP status code, or null if unavailable.
 * @param rawMessage The original error message.
 * @returns A formatted error string combining the status and message.
 */
export function normalizeError(status: number | null, rawMessage: string) {
  const base = rawMessage || "Request failed";
  const map: Record<number, string> = {
    400: "400 request/schema/model error",
    401: "401 invalid or missing API key",
    402: "402 insufficient balance/payment required",
    403: "403 forbidden/key scope problem",
    404: "404 model or resource not found",
    413: "413 payload too large",
    415: "415 wrong content type",
    429: "429 rate limit",
    500: "500 Venice/server retryable error",
    503: "503 Venice/server retryable error",
  };
  return status && map[status] ? `${map[status]}: ${base}` : base;
}

/**
 * Produces a safe, redacted error string for inspector telemetry.
 * Avoids stringifying arbitrary thrown objects (which can leak paths or
 * implementation details) and redacts secret-like tokens before storage.
 */
function safeInspectorError(err: unknown): string {
  if (err instanceof Error) return redactErrorMessage(err.message);
  if (typeof err === "string") return redactErrorMessage(err);
  return "Unknown error";
}

/**
 * Extracts a readable error message from a desktop API response body.
 * @param body The parsed response body from the main process.
 * @returns A human-readable error string.
 */
function readDesktopErrorBody(body: unknown): string {
  if (!body || typeof body !== "object") return String(body || "Unknown Venice API error");
  const record = body as Record<string, unknown>;
  const errorObj = record.error as Record<string, unknown> | undefined;
  const top = errorObj?.message || record.error || record.message;
  if (top) {
    if (typeof top === "object") {
      try {
        const str = JSON.stringify(top);
        if (str === "{}" || str === "[]") {
          try {
            const fallback = String(top);
            return fallback === "[object Object]" ? "Malformed API error object" : fallback;
          } catch {
            return "Malformed API error object";
          }
        }
        return str;
      } catch {
        return "[unserializable error]";
      }
    }
    return String(top);
  }

  const details = record.details;
  if (details && typeof details === "object") {
    const detailsRec = details as Record<string, unknown>;
    if (Array.isArray(detailsRec._errors) && detailsRec._errors.length) return String(detailsRec._errors[0]);
    for (const key of Object.keys(detailsRec)) {
      if (key === "_errors") continue;
      const val = detailsRec[key] as Record<string, unknown> | undefined;
      const errs = val?._errors;
      if (Array.isArray(errs) && errs.length) return `${key}: ${String(errs[0])}`;
    }
    return "Request validation failed";
  }
  return String(record.detail || record.text || "Unknown Venice API error");
}

/**
 * Extracts a readable error message from a web-mode API response.
 * @param parsed The parsed JSON body, if available.
 * @param text The raw response text.
 * @param statusText The HTTP status text.
 * @returns A human-readable error string.
 */
export function readWebErrorBody(parsed: unknown, text: string, statusText: string): string {
  if (!parsed || typeof parsed !== "object") return String(parsed || text || statusText || "Unknown Venice API error");
  const record = parsed as Record<string, unknown>;
  const errorObj = record.error as Record<string, unknown> | undefined;
  const top = errorObj?.message || record.error || record.message;
  if (top) {
    if (typeof top === "object") {
      try {
        const str = JSON.stringify(top);
        if (str === "{}" || str === "[]") {
          try {
            const fallback = String(top);
            return fallback === "[object Object]" ? "Malformed API error object" : fallback;
          } catch {
            return "Malformed API error object";
          }
        }
        return str;
      } catch {
        return "[unserializable error]";
      }
    }
    return String(top);
  }

  const details = record.details;
  if (details && typeof details === "object") {
    const detailsRec = details as Record<string, unknown>;
    if (Array.isArray(detailsRec._errors) && detailsRec._errors.length) return String(detailsRec._errors[0]);
    for (const key of Object.keys(detailsRec)) {
      if (key === "_errors") continue;
      const val = detailsRec[key] as Record<string, unknown> | undefined;
      const errs = val?._errors;
      if (Array.isArray(errs) && errs.length) return `${key}: ${String(errs[0])}`;
    }
    return "Request validation failed";
  }
  return String(record.detail || text || statusText || "Unknown Venice API error");
}

/**
 * Serializes a FormData instance into a plain object safe for IPC.
 * @param formData The FormData to serialize.
 * @returns A promise resolving to the serialized representation.
 */
export async function serializeFormData(formData: FormData): Promise<SerializedFormData> {
  const entries: SerializedFormDataEntry[] = [];
  for (const [name, value] of formData.entries()) {
    if (value instanceof File) {
      const arrayBuffer = await value.arrayBuffer();
      const estimatedSerializedBytes = Math.ceil(arrayBuffer.byteLength * 4 / 3);
      if (arrayBuffer.byteLength > MAX_RAW_UPLOAD_BYTES) {
        throw new Error(`File too large. Maximum upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / MIB)} MiB.`);
      }
      if (estimatedSerializedBytes > MAX_SERIALIZED_UPLOAD_BYTES) {
        throw new Error(`Serialized upload too large. Maximum raw upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / MIB)} MiB.`);
      }
      const bytes = new Uint8Array(arrayBuffer);
      // 0x8000 (32 KiB) chunks avoid stack overflow when spreading large typed arrays.
      const chunkSize = 0x8000;
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      entries.push({
        name,
        value: btoa(binary),
        filename: value.name,
        type: value.type,
        _isFile: true,
      });
    } else if (typeof value === "object" && value !== null && (value as unknown) instanceof Blob) {
      const blob = value as Blob;
      const arrayBuffer = await blob.arrayBuffer();
      const estimatedSerializedBytes = Math.ceil(arrayBuffer.byteLength * 4 / 3);
      if (arrayBuffer.byteLength > MAX_RAW_UPLOAD_BYTES) {
        throw new Error(`File too large. Maximum upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / MIB)} MiB.`);
      }
      if (estimatedSerializedBytes > MAX_SERIALIZED_UPLOAD_BYTES) {
        throw new Error(`Serialized upload too large. Maximum raw upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / MIB)} MiB.`);
      }
      const bytes = new Uint8Array(arrayBuffer);
      const chunkSize = 0x8000;
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      entries.push({
        name,
        value: btoa(binary),
        filename: (blob as File).name || "blob",
        type: blob.type || "application/octet-stream",
        _isFile: true,
      });
    } else {
      entries.push({ name, value: String(value) });
    }
  }
  return { _isSerializedFormData: true, entries };
}

/** Custom error structure for Venice client requests. */
interface VeniceApiError extends Error {
  status?: number | null;
  diagnostics?: Partial<DiagnosticsEntry>;
}

/**
 * Performs a Venice API request through the desktop IPC bridge with retries.
 * @param endpoint The Venice API endpoint.
 * @param options Request options including method, body, signal, and dispatch.
 * @returns A promise resolving to data, response, headers, and diagnostics.
 */
async function veniceFetchDesktop(
  endpoint: string,
  {
    method = "GET",
    body = undefined as unknown,
    signal = undefined as AbortSignal | undefined,
    dispatch = undefined as AppDispatch | undefined,
    headers = {} as Record<string, string>,
    isFormData = false,
    retry = true,
    timeoutMs = undefined as number | undefined,
  }: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
    dispatch?: AppDispatch;
    headers?: Record<string, string>;
    isFormData?: boolean;
    retry?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<{ data: unknown; response: VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }> {
  // Serialize FormData before crossing the IPC boundary.
  let serializedBody = body;
  if (isFormData && body instanceof FormData) {
    serializedBody = await serializeFormData(body);
  }
  const maxAttempts = retry ? 3 : 1;
  let lastError: VeniceApiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const startedAt = nowIso();
    let diagHeaders: Record<string, string> = {};
    let response: VeniceForgeResponse | null = null;
    let clearDesktopSignal: (() => void) | undefined;
    try {
      const timeout = timeoutMs ? createTimeoutSignal(timeoutMs, signal) : null;
      const desktopSignal = timeout?.signal ?? signal;
      clearDesktopSignal = timeout?.clear;
      if (desktopSignal?.aborted) throw new DOMException("Request aborted", "AbortError");
      response = await desktopVenice.request(
        {
          endpoint,
          method,
          body: serializedBody,
          headers,
        },
        desktopSignal
      );
      diagHeaders = response.headers || {};
      const errorMsg = response.ok ? "" : normalizeError(response.status, readDesktopErrorBody(response.body));
      const modelName = extractModelName(serializedBody, response.body);
      const diag = summarizeDiagnostics({
        endpoint,
        method,
        status: response.status,
        ok: response.ok,
        headers: diagHeaders,
        error: errorMsg,
        startedAt,
        endedAt: nowIso(),
        model: modelName,
      });
      dispatch?.({ type: "SET_DIAGNOSTICS", diagnostics: diag });

      if (!response.ok) {
        const retryable = [429, 500, 503].includes(response.status);
        if (retryable && attempt < maxAttempts - 1) {
          await sleep(
            response.status === 429
              ? computeRateLimitWait(diagHeaders, attempt)
              : calculateBackoff(attempt + 1),
            signal
          );
          continue;
        }
        const error: VeniceApiError = new Error(errorMsg);
        error.status = response.status;
        error.diagnostics = diag; // marks as already dispatched
        throw error;
      }

      return { data: response.body, response, headers: diagHeaders, diagnostics: diag };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const errorObj = err as VeniceApiError;
      const normalized = errorObj.message || "Desktop Venice transport failed.";
      lastError = new Error(normalized) as VeniceApiError;
      lastError.status = errorObj.status ?? response?.status ?? 0;
      // Skip re-dispatch for HTTP errors already dispatched in the try block.
      if (!errorObj.diagnostics) {
        dispatch?.({
          type: "SET_DIAGNOSTICS",
          diagnostics: summarizeDiagnostics({
            endpoint,
            method,
            status: lastError.status,
            ok: false,
            headers: diagHeaders,
            error: normalized,
            startedAt,
            endedAt: nowIso(),
            model: extractModelName(serializedBody, response?.body),
          }),
        });
      }

      const isNetworkFailure = lastError.status == null || lastError.status === 0;
      const isRetryableStatus =
        typeof lastError.status === "number" && [429, 500, 503].includes(lastError.status);
      if (
        (isNetworkFailure || isRetryableStatus) &&
        attempt < maxAttempts - 1
      ) {
        await sleep(calculateBackoff(attempt + 1, 1200, 9000), signal);
        continue;
      }
      throw lastError;
    } finally {
      clearDesktopSignal?.();
    }
  }

  throw lastError || new Error("Request failed");
}

/**
 * Computes how long to wait before retrying a rate-limited request.
 * @param headers The response headers containing rate-limit info.
 * @param attempt The current retry attempt number.
 * @returns The wait time in milliseconds.
 */
function computeRateLimitWait(headers: unknown, attempt: number) {
  const record = headers as Record<string, string> | undefined;
  // Prefer standard Retry-After header (seconds or HTTP-date)
  const retryAfter = record?.["retry-after"];
  if (retryAfter) {
    const n = Number(retryAfter);
    if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, 60000);
    const d = Date.parse(retryAfter);
    if (Number.isFinite(d)) {
      const wait = d - Date.now();
      if (wait >= 0) return Math.min(wait, 60000);
    }
  }

  const raw = record?.["x-ratelimit-reset-requests"];
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (looksLikeUnixTimestamp(n))
      return Math.max(0, Math.min(60000, n * 1000 - Date.now()));
    if (n >= 0 && n < 86400) return Math.min(60000, n * 1000);
  }
  return calculateBackoff(attempt, 2000, 16000);
}

/**
 * Internal Venice API fetch implementation that routes to desktop or web mode.
 * @param endpoint The Venice API endpoint.
 * @param options Request options including method, body, signal, and dispatch.
 * @returns A promise resolving to data, response, headers, and diagnostics.
 */
async function _veniceFetch(
  endpoint: string,
  {
    method = "GET",
    body = undefined as unknown,
    signal = undefined as AbortSignal | undefined,
    dispatch = undefined as AppDispatch | undefined,
    headers = {} as Record<string, string>,
    isFormData = false,
    retry = true,
    timeoutMs = undefined as number | undefined,
  }: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
    dispatch?: AppDispatch;
    headers?: Record<string, string>;
    isFormData?: boolean;
    retry?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<{ data: unknown; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }> {
  if (isElectron()) {
    return veniceFetchDesktop(endpoint, {
      method,
      body,
      signal,
      dispatch,
      headers,
      isFormData,
      retry,
      timeoutMs,
    });
  }

  const startedAt = nowIso();
  const url = `${PROXY_BASE_PATH}${endpoint}`;
  const maxAttempts = retry ? 3 : 1;
  let lastError: VeniceApiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");

    const requestHeaders: Record<string, string> = {
      ...headers,
      "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
    };
    if (!isFormData) requestHeaders["Content-Type"] = "application/json";

    let response: Response | null = null;
    let diagHeaders: Record<string, string> = {};
    let parsed: unknown = null;
    let clearFetchSignal: (() => void) | undefined;
    try {
      const fetchTimeout = createTimeoutSignal(timeoutMs ?? 60000, signal);
      clearFetchSignal = fetchTimeout.clear;
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: isFormData
          ? (body as FormData)
          : body === undefined
          ? undefined
          : JSON.stringify(body),
        signal: fetchTimeout.signal,
      });

      diagHeaders = parseDiagnosticsHeaders(response);

      let text = "";
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        text = await response.text().catch(() => "");
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = null;
        }
      } else if (
        contentType.startsWith("image/") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("video/")
      ) {
        const blob = await response.blob();
        parsed = {
          dataUrl: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to read response blob"));
            reader.readAsDataURL(blob);
          }),
        };
      } else {
        text = await response.text().catch(() => "");
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = { text };
        }
      }

      const modelName = extractModelName(body, parsed);
      const diag = summarizeDiagnostics({
        endpoint,
        method,
        status: response.status,
        ok: response.ok,
        headers: diagHeaders,
        error: response.ok ? "" : normalizeError(response.status, readWebErrorBody(parsed, text, response.statusText)),
        startedAt,
        endedAt: nowIso(),
        model: modelName,
      });
      dispatch?.({ type: "SET_DIAGNOSTICS", diagnostics: diag });

      if (!response.ok) {
        const normalized = diag.error || normalizeError(response.status, readWebErrorBody(parsed, text, response.statusText));
        const retryable = [429, 500, 503].includes(response.status);

        if (retryable && attempt < maxAttempts - 1) {
          await sleep(
            response.status === 429
              ? computeRateLimitWait(diagHeaders, attempt)
              : Math.min(1000 * Math.pow(2, attempt + 1), 8000),
            signal
          );
          continue;
        }

        const error: VeniceApiError = new Error(normalized);
        error.status = response.status;
        error.diagnostics = diag;
        throw error;
      }

      return { data: parsed, response, headers: diagHeaders, diagnostics: diag };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;

      const errorObj = err as VeniceApiError;
      const isFetchFailure =
        err instanceof TypeError ||
        (err instanceof DOMException && err.name === "TimeoutError");
      const normalized = isFetchFailure
        ? "Fetch failure: likely CORS, network, browser sandbox, timeout, or blocked request. " +
          (errorObj.message || "")
        : errorObj.message || "Request failed";

      lastError = new Error(normalized) as VeniceApiError;
      lastError.status = errorObj.status ?? response?.status ?? 0;

      if (!errorObj.diagnostics) {
        dispatch?.({
          type: "SET_DIAGNOSTICS",
          diagnostics: summarizeDiagnostics({
            endpoint,
            method,
            status: lastError.status,
            ok: false,
            headers: diagHeaders,
            error: normalized,
            startedAt,
            endedAt: nowIso(),
            model: extractModelName(body, parsed),
          }),
        });
      }

      const retryableStatus =
        lastError.status !== undefined &&
        lastError.status !== null &&
        [429, 500, 503].includes(lastError.status);

      if ((isFetchFailure || retryableStatus) && attempt < maxAttempts - 1) {
        await sleep(calculateBackoff(attempt + 1, 1200, 9000), signal);
        continue;
      }

      throw lastError;
    } finally {
      clearFetchSignal?.();
    }
  }

  throw lastError || new Error("Request failed");
}

/**
 * Fetches data from the Venice API with automatic retries, deduplication, and diagnostics.
 * @param endpoint The Venice API endpoint.
 * @param options Request options including method, body, signal, dispatch, and retry flags.
 * @returns A promise resolving to the parsed data, raw response, headers, and diagnostics.
 */
export async function veniceFetch<T = unknown>(
  endpoint: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
    dispatch?: AppDispatch;
    headers?: Record<string, string>;
    isFormData?: boolean;
    retry?: boolean;
    timeoutMs?: number;
    dedupe?: boolean;
    validator?: (data: unknown) => data is T;
  } = {}
): Promise<{ data: T; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }> {
  const { dedupe = false, method = "GET", body } = options;

  const startedAt = Date.now();
  const requestHeaders = maskInspectorHeaders(options.headers);
  const { decision: safetyDecision, previewDurationMs } = getSafetyDecisionForLog(endpoint, method, body);
  const guardOutcome = deriveGuardOutcome(safetyDecision);
  const logId = useInspectorStore.getState().addLog({
    endpoint,
    method,
    transport: "venice",
    requestHeaders,
    requestBody: sanitizeInspectorPayload(body),
    safetyDecision,
    previewDurationMs,
    guardOutcome,
    callOutcome: "pending",
  });

  // Child exploitation safety guard — enforcement at transport boundary.
  // Note: GET requests (e.g., /models) are skipped because they carry no user content.
  // SAFETY-DEDUP: In desktop (Electron) mode the IPC handler is the authoritative
  // guard, so we skip the renderer scan to avoid running the detector twice on the
  // same payload. The IPC handler still calls recordDecision() so the main-process
  // audit counters stay accurate. The renderer's recordDecision is intentionally
  // not called here in Electron mode to prevent double-counting (the renderer
  // audit snapshot is a separate process and the IPC handler is authoritative).
  // In web mode the scan runs here; the Express proxy in server.ts is the
  // fail-closed backstop.
  if (method === "POST" && body !== undefined && !isElectron()) {
    const decision = maybeRunLocalFamilyGuard(
      { endpoint, method, payload: body, source: "venice-client" },
      useSettingsStore.getState().localFamilySafeModeEnabled,
    );
    if (!decision.allowed) {
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 451,
          durationMs: Date.now() - startedAt,
          previewDurationMs,
          guardOutcome: "block",
          error: decision.userMessage,
        }),
      );
      useInspectorStore.getState().updateLog(logId, {
        safetyDecision: decision.guardDecision,
      });
      throw new SafetyGuardBlockedError({ ...decision.guardDecision, userMessage: decision.userMessage });
    }
  }

  const key = dedupe ? dedupeKey(endpoint, method, body) : "";
  if (dedupe && inFlight.has(key)) {
    return inFlight.get(key) as Promise<{ data: T; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }>;
  }

  const execute = async () => {
    try {
      const result = await _veniceFetch(endpoint, options);
      if (options.validator && !options.validator(result.data)) {
        throw new Error(`veniceFetch: Response validation failed for ${endpoint}`);
      }
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: result.response.status,
          durationMs: Date.now() - startedAt,
          previewDurationMs,
          guardOutcome,
          responseHeaders: result.headers,
          responseBody: result.data,
        }),
      );
      return result as { data: T; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> };
    } catch (err: unknown) {
      const errAny = err as { status?: number };
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: errAny.status || 500,
          durationMs: Date.now() - startedAt,
          previewDurationMs,
          guardOutcome,
          error: safeInspectorError(err),
        }),
      );
      throw err;
    }
  };

  const promise = execute();

  if (dedupe) {
    inFlight.set(key, promise);
    promise.finally(() => inFlight.delete(key)).catch(() => {});
  }

  return promise;
}

/**
 * Streams a chat completion from the Venice API, yielding deltas via a callback.
 * @param payload The chat completion request payload.
 */
export async function veniceStreamChat(
  payload: unknown,
  {
    signal,
    dispatch,
    onDelta,
  }: { signal?: AbortSignal; dispatch?: AppDispatch; onDelta: (chunk: { content: string; reasoning: string }) => void }
) {
  const startedAtTime = Date.now();
  const requestHeaders = { "Content-Type": "application/json" };
  const { decision: safetyDecision, previewDurationMs } = getSafetyDecisionForLog(
    "/chat/completions",
    "POST",
    payload,
  );
  const guardOutcome = deriveGuardOutcome(safetyDecision);
  const logId = useInspectorStore.getState().addLog({
    endpoint: "/chat/completions",
    method: "POST",
    transport: "venice",
    requestHeaders,
    requestBody: sanitizeInspectorPayload(payload),
    safetyDecision,
    previewDurationMs,
    guardOutcome,
    callOutcome: "pending",
  });

  let accumulatedContent = "";
  let accumulatedReasoning = "";

  const wrappedOnDelta = (chunk: { content: string; reasoning: string }) => {
    accumulatedContent += chunk.content;
    accumulatedReasoning += chunk.reasoning;
    onDelta(chunk);
  };

  const startedAt = nowIso();
  const payloadRecord = payload as Record<string, unknown> | null | undefined;

  try {
    // Child exploitation safety guard — enforcement at transport boundary.
    // In desktop mode the IPC handler also runs the guard, so we skip the renderer check.
    if (!isElectron()) {
      const decision = maybeRunLocalFamilyGuard(
        { endpoint: "/chat/completions", method: "POST", payload, source: "venice-client" },
        useSettingsStore.getState().localFamilySafeModeEnabled,
      );
      if (!decision.allowed) {
        useInspectorStore.getState().updateLog(
          logId,
          buildInspectorTelemetryPatch({
            status: 451,
            durationMs: Date.now() - startedAtTime,
            previewDurationMs,
            guardOutcome: "block",
            error: decision.userMessage,
          }),
        );
        useInspectorStore.getState().updateLog(logId, {
          safetyDecision: decision.guardDecision,
        });
        throw new SafetyGuardBlockedError({ ...decision.guardDecision, userMessage: decision.userMessage });
      }
    }

    if (isElectron()) {
      const response = await desktopVenice.streamChat(
        {
          endpoint: "/chat/completions",
          method: "POST",
          body: payload,
          headers: { "Content-Type": "application/json" },
        },
        wrappedOnDelta,
        signal
      );
      dispatch?.({
        type: "SET_DIAGNOSTICS",
        diagnostics: summarizeDiagnostics({
          endpoint: "/chat/completions",
          method: "POST",
          status: response.status,
          ok: response.ok,
          headers: response.headers || {},
          error: response.ok
            ? ""
            : normalizeError(response.status, readDesktopErrorBody(response.body)),
          startedAt,
          endedAt: nowIso(),
          model: typeof payloadRecord?.model === "string" ? payloadRecord.model : null,
        }),
      });
      if (!response.ok) {
        const errorMsg = normalizeError(response.status, readDesktopErrorBody(response.body));
        const error: VeniceApiError = new Error(errorMsg);
        error.status = response.status;
        throw error;
      }
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 200,
          durationMs: Date.now() - startedAtTime,
          previewDurationMs,
          guardOutcome,
          responseBody: {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: accumulatedContent,
                  reasoning_content: accumulatedReasoning,
                },
              },
            ],
          },
        }),
      );
      return;
    }

    const requestHeadersWeb: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
    };

    // REL-001: enforce a single absolute 5-minute deadline covering both the
    // initial fetch and the SSE read loop. The same AbortSignal is used for
    // fetch and is wired to cancel the reader if the deadline expires (or if
    // the caller aborts), so total stream lifetime cannot exceed ~300s.
    const STREAM_TIMEOUT_MS = 300_000;
    const timeoutError = new Error(
      "Stream timed out after 5 minutes. The server may be overloaded — please try again."
    );

    const deadlineController = new AbortController();
    let deadlineExpired = false;
    const deadlineId = setTimeout(() => {
      deadlineExpired = true;
      deadlineController.abort();
    }, STREAM_TIMEOUT_MS);

    const onParentAbort = () => deadlineController.abort();
    if (signal) {
      signal.addEventListener("abort", onParentAbort, { once: true });
      if (signal.aborted) deadlineController.abort();
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelReader = () => {
      reader?.cancel().catch(() => {});
    };
    deadlineController.signal.addEventListener("abort", cancelReader);

    try {
      let response: Response;
      try {
        response = await fetch(`${PROXY_BASE_PATH}/chat/completions`, {
          method: "POST",
          headers: requestHeadersWeb,
          body: JSON.stringify(payload),
          signal: deadlineController.signal,
        });
      } catch (err: unknown) {
        if (deadlineExpired) throw timeoutError;
        if (signal?.aborted) throw new Error("Aborted");
        throw err;
      }

      const headers = parseDiagnosticsHeaders(response);
      let streamError = "";
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        let parsed: unknown = null;
        try { parsed = JSON.parse(text); } catch { /* non-JSON error body — use raw text */ }
        streamError = normalizeError(response.status, readWebErrorBody(parsed, text, response.statusText));
      }

      dispatch?.({
        type: "SET_DIAGNOSTICS",
        diagnostics: summarizeDiagnostics({
          endpoint: "/chat/completions",
          method: "POST",
          status: response.status,
          ok: response.ok,
          headers,
          error: streamError,
          startedAt,
          endedAt: nowIso(),
          model: typeof payloadRecord?.model === "string" ? payloadRecord.model : null,
        }),
      });

      if (!response.ok) {
        const error: VeniceApiError = new Error(streamError);
        error.status = response.status;
        throw error;
      }

      if (!response.body || typeof response.body.getReader !== "function")
        throw new Error("Streaming is unavailable in this browser sandbox.");

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (deadlineExpired) throw timeoutError;
        if (signal?.aborted) throw new Error("Aborted");

        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch (err: unknown) {
          if (deadlineExpired) throw timeoutError;
          if (signal?.aborted) throw new Error("Aborted");
          throw err;
        }

        if (result.done) {
          if (deadlineExpired) throw timeoutError;
          if (signal?.aborted) throw new Error("Aborted");
          break;
        }

        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.replace(/^data:\s*/, "");
          if (data === "[DONE]") {
            useInspectorStore.getState().updateLog(
              logId,
              buildInspectorTelemetryPatch({
                status: 200,
                durationMs: Date.now() - startedAtTime,
                previewDurationMs,
                guardOutcome,
                responseBody: {
                  choices: [
                    {
                      message: {
                        role: "assistant",
                        content: accumulatedContent,
                        reasoning_content: accumulatedReasoning,
                      },
                    },
                  ],
                },
              }),
            );
            return;
          }

          try {
            const json = JSON.parse(data);
            const content =
              json?.choices?.[0]?.delta?.content ||
              json?.choices?.[0]?.message?.content ||
              json?.choices?.[0]?.text ||
              "";
            const reasoning =
              json?.choices?.[0]?.delta?.reasoning_content ||
              json?.choices?.[0]?.message?.reasoning_content ||
              "";
            if (content || reasoning) wrappedOnDelta({ content, reasoning });
          } catch { /* malformed SSE JSON chunk — skip */ }
        }
      }

      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 200,
          durationMs: Date.now() - startedAtTime,
          previewDurationMs,
          guardOutcome,
          responseBody: {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: accumulatedContent,
                  reasoning_content: accumulatedReasoning,
                },
              },
            ],
          },
        }),
      );
    } finally {
      clearTimeout(deadlineId);
      deadlineController.signal.removeEventListener("abort", cancelReader);
      if (signal) signal.removeEventListener("abort", onParentAbort);
      reader?.releaseLock();
    }
  } catch (err: unknown) {
    const errAny = err as { status?: number };
    useInspectorStore.getState().updateLog(
      logId,
      buildInspectorTelemetryPatch({
        status: errAny.status || 500,
        durationMs: Date.now() - startedAtTime,
        previewDurationMs,
        guardOutcome,
        error: safeInspectorError(err),
      }),
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Legacy thin compatibility surface exported for `src/lib/venice-client.ts`.
// These functions are deliberately simple (no retries, no inspector logging)
// so existing hooks/services that import from `lib/venice-client` continue to
// work without changing call sites. New code should prefer `veniceFetch` and
// the canonical `veniceStreamChat` below.
// ---------------------------------------------------------------------------

/** Custom error thrown by the legacy Venice client surface. */
export class VeniceAPIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "VeniceAPIError";
    this.status = status;
  }
}

function readVeniceErrorBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const errorObj = record.error as Record<string, unknown> | undefined;
  const top = errorObj?.message || record.error || record.message;
  if (top) {
    if (typeof top === "object") {
      try {
        const str = JSON.stringify(top);
        if (str === "{}" || str === "[]") return String(top);
        return str;
      } catch {
        return "[unserializable error]";
      }
    }
    return String(top);
  }
  const details = record.details;
  if (details && typeof details === "object") {
    const detailsRec = details as Record<string, unknown>;
    if (Array.isArray(detailsRec._errors) && detailsRec._errors.length) return String(detailsRec._errors[0]);
    for (const key of Object.keys(detailsRec)) {
      if (key === "_errors") continue;
      const val = detailsRec[key] as Record<string, unknown> | undefined;
      const errs = val?._errors;
      if (Array.isArray(errs) && errs.length) return `${key}: ${String(errs[0])}`;
    }
    return "Request validation failed";
  }
  return String(record.detail || "");
}

/** Runs the renderer-side Family Safe Mode guard for the legacy web surface.
 *  Throws `SafetyGuardBlockedError` when the payload is blocked. GET requests
 *  and undefined bodies are skipped (they carry no user content). */
function enforceLegacyWebGuard(
  endpoint: string,
  method: string,
  body: unknown,
): void {
  if (method !== "POST" || body === undefined || isElectron()) return;
  const decision = maybeRunLocalFamilyGuard(
    { endpoint, method, payload: body, source: "venice-client" },
    useSettingsStore.getState().localFamilySafeModeEnabled,
  );
  if (!decision.allowed) {
    throw new SafetyGuardBlockedError({ ...decision.guardDecision, userMessage: decision.userMessage });
  }
}

/** Web-mode fallback used by the legacy surface: fetch through the Express
 *  proxy with the same error-body extraction and abort-signal forwarding as
 *  the desktop path. */
async function webVeniceFetch(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<{ ok: boolean; status: number; statusText: string; body: unknown; contentType?: string }> {
  const method = options.method || "GET";
  const url = `${PROXY_BASE_PATH}${path.replace("/api/v1", "")}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
  };
  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  let body: unknown = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = null;
    }
  } else {
    const text = await response.text().catch(() => "");
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { text };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body,
    contentType: contentType || undefined,
  };
}

export async function venice<T>(
  path: string,
  options: { method?: string; body?: unknown; stream?: boolean; noAuth?: boolean; signal?: AbortSignal } = {}
): Promise<T> {
  const method = options.method || "GET";
  let parsedBody: unknown = undefined;
  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body === "string") {
      try {
        parsedBody = JSON.parse(options.body);
      } catch (err) {
        throw new VeniceAPIError(
          `Invalid JSON body passed to venice(): ${err instanceof Error ? err.message : String(err)}`,
          0
        );
      }
    } else {
      parsedBody = options.body;
    }
  }

  if (!isElectron()) {
    enforceLegacyWebGuard(path, method, parsedBody);
    const response = await webVeniceFetch(path, { method, body: parsedBody, signal: options.signal });
    if (options.signal && options.signal.aborted) throw new Error("Aborted");
    if (!response.ok) {
      const bodyMessage = readVeniceErrorBody(response.body);
      throw new VeniceAPIError(
        bodyMessage || response.statusText || `HTTP ${response.status}`,
        response.status
      );
    }
    return response.body as T;
  }

  const response = await desktopVenice.request(
    {
      endpoint: path.replace("/api/v1", ""),
      method: method as "GET" | "POST",
      body: parsedBody,
    },
    options.signal
  );

  if (options.signal && options.signal.aborted) throw new Error("Aborted");
  if (!response.ok) {
    const bodyMessage = readVeniceErrorBody(response.body);
    throw new VeniceAPIError(
      bodyMessage || response.statusText || `HTTP ${response.status}`,
      response.status
    );
  }
  return response.body as T;
}

export async function veniceBlob(path: string, body: object, init: { signal?: AbortSignal } = {}): Promise<Blob> {
  if (init.signal?.aborted) throw new Error("Aborted");

  if (!isElectron()) {
    enforceLegacyWebGuard(path, "POST", body);
    const url = `${PROXY_BASE_PATH}${path.replace("/api/v1", "")}`;
    const fetchResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
      },
      body: JSON.stringify(body),
      signal: init.signal,
    });
    if (!fetchResponse.ok) {
      const text = await fetchResponse.text().catch(() => "");
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      const bodyMessage = readVeniceErrorBody(parsed || text || fetchResponse.statusText);
      throw new VeniceAPIError(bodyMessage || `HTTP ${fetchResponse.status}`, fetchResponse.status);
    }
    return await fetchResponse.blob();
  }

  const response = await desktopVenice.request(
    {
      endpoint: path.replace("/api/v1", ""),
      method: "POST",
      body,
    },
    init.signal
  );
  if (!response.ok) {
    const bodyMessage = readVeniceErrorBody(response.body);
    throw new VeniceAPIError(bodyMessage || `HTTP ${response.status}`, response.status);
  }

  const b64 = (response.body as { dataBase64?: string }).dataBase64;
  if (!b64) {
    if (typeof response.body === "string") return new Blob([response.body], { type: response.contentType });
    return new Blob([], { type: response.contentType });
  }
  const binaryStr = atob(b64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);
  return new Blob([bytes], { type: response.contentType });
}

export async function veniceFormData<T>(path: string, formData: FormData, init: { signal?: AbortSignal } = {}): Promise<T> {
  if (init.signal?.aborted) throw new Error("Aborted");

  if (!isElectron()) {
    enforceLegacyWebGuard(path, "POST", formData);
    const url = `${PROXY_BASE_PATH}${path.replace("/api/v1", "")}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
      },
      body: formData,
      signal: init.signal,
    });
    let body: unknown = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const text = await response.text().catch(() => "");
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = null;
      }
    } else {
      const text = await response.text().catch(() => "");
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { text };
      }
    }
    if (!response.ok) {
      const bodyMessage = readVeniceErrorBody(body);
      throw new VeniceAPIError(bodyMessage || response.statusText || `HTTP ${response.status}`, response.status);
    }
    return body as T;
  }

  const serializedBody = await serializeFormData(formData);
  const response = await desktopVenice.request(
    {
      endpoint: path.replace("/api/v1", ""),
      method: "POST",
      body: { _isSerializedFormData: true, entries: serializedBody.entries },
    },
    init.signal
  );

  if (!response.ok) {
    const bodyMessage = readVeniceErrorBody(response.body);
    throw new VeniceAPIError(bodyMessage || `HTTP ${response.status}`, response.status);
  }
  return response.body as T;
}
