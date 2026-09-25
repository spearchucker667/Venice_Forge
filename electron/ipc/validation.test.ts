// @vitest-environment node

/** @fileoverview Unit tests for Electron IPC request validation and API key input
 *  sanitization. */

import { describe, expect, it } from "vitest";
import {
  MAX_VENICE_IPC_BODY_BYTES,
  validateApiKeyInput,
  validateAzureResourceName,
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

  it("accepts only POST for the exact /images/generations endpoint through IPC", () => {
    expect(
      validateVeniceIpcRequest({
        endpoint: "/images/generations?quality=standard",
        method: "POST",
        body: { model: "gpt-image-1", prompt: "minimal geometric shapes" },
      }),
    ).toMatchObject({
      endpoint: "/images/generations?quality=standard",
      method: "POST",
    });
    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/images/generations", method: "GET" }),
    ).toThrow(/method/i);
    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/images/not-real", method: "POST" }),
    ).toThrow(/not allowed/i);
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

  it("enforces the shared static system-prompt policy at the trusted boundary", () => {
    const request = (content: string) => ({
      endpoint: "/chat/completions",
      method: "POST",
      body: { messages: [{ role: "system", content }] },
    });

    expect(() => validateVeniceIpcRequest(request("a".repeat(32_768)))).not.toThrow();
    expect(() => validateVeniceIpcRequest(request("a".repeat(32_769)))).toThrow(
      /32,768 Unicode code points.*approximately 8,192 tokens/i,
    );
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

  /** Validates Azure resource names to prevent SSRF via the resource field. */
  it("validates Azure resource names", () => {
    expect(validateAzureResourceName("venice-forge-test")).toBe("venice-forge-test");
    expect(() => validateAzureResourceName("")).toThrow(/required/i);
    expect(() => validateAzureResourceName("a")).toThrow(/2–64/i);
    expect(() => validateAzureResourceName("-invalid")).toThrow(/hyphen/i);
    expect(() => validateAzureResourceName("invalid.com")).toThrow(/2–64/i);
    expect(() => validateAzureResourceName("https://evil")).toThrow(/2–64/i);
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

  /** T-001 regression guard: provider credential scope must use a validated profile id. */
  it("validates profile ids before provider credential routing", () => {
    expect(
      validateVeniceIpcRequest({
        endpoint: "/chat/completions",
        method: "POST",
        profileId: "work-profile",
        body: { model: "anthropic:claude-3-5-sonnet-latest" },
      }),
    ).toMatchObject({ profileId: "work-profile" });

    expect(() =>
      validateVeniceIpcRequest({
        endpoint: "/chat/completions",
        method: "POST",
        profileId: "../../default",
        body: { model: "anthropic:claude-3-5-sonnet-latest" },
      }),
    ).toThrow(/profile id/i);
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

  describe("Phase 7 — x402 IPC validation", () => {
    const validEvmAddress = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";

    it("allows valid x402 balance and top-up requests through IPC", () => {
      const balanceReq = validateVeniceIpcRequest({
        endpoint: `/x402/balance/${validEvmAddress}`,
        method: "GET",
        headers: { "SIGN-IN-WITH-X": "a".repeat(1000) },
      });
      expect(balanceReq).toMatchObject({
        endpoint: `/x402/balance/${validEvmAddress}`,
        method: "GET",
      });
      expect(balanceReq.headers?.["SIGN-IN-WITH-X"]).toBe("a".repeat(1000));

      expect(
        validateVeniceIpcRequest({
          endpoint: "/x402/top-up",
          method: "POST",
          headers: { "PAYMENT-SIGNATURE": "b".repeat(1000) },
        }),
      ).toMatchObject({
        endpoint: "/x402/top-up",
        method: "POST",
      });
    });

    it("rejects invalid x402 endpoints or methods through IPC", () => {
      expect(() =>
        validateVeniceIpcRequest({
          endpoint: "/x402/balance/invalid_address",
          method: "GET",
        }),
      ).toThrow(/not allowed/i);

      expect(() =>
        validateVeniceIpcRequest({
          endpoint: "/x402/top-up",
          method: "DELETE",
        }),
      ).toThrow(/method/i);
    });
  });

  describe("Phase 8 — Crypto RPC IPC validation", () => {
    it("allows valid public /crypto/rpc/networks through IPC", () => {
      const result = validateVeniceIpcRequest({
        endpoint: "/crypto/rpc/networks",
        method: "GET",
      });
      expect(result).toMatchObject({
        endpoint: "/crypto/rpc/networks",
        method: "GET",
      });
    });

    it("allows valid POST /crypto/rpc/{network} with Idempotency-Key header through IPC", () => {
      const result = validateVeniceIpcRequest({
        endpoint: "/crypto/rpc/ethereum-mainnet",
        method: "POST",
        headers: {
          "Idempotency-Key": "tx-12345-abcde",
          "SIGN-IN-WITH-X": "siwx_sample_token",
        },
        body: {
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        },
      });
      expect(result).toMatchObject({
        endpoint: "/crypto/rpc/ethereum-mainnet",
        method: "POST",
      });
      expect(result.headers?.["Idempotency-Key"]).toBe("tx-12345-abcde");
      expect(result.headers?.["SIGN-IN-WITH-X"]).toBe("siwx_sample_token");
    });

    it("rejects invalid methods or slugs on Crypto RPC through IPC", () => {
      expect(() =>
        validateVeniceIpcRequest({
          endpoint: "/crypto/rpc/networks",
          method: "POST",
        }),
      ).toThrow(/method/i);

      expect(() =>
        validateVeniceIpcRequest({
          endpoint: "/crypto/rpc/ethereum-mainnet",
          method: "GET",
        }),
      ).toThrow(/method/i);

      expect(() =>
        validateVeniceIpcRequest({
          endpoint: "/crypto/rpc/INVALID-SLUG",
          method: "POST",
        }),
      ).toThrow(/not allowed/i);

      expect(() =>
        validateVeniceIpcRequest({
          endpoint: "/crypto/rpc/networks",
          method: "GET",
          body: { extra: true },
        }),
      ).toThrow(/GET Venice requests cannot include a body/i);
    });
  });
});
