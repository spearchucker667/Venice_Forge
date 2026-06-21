/** @fileoverview Error normalization and extraction for Venice API responses. */

import type { DiagnosticsEntry } from "../../types/venice";

/** Custom error structure for Venice client requests. */
export interface VeniceApiError extends Error {
  status?: number | null;
  diagnostics?: Partial<DiagnosticsEntry>;
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
