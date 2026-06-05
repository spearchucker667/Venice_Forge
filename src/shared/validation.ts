// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Shared endpoint allowlist consumed by both Electron IPC and the web proxy. */

/** Venice API endpoints permitted by the IPC and proxy validators. */
export const ALLOWED_VENICE_ENDPOINTS = [
  "/models",
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
  "/image/edit",
  "/image/multi-edit",
  "/embeddings",
  "/audio/queue",
  "/audio/retrieve",
  "/audio/speech",
  "/audio/transcriptions",
] as const;

/** HTTP methods permitted for Venice API requests. */
export const ALLOWED_VENICE_METHODS = ["GET", "POST"] as const;

/** Union type of allowed Venice API endpoint paths. */
export type VeniceIpcEndpoint = (typeof ALLOWED_VENICE_ENDPOINTS)[number];

/** Union type of allowed Venice API HTTP methods. */
export type VeniceIpcMethod = (typeof ALLOWED_VENICE_METHODS)[number];

/** Allowed HTTP methods for each permitted Venice endpoint. */
export const VENICE_ENDPOINT_METHODS: Record<VeniceIpcEndpoint, readonly VeniceIpcMethod[]> = {
  "/models": ["GET"],
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
  "/image/edit": ["POST"],
  "/image/multi-edit": ["POST"],
  "/embeddings": ["POST"],
  "/audio/queue": ["POST"],
  "/audio/retrieve": ["POST"],
  "/audio/speech": ["POST"],
  "/audio/transcriptions": ["POST"],
};

/** The bare /characters list endpoint. The character-slug variant is
 *  parameterized: see `VENICE_CHARACTER_SLUG_PATTERN`. */
export const CHARACTERS_ENDPOINT = "/characters" as const;

/** Maximum length of a character slug. */
export const CHARACTER_SLUG_MAX_LENGTH = 128;

/** Regex used to validate a single character slug segment.
 *  Allowed: ASCII letters, digits, `_`, `-`. Length 1..128.
 *  Reject: `/`, `.`, `%`, URL-encoded variants, anything else.
 *  The IPC layer also rejects encoded slashes / dot-segments separately. */
export const VENICE_CHARACTER_SLUG_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** HTTP methods accepted on the /characters family of endpoints. */
export const CHARACTERS_ENDPOINT_METHODS: readonly VeniceIpcMethod[] = ["GET"];

/**
 * Checks whether a path matches the Venice character endpoints.
 *
 * Accepts:
 *   - `/characters`              (list)
 *   - `/characters/{slug}`       (single character)
 *
 * Rejects:
 *   - nested paths               (`/characters/foo/bar`)
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
  // Reject nested paths: only one extra segment.
  const tail = pathname.slice(CHARACTERS_ENDPOINT.length + 1);
  if (!tail || tail.includes("/")) return false;
  return VENICE_CHARACTER_SLUG_PATTERN.test(tail);
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
 * Checks whether an HTTP method is valid for an allowed Venice endpoint.
 * @param endpoint The parsed Venice endpoint pathname.
 * @param method The normalized HTTP method.
 * @returns True when the endpoint/method pair is allowed.
 */
export function isAllowedVeniceRequest(endpoint: string, method: string): boolean {
  const allowedMethods = VENICE_ENDPOINT_METHODS[endpoint as VeniceIpcEndpoint];
  if (allowedMethods?.includes(method as VeniceIpcMethod)) return true;
  return isAllowedCharactersRequest(endpoint, method);
}
