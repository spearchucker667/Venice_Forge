// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Primary API route contract.
 *
 * Venice Forge may send primary-API traffic to either:
 *
 *   - `venice`   — the canonical Venice API host (`api.venice.ai`, base path
 *                  `/api/v1`). This is the default and remains the only host
 *                  that supports the full endpoint surface (billing, models,
 *                  video, audio, characters, API keys, x402, crypto RPC,
 *                  responses, augment, etc.).
 *   - `fraterna` — the public Fraterna host (`fraterna.ai`, base path
 *                  `/api/v1`). Fraterna is a *transparent upstream* for a
 *                  curated subset of the same upstream family. It accepts the
 *                  Venice API key and the same request/response contract for
 *                  a small, hand-picked allowlist of endpoints. It never
 *                  bypasses the canonical Venice origin — there is no
 *                  separate credential, no separate privacy posture, and no
 *                  separate billing. It is just another canonical origin that
 *                  exposes a subset of the same Venice API contract.
 *
 * The mapping between `PrimaryApiRouteId`, its transport-level host/base-path,
 * and the per-endpoint capability matrix is the SINGLE source of truth shared
 * by:
 *
 *   - the Electron main-process transport (`electron/services/veniceClient.ts`)
 *   - the web Express proxy (`server.ts`)
 *   - the renderer settings store (`src/stores/settings-store.ts`)
 *   - diagnostics / status surfaces
 *   - the model cache key (`src/hooks/use-models.ts`)
 *   - the network-boundaries verifier
 *
 * No other code should hard-code the Fraterna host or base path; if you find
 * yourself reaching for `fraterna.ai` outside this file, add a resolver
 * helper here instead.
 *
 * IMPORTANT: this contract is read by both sandboxed renderer code and Node
 * (Electron main, Express proxy). It must remain free of Node-only APIs.
 */

/**
 * The set of primary-API route identifiers the user may select.
 *
 * Adding a new id requires:
 *   1. extending {@link PRIMARY_API_ROUTE_IDS}
 *   2. extending {@link PRIMARY_API_ROUTE_HOSTS} with the canonical host
 *   3. extending {@link PRIMARY_API_ROUTE_BASE_PATHS} with the base path
 *   4. extending {@link PRIMARY_API_ROUTE_LABELS} with a presentable label
 *   5. extending {@link PRIMARY_API_ROUTE_DESCRIPTIONS} with contextual copy
 *   6. extending {@link isEndpointSupportedByRoute} for each endpoint in the
 *      canonical endpoint allowlist (or rely on the default-`false` policy
 *      that says "no, this endpoint is not supported on a non-default route
 *      unless explicitly enumerated")
 *   7. updating docs/configuration documentation
 *   8. adding focused tests
 */
export const PRIMARY_API_ROUTE_IDS = ["venice", "fraterna"] as const;
export type PrimaryApiRouteId = (typeof PRIMARY_API_ROUTE_IDS)[number];

/**
 * Default primary route. The renderer migration code, the IPC validator, the
 * transport, and the model cache key MUST all agree on this default so a
 * freshly-installed app behaves identically to a pre-routing app.
 */
export const DEFAULT_PRIMARY_API_ROUTE: PrimaryApiRouteId = "venice";

/**
 * Canonical origin host for each primary route. The fixed-allowlist model is
 * enforced by the network-boundaries verifier; new hosts must be added here
 * AND enumerated in `scripts/verify-network-boundaries.cjs`.
 *
 * Per the FRATERNA primary routing handoff (`docs/audits/...`) §4 the
 * public Fraterna upstream is `fraterna.ai` (NOT `api.fraterna.ai`); the
 * base path `/api/v1` carries the canonical prefix so the OpenAI-compatible
 * client rewrites the Venice host + base path verbatim.
 */
export const PRIMARY_API_ROUTE_HOSTS: Record<PrimaryApiRouteId, string> = {
  // Default: canonical Venice API host. Matches the historical default
  // (`api.venice.ai`) so existing keys, billing, and rate limits behave
  // identically to a pre-routing build.
  venice: "api.venice.ai",
  // Public Fraterna upstream per handoff §2.1 / §4. Shares the Venice API
  // key + `/api/v1` base path + JSON contract for the curated endpoint
  // subset enumerated in §4.1.
  fraterna: "fraterna.ai",
};

/**
 * Base path for each primary route. Both canonical hosts expose the Venice
 * v1 surface under the same `/api/v1` prefix; this is intentional so the
 * client can keep its existing per-endpoint paths verbatim.
 */
export const PRIMARY_API_ROUTE_BASE_PATHS: Record<PrimaryApiRouteId, string> = {
  venice: "/api/v1",
  fraterna: "/api/v1",
};

/**
 * Display labels for the settings UI. Keep the keys ordered as in
 * `PRIMARY_API_ROUTE_IDS` so the select order is stable.
 */
export const PRIMARY_API_ROUTE_LABELS: Record<PrimaryApiRouteId, string> = {
  venice: "Venice (default)",
  fraterna: "Fraterna",
};

/**
 * Short, presentable descriptions of the route for the settings UI. The
 * renderer must NOT hard-code these strings — they are template defaults,
 * and the localized versions live in the i18n catalogs.
 */
export const PRIMARY_API_ROUTE_DESCRIPTIONS: Record<PrimaryApiRouteId, string> = {
  venice:
    "Canonical Venice API host. Required for billing, audio, video, characters, API-key administration, x402, crypto RPC, augment, embeddings, image edit/upscale/multi-edit, and every other endpoint not documented for Fraterna.",
  fraterna:
    "Public Fraterna upstream that mirrors a curated subset of the Venice API contract (/models, /chat/completions, /image/generate, /images/generations). All other endpoints fall back to the Venice host automatically. Fraterna is a third-party service separate from Venice Forge and Venice.ai; it reuses the Venice API key but records selected request metadata for successful proxied requests per its public documentation.",
};

/**
 * Capability matrix. The literal allowlist (`ALLOWED_VENICE_ENDPOINTS`) is
 * the single source of truth for "is this an allowed Venice endpoint?".
 * This matrix answers the orthogonal question: "is this endpoint
 * supported by the Fraterna upstream, given that the user selected it as
 * the primary route?".
 *
 * Per the FRATERNA primary routing handoff §4.1, the publicly documented
 * Fraterna endpoints at the time of the audit are exactly:
 *   GET  /api/v1/models
 *   POST /api/v1/chat/completions
 *   POST /api/v1/image/generate
 *   POST /api/v1/images/generations
 *
 * Per handoff §4.2 every other endpoint stays on the Venice host. This
 * module mirrors that contract verbatim. Do not assume "OpenAI-compatible"
 * means every Venice endpoint is proxied — the resolver is strict and any
 * non-enumerated endpoint falls back to Venice automatically.
 *
 * Endpoints intentionally kept on Venice (NOT supported by Fraterna):
 * image edit, image multi-edit, image upscale, background removal,
 * video generation/queue/retrieve/quote, audio/TTS/transcription/voice
 * conversion, music, embeddings, augment search, augment scrape, text
 * parser/document parsing, account/billing/API-key-management endpoints,
 * model traits or other model metadata endpoints not documented by
 * Fraterna, crypto RPC, X402 flows, SIWX-authenticated crypto requests,
 * any binary/media retrieval route not in the documented Fraterna matrix,
 * any future endpoint until explicitly classified.
 */
const FRATERNA_SUPPORTED_ENDPOINTS: ReadonlySet<string> = new Set([
  // Models catalog (GET) — Fraterna proxies the canonical Venice /models
  // listing for the venice-ai key holder. Query strings are normalized
  // before lookup so `/models?type=image` resolves correctly.
  "/models",
  // Chat completions — the headline use-case. Fraterna is documented as a
  // mirror of the Venice chat completion contract.
  "/chat/completions",
  // Image generation — Fraterna exposes both the canonical Venice
  // /image/generate endpoint AND the OpenAI-compatible /images/generations
  // alias (handoff §4.1).
  "/image/generate",
  "/images/generations",
]);

/**
 * Checks whether the given endpoint pathname is supported by the named
 * primary route. The `venice` route supports every endpoint that passes
 * the literal allowlist; non-Venice routes default to NOT supporting an
 * endpoint unless it is explicitly enumerated for that route.
 *
 * @param route  The selected primary route identifier.
 * @param pathname  The parsed endpoint pathname (no query string, no host).
 * @returns True if the endpoint may be served by the route.
 */
export function isEndpointSupportedByRoute(
  route: PrimaryApiRouteId,
  pathname: string,
): boolean {
  if (route === "venice") return true;
  // `fraterna` (and any future non-default route) defaults to a strict
  // allowlist. The set is module-private; future routes must add their own
  // set.
  if (route === "fraterna") return FRATERNA_SUPPORTED_ENDPOINTS.has(pathname);
  // Defensive: an unknown route id should never reach this function. The
  // resolver and validators guard against it; we err on the side of
  // "unsupported" so the transport falls back to the default host.
  return false;
}

/**
 * The resolved route material — host + base path + identity — that the
 * transport layer uses to forward a request. `null` means "no override; use
 * the default Venice host/base path".
 */
export interface ResolvedPrimaryApiRoute {
  id: PrimaryApiRouteId;
  host: string;
  basePath: string;
}

/**
 * Resolves the primary route the transport should use for a given
 * endpoint. If the route is fully supported, returns its host/base path.
 * If the route is unsupported for this endpoint, returns `null` so the
 * caller falls back to the default Venice host (which always supports the
 * endpoint).
 *
 * IMPORTANT: this is the single function the transport calls. Never
 * duplicate the host-derivation logic at the call site.
 *
 * @param route  The selected primary route identifier.
 * @param pathname  The parsed endpoint pathname.
 * @returns A `ResolvedPrimaryApiRoute` describing where to send the
 *          request, or `null` to fall back to the default Venice host.
 */
export function resolvePrimaryApiRoute(
  route: PrimaryApiRouteId,
  pathname: string,
): ResolvedPrimaryApiRoute | null {
  if (!isEndpointSupportedByRoute(route, pathname)) return null;
  return {
    id: route,
    host: PRIMARY_API_ROUTE_HOSTS[route],
    basePath: PRIMARY_API_ROUTE_BASE_PATHS[route],
  };
}

/**
 * Type guard: `value` is a valid primary route identifier.
 *
 * Accepts the literal strings AND any string that matches the typed shape,
 * which keeps the IPC validator simple.
 */
export function isPrimaryApiRouteId(value: unknown): value is PrimaryApiRouteId {
  return (
    typeof value === "string" &&
    (PRIMARY_API_ROUTE_IDS as readonly string[]).includes(value)
  );
}

/**
 * Normalizes a raw value into a valid primary route id, falling back to
 * the default when the value is missing, malformed, or unknown. This is
 * the function the renderer migration and the IPC validator both call.
 */
export function normalizePrimaryApiRouteId(value: unknown): PrimaryApiRouteId {
  return isPrimaryApiRouteId(value) ? value : DEFAULT_PRIMARY_API_ROUTE;
}
