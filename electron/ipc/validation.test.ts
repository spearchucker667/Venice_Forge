// @vitest-environment node

/** @fileoverview Unit tests for Electron IPC request validation and API key input
 *  sanitization. */

import { describe, expect, it } from "vitest";
import {
  MAX_VENICE_IPC_BODY_BYTES,
  validateApiKeyInput,
  validateMutationOrigin,
  validateVeniceIpcRequest,
} from "./validation";

/** Validates that a user-provided API key is a non-empty string within length limits. */
describe("Electron IPC validation", () => {
  /** Allows only supported Venice endpoints and methods. */
  it("allows only supported Venice endpoints and methods", () => {
    expect(
      validateVeniceIpcRequest({ endpoint: "/models?type=all", method: "GET" })
    ).toMatchObject({ endpoint: "/models?type=all", method: "GET" });

    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/billing", method: "GET" })
    ).toThrow(/not allowed/i);

    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/models", method: "DELETE" })
    ).toThrow(/method/i);
  });

  /** BUG-010 regression guard: allowed methods must still match the endpoint. */
  it("rejects allowed methods on the wrong Venice endpoint", () => {
    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/models", method: "POST" })
    ).toThrow(/method/i);

    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/chat/completions", method: "GET" })
    ).toThrow(/method/i);
  });

  /** Rejects Venice IPC payloads that exceed the maximum body size. */
  it("rejects oversized Venice IPC payloads", () => {
    const tooLarge = "x".repeat(MAX_VENICE_IPC_BODY_BYTES + 1);

    expect(() =>
      validateVeniceIpcRequest({
        endpoint: "/chat/completions",
        method: "POST",
        body: { prompt: tooLarge },
      })
    ).toThrow(/too large/i);
  });

  /** Rejects GET bodies, absolute URLs, and forbidden headers. */
  it("rejects GET bodies, absolute urls and forbidden headers", () => {
    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/models", method: "GET", body: { bad: true } })
    ).toThrow();
    expect(() =>
      validateVeniceIpcRequest({ endpoint: "https://api.venice.ai/models", method: "GET" })
    ).toThrow();
    const sanitized = validateVeniceIpcRequest({
      endpoint: "/chat/completions",
      method: "POST",
      headers: { Authorization: "x", "x-client": "ok" },
    });
    expect(sanitized.headers).toEqual({ "x-client": "ok" });
  });

  /** Validates API key input without leaking the value in errors. */
  it("validates API key input without leaking the value", () => {
    expect(validateApiKeyInput("  vn-test-key  ")).toBe("vn-test-key");
    expect(() => validateApiKeyInput("")).toThrow(/enter/i);
    expect(() => validateApiKeyInput("x".repeat(513))).toThrow(/too long/i);
  });

  /** Validates mutation origin values and defaults omitted origins to local-user. */
  it("validates mutation origin values", () => {
    expect(validateMutationOrigin("local-user")).toBe("local-user");
    expect(validateMutationOrigin("remote-sync")).toBe("remote-sync");
    expect(validateMutationOrigin("manual-import")).toBe("manual-import");
    expect(validateMutationOrigin("migration")).toBe("migration");
    expect(validateMutationOrigin(undefined)).toBe("local-user");
    expect(() => validateMutationOrigin("unknown")).toThrow(/invalid mutation origin/i);
    expect(() => validateMutationOrigin(123)).toThrow(/invalid mutation origin/i);
    expect(() => validateMutationOrigin(null)).toThrow(/invalid mutation origin/i);
  });

  /** Rejects bodies with circular references (M-024). */
  it("rejects circular request bodies", () => {
    const body: Record<string, unknown> = { prompt: "hello" };
    body.self = body;
    expect(() =>
      validateVeniceIpcRequest({
        endpoint: "/chat/completions",
        method: "POST",
        body,
      })
    ).toThrow(/circular references|not serializable/i);
  });

  /** Character endpoints: GET /characters is allowed, GET /characters/{slug}
   *  is allowed for valid slugs, and a range of attack inputs is rejected. */
  describe("character endpoints", () => {
    it("accepts GET /characters", () => {
      const result = validateVeniceIpcRequest({ endpoint: "/characters", method: "GET" });
      expect(result).toMatchObject({ endpoint: "/characters", method: "GET" });
    });

    it("accepts GET /characters with a query string", () => {
      const result = validateVeniceIpcRequest({
        endpoint: "/characters?search=assistant&limit=20",
        method: "GET",
      });
      expect(result.endpoint).toBe("/characters?search=assistant&limit=20");
    });

    it("accepts GET /characters/{slug}", () => {
      const result = validateVeniceIpcRequest({
        endpoint: "/characters/alan-watts",
        method: "GET",
      });
      expect(result.endpoint).toBe("/characters/alan-watts");
    });

    it("rejects POST /characters", () => {
      expect(() =>
        validateVeniceIpcRequest({ endpoint: "/characters", method: "POST" })
      ).toThrow(/method/i);
    });

    it("rejects nested character paths", () => {
      expect(() =>
        validateVeniceIpcRequest({ endpoint: "/characters/foo/bar", method: "GET" })
      ).toThrow();
    });

    it("rejects URL-encoded traversal in the slug", () => {
      // The IPC layer's parseEndpoint decodes %2F to / inside pathname.
      // A real attacker would craft a string like "/characters/%2Fmodels".
      // parseEndpoint decodes that to /characters//models which has a
      // double-slash, then the second `/models` segment is an extra
      // nested segment and is rejected.
      expect(() =>
        validateVeniceIpcRequest({ endpoint: "/characters/%2Fmodels", method: "GET" })
      ).toThrow();
    });

    it("rejects an oversized query string on /characters", () => {
      const huge = "x".repeat(600);
      expect(() =>
        validateVeniceIpcRequest({
          endpoint: `/characters?search=${huge}`,
          method: "GET",
        })
      ).toThrow();
    });

    it("rejects bodies on GET /characters", () => {
      expect(() =>
        validateVeniceIpcRequest({
          endpoint: "/characters",
          method: "GET",
          body: { hidden: true },
        })
      ).toThrow();
    });
  });
});
