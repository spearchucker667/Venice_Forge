/** @fileoverview Resolves a character image URL from various API response shapes. */

/**
 * Commonly observed image/avatar fields in Venice character API responses.
 * The Venice /characters endpoint uses `photoUrl`, the /v1/characters
 * endpoint uses `avatar_url`, and legacy/multi-model endpoints may return
 * `image`, `image_url`, or a nested object with a `url` property.
 */
const IMAGE_FIELDS = ["photoUrl", "photo_url", "avatar_url", "image", "image_url"] as const;

const VALID_HTTP_RE = /^https?:\/\//i;
const VALID_RELATIVE_RE = /^\/[^/]/;

/**
 * Resolves a character image URL from an arbitrary API response object.
 *
 * Inspection order:
 *   1. Direct string fields: `photoUrl`, `photo_url`, `avatar_url`, `image`, `image_url`
 *   2. Nested object with `url` property (e.g. `{ image: { url: "..." } }`)
 *   3. Fallback to null
 *
 * Relative URLs are normalized against the provided `apiBaseUrl` (defaults
 * to `https://api.venice.ai/api/v1`). Invalid URLs, data URIs, and
 * obviously non-http values are rejected.
 *
 * @param character The raw character object from an API response.
 * @param apiBaseUrl Optional base URL for resolving relative paths.
 * @returns A resolved absolute URL string, or null if no valid image is found.
 */
export function resolveCharacterImageUrl(
  character: unknown,
  apiBaseUrl = "https://api.venice.ai/api/v1",
): string | null {
  if (!character || typeof character !== "object") return null;
  const c = character as Record<string, unknown>;

  for (const field of IMAGE_FIELDS) {
    const value = c[field];

    if (typeof value === "string" && value.length > 0) {
      if (VALID_HTTP_RE.test(value)) return value;
      if (VALID_RELATIVE_RE.test(value)) return `${apiBaseUrl.replace(/\/+$/, "")}${value}`;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      if (typeof nested.url === "string" && nested.url.length > 0) {
        const url = nested.url;
        if (VALID_HTTP_RE.test(url)) return url;
        if (VALID_RELATIVE_RE.test(url)) return `${apiBaseUrl.replace(/\/+$/, "")}${url}`;
      }
    }
  }

  return null;
}

/**
 * Returns a deterministic fallback avatar label (initials) for a character
 * when no image URL is available.
 */
export function avatarFallback(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 2).toUpperCase();
}