import { describe, expect, it } from "vitest";
import {
  RETRYABLE_STATUS_CODES,
  isRetryableStatusCode,
  resolveRetryEnabled,
  resolveTimeoutMs,
} from "./retry";

describe("VeniceClient Retry & Status Codes (VF-CUR-P2-014)", () => {
  it("includes 502 and 504 in RETRYABLE_STATUS_CODES", () => {
    expect(RETRYABLE_STATUS_CODES).toContain(502);
    expect(RETRYABLE_STATUS_CODES).toContain(504);
    expect(RETRYABLE_STATUS_CODES).toContain(429);
    expect(RETRYABLE_STATUS_CODES).toContain(500);
    expect(RETRYABLE_STATUS_CODES).toContain(503);
  });

  it("isRetryableStatusCode correctly flags transient gateway errors", () => {
    expect(isRetryableStatusCode(502)).toBe(true);
    expect(isRetryableStatusCode(504)).toBe(true);
    expect(isRetryableStatusCode(429)).toBe(true);
    expect(isRetryableStatusCode(500)).toBe(true);
    expect(isRetryableStatusCode(503)).toBe(true);
    expect(isRetryableStatusCode(408)).toBe(true);

    // Non-retryable
    expect(isRetryableStatusCode(400)).toBe(false);
    expect(isRetryableStatusCode(401)).toBe(false);
    expect(isRetryableStatusCode(403)).toBe(false);
    expect(isRetryableStatusCode(404)).toBe(false);
    expect(isRetryableStatusCode(451)).toBe(false);
    expect(isRetryableStatusCode(null)).toBe(false);
    expect(isRetryableStatusCode(undefined)).toBe(false);
  });

  it("resolveRetryEnabled preserves idempotency policy", () => {
    // Idempotent methods retry by default
    expect(resolveRetryEnabled("GET")).toBe(true);
    expect(resolveRetryEnabled("HEAD")).toBe(true);
    expect(resolveRetryEnabled("OPTIONS")).toBe(true);

    // Non-idempotent methods do NOT retry by default (prevents billable replays)
    expect(resolveRetryEnabled("POST")).toBe(false);
    expect(resolveRetryEnabled("PUT")).toBe(false);
    expect(resolveRetryEnabled("DELETE")).toBe(false);

    // Explicit override always wins
    expect(resolveRetryEnabled("POST", true)).toBe(true);
    expect(resolveRetryEnabled("GET", false)).toBe(false);
  });

  it("resolveTimeoutMs bounds user timeouts safely", () => {
    expect(resolveTimeoutMs(undefined)).toBeNull();
    expect(resolveTimeoutMs(0)).toBe(60000);
    expect(resolveTimeoutMs(-5)).toBe(60000);
    expect(resolveTimeoutMs(30000)).toBe(30000);
    expect(resolveTimeoutMs(200000)).toBe(120000); // capped at 120s
  });
});
