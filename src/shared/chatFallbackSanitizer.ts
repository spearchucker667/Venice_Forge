/** @fileoverview Fallback-provider sanitization for Venice-primary chat bodies.
 *
 *  VF-20260916-P1-001: the Venice-primary chat body carries Venice-only
 *  fields (`venice_parameters.enable_e2ee`, top-level `prompt_cache_retention`)
 *  that non-Venice fallback providers reject or must never see (E2EE semantics
 *  cannot be preserved on a provider without an equivalent contract).
 *
 *  Rule: the primary body is built once, Venice-first, and is NEVER mutated
 *  for fallback compatibility. When a request enters a non-Venice fallback
 *  adapter, the adapter sanitizes a CLONE via `cloneSanitizedForFallbackProvider`.
 *  The Electron fallback chain additionally enforces a per-provider field
 *  allowlist (`sanitizeProviderRequestBody` in
 *  `electron/services/providerAdapters.ts`); this helper is the shared
 *  defense-in-depth contract for Venice-only semantics that allowlists cannot
 *  express (e.g. "E2EE must not silently downgrade").
 */

/** Top-level Venice-only chat body fields stripped for fallback providers. */
export const VENICE_ONLY_CHAT_TOP_LEVEL_FIELDS = [
  "prompt_cache_retention",
] as const;

/** `venice_parameters` sub-fields with Venice-only semantics stripped for
 *  fallback providers. */
export const VENICE_ONLY_VENICE_PARAM_FIELDS = [
  "enable_e2ee",
] as const;

/** Returns a sanitized CLONE of a Venice-primary chat body suitable for a
 *  non-Venice fallback provider. The input body is never mutated. */
export function cloneSanitizedForFallbackProvider<T>(body: T): T {
  const clone: T =
    typeof structuredClone === "function"
      ? structuredClone(body)
      : (JSON.parse(JSON.stringify(body)) as T);
  if (typeof clone !== "object" || clone === null) return clone;

  const record = clone as Record<string, unknown>;
  for (const field of VENICE_ONLY_CHAT_TOP_LEVEL_FIELDS) {
    delete record[field];
  }

  const veniceParams = record.venice_parameters;
  if (typeof veniceParams === "object" && veniceParams !== null) {
    const params = veniceParams as Record<string, unknown>;
    for (const field of VENICE_ONLY_VENICE_PARAM_FIELDS) {
      delete params[field];
    }
  }

  return clone;
}
