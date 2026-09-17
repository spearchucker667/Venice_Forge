// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ALLOWED_VENICE_ENDPOINTS,
  ALLOWED_VENICE_METHODS,
  API_KEYS_ENDPOINT,
  CHARACTER_REVIEWS_SUFFIX,
  CHARACTER_SLUG_MAX_LENGTH,
  CHARACTERS_ENDPOINT,
  extractApiKeyId,
  extractCharacterSlug,
  extractCharacterSlugFromReviewsPath,
  extractWalletAddressFromX402Path,
  isAllowedApiKeysRequest,
  isAllowedCharactersRequest,
  isAllowedVeniceRequest,
  isAllowedX402Endpoint,
  isAllowedX402Request,
  VENICE_API_KEY_ID_PATTERN,
  VENICE_CHARACTER_SLUG_PATTERN,
  VENICE_ENDPOINT_METHODS,
  VENICE_WALLET_ADDRESS_PATTERN,
  X402_TOP_UP_ENDPOINT,
  CRYPTO_RPC_NETWORKS_ENDPOINT,
  CRYPTO_RPC_PREFIX,
  VENICE_NETWORK_SLUG_PATTERN,
  isAllowedCryptoRpcEndpoint,
  isAllowedCryptoRpcRequest,
  extractNetworkSlugFromCryptoRpcPath,
} from "./validation";

describe("validation", () => {
  describe("ALLOWED_VENICE_ENDPOINTS", () => {
    it("contains exactly the expected endpoints", () => {
      expect(ALLOWED_VENICE_ENDPOINTS).toEqual([
        "/models",
        "/models/traits",
        "/models/compatibility_mapping",
        "/image/styles",
        "/chat/completions",
        "/image/generate",
        "/image/upscale",
        "/augment/search",
        "/augment/scrape",
        "/augment/text-parser",
        "/video/queue",
        "/video/retrieve",
        "/video/quote",
        "/video/complete",
        "/video/transcriptions",
        "/image/edit",
        "/image/multi-edit",
        "/image/background-remove",
        "/embeddings",
        "/audio/queue",
        "/audio/retrieve",
        "/audio/quote",
        "/audio/complete",
        "/audio/speech",
        "/audio/voices",
        "/audio/transcriptions",
        // Phase 2 — Billing & Usage center. /billing/usage-history is the
        // canonical endpoint; /billing/usage-analytics is also read-only.
        "/billing/balance",
        "/billing/usage-history",
        "/billing/usage-analytics",
        // Phase 9 — API-key administration. /api_keys/{id} is matched by
        // the parameterized helper (see isAllowedApiKeysRequest); the
        // literal-path lookup table carries it as a template.
        "/api_keys",
        "/api_keys/{id}",
        "/api_keys/rate_limits",
        "/api_keys/rate_limits/log",
        // Phase 8 — Responses API (alpha). Experimental, opt-in; POST-only.
        "/responses",
        // Phase 7 — x402 keyless wallet authentication and payment rail.
        "/x402/top-up",
        "/x402/balance/{walletAddress}",
        "/x402/transactions/{walletAddress}",
        // Phase 8 — Crypto RPC.
        "/crypto/rpc/networks",
        "/crypto/rpc/{network}",
      ]);
    });
  });

  describe("ALLOWED_VENICE_METHODS", () => {
    it("contains GET, POST, PUT, DELETE (Phase 9 added PUT/DELETE for /api_keys/{id})", () => {
      expect(ALLOWED_VENICE_METHODS).toEqual(["GET", "POST", "PUT", "DELETE"]);
    });
  });

  describe("VENICE_ENDPOINT_METHODS", () => {
    it("allows GET only for /models", () => {
      expect(VENICE_ENDPOINT_METHODS["/models"]).toEqual(["GET"]);
    });

    it("allows GET only for /image/styles", () => {
      expect(VENICE_ENDPOINT_METHODS["/image/styles"]).toEqual(["GET"]);
    });

    it("allows POST for all non-GET-only endpoints except the parameterized /api_keys/{id}", () => {
      // Phase 9 widened the method set and added the parameterized
      // `/api_keys/{id}` (GET/PUT/DELETE). The invariant for this test is
      // therefore: every endpoint that is not GET-only and is not
      // `/api_keys/{id}` accepts POST. /api_keys/{id} accepts PUT/DELETE
      // for single-key CRUD instead.
      const getOnlyEndpoints = new Set([
        "/models",
        "/models/traits",
        "/models/compatibility_mapping",
        "/image/styles",
        // Phase 2 — billing endpoints are read-only.
        "/billing/balance",
        "/billing/usage-history",
        "/billing/usage-analytics",
        // Phase 9 — read-only rate-limit sub-paths.
        "/api_keys/rate_limits",
        "/api_keys/rate_limits/log",
        // Phase 7 — read-only x402 balance and transactions.
        "/x402/balance/{walletAddress}",
        "/x402/transactions/{walletAddress}",
        // Phase 8 — read-only network discovery.
        "/crypto/rpc/networks",
      ]);
      const nonGetOnlyExceptParameterized = new Set([
        ...getOnlyEndpoints,
        // Phase 9 — `/api_keys/{id}` accepts GET/PUT/DELETE, NOT POST.
        "/api_keys/{id}",
      ]);
      const postEndpoints = Object.entries(VENICE_ENDPOINT_METHODS).filter(
        ([ep, methods]) =>
          !nonGetOnlyExceptParameterized.has(ep) && methods.includes("POST"),
      );
      expect(postEndpoints.length).toBe(
        ALLOWED_VENICE_ENDPOINTS.length - nonGetOnlyExceptParameterized.size,
      );
    });

    it("rejects POST on /billing/usage-history (Phase 2: read-only billing)", () => {
      expect(isAllowedVeniceRequest("/billing/usage-history", "POST")).toBe(false);
      expect(isAllowedVeniceRequest("/billing/balance", "POST")).toBe(false);
      expect(isAllowedVeniceRequest("/billing/usage-analytics", "POST")).toBe(false);
    });
  });

  describe("isAllowedVeniceRequest", () => {
    it("returns true for allowed endpoint/method pairs", () => {
      expect(isAllowedVeniceRequest("/models", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/image/styles", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/chat/completions", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/image/generate", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/video/queue", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/video/retrieve", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/image/edit", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/image/multi-edit", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/embeddings", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/audio/queue", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/audio/retrieve", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/audio/speech", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/audio/transcriptions", "POST")).toBe(true);
    });

    it("Phase 8 — allows POST only on /responses (alpha)", () => {
      expect(isAllowedVeniceRequest("/responses", "POST")).toBe(true);
      expect(VENICE_ENDPOINT_METHODS["/responses"]).toEqual(["POST"]);
    });

    it("Phase 8 — rejects non-POST methods and sub-paths on /responses", () => {
      expect(isAllowedVeniceRequest("/responses", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/responses", "PUT")).toBe(false);
      expect(isAllowedVeniceRequest("/responses", "DELETE")).toBe(false);
      // No wildcard/nested routing.
      expect(isAllowedVeniceRequest("/responses/anything", "POST")).toBe(false);
      expect(isAllowedVeniceRequest("/responses/input", "POST")).toBe(false);
    });

    it("returns false for wrong method", () => {
      expect(isAllowedVeniceRequest("/models", "POST")).toBe(false);
      expect(isAllowedVeniceRequest("/image/styles", "POST")).toBe(false);
      expect(isAllowedVeniceRequest("/chat/completions", "GET")).toBe(false);
    });

    it("returns false for unknown endpoints", () => {
      expect(isAllowedVeniceRequest("/admin", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/api/v1/models", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("", "GET")).toBe(false);
    });

    it("returns false for case-mismatched methods", () => {
      expect(isAllowedVeniceRequest("/models", "get")).toBe(false);
      expect(isAllowedVeniceRequest("/models", "Get")).toBe(false);
    });
  });

  describe("character endpoint allowlist", () => {
    it("accepts GET /characters", () => {
      expect(isAllowedVeniceRequest("/characters", "GET")).toBe(true);
    });

    it("accepts GET /characters/{slug} for valid slugs", () => {
      expect(isAllowedVeniceRequest("/characters/alan-watts", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/characters/dolores-dei", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/characters/Some_Char-9", "GET")).toBe(true);
    });

    it("rejects POST /characters", () => {
      expect(isAllowedCharactersRequest("/characters", "POST")).toBe(false);
      expect(isAllowedVeniceRequest("/characters", "POST")).toBe(false);
    });

    it("rejects nested character paths", () => {
      expect(isAllowedVeniceRequest("/characters/foo/bar", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/foo/bar/baz", "GET")).toBe(false);
    });

    it("rejects URL-encoded slashes and traversal in the slug", () => {
      expect(isAllowedVeniceRequest("/characters/%2Fmodels", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/..%2F..", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/..", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/.", "GET")).toBe(false);
    });

    it("rejects oversized or empty slugs", () => {
      expect(isAllowedVeniceRequest("/characters/", "GET")).toBe(false);
      expect(isAllowedVeniceRequest(`/characters/${"a".repeat(CHARACTER_SLUG_MAX_LENGTH + 1)}`, "GET")).toBe(false);
    });

    it("rejects slugs that contain disallowed characters", () => {
      expect(isAllowedVeniceRequest("/characters/has space", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/has.dot", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/has%2Fslash", "GET")).toBe(false);
    });

    it("rejects unknown endpoints", () => {
      expect(isAllowedVeniceRequest("/character", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters-extra", "GET")).toBe(false);
    });

    it("extractCharacterSlug returns the slug for valid paths", () => {
      expect(extractCharacterSlug("/characters/alan-watts")).toBe("alan-watts");
      expect(extractCharacterSlug("/characters/Dolores_42")).toBe("Dolores_42");
    });

    it("extractCharacterSlug returns null for invalid paths", () => {
      expect(extractCharacterSlug("/characters")).toBeNull();
      expect(extractCharacterSlug("/characters/foo/bar")).toBeNull();
      expect(extractCharacterSlug("/characters/has.dot")).toBeNull();
      expect(extractCharacterSlug("/characters/%2Fmodels")).toBeNull();
    });

    it("slug pattern rejects empty / oversized / control / encoded inputs", () => {
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a")).toBe(true);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("A_b-9")).toBe(true);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a".repeat(CHARACTER_SLUG_MAX_LENGTH))).toBe(true);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a".repeat(CHARACTER_SLUG_MAX_LENGTH + 1))).toBe(false);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("")).toBe(false);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a/b")).toBe(false);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a.b")).toBe(false);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a%2Fb")).toBe(false);
    });

    it("constant matches the documented list endpoint", () => {
      expect(CHARACTERS_ENDPOINT).toBe("/characters");
    });
  });

  describe("Phase 12 — /characters/{slug}/reviews", () => {
    it("accepts /characters/{slug}/reviews with GET", () => {
      expect(isAllowedCharactersRequest("/characters/alan-watts/reviews", "GET")).toBe(true);
    });

    it("accepts the broader isAllowedVeniceRequest path for reviews", () => {
      expect(isAllowedVeniceRequest("/characters/alan-watts/reviews", "GET")).toBe(true);
    });

    it("rejects POST / PUT / DELETE on reviews", () => {
      expect(isAllowedCharactersRequest("/characters/alan-watts/reviews", "POST")).toBe(false);
      expect(isAllowedCharactersRequest("/characters/alan-watts/reviews", "PUT")).toBe(false);
      expect(isAllowedCharactersRequest("/characters/alan-watts/reviews", "DELETE")).toBe(false);
    });

    it("rejects nested paths beyond reviews", () => {
      // handoff §17 forbids generalizing to arbitrary nested /characters/* paths.
      expect(isAllowedCharactersRequest("/characters/alan-watts/reviews/something", "GET")).toBe(false);
      expect(isAllowedCharactersRequest("/characters/alan-watts/tags", "GET")).toBe(false);
      expect(isAllowedCharactersRequest("/characters/alan-watts/reviews/extra", "GET")).toBe(false);
    });

    it("rejects reviews with empty or invalid slug", () => {
      expect(isAllowedCharactersRequest("/characters//reviews", "GET")).toBe(false);
      expect(isAllowedCharactersRequest("/characters/has.dot/reviews", "GET")).toBe(false);
      expect(isAllowedCharactersRequest("/characters/has%2Fslash/reviews", "GET")).toBe(false);
    });

    it("rejects the bare /characters/reviews path (no slug)", () => {
      expect(isAllowedCharactersRequest("/characters/reviews", "GET")).toBe(false);
    });

    it("extractCharacterSlugFromReviewsPath returns the slug or null", () => {
      expect(extractCharacterSlugFromReviewsPath("/characters/alan-watts/reviews")).toBe("alan-watts");
      expect(extractCharacterSlugFromReviewsPath("/characters/has.dot/reviews")).toBeNull();
      expect(extractCharacterSlugFromReviewsPath("/characters//reviews")).toBeNull();
      expect(extractCharacterSlugFromReviewsPath("/characters/reviews")).toBeNull();
      expect(extractCharacterSlugFromReviewsPath("/characters/alan-watts")).toBeNull();
    });

    it("constant matches the documented suffix", () => {
      expect(CHARACTER_REVIEWS_SUFFIX).toBe("/reviews");
    });
  });

  describe("Phase 9 — /api_keys administration", () => {
    it("accepts /api_keys with GET and POST", () => {
      expect(isAllowedApiKeysRequest("/api_keys", "GET")).toBe(true);
      expect(isAllowedApiKeysRequest("/api_keys", "POST")).toBe(true);
    });

    it("accepts /api_keys/{id} with GET / PUT / DELETE", () => {
      expect(isAllowedApiKeysRequest("/api_keys/abc-123", "GET")).toBe(true);
      expect(isAllowedApiKeysRequest("/api_keys/abc-123", "PUT")).toBe(true);
      expect(isAllowedApiKeysRequest("/api_keys/abc-123", "DELETE")).toBe(true);
    });

    it("rejects POST on /api_keys/{id}", () => {
      expect(isAllowedApiKeysRequest("/api_keys/abc-123", "POST")).toBe(false);
    });

    it("rejects nested /api_keys/{id}/{something}", () => {
      expect(isAllowedApiKeysRequest("/api_keys/abc/extra", "GET")).toBe(false);
    });

    it("rejects URL-encoded slashes / dot-segments in id", () => {
      expect(isAllowedApiKeysRequest("/api_keys/%2Fmodels", "GET")).toBe(false);
      expect(isAllowedApiKeysRequest("/api_keys/has.dot", "GET")).toBe(false);
    });

    it("rejects unknown methods", () => {
      expect(isAllowedApiKeysRequest("/api_keys", "PATCH")).toBe(false);
    });

    it("rejects paths outside the /api_keys prefix", () => {
      expect(isAllowedApiKeysRequest("/api_keyx", "GET")).toBe(false);
    });

    it("extractApiKeyId returns the id on match, null otherwise", () => {
      expect(extractApiKeyId("/api_keys/abc-123")).toBe("abc-123");
      expect(extractApiKeyId("/api_keys/abc/extra")).toBeNull();
      expect(extractApiKeyId("/api_keys/")).toBeNull();
      expect(extractApiKeyId("/api_keys")).toBeNull();
    });

    it("isAllowedVeniceRequest routes /api_keys/{id} through the parameterized matcher", () => {
      expect(isAllowedVeniceRequest("/api_keys", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/api_keys", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/api_keys/abc-123", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/api_keys/abc-123", "PUT")).toBe(true);
      expect(isAllowedVeniceRequest("/api_keys/abc-123", "DELETE")).toBe(true);
      expect(isAllowedVeniceRequest("/api_keys/abc/extra", "GET")).toBe(false);
    });

    it("literal read-only /api_keys/rate_limits is allowed", () => {
      expect(isAllowedVeniceRequest("/api_keys/rate_limits", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/api_keys/rate_limits", "POST")).toBe(false);
      expect(isAllowedVeniceRequest("/api_keys/rate_limits/log", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/api_keys/rate_limits/log", "POST")).toBe(false);
    });

    it("constant matches the documented base endpoint", () => {
      expect(API_KEYS_ENDPOINT).toBe("/api_keys");
    });

    it("api-key id pattern rejects empty / oversized / control / encoded inputs", () => {
      expect(VENICE_API_KEY_ID_PATTERN.test("a")).toBe(true);
      expect(VENICE_API_KEY_ID_PATTERN.test("A_b-9")).toBe(true);
      expect(VENICE_API_KEY_ID_PATTERN.test("a".repeat(128))).toBe(true);
      expect(VENICE_API_KEY_ID_PATTERN.test("a".repeat(129))).toBe(false);
      expect(VENICE_API_KEY_ID_PATTERN.test("")).toBe(false);
      expect(VENICE_API_KEY_ID_PATTERN.test("a/b")).toBe(false);
      expect(VENICE_API_KEY_ID_PATTERN.test("a.b")).toBe(false);
    });
  });

  describe("Phase 7 — x402 endpoints and validation", () => {
    const validEvmAddress = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
    const validSolanaAddress = "8qUL23aSj7mDWdoLMXGHFvnVCT9wd7jXcysiekroADEL";
    const invalidAddress = "0xInvalidShort";

    it("validates wallet address pattern for EVM and Solana", () => {
      expect(VENICE_WALLET_ADDRESS_PATTERN.test(validEvmAddress)).toBe(true);
      expect(VENICE_WALLET_ADDRESS_PATTERN.test(validSolanaAddress)).toBe(true);
      expect(VENICE_WALLET_ADDRESS_PATTERN.test(invalidAddress)).toBe(false);
      expect(VENICE_WALLET_ADDRESS_PATTERN.test("")).toBe(false);
      expect(VENICE_WALLET_ADDRESS_PATTERN.test("0x" + "g".repeat(40))).toBe(false);
    });

    it("allows POST on /x402/top-up and rejects other methods", () => {
      expect(isAllowedX402Request(X402_TOP_UP_ENDPOINT, "POST")).toBe(true);
      expect(isAllowedX402Request(X402_TOP_UP_ENDPOINT, "GET")).toBe(false);
      expect(isAllowedX402Request(X402_TOP_UP_ENDPOINT, "PUT")).toBe(false);
      expect(isAllowedX402Request(X402_TOP_UP_ENDPOINT, "DELETE")).toBe(false);
    });

    it("allows GET on /x402/balance/{walletAddress} with valid address", () => {
      expect(isAllowedX402Request(`/x402/balance/${validEvmAddress}`, "GET")).toBe(true);
      expect(isAllowedX402Request(`/x402/balance/${validSolanaAddress}`, "GET")).toBe(true);
      expect(isAllowedX402Request(`/x402/balance/${validEvmAddress}`, "POST")).toBe(false);
      expect(isAllowedX402Request(`/x402/balance/${invalidAddress}`, "GET")).toBe(false);
      expect(isAllowedX402Request(`/x402/balance/${validEvmAddress}/nested`, "GET")).toBe(false);
    });

    it("allows GET on /x402/transactions/{walletAddress} with valid address", () => {
      expect(isAllowedX402Request(`/x402/transactions/${validEvmAddress}`, "GET")).toBe(true);
      expect(isAllowedX402Request(`/x402/transactions/${validSolanaAddress}`, "GET")).toBe(true);
      expect(isAllowedX402Request(`/x402/transactions/${validEvmAddress}`, "POST")).toBe(false);
      expect(isAllowedX402Request(`/x402/transactions/${invalidAddress}`, "GET")).toBe(false);
      expect(isAllowedX402Request(`/x402/transactions/${validEvmAddress}/extra`, "GET")).toBe(false);
    });

    it("extracts wallet address from x402 paths", () => {
      expect(extractWalletAddressFromX402Path(`/x402/balance/${validEvmAddress}`)).toBe(validEvmAddress);
      expect(extractWalletAddressFromX402Path(`/x402/transactions/${validSolanaAddress}`)).toBe(validSolanaAddress);
      expect(extractWalletAddressFromX402Path(`/x402/balance/${invalidAddress}`)).toBeNull();
      expect(extractWalletAddressFromX402Path("/x402/top-up")).toBeNull();
    });

    it("checks isAllowedX402Endpoint structure", () => {
      expect(isAllowedX402Endpoint("/x402/top-up")).toBe(true);
      expect(isAllowedX402Endpoint(`/x402/balance/${validEvmAddress}`)).toBe(true);
      expect(isAllowedX402Endpoint(`/x402/transactions/${validSolanaAddress}`)).toBe(true);
      expect(isAllowedX402Endpoint("/x402/other")).toBe(false);
    });

    it("isAllowedVeniceRequest routes x402 requests correctly", () => {
      expect(isAllowedVeniceRequest("/x402/top-up", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/x402/top-up", "GET")).toBe(false);
      expect(isAllowedVeniceRequest(`/x402/balance/${validEvmAddress}`, "GET")).toBe(true);
      expect(isAllowedVeniceRequest(`/x402/transactions/${validSolanaAddress}`, "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/x402/unknown", "GET")).toBe(false);
    });
  });

  describe("Phase 8 — Crypto RPC endpoints and validation", () => {
    it("validates network slug pattern", () => {
      expect(VENICE_NETWORK_SLUG_PATTERN.test("ethereum-mainnet")).toBe(true);
      expect(VENICE_NETWORK_SLUG_PATTERN.test("base-sepolia")).toBe(true);
      expect(VENICE_NETWORK_SLUG_PATTERN.test("solana-mainnet")).toBe(true);
      expect(VENICE_NETWORK_SLUG_PATTERN.test("arbitrum-one")).toBe(true);
      expect(VENICE_NETWORK_SLUG_PATTERN.test("polygon-amoy")).toBe(true);
      expect(VENICE_NETWORK_SLUG_PATTERN.test("")).toBe(false);
      expect(VENICE_NETWORK_SLUG_PATTERN.test("Ethereum-Mainnet")).toBe(false);
      expect(VENICE_NETWORK_SLUG_PATTERN.test("has.dot")).toBe(false);
      expect(VENICE_NETWORK_SLUG_PATTERN.test("has_underscore")).toBe(false);
      expect(VENICE_NETWORK_SLUG_PATTERN.test("has/slash")).toBe(false);
      expect(VENICE_NETWORK_SLUG_PATTERN.test("a".repeat(65))).toBe(false);
    });

    it("allows GET on /crypto/rpc/networks and rejects other methods", () => {
      expect(isAllowedCryptoRpcRequest(CRYPTO_RPC_NETWORKS_ENDPOINT, "GET")).toBe(true);
      expect(isAllowedCryptoRpcRequest(CRYPTO_RPC_NETWORKS_ENDPOINT, "POST")).toBe(false);
      expect(isAllowedCryptoRpcRequest(CRYPTO_RPC_NETWORKS_ENDPOINT, "PUT")).toBe(false);
      expect(isAllowedCryptoRpcRequest(CRYPTO_RPC_NETWORKS_ENDPOINT, "DELETE")).toBe(false);
    });

    it("constant matches the documented prefix", () => {
      expect(CRYPTO_RPC_PREFIX).toBe("/crypto/rpc/");
      expect(CRYPTO_RPC_NETWORKS_ENDPOINT).toBe("/crypto/rpc/networks");
    });

    it("allows POST on /crypto/rpc/{network} with valid slug and rejects other methods", () => {
      expect(isAllowedCryptoRpcRequest("/crypto/rpc/ethereum-mainnet", "POST")).toBe(true);
      expect(isAllowedCryptoRpcRequest("/crypto/rpc/base-sepolia", "POST")).toBe(true);
      expect(isAllowedCryptoRpcRequest("/crypto/rpc/solana-mainnet", "POST")).toBe(true);
      expect(isAllowedCryptoRpcRequest("/crypto/rpc/ethereum-mainnet", "GET")).toBe(false);
      expect(isAllowedCryptoRpcRequest("/crypto/rpc/ethereum-mainnet", "PUT")).toBe(false);
      expect(isAllowedCryptoRpcRequest("/crypto/rpc/ethereum-mainnet", "DELETE")).toBe(false);
    });

    it("rejects malformed network slugs or nested paths", () => {
      expect(isAllowedCryptoRpcRequest("/crypto/rpc/INVALID-UPPER", "POST")).toBe(false);
      expect(isAllowedCryptoRpcRequest("/crypto/rpc/ethereum-mainnet/nested", "POST")).toBe(false);
      expect(isAllowedCryptoRpcRequest("/crypto/rpc/", "POST")).toBe(false);
      expect(isAllowedCryptoRpcRequest("/crypto/other", "POST")).toBe(false);
    });

    it("extracts network slug correctly from valid paths", () => {
      expect(extractNetworkSlugFromCryptoRpcPath("/crypto/rpc/ethereum-mainnet")).toBe("ethereum-mainnet");
      expect(extractNetworkSlugFromCryptoRpcPath("/crypto/rpc/base-sepolia")).toBe("base-sepolia");
      expect(extractNetworkSlugFromCryptoRpcPath("/crypto/rpc/networks")).toBeNull();
      expect(extractNetworkSlugFromCryptoRpcPath("/crypto/rpc/INVALID")).toBeNull();
      expect(extractNetworkSlugFromCryptoRpcPath("/crypto/rpc/ethereum-mainnet/extra")).toBeNull();
      expect(extractNetworkSlugFromCryptoRpcPath("/other/path")).toBeNull();
    });

    it("checks isAllowedCryptoRpcEndpoint structure", () => {
      expect(isAllowedCryptoRpcEndpoint("/crypto/rpc/networks")).toBe(true);
      expect(isAllowedCryptoRpcEndpoint("/crypto/rpc/ethereum-mainnet")).toBe(true);
      expect(isAllowedCryptoRpcEndpoint("/crypto/rpc/solana-mainnet")).toBe(true);
      expect(isAllowedCryptoRpcEndpoint("/crypto/rpc/INVALID_UPPER")).toBe(false);
      expect(isAllowedCryptoRpcEndpoint("/crypto/other")).toBe(false);
    });

    it("isAllowedVeniceRequest routes Crypto RPC requests correctly", () => {
      expect(isAllowedVeniceRequest("/crypto/rpc/networks", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/crypto/rpc/networks", "POST")).toBe(false);
      expect(isAllowedVeniceRequest("/crypto/rpc/ethereum-mainnet", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/crypto/rpc/ethereum-mainnet", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/crypto/rpc/unknown.slug", "POST")).toBe(false);
    });
  });
});
