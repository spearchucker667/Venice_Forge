// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Shared endpoint allowlist consumed by both Electron IPC and the web proxy. */

/** Venice API endpoints permitted by the IPC and proxy validators. */
export const ALLOWED_VENICE_ENDPOINTS = [
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
  // Phase 2 — Billing & Usage center. The canonical /billing/usage-history
  // supersedes the deprecated /billing/usage; both endpoints are allowed
  // here so existing read-only consumers keep working until migration
  // completes. See docs/audits/TODO/VENICE_API_2026-09-16_FEATURE_GAP_AGENT_HANDOFF.md
  // §7 (Phase 2) for the "do not implement new UI against /billing/usage"
  // rule. New code MUST prefer /billing/usage-history.
  "/billing/balance",
  "/billing/usage-history",
  "/billing/usage-analytics",
  // Phase 9 — API-key administration & privacy. `/api_keys/{id}` is a
  // template that resolves via isAllowedApiKeysRequest(); it is still
  // enumerated here so the exact-allowlist assertion in
  // validation.test.ts stays the single source of truth.
  "/api_keys",
  "/api_keys/{id}",
  "/api_keys/rate_limits",
  "/api_keys/rate_limits/log",
  // Phase 8 — Responses API (alpha). Experimental, opt-in transport only;
  // POST-only per the upstream contract (docs/reference/Venice_swagger_api.yaml
  // :7095). Never a silent replacement for /chat/completions.
  "/responses",
  // Phase 7 — x402 keyless wallet authentication and payment rail.
  // /x402/top-up is POST (empty body discovers payment options, header tops up).
  // Parameterized /x402/balance/{walletAddress} and /x402/transactions/{walletAddress}
  // resolve via isAllowedX402Request().
  "/x402/top-up",
  "/x402/balance/{walletAddress}",
  "/x402/transactions/{walletAddress}",
  // Phase 8 — Crypto RPC (blockchain node access).
  // /crypto/rpc/networks is GET (public network slug discovery).
  // Parameterized /crypto/rpc/{network} is POST (JSON-RPC 2.0 proxy).
  // Resolves via isAllowedCryptoRpcRequest().
  "/crypto/rpc/networks",
  "/crypto/rpc/{network}",
] as const;

/** HTTP methods permitted for Venice API requests. PUT and DELETE were
 *  added with the Phase 9 API-key administration surface
 *  (`/api_keys/{id}`) — both methods are documented upstream for the
 *  single-key CRUD endpoints. */
export const ALLOWED_VENICE_METHODS = ["GET", "POST", "PUT", "DELETE"] as const;

/** Union type of allowed Venice API endpoint paths. */
export type VeniceIpcEndpoint = (typeof ALLOWED_VENICE_ENDPOINTS)[number];

/** Union type of allowed Venice API HTTP methods. */
export type VeniceIpcMethod = (typeof ALLOWED_VENICE_METHODS)[number];

/** Allowed HTTP methods for each permitted Venice endpoint.
 *  Indexed by string at runtime to permit parameterized routes like
 *  `/api_keys/{id}` (Phase 9) which live alongside the literal lookup
 *  table. `VeniceIpcEndpoint` (the union of literal entries) is
 *  preserved as the static type for callers that want compile-time
 *  safety on the documented endpoints; this Record just broadens the
 *  index signature so the parameterized route can also be enumerated. */
export const VENICE_ENDPOINT_METHODS: Record<string, readonly VeniceIpcMethod[]> = {
  "/models": ["GET"],
  "/models/traits": ["GET"],
  "/models/compatibility_mapping": ["GET"],
  "/image/styles": ["GET"],
  "/chat/completions": ["POST"],
  "/image/generate": ["POST"],
  "/image/upscale": ["POST"],
  "/augment/search": ["POST"],
  "/augment/scrape": ["POST"],
  "/augment/text-parser": ["POST"],
  "/video/queue": ["POST"],
  "/video/retrieve": ["POST"],
  "/video/quote": ["POST"],
  "/video/complete": ["POST"],
  "/video/transcriptions": ["POST"],
  "/image/edit": ["POST"],
  "/image/multi-edit": ["POST"],
  "/image/background-remove": ["POST"],
  "/embeddings": ["POST"],
  "/audio/queue": ["POST"],
  "/audio/retrieve": ["POST"],
  "/audio/quote": ["POST"],
  "/audio/complete": ["POST"],
  "/audio/speech": ["POST"],
  "/audio/voices": ["POST"],
  "/audio/transcriptions": ["POST"],
  // Billing endpoints are read-only — GET only. Renderer cannot mutate
  // billing state via the canonical Venice request path; that gate is
  // enforced by VENICE_ENDPOINT_METHODS being the single source of truth
  // for "is this method allowed on this endpoint".
  "/billing/balance": ["GET"],
  "/billing/usage-history": ["GET"],
  "/billing/usage-analytics": ["GET"],
  // Phase 9 — API-key administration & privacy. The canonical CRUD surface
  // for managing Venice API keys. Note that the renderer must NEVER receive
  // the active stored secret; create-key responses that include a one-time
  // secret are surfaced through a narrowly-scoped, one-shot IPC channel
  // and redacted from logs/diagnostics. See Phase 9 of the 2026-09-16
  // feature-gap handoff for the security model.
  "/api_keys": ["GET", "POST"],
  "/api_keys/{id}": ["GET", "PUT", "DELETE"],
  "/api_keys/rate_limits": ["GET"],
  "/api_keys/rate_limits/log": ["GET"],
  // Phase 8 — Responses API (alpha). POST only; the upstream contract
  // documents no other method on /responses.
  "/responses": ["POST"],
  // Phase 7 — x402 wallet authentication & payment rail.
  "/x402/top-up": ["POST"],
  "/x402/balance/{walletAddress}": ["GET"],
  "/x402/transactions/{walletAddress}": ["GET"],
  // Phase 8 — Crypto RPC.
  "/crypto/rpc/networks": ["GET"],
  "/crypto/rpc/{network}": ["POST"],
};

/** The bare /characters list endpoint. The character-slug variant is
 *  parameterized: see `VENICE_CHARACTER_SLUG_PATTERN`. */
export const CHARACTERS_ENDPOINT = "/characters" as const;

/** Phase 9 — base path for the API-key administration surface. The
 *  parameterized `/api_keys/{id}` variant is matched by
 *  `isAllowedApiKeysRequest()`. */
export const API_KEYS_ENDPOINT = "/api_keys" as const;

/** Maximum length of a character slug. */
export const CHARACTER_SLUG_MAX_LENGTH = 128;

/** Regex used to validate a single API-key identifier segment for
 *  `/api_keys/{id}` (Phase 9). Allowed: ASCII letters, digits, `_`, `-`.
 *  Length 1..128. Reject: `/`, `.`, `%`, URL-encoded variants, anything
 *  else. The IPC layer also rejects encoded slashes / dot-segments
 *  separately. */
export const VENICE_API_KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Regex used to validate a single character slug segment.
 *  Allowed: ASCII letters, digits, `_`, `-`. Length 1..128.
 *  Reject: `/`, `.`, `%`, URL-encoded variants, anything else.
 *  The IPC layer also rejects encoded slashes / dot-segments separately. */
export const VENICE_CHARACTER_SLUG_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Phase 12 — suffix on the parameterized `/characters/{slug}/reviews`
 *  route. The handoff explicitly forbids generalizing to arbitrary nested
 *  `/characters/*` paths; this constant is the single exception and is
 *  matched verbatim below. */
export const CHARACTER_REVIEWS_SUFFIX = "/reviews" as const;

/** HTTP methods accepted on the /characters family of endpoints. */
export const CHARACTERS_ENDPOINT_METHODS: readonly VeniceIpcMethod[] = ["GET"];

/**
 * Checks whether a path matches the Venice character endpoints.
 *
 * Accepts:
 *   - `/characters`              (list)
 *   - `/characters/{slug}`       (single character)
 *   - `/characters/{slug}/reviews` (Phase 12 — paginated reviews)
 *
 * Rejects:
 *   - other nested paths         (`/characters/foo/bar`)
 *   - URL-encoded slashes/dots   (`/characters/%2Fmodels`)
 *   - missing or oversized slug
 *   - any method other than GET
 *
 * @param pathname The parsed Venice endpoint pathname (no query string).
 * @param method The normalized HTTP method.
 * @returns True when the pathname + method pair is allowed.
 */
export function isAllowedCharactersRequest(pathname: string, method: string): boolean {
  if (method !== "GET") return false;
  if (pathname === CHARACTERS_ENDPOINT) return true;
  if (!pathname.startsWith(`${CHARACTERS_ENDPOINT}/`)) return false;
  // The reviews suffix is the ONLY exception to the "no nested paths"
  // rule (Phase 12). Anything else nested is rejected.
  if (pathname.endsWith(CHARACTER_REVIEWS_SUFFIX)) {
    const slug = pathname.slice(
      CHARACTERS_ENDPOINT.length + 1,
      -CHARACTER_REVIEWS_SUFFIX.length,
    );
    return slug.length > 0 && !slug.includes("/") && VENICE_CHARACTER_SLUG_PATTERN.test(slug);
  }
  // Single-segment path: `/characters/{slug}`.
  const tail = pathname.slice(CHARACTERS_ENDPOINT.length + 1);
  if (!tail || tail.includes("/")) return false;
  return VENICE_CHARACTER_SLUG_PATTERN.test(tail);
}

/** Extracts the character slug from a `/characters/{slug}/reviews`
 *  pathname. Returns null when the pathname does not match. */
export function extractCharacterSlugFromReviewsPath(pathname: string): string | null {
  if (!pathname.endsWith(CHARACTER_REVIEWS_SUFFIX)) return null;
  const slug = pathname.slice(
    CHARACTERS_ENDPOINT.length + 1,
    -CHARACTER_REVIEWS_SUFFIX.length,
  );
  if (!slug || slug.includes("/") || !VENICE_CHARACTER_SLUG_PATTERN.test(slug)) {
    return null;
  }
  return slug;
}

/** Extracts the character slug from a `/characters/{slug}` pathname.
 *  Returns null when the pathname does not match. */
export function extractCharacterSlug(pathname: string): string | null {
  if (!pathname.startsWith(`${CHARACTERS_ENDPOINT}/`)) return null;
  const tail = pathname.slice(CHARACTERS_ENDPOINT.length + 1);
  if (!tail || tail.includes("/")) return null;
  return VENICE_CHARACTER_SLUG_PATTERN.test(tail) ? tail : null;
}

/**
 * Checks whether a path matches the Venice `/api_keys` administration
 * endpoints (Phase 9).
 *
 * Accepts:
 *   - `/api_keys`                   (list / create)
 *   - `/api_keys/{id}`              (get / update / delete single key)
 *
 * Rejects:
 *   - nested paths beyond a single id segment
 *   - URL-encoded slashes / dot-segments
 *   - missing or oversized id
 *   - POST on `/api_keys/{id}` (per-method split between list/create vs.
 *     single-key CRUD; see VENICE_ENDPOINT_METHODS for the canonical list)
 *
 * Read-only rate-limit endpoints (`/api_keys/rate_limits`,
 * `/api_keys/rate_limits/log`) are NOT covered by this matcher because
 * they live under `ALLOWED_VENICE_ENDPOINTS` directly and are matched by
 * the literal-lookup path in `isAllowedVeniceRequest`.
 *
 * @param pathname The parsed Venice endpoint pathname (no query string).
 * @param method The normalized HTTP method.
 * @returns True when the pathname + method pair is allowed.
 */
export function isAllowedApiKeysRequest(pathname: string, method: string): boolean {
  // Method constraints mirror VENICE_ENDPOINT_METHODS for the parameterized
  // shape; literal paths use the standard lookup.
  if (pathname === API_KEYS_ENDPOINT) {
    return method === "GET" || method === "POST";
  }
  if (!pathname.startsWith(`${API_KEYS_ENDPOINT}/`)) return false;
  const tail = pathname.slice(API_KEYS_ENDPOINT.length + 1);
  if (!tail || tail.includes("/")) return false;
  if (!VENICE_API_KEY_ID_PATTERN.test(tail)) return false;
  return method === "GET" || method === "PUT" || method === "DELETE";
}

/** Extracts the API-key id from a `/api_keys/{id}` pathname.
 *  Returns null when the pathname does not match. */
export function extractApiKeyId(pathname: string): string | null {
  if (!pathname.startsWith(`${API_KEYS_ENDPOINT}/`)) return null;
  const tail = pathname.slice(API_KEYS_ENDPOINT.length + 1);
  if (!tail || tail.includes("/")) return null;
  return VENICE_API_KEY_ID_PATTERN.test(tail) ? tail : null;
}

/** Phase 7 — base constants for the x402 keyless wallet authentication surface. */
export const X402_TOP_UP_ENDPOINT = "/x402/top-up" as const;
export const X402_BALANCE_PREFIX = "/x402/balance/" as const;
export const X402_TRANSACTIONS_PREFIX = "/x402/transactions/" as const;

/** Regex used to validate EVM (0x + 40 hex) or Solana (base58 32..44 chars) wallet addresses. */
export const VENICE_WALLET_ADDRESS_PATTERN = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;

/**
 * Checks whether a path matches any recognized x402 endpoint structure.
 */
export function isAllowedX402Endpoint(pathname: string): boolean {
  if (pathname === X402_TOP_UP_ENDPOINT) return true;
  if (pathname.startsWith(X402_BALANCE_PREFIX)) {
    const address = pathname.slice(X402_BALANCE_PREFIX.length);
    return address.length > 0 && !address.includes("/") && VENICE_WALLET_ADDRESS_PATTERN.test(address);
  }
  if (pathname.startsWith(X402_TRANSACTIONS_PREFIX)) {
    const address = pathname.slice(X402_TRANSACTIONS_PREFIX.length);
    return address.length > 0 && !address.includes("/") && VENICE_WALLET_ADDRESS_PATTERN.test(address);
  }
  return false;
}

/**
 * Checks whether a path + method pair matches the Venice `/x402` endpoints (Phase 7).
 *
 * Accepts:
 *   - `/x402/top-up` (POST)
 *   - `/x402/balance/{walletAddress}` (GET)
 *   - `/x402/transactions/{walletAddress}` (GET)
 *
 * Rejects:
 *   - other nested paths
 *   - invalid wallet address formats
 *   - methods not permitted for the specific endpoint
 */
export function isAllowedX402Request(pathname: string, method: string): boolean {
  if (pathname === X402_TOP_UP_ENDPOINT) {
    return method === "POST";
  }
  if (pathname.startsWith(X402_BALANCE_PREFIX)) {
    if (method !== "GET") return false;
    const address = pathname.slice(X402_BALANCE_PREFIX.length);
    return address.length > 0 && !address.includes("/") && VENICE_WALLET_ADDRESS_PATTERN.test(address);
  }
  if (pathname.startsWith(X402_TRANSACTIONS_PREFIX)) {
    if (method !== "GET") return false;
    const address = pathname.slice(X402_TRANSACTIONS_PREFIX.length);
    return address.length > 0 && !address.includes("/") && VENICE_WALLET_ADDRESS_PATTERN.test(address);
  }
  return false;
}

/** Extracts the wallet address from a `/x402/balance/{walletAddress}` or
 *  `/x402/transactions/{walletAddress}` pathname. Returns null when not matched. */
export function extractWalletAddressFromX402Path(pathname: string): string | null {
  let address: string | null = null;
  if (pathname.startsWith(X402_BALANCE_PREFIX)) {
    address = pathname.slice(X402_BALANCE_PREFIX.length);
  } else if (pathname.startsWith(X402_TRANSACTIONS_PREFIX)) {
    address = pathname.slice(X402_TRANSACTIONS_PREFIX.length);
  }
  if (!address || address.includes("/") || !VENICE_WALLET_ADDRESS_PATTERN.test(address)) {
    return null;
  }
  return address;
}

/** Phase 8 — base constants for the Venice Crypto RPC surface. */
export const CRYPTO_RPC_NETWORKS_ENDPOINT = "/crypto/rpc/networks" as const;
export const CRYPTO_RPC_PREFIX = "/crypto/rpc/" as const;

/** Network slug regex: lowercase alphanumeric and hyphens, 1..64 characters. */
export const VENICE_NETWORK_SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

/**
 * Checks whether a path matches any recognized Crypto RPC endpoint structure.
 */
export function isAllowedCryptoRpcEndpoint(pathname: string): boolean {
  if (pathname === CRYPTO_RPC_NETWORKS_ENDPOINT) return true;
  if (pathname.startsWith(CRYPTO_RPC_PREFIX)) {
    const slug = pathname.slice(CRYPTO_RPC_PREFIX.length);
    return slug.length > 0 && !slug.includes("/") && VENICE_NETWORK_SLUG_PATTERN.test(slug);
  }
  return false;
}

/**
 * Checks whether a path + method pair matches the Venice Crypto RPC endpoints (Phase 8).
 *
 * Accepts:
 *   - `/crypto/rpc/networks` (GET)
 *   - `/crypto/rpc/{network}` (POST)
 *
 * Rejects:
 *   - other nested paths
 *   - invalid network slug formats
 *   - methods not permitted for the specific endpoint
 */
export function isAllowedCryptoRpcRequest(pathname: string, method: string): boolean {
  if (pathname === CRYPTO_RPC_NETWORKS_ENDPOINT) {
    return method === "GET";
  }
  if (pathname.startsWith(CRYPTO_RPC_PREFIX)) {
    if (method !== "POST") return false;
    const slug = pathname.slice(CRYPTO_RPC_PREFIX.length);
    return slug.length > 0 && !slug.includes("/") && VENICE_NETWORK_SLUG_PATTERN.test(slug);
  }
  return false;
}

/** Extracts the network slug from a `/crypto/rpc/{network}` pathname. Returns null when not matched. */
export function extractNetworkSlugFromCryptoRpcPath(pathname: string): string | null {
  if (!pathname.startsWith(CRYPTO_RPC_PREFIX)) return null;
  const slug = pathname.slice(CRYPTO_RPC_PREFIX.length);
  if (!slug || slug === "networks" || slug.includes("/") || !VENICE_NETWORK_SLUG_PATTERN.test(slug)) {
    return null;
  }
  return slug;
}

/**
 * Checks whether an HTTP method is valid for an allowed Venice endpoint.
 * @param endpoint The parsed Venice endpoint pathname.
 * @param method The normalized HTTP method.
 * @returns True when the endpoint/method pair is allowed.
 */
export function isAllowedVeniceRequest(endpoint: string, method: string): boolean {
  const allowedMethods = VENICE_ENDPOINT_METHODS[endpoint as VeniceIpcEndpoint];
  if (allowedMethods?.includes(method as VeniceIpcMethod)) return true;
  if (isAllowedCharactersRequest(endpoint, method)) return true;
  // Phase 9 — parameterized `/api_keys/{id}` is matched here because the
  // literal-path lookup table only carries `/api_keys/{id}` as a template.
  if (isAllowedApiKeysRequest(endpoint, method)) return true;
  // Phase 7 — parameterized `/x402/balance/{walletAddress}` and `/x402/transactions/{walletAddress}`
  if (isAllowedX402Request(endpoint, method)) return true;
  // Phase 8 — parameterized `/crypto/rpc/{network}` and `/crypto/rpc/networks`
  return isAllowedCryptoRpcRequest(endpoint, method);
}
