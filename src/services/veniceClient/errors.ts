/** @fileoverview Error normalization and extraction for Venice API responses. */

import type { DiagnosticsEntry } from "../../types/venice";
import type { VeniceRateLimitInfo } from "../../types/venice";
import type { PrimaryApiRouteId } from "../../shared/primaryApiRoute";
import type { InspectorRoutingReason } from "../inspectorTelemetry";

/** Custom error structure for Venice client requests. */
export interface VeniceApiError extends Error {
  status?: number | null;
  diagnostics?: Partial<DiagnosticsEntry>;
  /** Typed rate-limit metadata when the response status is 429. Present only
   *  when the upstream surface emitted enough information to populate it —
   *  older or opaque 429 responses may carry `status` but no `rateLimit`. */
  rateLimit?: VeniceRateLimitInfo;
  /** Parsed response payload when available (e.g. 402 payment requirements). */
  responseBody?: unknown;
  selectedPrimaryRoute?: PrimaryApiRouteId;
  effectiveUpstream?: string;
  routingReason?: InspectorRoutingReason;
}

/** Custom error thrown by the legacy Venice client surface. */
export class VeniceAPIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "VeniceAPIError";
    this.status = status;
  }
}

/** Map of known upstream rate-limit reason strings to the typed
 *  `VeniceRateLimitReason` enum. The mapping is intentionally narrow and
 *  additive — unknown values flow through `rawReason` on the extracted
 *  info so we can extend this table without breaking existing callers. */
const KNOWN_RATE_LIMIT_REASONS: Record<string, string> = {
  "requests_per_minute": "requests_per_minute",
  "rpm": "requests_per_minute",
  "requests_per_day": "requests_per_day",
  "rpd": "requests_per_day",
  "tokens_per_minute": "tokens_per_minute",
  "tpm": "tokens_per_minute",
  "tokens_per_day": "tokens_per_day",
  "tpd": "tokens_per_day",
  "concurrent_requests": "concurrent_requests",
  "concurrent": "concurrent_requests",
};

const KNOWN_LIMIT_TYPES = new Set(["RPM", "RPD", "TPM", "TPD", "CONCURRENT"]);

/** Extracts a typed `VeniceRateLimitInfo` from a 429 response. Reads
 *  `Retry-After` and `x-ratelimit-reset-*` headers (preserving existing
 *  semantics), and additionally looks for reason/limit-type metadata in
 *  `x-ratelimit-reason`, `x-venice-rate-limit-reason`, `x-ratelimit-type`,
 *  and the response body's `error.code` / `error.reason` fields. Unknown
 *  upstream values are preserved on `rawReason` for diagnostics rather than
 *  being dropped. */
export function extractRateLimitInfo(
  headers: Record<string, string> | undefined,
  body: unknown,
): VeniceRateLimitInfo {
  const info: VeniceRateLimitInfo = { reason: "unspecified" };

  if (headers && typeof headers === "object") {
    const rawReason = headers["x-ratelimit-reason"]
      ?? headers["x-venice-rate-limit-reason"]
      ?? headers["x-rate-limit-reason"];
    if (typeof rawReason === "string" && rawReason.trim()) {
      const normalized = rawReason.trim().toLowerCase();
      const typed = KNOWN_RATE_LIMIT_REASONS[normalized];
      if (typed) {
        info.reason = typed as VeniceRateLimitInfo["reason"];
      }
      info.rawReason = rawReason.trim();
    }

    const rawType = headers["x-ratelimit-type"] ?? headers["x-venice-rate-limit-type"];
    if (typeof rawType === "string") {
      const upper = rawType.trim().toUpperCase();
      if (KNOWN_LIMIT_TYPES.has(upper)) {
        info.limitType = upper as VeniceRateLimitInfo["limitType"];
      }
    }

    const retryAfter = headers["retry-after"];
    if (retryAfter) {
      const n = Number(retryAfter);
      if (Number.isFinite(n) && n >= 0) {
        info.retryAfterSeconds = Math.floor(n);
      } else {
        const parsed = Date.parse(retryAfter);
        if (Number.isFinite(parsed)) {
          const seconds = Math.max(0, Math.floor((parsed - Date.now()) / 1000));
          info.retryAfterSeconds = seconds;
        }
      }
    }
    // Existing `x-ratelimit-reset-requests` semantics are preserved — only
    // used when `Retry-After` is absent.
    if (info.retryAfterSeconds === undefined) {
      const reset = headers["x-ratelimit-reset-requests"];
      if (reset) {
        const n = Number(reset);
        if (Number.isFinite(n) && n >= 0 && n < 86400) {
          info.retryAfterSeconds = Math.floor(n);
        }
      }
    }
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const errorField = record.error;
    const errorObj = errorField && typeof errorField === "object"
      ? errorField as Record<string, unknown>
      : undefined;
    const candidates = [
      record.code,
      record.reason,
      errorObj?.code,
      errorObj?.reason,
      errorObj?.type,
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      if (!info.rawReason) info.rawReason = trimmed;
      const typed = KNOWN_RATE_LIMIT_REASONS[trimmed.toLowerCase()];
      if (typed && info.reason === "unspecified") {
        info.reason = typed as VeniceRateLimitInfo["reason"];
      }
      break;
    }
  }

  return info;
}

/**
 * Normalizes an HTTP error status and raw message into a user-friendly string.
 * @param status The HTTP status code, or null if unavailable.
 * @param rawMessage The original error message.
 * @returns A formatted error string combining the status and message.
 */
/** Appends Venice's string `details` field when it adds new information. */
function withStringDetails(primary: string, details: unknown): string {
  if (typeof details !== "string") return primary;
  const detail = details.trim();
  if (!detail || primary.includes(detail)) return primary;
  return `${primary}: ${detail}`;
}

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
 * Extracts a readable error message from a desktop API response body.
 * @param body The parsed response body from the main process.
 * @returns A human-readable error string.
 */
export function readDesktopErrorBody(body: unknown): string {
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
        return withStringDetails(str, record.details);
      } catch {
        return "[unserializable error]";
      }
    }
    return withStringDetails(String(top), record.details);
  }

  const details = record.details;
  if (typeof details === "string" && details.trim()) return details.trim();
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
        return withStringDetails(str, record.details);
      } catch {
        return "[unserializable error]";
      }
    }
    return withStringDetails(String(top), record.details);
  }

  const details = record.details;
  if (typeof details === "string" && details.trim()) return details.trim();
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
 * Extracts a readable error message from a legacy API response body.
 * Used by the thin `lib/venice-client` compatibility surface.
 * @param body The parsed response body.
 * @returns A human-readable error string.
 */
export function readVeniceErrorBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const errorObj = record.error as Record<string, unknown> | undefined;
  const top = errorObj?.message || record.error || record.message;
  if (top) {
    if (typeof top === "object") {
      try {
        const str = JSON.stringify(top);
        if (str === "{}" || str === "[]") return String(top);
        return withStringDetails(str, record.details);
      } catch {
        return "[unserializable error]";
      }
    }
    return withStringDetails(String(top), record.details);
  }
  const details = record.details;
  if (typeof details === "string" && details.trim()) return details.trim();
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
