// Code Owner: fayeblade (@spearchucker667)
import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRIMARY_API_ROUTE,
  PRIMARY_API_ROUTE_BASE_PATHS,
  PRIMARY_API_ROUTE_DESCRIPTIONS,
  PRIMARY_API_ROUTE_HOSTS,
  PRIMARY_API_ROUTE_IDS,
  PRIMARY_API_ROUTE_LABELS,
  isEndpointSupportedByRoute,
  isPrimaryApiRouteId,
  normalizePrimaryApiRouteId,
  resolvePrimaryApiRoute,
  type PrimaryApiRouteId,
} from "./primaryApiRoute";

describe("primaryApiRoute contract", () => {
  it("exposes the documented route identifiers in a stable order", () => {
    expect(PRIMARY_API_ROUTE_IDS).toEqual(["venice", "fraterna"]);
    expect(DEFAULT_PRIMARY_API_ROUTE).toBe("venice");
  });

  it("wires a fixed allowlist of canonical hosts and base paths", () => {
    expect(PRIMARY_API_ROUTE_HOSTS.venice).toBe("api.venice.ai");
    expect(PRIMARY_API_ROUTE_HOSTS.fraterna).toBe("fraterna.ai");
    expect(PRIMARY_API_ROUTE_BASE_PATHS.venice).toBe("/api/v1");
    expect(PRIMARY_API_ROUTE_BASE_PATHS.fraterna).toBe("/api/v1");
    // Every route id must have a host + base path + label + description.
    for (const id of PRIMARY_API_ROUTE_IDS) {
      expect(typeof PRIMARY_API_ROUTE_HOSTS[id]).toBe("string");
      expect(PRIMARY_API_ROUTE_HOSTS[id].length).toBeGreaterThan(0);
      expect(typeof PRIMARY_API_ROUTE_BASE_PATHS[id]).toBe("string");
      expect(PRIMARY_API_ROUTE_BASE_PATHS[id].startsWith("/")).toBe(true);
      expect(typeof PRIMARY_API_ROUTE_LABELS[id]).toBe("string");
      expect(typeof PRIMARY_API_ROUTE_DESCRIPTIONS[id]).toBe("string");
      expect(PRIMARY_API_ROUTE_DESCRIPTIONS[id].length).toBeGreaterThan(0);
    }
  });

  it("treats the Venice route as the universal endpoint fallback", () => {
    const samples = [
      "/models",
      "/chat/completions",
      "/image/generate",
      "/images/generations",
      // These are NOT supported by Fraterna but ARE supported by Venice.
      "/image/edit",
      "/image/upscale",
      "/image/multi-edit",
      "/image/background-remove",
      "/models/traits",
      "/models/compatibility_mapping",
      "/image/styles",
      "/embeddings",
      "/audio/speech",
      "/audio/voices",
      "/audio/transcriptions",
      "/audio/queue",
      "/audio/retrieve",
      "/audio/quote",
      "/audio/complete",
      "/video/queue",
      "/video/retrieve",
      "/video/quote",
      "/video/complete",
      "/video/transcriptions",
      "/augment/search",
      "/augment/scrape",
      "/augment/text-parser",
      "/billing/balance",
      "/billing/usage-history",
      "/billing/usage-analytics",
      "/api_keys",
      "/api_keys/rate_limits",
      "/api_keys/rate_limits/log",
      "/characters",
      "/x402/top-up",
      "/x402/balance/0xabc",
      "/crypto/rpc/networks",
      "/crypto/rpc/eth-mainnet",
      "/responses",
    ];
    for (const pathname of samples) {
      expect(isEndpointSupportedByRoute("venice", pathname)).toBe(true);
    }
  });

  it("allows Fraterna only for the documented /models + chat/image matrix", () => {
    // handoff §4.1: GET /models, POST /chat/completions,
    //               POST /image/generate, POST /images/generations
    const supported = [
      "/models",
      "/chat/completions",
      "/image/generate",
      "/images/generations",
    ];
    for (const pathname of supported) {
      expect(isEndpointSupportedByRoute("fraterna", pathname)).toBe(true);
    }
  });

  it("denies every non-curated endpoint on the Fraterna route", () => {
    // handoff §4.2 keeps these on Venice Direct. The matrix is strict:
    // even endpoints that look "OpenAI-compatible" (embeddings, image
    // edit/upscale/multi-edit, audio/video, billing, etc.) must fall back
    // to the canonical Venice host because Fraterna does not officially
    // document them.
    const unsupported = [
      // Image editing / variations / upscale / background removal — §4.2
      "/image/edit",
      "/image/upscale",
      "/image/multi-edit",
      "/image/background-remove",
      "/image/styles",
      // Embeddings and other OpenAI-compatible extras — §4.2
      "/embeddings",
      // Models metadata — §4.2 (model traits etc.)
      "/models/traits",
      "/models/compatibility_mapping",
      // Audio / video / music — §4.2
      "/audio/speech",
      "/audio/voices",
      "/audio/transcriptions",
      "/audio/queue",
      "/audio/retrieve",
      "/audio/quote",
      "/audio/complete",
      "/video/queue",
      "/video/retrieve",
      "/video/quote",
      "/video/complete",
      "/video/transcriptions",
      // Augment — §4.2
      "/augment/search",
      "/augment/scrape",
      "/augment/text-parser",
      // Billing / API key management — §4.2
      "/billing/balance",
      "/billing/usage-history",
      "/billing/usage-analytics",
      "/api_keys",
      "/api_keys/rate_limits",
      "/api_keys/rate_limits/log",
      "/characters",
      // Crypto RPC / X402 / SIWX — §4.2
      "/x402/top-up",
      "/crypto/rpc/networks",
      "/crypto/rpc/eth-mainnet",
      "/responses",
      // And: arbitrary paths that aren't in the canonical allowlist at all.
      "/totally/unknown",
      "/",
    ];
    for (const pathname of unsupported) {
      expect(isEndpointSupportedByRoute("fraterna", pathname)).toBe(false);
    }
  });

  it("resolvePrimaryApiRoute returns the route identity for supported endpoints", () => {
    const resolved = resolvePrimaryApiRoute("fraterna", "/chat/completions");
    expect(resolved).toEqual({
      id: "fraterna",
      host: "fraterna.ai",
      basePath: "/api/v1",
    });
    expect(resolvePrimaryApiRoute("fraterna", "/models")).toEqual({
      id: "fraterna",
      host: "fraterna.ai",
      basePath: "/api/v1",
    });
    expect(resolvePrimaryApiRoute("venice", "/billing/balance")).toEqual({
      id: "venice",
      host: "api.venice.ai",
      basePath: "/api/v1",
    });
  });

  it("resolvePrimaryApiRoute returns null for unsupported endpoints so callers fall back to Venice", () => {
    expect(resolvePrimaryApiRoute("fraterna", "/image/edit")).toBeNull();
    expect(resolvePrimaryApiRoute("fraterna", "/embeddings")).toBeNull();
    expect(resolvePrimaryApiRoute("fraterna", "/video/queue")).toBeNull();
    expect(resolvePrimaryApiRoute("fraterna", "/billing/balance")).toBeNull();
    expect(resolvePrimaryApiRoute("fraterna", "/x402/top-up")).toBeNull();
    // The Venice route is the universal fallback, so it never returns null.
    expect(resolvePrimaryApiRoute("venice", "/billing/balance")).not.toBeNull();
    expect(resolvePrimaryApiRoute("venice", "/models")).not.toBeNull();
  });

  it("isPrimaryApiRouteId accepts only the documented route ids", () => {
    for (const id of PRIMARY_API_ROUTE_IDS) {
      expect(isPrimaryApiRouteId(id)).toBe(true);
      const typed: PrimaryApiRouteId = id;
      expect(typed).toBeTypeOf("string");
    }
    expect(isPrimaryApiRouteId("VENICE")).toBe(false);
    expect(isPrimaryApiRouteId("")).toBe(false);
    expect(isPrimaryApiRouteId(null)).toBe(false);
    expect(isPrimaryApiRouteId(undefined)).toBe(false);
    expect(isPrimaryApiRouteId(42)).toBe(false);
    expect(isPrimaryApiRouteId({})).toBe(false);
    expect(isPrimaryApiRouteId([])).toBe(false);
  });

  it("normalizePrimaryApiRouteId falls back to the default when given a bad value", () => {
    expect(normalizePrimaryApiRouteId("venice")).toBe("venice");
    expect(normalizePrimaryApiRouteId("fraterna")).toBe("fraterna");
    expect(normalizePrimaryApiRouteId(undefined)).toBe(DEFAULT_PRIMARY_API_ROUTE);
    expect(normalizePrimaryApiRouteId(null)).toBe(DEFAULT_PRIMARY_API_ROUTE);
    expect(normalizePrimaryApiRouteId("")).toBe(DEFAULT_PRIMARY_API_ROUTE);
    expect(normalizePrimaryApiRouteId("unknown")).toBe(DEFAULT_PRIMARY_API_ROUTE);
    expect(normalizePrimaryApiRouteId(42)).toBe(DEFAULT_PRIMARY_API_ROUTE);
    expect(normalizePrimaryApiRouteId({})).toBe(DEFAULT_PRIMARY_API_ROUTE);
  });
});
