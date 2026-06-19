/** @fileoverview Unit tests for veniceClient utility functions. */

import { describe, expect, it, vi } from "vitest";
import { summarizeDiagnostics, normalizeError, readWebErrorBody, extractModelName, dedupeKey, serializeFormData, resolveTimeoutMs } from "./veniceClient";
import { sleep } from "../utils/timeout";

describe("veniceClient utilities", () => {
  describe("serializeFormData", () => {
    it("serializes plain Blob values correctly", async () => {
      const fd = new FormData();
      const blob = new Blob(["hello blob"], { type: "text/plain" });
      // In jsdom, append() converts Blob to File. Force a plain Blob to test the Blob branch.
      vi.spyOn(fd, "entries").mockReturnValue([
        ["file", blob]
      ] as any);
      
      const result = await serializeFormData(fd);
      expect(result.entries[0]._isFile).toBe(true);
      expect(result.entries[0].value).toBe(btoa("hello blob"));
      expect(result.entries[0].type).toBe("text/plain");
    });
  });

  /** BUG-006 regression: dedupeKey must not throw on circular bodies. */
  describe("dedupeKey", () => {
    it("returns consistent keys for serialisable bodies", () => {
      const key1 = dedupeKey("/models", "GET", { foo: "bar" });
      const key2 = dedupeKey("/models", "GET", { foo: "bar" });
      expect(key1).toBe(key2);
    });

    it("does not throw on circular bodies", () => {
      const body: Record<string, unknown> = { a: 1 };
      body.self = body;
      expect(() => dedupeKey("/chat/completions", "POST", body)).not.toThrow();
    });

    it("treats undefined body as empty hash", () => {
      const key = dedupeKey("/models", "GET", undefined);
      expect(key).toBe("GET /models ");
    });

    it("redacts secret-bearing fields before stringifying request bodies", () => {
      const key = dedupeKey("/chat/completions", "POST", {
        apiKey: "sk-test-secret",
        authorization: "Bearer secret",
        token: "secret-token",
        prompt: "hello",
        nested: { "api_key": "venice_nested_secret", keep: "visible" },
      });

      expect(key).not.toContain("sk-test-secret");
      expect(key).not.toContain("Bearer secret");
      expect(key).not.toContain("secret-token");
      expect(key).not.toContain("venice_nested_secret");
      expect(key).toContain("hello");
      expect(key).toContain("visible");
    });
  });

  describe("resolveTimeoutMs", () => {
    it("preserves undefined as no explicit timeout override", () => {
      expect(resolveTimeoutMs(undefined)).toBeNull();
    });

    it.each([
      [null, 60000],
      [0, 60000],
      [-1, 60000],
      [Number.NaN, 60000],
      [Number.POSITIVE_INFINITY, 60000],
      [1, 1],
      [60000, 60000],
      [120001, 120000],
    ])("normalizes %s to %s", (input, expected) => {
      expect(resolveTimeoutMs(input)).toBe(expected);
    });
  });

  /**
   * BUG-028 regression: sleep must reject immediately on already-aborted signal.
   */
  describe("sleep", () => {
    it("rejects immediately when passed an already-aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(sleep(1000, controller.signal)).rejects.toThrow("Request aborted");
    });

    it("resolves after delay when no signal is given", async () => {
      const start = Date.now();
      await sleep(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
  });

  /** Tests for summarizeDiagnostics. */
  describe("summarizeDiagnostics", () => {
    /** Verifies latency computation from startedAt and endedAt timestamps. */
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

    /** Verifies graceful handling of missing timestamps. */
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

    /** Verifies that model is populated if provided. */
    it("includes model when provided", () => {
      const result = summarizeDiagnostics({
        endpoint: "/chat/completions",
        method: "POST",
        status: 200,
        ok: true,
        model: "venice-uncensored",
      });
      expect(result.model).toBe("venice-uncensored");
    });
  });

  /** Tests for extractModelName. */
  describe("extractModelName", () => {
    it("extracts from response body model field", () => {
      expect(extractModelName(null, { model: "model-res" })).toBe("model-res");
    });

    it("extracts from request body model field", () => {
      expect(extractModelName({ model: "model-req" }, null)).toBe("model-req");
    });

    it("extracts from serialized FormData", () => {
      expect(
        extractModelName(
          {
            _isSerializedFormData: true,
            entries: [{ name: "model", value: "model-form" }],
          },
          null
        )
      ).toBe("model-form");
    });

    it("returns null if not found", () => {
      expect(extractModelName({}, {})).toBeNull();
    });
  });

  /** Tests for normalizeError. */
  describe("normalizeError", () => {
    /** Verifies status-prefixed messages for known HTTP status codes. */
    it("returns status-prefixed message for known codes", () => {
      expect(normalizeError(429, "too many requests")).toBe("429 rate limit: too many requests");
      expect(normalizeError(401, "unauthorized")).toBe("401 invalid or missing API key: unauthorized");
      expect(normalizeError(500, "server blew up")).toBe("500 Venice/server retryable error: server blew up");
    });

    /** Verifies raw message preservation for unknown status codes. */
    it("returns raw message for unknown codes", () => {
      expect(normalizeError(418, "I'm a teapot")).toBe("I'm a teapot");
    });

    /** Verifies raw message preservation when status is null. */
    it("returns raw message when status is null", () => {
      expect(normalizeError(null, "network failure")).toBe("network failure");
    });

    /** Verifies default message fallback for empty error strings. */
    it("returns default when message is empty", () => {
      expect(normalizeError(400, "")).toBe("400 request/schema/model error: Request failed");
    });
  });

  /** Tests for readWebErrorBody. */
  describe("readWebErrorBody", () => {
    /** Verifies preservation of plain text error messages. */
    it("preserves text/plain error message", () => {
      expect(readWebErrorBody({}, "plain failure", "Bad Request")).toBe("plain failure");
    });
    /** Verifies fallback behavior for malformed JSON bodies. */
    it("handles malformed JSON fallback", () => {
      expect(readWebErrorBody(null, "{oops", "Bad Request")).toBe("{oops");
    });
    /** Verifies safe stringification of error objects that return {}. */
    it("safely stringifies error objects that yield empty objects", () => {
      const err = { toString() { return "fallback str"; } };
      expect(readWebErrorBody({ error: err }, "", "")).toBe("fallback str");
    });
    /** Verifies it handles uninformative [object Object] fallbacks. */
    it("does not return [object Object] for malformed records", () => {
      const emptyObj = Object.create(null);
      expect(readWebErrorBody({ error: emptyObj }, "", "")).toBe("Malformed API error object");
    });
  });
});
