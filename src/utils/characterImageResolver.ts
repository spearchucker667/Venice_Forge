/** @fileoverview Resolves a character image URL from various API response shapes. */

/**
 * Official Venice AI character-photo / CDN hostnames. The Venice
 * `/characters` endpoint hosts avatars on `outerface.venice.ai`, with
 * `venice.ai` and `api.venice.ai` as sibling image surfaces. Add a
 * host here only after verifying real API output.
 */
export const VENICE_CHARACTER_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  "outerface.venice.ai",
  "venice.ai",
  "api.venice.ai",
]);

/**
 * Fields the Venice character endpoints and their older/multi-model
 * counterparts use to convey an image. Order matters: more-specific
 * fields (e.g. `photoUrl`, `photo_url`) are checked first.
 */
const IMAGE_FIELDS = [
  "photoUrl",
  "photo_url",
  "avatarUrl",
  "avatar_url",
  "imageUrl",
  "image_url",
  "profileImageUrl",
  "profile_image_url",
  "image",
  "avatar",
  "profileImage",
  "profile_image",
] as const;

const NESTED_URL_FIELDS = ["url", "src", "href"] as const;

const VALID_HTTPS_RE = /^https:\/\//i;
const VALID_RELATIVE_RE = /^\/[^/]/;
const VALID_PATH_SEGMENT = /^\/[A-Za-z0-9._/~%?&:@=+,;()-]*$/;

/** IPv4 private + loopback + link-local ranges. */
const PRIVATE_IPV4_RE = /^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|0\.0\.0\.0)$/;

/** Returns true if the IPv4 address (parsed as octets) is in a private range. */
function isPrivateIpv4(host: string): boolean {
  if (PRIVATE_IPV4_RE.test(host)) return true;
  // Short-form IPv4 (`inet_aton` quirk): "0177.0.0.1", "0x7f.0.0.1", "2130706433".
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const n = Number.parseInt(host.slice(2), 16);
    if (Number.isFinite(n)) {
      const dot = `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
      return isPrivateIpv4(dot);
    }
  }
  if (/^0[0-7]+$/.test(host)) {
    const n = Number.parseInt(host, 8);
    if (Number.isFinite(n) && n >= 0 && n <= 0xffffffff) {
      const dot = `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
      return isPrivateIpv4(dot);
    }
  }
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (Number.isFinite(n) && n >= 0 && n <= 0xffffffff) {
      const dot = `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
      return isPrivateIpv4(dot);
    }
  }
  return false;
}

/** Returns true if the hostname points at a private / loopback / link-local IP. */
function isUnsafeHostname(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "localhost") return true;
  if (isPrivateIpv4(lower)) return true;
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("[") && lower.endsWith("]")) {
    const inner = lower.slice(1, -1);
    if (inner === "::1" || inner === "::") return true;
    if (inner.startsWith("fe80:") || inner.startsWith("fe80::")) return true;
    if (inner.startsWith("fc") || inner.startsWith("fd")) return true;
  }
  return false;
}

/** Strips surrounding brackets and lowercases a hostname for comparison. */
function normaliseHost(host: string): string {
  return host.replace(/^\[|\]$/g, "").toLowerCase();
}

/** Strict id validator for the synthetic fallback path. The Venice
 *  character photo endpoint at `https://outerface.venice.ai/api/characters/{id}/photo`
 *  accepts a provider-side opaque id (UUID v4) or a URL-safe slug.
 *  We restrict the id to characters that cannot break out of the path
 *  segment — alphanumerics, `_`, `-`, `.` only — so the constructed URL
 *  always resolves to `/api/characters/<safe id>/photo` on a host that
 *  is already in the {@link VENICE_CHARACTER_IMAGE_HOSTS} allowlist. */
const SAFE_CHARACTER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function isSafeCharacterId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && SAFE_CHARACTER_ID_RE.test(value);
}

/** Builds the canonical Venice character photo URL for a known-safe id.
 *  Per the official Venice swagger (`docs/Venice_swagger_api.yaml` lines
 *  8823-8827 and 8989), the photo surface is exposed at
 *  `https://outerface.venice.ai/api/characters/{id}/photo`. The id is
 *  re-checked against {@link SAFE_CHARACTER_ID_RE} so the constructed
 *  URL cannot escape its path segment. */
export function buildSyntheticCharacterPhotoUrl(id: string): string | null {
  if (!isSafeCharacterId(id)) return null;
  return `https://outerface.venice.ai/api/characters/${encodeURIComponent(id)}/photo`;
}

/** Returns true if the URL is HTTPS, has a Venice-allowlisted host,
 *  and its host is not a private/loopback/link-local address. */
export function isTrustedVeniceImageUrl(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (!VALID_HTTPS_RE.test(trimmed)) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = normaliseHost(parsed.hostname);
  if (isUnsafeHostname(host)) return false;
  return VENICE_CHARACTER_IMAGE_HOSTS.has(host);
}

/** Returns true if the value is a same-origin relative path under
 *  `apiBaseUrl` that resolves to an allowlisted Venice host. */
function isTrustedRelativePath(value: string, apiBaseUrl: string): boolean {
  if (!VALID_RELATIVE_RE.test(value)) return false;
  if (!VALID_PATH_SEGMENT.test(value)) return false;
  let parsed: URL;
  try {
    parsed = new URL(value, apiBaseUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = normaliseHost(parsed.hostname);
  if (isUnsafeHostname(host)) return false;
  return VENICE_CHARACTER_IMAGE_HOSTS.has(host);
}

/** Resolves a character image URL from an arbitrary API response object.
 *
 *  Accepts:
 *    - Direct string fields: `photoUrl`, `photo_url`, `avatarUrl`, `avatar_url`,
 *      `imageUrl`, `image_url`, `profileImageUrl`, `profile_image_url`,
 *      `image`, `avatar`, `profileImage`, `profile_image`
 *    - Nested objects with a `url` / `src` / `href` property
 *    - HTTPS URLs whose host is in {@link VENICE_CHARACTER_IMAGE_HOSTS}
 *    - Relative paths that resolve to an allowlisted Venice host
 *    - Synthetic canonical photo URL built from a safe `id` or `slug`
 *      (see {@link buildSyntheticCharacterPhotoUrl}) when the API
 *      response omitted every recognized image field. Per the official
 *      Venice swagger, the photo surface is exposed at
 *      `https://outerface.venice.ai/api/characters/{id}/photo`.
 *
 *  Rejects: `http://`, `data:`, `blob:`, `file:`, `javascript:`,
 *  `localhost`, private/loopback/link-local IPs, and arbitrary
 *  external domains.
 *
 *  @param character The raw character object from an API response.
 *  @param apiBaseUrl Optional base URL for resolving relative paths.
 *  @returns A resolved absolute HTTPS URL string, or null.
 */
export function resolveCharacterImageUrl(
  character: unknown,
  apiBaseUrl = "https://api.venice.ai/api/v1",
): string | null {
  if (!character || typeof character !== "object") return null;
  const c = character as Record<string, unknown>;

  const tryString = (raw: unknown): string | null => {
    if (typeof raw !== "string" || raw.length === 0) return null;
    if (isTrustedVeniceImageUrl(raw)) return raw;
    if (isTrustedRelativePath(raw, apiBaseUrl)) {
      let parsed: URL;
      try {
        parsed = new URL(raw, apiBaseUrl);
      } catch {
        return null;
      }
      return parsed.toString();
    }
    return null;
  };

  const tryNested = (raw: unknown): string | null => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const nested = raw as Record<string, unknown>;
    for (const key of NESTED_URL_FIELDS) {
      const value = nested[key];
      if (typeof value === "string" && value.length > 0) {
        if (isTrustedVeniceImageUrl(value)) return value;
        if (isTrustedRelativePath(value, apiBaseUrl)) {
          let parsed: URL;
          try {
            parsed = new URL(value, apiBaseUrl);
          } catch {
            return null;
          }
          return parsed.toString();
        }
      }
    }
    return null;
  };

  for (const field of IMAGE_FIELDS) {
    const value = c[field];
    const fromString = tryString(value);
    if (fromString) return fromString;
    const fromNested = tryNested(value);
    if (fromNested) return fromNested;
  }

  // Synthetic fallback: when the Venice response omitted every recognized
  // image field, construct the canonical photo URL ourselves. Per the
  // official Venice swagger (docs/Venice_swagger_api.yaml lines 8823-8827
  // and 8989) the photo surface is exposed at
  // `https://outerface.venice.ai/api/characters/{id}/photo`. The id is
  // re-validated against SAFE_CHARACTER_ID_RE so the constructed URL
  // cannot escape its path segment, and the resulting host is already
  // in VENICE_CHARACTER_IMAGE_HOSTS — so SSRF controls stay strict.
  const candidateId = typeof c.id === "string" && isSafeCharacterId(c.id)
    ? c.id
    : typeof c.slug === "string" && isSafeCharacterId(c.slug)
      ? c.slug
      : null;
  if (candidateId) {
    const synthetic = buildSyntheticCharacterPhotoUrl(candidateId);
    if (synthetic) return synthetic;
  }

  return null;
}

/** Returns a deterministic fallback avatar label (initials) for a character
 *  when no image URL is available. */
export function avatarFallback(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 2).toUpperCase();
}
