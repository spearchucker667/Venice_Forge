/** @fileoverview Centralised Venice provider-side image safety preference.
 *
 *  `safe_mode` is a PROVIDER-side boolean that Venice passes to its
 *  upstream model router. It is COMPLETELY SEPARATE from
 *  `localFamilySafeModeEnabled` (Venice Forge's local family-oriented
 *  filter). Adult Mode bypasses only the local filter; it does not
 *  affect `safe_mode`. Conversely, turning `safe_mode` off does not
 *  disable Family Safe Mode. The two settings are independent controls.
 *
 *  Use `applyVeniceProviderSafetyPreference(endpoint, payload, enabled)`
 *  at request boundaries. Native image routes use `safe_mode`; the
 *  OpenAI-compatible image route uses `moderation`. The legacy
 *  `applyVeniceApiSafeMode` helper remains specific to the boolean field.
 *
 *  Source: https://docs.venice.ai plus the tracked OpenAPI snapshot
 *  (docs/reference/Venice_swagger_api.yaml, Schema Version 20260814.194349).
 *  Only the four image request schemas declare `safe_mode`
 *  (GenerateImageRequest, EditImageRequest, MultiEditImageRequest,
 *  MultiEditImageMultipartRequest). Every other request schema omits it
 *  and several set `additionalProperties: false`, so injecting the field
 *  anywhere else risks a 400 before feature logic runs.
 *  - /image/generate, /image/edit, /image/multi-edit: top-level safe_mode
 *  - /image/upscale: does NOT support safe_mode (no extractable prompt fields)
 *  - /audio/speech, /audio/transcriptions, /embeddings: do NOT declare safe_mode
 *  - /video/queue: does NOT support safe_mode; the live API rejects it as an
 *    unknown key before queueing or billing
 *  - /augment/{search,scrape,text-parser}: do NOT declare safe_mode
 *  - /audio/queue, /audio/retrieve: returned-content only, no safe_mode field
 *  - /video/{retrieve,quote,complete}: returned-content only, no safe_mode field
 *  - /chat/completions: does NOT support top-level safe_mode
 *  - /models: read-only, no safe_mode field
 */

/** Endpoints that accept a top-level `safe_mode: boolean` field.
 *  Derived from the tracked OpenAPI snapshot: only the four image request
 *  schemas (GenerateImageRequest, EditImageRequest, MultiEditImageRequest,
 *  MultiEditImageMultipartRequest) declare `safe_mode`. Do not add an
 *  endpoint here unless its current request schema declares the field. */
const ENDPOINTS_WITH_SAFE_MODE: ReadonlySet<string> = new Set([
  "/image/generate",
  "/image/edit",
  "/image/multi-edit",
]);

/**
 * Returns true when the given endpoint accepts a top-level `safe_mode`
 * boolean in its request body. Endpoints not in the supported set MUST
 * NOT receive a `safe_mode` field — Venice returns 400 on unknown
 * payload fields for some endpoints. Tolerates `/api/v1` prefix used by
 * thin-client callers and any leading-or-trailing whitespace.
 */
export function endpointSupportsSafeMode(endpoint: string): boolean {
  let norm = (endpoint ?? "").trim();
  if (!norm.startsWith("/")) norm = "/" + norm;
  // Strip leading `/api/v1` so legacy callers (`/api/v1/<endpoint>`)
  // resolve to the canonical endpoint entries.
  if (norm.startsWith("/api/v1/")) norm = norm.slice("/api/v1".length);
  return ENDPOINTS_WITH_SAFE_MODE.has(norm);
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

  if (payload._isSerializedFormData === true && Array.isArray(payload.entries)) {
    const newEntries = [...payload.entries];
    const existingIdx = newEntries.findIndex(
      (e) => typeof e === "object" && e !== null && (e as Record<string, unknown>).name === "safe_mode"
    );
    if (existingIdx >= 0) {
      newEntries[existingIdx] = { ...newEntries[existingIdx], value: String(enabled) };
    } else {
      newEntries.push({ name: "safe_mode", value: String(enabled) });
    }
    return { ...payload, entries: newEntries };
  }

  return { ...payload, safe_mode: enabled };
}

/** Provider-side safety fields for image routes with distinct Venice schemas. */
export const VENICE_PROVIDER_SAFETY_MATRIX = [
  { endpoint: "/image/generate", field: "safe_mode", onValue: true, offValue: false },
  { endpoint: "/image/edit", field: "safe_mode", onValue: true, offValue: false },
  { endpoint: "/image/multi-edit", field: "safe_mode", onValue: true, offValue: false },
  { endpoint: "/images/generations", field: "moderation", onValue: "auto", offValue: "low" },
] as const;

/** Apply the provider preference using the request schema for this endpoint. */
export function applyVeniceProviderSafetyPreference(
  endpoint: string,
  payload: Record<string, unknown>,
  enabled: boolean | undefined,
): Record<string, unknown> {
  if (typeof enabled !== "boolean") return { ...payload };
  const normalized = endpoint.trim().replace(/^\/api\/v1(?=\/)/, "");
  const contract = VENICE_PROVIDER_SAFETY_MATRIX.find((row) => row.endpoint === normalized);
  if (contract?.field === "moderation") {
    const { safe_mode: _unsupported, ...schemaPayload } = payload;
    return { ...schemaPayload, moderation: enabled ? contract.onValue : contract.offValue };
  }
  return applyVeniceApiSafeMode(endpoint, payload, enabled);
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
  { endpoint: "/images/generations", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/image/upscale", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/audio/speech", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/audio/transcriptions", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/audio/queue", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/audio/retrieve", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/embeddings", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/video/queue", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/video/retrieve", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/video/quote", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/video/complete", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/augment/search", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/augment/scrape", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/augment/text-parser", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/models", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/models/traits", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/models/compatibility_mapping", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/audio/quote", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/audio/complete", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/audio/voices", supportsSafeMode: false, fieldLocation: "not-supported" },
  { endpoint: "/video/transcriptions", supportsSafeMode: false, fieldLocation: "not-supported" },
];
