/** @fileoverview Retry/backoff logic and in-flight request deduplication. */

import type { VeniceForgeResponse } from "../../types/desktop";
import type { DiagnosticsEntry } from "../../types/venice";

/** Shape of a deduplicated in-flight request promise. */
export interface InFlightResult {
  data: unknown;
  response: Response | VeniceForgeResponse;
  headers: Record<string, string>;
  diagnostics: Partial<DiagnosticsEntry>;
}

/** In-flight request deduplication map (API-004). */
const inFlight = new Map<string, Promise<InFlightResult>>();

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

/** Returns whether an identical request is already in flight. */
export function hasInFlight(key: string): boolean {
  return inFlight.has(key);
}

/** Returns the in-flight promise for a deduplication key, if any. */
export function getInFlight(key: string): Promise<InFlightResult> | undefined {
  return inFlight.get(key);
}

/** Registers a promise as in-flight for a deduplication key. */
export function setInFlight(key: string, promise: Promise<InFlightResult>): void {
  inFlight.set(key, promise);
}

/** Removes a deduplication key from the in-flight map. */
export function deleteInFlight(key: string): void {
  inFlight.delete(key);
}

/**
 * Resolves a user-provided timeout into a safe millisecond value.
 * Undefined means no timeout (null). Zero or negative values are
 * treated as the default 60 s to prevent infinite hangs (AUDIT-004).
 * Values above 120 s are capped to prevent excessive resource use.
 */
export function resolveTimeoutMs(timeoutMs: number | null | undefined): number | null {
  if (timeoutMs === undefined) return null;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return 60000;
  return Math.min(timeoutMs, 120000);
}

/**
 * Computes an exponential backoff delay with randomized jitter.
 * @param attempt The current retry attempt (0-indexed).
 * @param baseMs The base delay in milliseconds.
 * @param maxMs The maximum delay in milliseconds.
 * @returns The backoff delay.
 */
export function calculateBackoff(attempt: number, baseMs = 1000, maxMs = 8000): number {
  const backoff = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = backoff * 0.2 * Math.random(); // Add up to 20% jitter
  return Math.floor(backoff + jitter);
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
 * Computes how long to wait before retrying a rate-limited request.
 * @param headers The response headers containing rate-limit info.
 * @param attempt The current retry attempt number.
 * @returns The wait time in milliseconds.
 */
export function computeRateLimitWait(headers: unknown, attempt: number) {
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
