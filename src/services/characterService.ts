/** @fileoverview Service layer for the Venice hosted-character API.
 *
 *  Talks to the official Venice endpoints:
 *    GET /api/v1/characters
 *    GET /api/v1/characters/{slug}
 *    GET /api/v1/characters/{slug}/reviews   (preview API — read-only)
 *
 *  Never calls `fetch()` directly — routes through the existing
 *  `venice<T>()` helper which forwards to the Electron IPC bridge
 *  (and the IPC safety guard in the main process). The reviews route is
 *  the single allowlisted nested path under `/characters`
 *  (`CHARACTER_REVIEWS_SUFFIX` in `src/shared/validation.ts`); the IPC and
 *  Express-proxy validation layers both route it through
 *  `isAllowedCharactersRequest`.
 */

import { venice, VeniceAPIError } from "../lib/venice-client";
import { resolveCharacterImageUrl } from "../utils/characterImageResolver";
import type {
  CharacterReviewsPagination,
  CharacterReviewsResult,
  CharacterReviewsSummary,
  GetCharacterResponse,
  ListCharactersRequest,
  ListCharactersResponse,
  VeniceCharacter,
  VeniceCharacterReview,
} from "../types/characters";

/** Venice supports a maximum of 100 items per list call. */
const LIST_LIMIT_MAX = 100;
const LIST_LIMIT_MIN = 1;
/** Searches are truncated to 200 chars to keep query strings short. */
const SEARCH_MAX_LENGTH = 200;
/** Slug max length matches the validator in shared/validation. */
const SLUG_MAX_LENGTH = 128;
const VENICE_CHARACTER_SHARE_HOSTS: ReadonlySet<string> = new Set([
  "venice.ai",
  "www.venice.ai",
]);

/** Allowed sort fields, kept in sync with `CharacterSortBy`. */
const ALLOWED_SORT_FIELDS = new Set<NonNullable<ListCharactersRequest["sortBy"]>>([
  "featured",
  "imports",
  "highestRating",
  "highlyRated",
  "highlyRatedAndRecent",
  "mostRecent",
  "ratingCount",
]);

/** Clamps a value to the inclusive integer range [min, max]. */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Returns true when the slug consists only of `[A-Za-z0-9_-]` and
 *  is between 1 and 128 characters. URL-encoded slashes and dots are
 *  rejected so the IPC layer cannot be tricked into routing to
 *  sibling endpoints via `/characters/%2Fmodels`. */
export function isValidCharacterSlug(slug: unknown): slug is string {
  if (typeof slug !== "string") return false;
  if (slug.length < 1 || slug.length > SLUG_MAX_LENGTH) return false;
  return /^[A-Za-z0-9_-]+$/.test(slug);
}

/** Normalizes a public Venice character share URL.
 *  Only HTTPS Venice-owned character pages are renderable as links.
 *  Invalid, script/data/file, private-host, or non-character URLs are
 *  deliberately reduced to `undefined` so components can omit the anchor. */
export function resolveCharacterShareUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || !VENICE_CHARACTER_SHARE_HOSTS.has(host)) return undefined;
  if (!/^(?:\/characters(?:\/|$)|\/c\/[A-Za-z0-9_-]+\/?$)/i.test(parsed.pathname)) return undefined;
  parsed.hash = "";
  return parsed.toString();
}

/** Normalizes a Venice character payload to a fully-populated record.
 *  Every optional field defaults to a safe empty value so consumers
 *  never have to guard against `undefined` at access sites. */
export function normalizeCharacter(raw: unknown): VeniceCharacter | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const slug = typeof r.slug === "string" ? r.slug.trim() : "";
  const id =
    typeof r.id === "string" && r.id.trim()
      ? r.id.trim()
      : slug || (typeof r.name === "string" ? r.name.trim() : "");
  if (!slug || !isValidCharacterSlug(slug)) return null;
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : slug;
  const tags = Array.isArray(r.tags)
    ? (r.tags.filter((t): t is string => typeof t === "string") as string[])
    : undefined;
  const stats = (() => {
    if (!r.stats || typeof r.stats !== "object") return undefined;
    const s = r.stats as Record<string, unknown>;
    const out: VeniceCharacter["stats"] = {};
    if (typeof s.averageRating === "number" && Number.isFinite(s.averageRating)) out.averageRating = s.averageRating;
    if (typeof s.imports === "number" && Number.isFinite(s.imports)) out.imports = s.imports;
    if (typeof s.ratingCount === "number" && Number.isFinite(s.ratingCount)) out.ratingCount = s.ratingCount;
    if (typeof s.ratingSum === "number" && Number.isFinite(s.ratingSum)) out.ratingSum = s.ratingSum;
    if (typeof s.userRating === "number" && Number.isFinite(s.userRating)) out.userRating = s.userRating;
    return Object.keys(out).length > 0 ? out : undefined;
  })();
  const modelId = typeof r.modelId === "string" && r.modelId.trim() ? r.modelId.trim() : undefined;
  return {
    id,
    slug,
    name,
    description: typeof r.description === "string" ? r.description : undefined,
    author: typeof r.author === "string" ? r.author : undefined,
    adult: r.adult === true,
    featured: r.featured === true,
    shareUrl: resolveCharacterShareUrl(r.shareUrl),
    photoUrl: resolveCharacterImageUrl(raw) ?? undefined,
    tags,
    webEnabled: r.webEnabled === true,
    modelId,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
    stats,
    greeting: typeof r.greeting === "string" ? r.greeting : undefined,
  };
}

/** Normalizes a list response, accepting bare arrays, `{ data: [...] }`,
 *  and `{ characters: [...] }` envelopes. Malformed entries are dropped
 *  silently rather than throwing so the UI degrades gracefully. */
function normalizeListResponse(raw: unknown): VeniceCharacter[] {
  let list: unknown[] | undefined;
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.data)) list = r.data;
    else if (Array.isArray(r.characters)) list = r.characters;
    else if (Array.isArray(r.results)) list = r.results;
  }
  if (!list) return [];
  const out: VeniceCharacter[] = [];
  for (const item of list) {
    const normalized = normalizeCharacter(item);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** Builds a safe query string for the list endpoint, omitting empty
 *  parameters and clamping numeric ranges. Exported for testability. */
export function buildListQueryString(params: ListCharactersRequest): string {
  const search = new URLSearchParams();
  if (typeof params.search === "string") {
    const trimmed = params.search.trim();
    if (trimmed) search.set("search", trimmed.slice(0, SEARCH_MAX_LENGTH));
  }
  if (Array.isArray(params.tags) && params.tags.length) {
    const tags = params.tags.filter((t): t is string => typeof t === "string" && t.length > 0);
    if (tags.length) search.set("tags", tags.join(","));
  }
  if (Array.isArray(params.categories) && params.categories.length) {
    const cats = params.categories.filter((c): c is string => typeof c === "string" && c.length > 0);
    if (cats.length) search.set("categories", cats.join(","));
  }
  if (typeof params.modelId === "string" && params.modelId.trim()) {
    search.set("modelId", params.modelId.trim());
  }
  if (params.isAdult === true) search.set("isAdult", "true");
  if (params.isPro === true) search.set("isPro", "true");
  if (params.isWebEnabled === true) search.set("isWebEnabled", "true");
  if (params.isAdult === false) search.set("isAdult", "false");
  if (params.isPro === false) search.set("isPro", "false");
  if (params.isWebEnabled === false) search.set("isWebEnabled", "false");
  if (params.sortBy && ALLOWED_SORT_FIELDS.has(params.sortBy)) {
    search.set("sortBy", params.sortBy);
  }
  if (params.sortOrder === "asc" || params.sortOrder === "desc") {
    search.set("sortOrder", params.sortOrder);
  }
  if (typeof params.limit === "number" || typeof params.limit === "string") {
    const clamped = clampInt(params.limit, LIST_LIMIT_MIN, LIST_LIMIT_MAX, 20);
    search.set("limit", String(clamped));
  }
  if (typeof params.offset === "number" || typeof params.offset === "string") {
    const clamped = clampInt(params.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    search.set("offset", String(clamped));
  }
  return search.toString();
}

/** Lists Venice hosted characters.
 *  @param params Optional filters (search, tags, sortBy, etc.).
 *  @param signal Optional AbortSignal to cancel the request.
 *  @returns A normalized array of VeniceCharacter records.
 */
export async function listCharacters(
  params: ListCharactersRequest = {},
  signal?: AbortSignal,
): Promise<VeniceCharacter[]> {
  const query = buildListQueryString(params);
  const endpoint = query ? `/characters?${query}` : "/characters";
  const body = await venice<ListCharactersResponse | VeniceCharacter[] | unknown>(endpoint, {
    method: "GET",
    signal,
  });
  return normalizeListResponse(body);
}

/** Fetches a single character by slug.
 *  @param slug The Venice character slug.
 *  @param signal Optional AbortSignal to cancel the request.
 *  @returns The normalized VeniceCharacter record.
 *  @throws Error if the slug is invalid or the API call fails.
 */
export async function getCharacter(
  slug: string,
  signal?: AbortSignal,
): Promise<VeniceCharacter> {
  if (!isValidCharacterSlug(slug)) {
    throw new Error("Invalid character slug.");
  }
  const body = await venice<GetCharacterResponse | VeniceCharacter | unknown>(
    `/characters/${encodeURIComponent(slug)}`,
    { method: "GET", signal },
  );
  const char = normalizeCharacter(body && typeof body === "object" && "data" in (body as Record<string, unknown>)
    ? (body as { data: unknown }).data
    : body);
  if (!char) {
    throw new VeniceAPIError("Venice returned a malformed character record.", 502);
  }
  return char;
}

/** Maximum reviews per page documented by the preview API. */
export const CHARACTER_REVIEWS_PAGE_SIZE_MAX = 100;
/** Default reviews page size — matches the upstream default. */
export const CHARACTER_REVIEWS_PAGE_SIZE_DEFAULT = 20;

/** Clamps an arbitrary value to the inclusive integer range [min, max]. */
function clampReviewInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Normalizes a single review record. Returns null when the record is too
 *  malformed to display (missing id/username/createdAt or a non-numeric
 *  rating). */
export function normalizeCharacterReview(raw: unknown): VeniceCharacterReview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  const characterId = typeof r.characterId === "string" ? r.characterId.trim() : "";
  const username = typeof r.username === "string" && r.username.trim() ? r.username.trim() : "";
  const createdAt = typeof r.createdAt === "string" && r.createdAt.trim() ? r.createdAt.trim() : "";
  const rating = typeof r.rating === "number" && Number.isFinite(r.rating) ? Math.round(r.rating) : NaN;
  if (!id || !characterId || !createdAt || !username || !Number.isFinite(rating)) return null;
  return {
    id,
    characterId,
    username,
    rating: Math.max(1, Math.min(5, rating)),
    message: typeof r.message === "string" && r.message.trim() ? r.message : null,
    createdAt,
    locale: typeof r.locale === "string" && r.locale.trim() ? r.locale : null,
    userAvatarUrl: typeof r.userAvatarUrl === "string" && r.userAvatarUrl.trim() ? r.userAvatarUrl : null,
    isOwner: r.isOwner === true,
  };
}

/** Normalizes the reviews response envelope. Accepts the documented
 *  `{ data, object, pagination, summary }` shape plus a bare review array
 *  so the UI degrades gracefully on partial upstream responses. */
export function normalizeCharacterReviews(raw: unknown): CharacterReviewsResult {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(r.data) ? r.data : Array.isArray(raw) ? raw : [];
  const data = list
    .map(normalizeCharacterReview)
    .filter((review): review is VeniceCharacterReview => review !== null);
  const p = r.pagination && typeof r.pagination === "object"
    ? (r.pagination as Record<string, unknown>)
    : {};
  const pagination: CharacterReviewsPagination = {
    page: clampReviewInt(p.page, 1, Number.MAX_SAFE_INTEGER, 1),
    pageSize: clampReviewInt(p.pageSize, 1, CHARACTER_REVIEWS_PAGE_SIZE_MAX, CHARACTER_REVIEWS_PAGE_SIZE_DEFAULT),
    total: clampReviewInt(p.total, 0, Number.MAX_SAFE_INTEGER, data.length),
    totalPages: clampReviewInt(p.totalPages, 0, Number.MAX_SAFE_INTEGER, 1),
  };
  const s = r.summary && typeof r.summary === "object"
    ? (r.summary as Record<string, unknown>)
    : {};
  const summary: CharacterReviewsSummary = {
    averageRating: typeof s.averageRating === "number" && Number.isFinite(s.averageRating) ? s.averageRating : 0,
    totalReviews: clampReviewInt(s.totalReviews, 0, Number.MAX_SAFE_INTEGER, data.length),
  };
  return { data, pagination, summary };
}

/** Fetches public reviews for a hosted character (preview API — GET-only).
 *  @param slug The Venice character slug.
 *  @param options Optional pagination (`page` 1-based, `pageSize` 1–100).
 *  @param signal Optional AbortSignal to cancel the request.
 *  @returns The normalized reviews result.
 *  @throws Error if the slug is invalid or the API call fails.
 */
export async function getCharacterReviews(
  slug: string,
  options: { page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<CharacterReviewsResult> {
  if (!isValidCharacterSlug(slug)) {
    throw new Error("Invalid character slug.");
  }
  const page = clampReviewInt(options.page, 1, Number.MAX_SAFE_INTEGER, 1);
  const pageSize = clampReviewInt(
    options.pageSize,
    1,
    CHARACTER_REVIEWS_PAGE_SIZE_MAX,
    CHARACTER_REVIEWS_PAGE_SIZE_DEFAULT,
  );
  const body = await venice<unknown>(
    `/characters/${encodeURIComponent(slug)}/reviews?page=${page}&pageSize=${pageSize}`,
    { method: "GET", signal },
  );
  return normalizeCharacterReviews(body);
}
