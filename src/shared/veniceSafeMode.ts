/** @fileoverview Centralised `safe_mode` (Venice API Safe Mode) helper.
 *
 *  `safe_mode` is a PROVIDER-side boolean that Venice passes to its
 *  upstream model router. It is COMPLETELY SEPARATE from
 *  `localFamilySafeModeEnabled` (Venice Forge's local family-oriented
 *  filter). Adult Mode bypasses only the local filter; it does not
 *  affect `safe_mode`. Conversely, turning `safe_mode` off does not
 *  disable Family Safe Mode. The two settings are independent controls.
 *
 *  Use `applyVeniceApiSafeMode(endpoint, payload, enabled)` to add the
 *  field to a payload in a single, audited place. The endpoint matrix
 *  below documents which endpoints accept the top-level `safe_mode`
 *  field; the helper silently omits the field for endpoints that do
 *  not support it, so unsupported endpoints never receive an unknown
 *  payload field.
 *
 *  Source: https://docs.venice.ai (2026-06-05).
 *  Note: /chat/completions does NOT support top-level safe_mode.
 *        safe_mode fields are sent via venice_parameters instead.
 *  - /image/generate, /image/edit, /image/multi-edit: top-level safe_mode
 *  - /image/upscale: does NOT support safe_mode (no extractable prompt fields)
 *  - /audio/speech, /audio/transcriptions: top-level safe_mode
 *  - /embeddings: top-level safe_mode
 *  - /video/queue: top-level safe_mode
 *  - /augment/{search,scrape,text-parser}: top-level safe_mode
 *  - /audio/queue, /audio/retrieve: returned-content only, no safe_mode field
 *  - /video/{retrieve,quote,complete}: returned-content only, no safe_mode field
 *  - /chat/completions: does NOT support top-level safe_mode
 *  - /models: read-only, no safe_mode field
 */

/** Endpoints that accept a top-level `safe_mode: boolean` field. */
const ENDPOINTS_WITH_SAFE_MODE: ReadonlySet<string> = new Set([
  "/image/generate",
  "/image/edit",
  "/image/multi-edit",
  "/audio/speech",
  "/audio/transcriptions",
  "/embeddings",
  "/video/queue",
  "/augment/search",
  "/augment/scrape",
  "/augment/text-parser",
]);

/**
 * Returns true when the given endpoint accepts a top-level `safe_mode`
 * boolean in its request body. Endpoints not in the supported set MUST
 * NOT receive a `safe_mode` field — Venice returns 400 on unknown
 * payload fields for some endpoints.
 */
export function endpointSupportsSafeMode(endpoint: string): boolean {
  return ENDPOINTS_WITH_SAFE_MODE.has(endpoint);
}

/**
 * Applies the Venice API Safe Mode flag to a request payload, respecting
 * the endpoint matrix. The flag is only added when:
 *
 *   1. The endpoint is in the supported set.
 *   2. `enabled` is a boolean (callers can pass `undefined` to skip).
 *
 * The returned payload is always a fresh object; the input is not
 * mutated. Endpoints that do not support `safe_mode` get the input
 * payload back unchanged (other than shallow cloning for safety).
 *
 * @param endpoint The Venice API endpoint path (e.g. "/chat/completions").
 * @param payload The request body being assembled.
 * @param enabled The Venice API Safe Mode setting. `undefined` skips.
 */
export function applyVeniceApiSafeMode(
  endpoint: string,
  payload: Record<string, unknown>,
  enabled: boolean | undefined,
): Record<string, unknown> {
  if (typeof enabled !== "boolean") return { ...payload };
  if (!endpointSupportsSafeMode(endpoint)) return { ...payload };
  return { ...payload, safe_mode: enabled };
}

/** Human-readable endpoint matrix. Kept here so the docs and the helper
 *  cannot drift apart. */
export const VENICE_API_SAFE_MODE_MATRIX: ReadonlyArray<{
  endpoint: string;
  supportsSafeMode: boolean;
  fieldLocation: "top-level" | "form-field" | "not-supported";
}> = [
  { endpoint: "/chat/completions", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/image/generate", supportsSafeMode: true, fieldLocation: "top-level" },
  { endpoint: "/image/edit", supportsSafeMode: true, fieldLocation: "top-level" },
  { endpoint: "/image/multi-edit", supportsSafeMode: true, fieldLocation: "top-level" },
  { endpoint: "/image/upscale", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/audio/speech", supportsSafeMode: true, fieldLocation: "top-level" },
  { endpoint: "/audio/transcriptions", supportsSafeMode: true, fieldLocation: "top-level" },
  { endpoint: "/audio/queue", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/audio/retrieve", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/embeddings", supportsSafeMode: true, fieldLocation: "top-level" },
  { endpoint: "/video/queue", supportsSafeMode: true, fieldLocation: "top-level" },
  { endpoint: "/video/retrieve", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/video/quote", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/video/complete", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/augment/search", supportsSafeMode: true, fieldLocation: "top-level" },
  { endpoint: "/augment/scrape", supportsSafeMode: true, fieldLocation: "top-level" },
  { endpoint: "/augment/text-parser", supportsSafeMode: true, fieldLocation: "top-level" },
  { endpoint: "/models", supportsSafeMode: false, fieldLocation: "not-supported" },
];
