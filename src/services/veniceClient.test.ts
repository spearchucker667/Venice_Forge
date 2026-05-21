import { describe, expect, it } from "vitest";
import { summarizeDiagnostics, normalizeError } from "./veniceClient";

describe("veniceClient utilities", () => {
  describe("summarizeDiagnostics", () => {
    it("computes latency from startedAt and endedAt", () => {
      const startedAt = "2024-01-01T00:00:00.000Z";
      const endedAt = "2024-01-01T00:00:00.123Z";
      const result = summarizeDiagnostics({
        endpoint: "/models",
        method: "GET",
        status: 200,
        ok: true,
        headers: { "x-venice-version": "1.0" },
        error: "",
        startedAt,
        endedAt,
      });
      expect(result.latencyMs).toBe(123);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.headers).toEqual({ "x-venice-version": "1.0" });
    });

    it("handles missing timestamps", () => {
      const result = summarizeDiagnostics({
        endpoint: "/models",
        method: "GET",
        status: null,
        ok: false,
        headers: {},
        error: "network error",
      });
      expect(result.latencyMs).toBeNull();
      expect(result.error).toBe("network error");
    });
  });

  describe("normalizeError", () => {
    it("returns status-prefixed message for known codes", () => {
      expect(normalizeError(429, "too many requests")).toBe("429 rate limit: too many requests");
      expect(normalizeError(401, "unauthorized")).toBe("401 invalid or missing API key: unauthorized");
      expect(normalizeError(500, "server blew up")).toBe("500 Venice/server retryable error: server blew up");
    });

    it("returns raw message for unknown codes", () => {
      expect(normalizeError(418, "I'm a teapot")).toBe("I'm a teapot");
    });

    it("returns raw message when status is null", () => {
      expect(normalizeError(null, "network failure")).toBe("network failure");
    });

    it("returns default when message is empty", () => {
      expect(normalizeError(400, "")).toBe("400 request/schema/model error: Request failed");
    });
  });
});
