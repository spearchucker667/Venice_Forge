/** @fileoverview Type definitions for the Venice.ai hosted character API.
 *
 * Endpoints used (official Venice API, no scraping):
 *   GET /api/v1/characters
 *   GET /api/v1/characters/{slug}
 *
 *  Character chat is initiated by sending:
 *    venice_parameters.character_slug = "<slug>"
 *  to POST /api/v1/chat/completions.
 *
 * The shapes below are defensive: optional fields may be missing or
 * malformed in real responses, and downstream consumers (renderer
 * components, conversation metadata) rely on normalization to fill
 * safe defaults.
 */

/** Sort options supported by `GET /characters`. */
export type CharacterSortBy =
  | "featured"
  | "imports"
  | "highestRating"
  | "highlyRated"
  | "highlyRatedAndRecent"
  | "mostRecent"
  | "ratingCount";

/** Sort direction. The Venice API uses `"asc"` / `"desc"`. */
export type CharacterSortOrder = "asc" | "desc";

/** Public statistics for a character. All fields are optional because
 *  older or partial character records may omit rating data entirely. */
export interface VeniceCharacterStats {
  averageRating?: number;
  imports?: number;
  ratingCount?: number;
  ratingSum?: number;
  userRating?: number;
}

/** A normalized Venice hosted character.
 *  All optional fields default to undefined; never throw on missing data. */
export interface VeniceCharacter {
  /** Stable opaque character id (provider-side). */
  id: string;
  /** URL-safe slug used by `venice_parameters.character_slug`. */
  slug: string;
  /** Display name. */
  name: string;
  /** Short bio / system prompt excerpt. */
  description?: string;
  /** Author / creator. */
  author?: string;
  /** Adult / NSFW flag — opt-in only, never enabled by default. */
  adult?: boolean;
  /** Whether the character appears in the featured list. */
  featured?: boolean;
  /** Public Venice share URL. */
  shareUrl?: string;
  /** Avatar image URL (e.g. https://outerface.venice.ai/...). */
  photoUrl?: string;
  /** Free-form tags. */
  tags?: string[];
  /** Whether web search is enabled for this character. */
  webEnabled?: boolean;
  /** Recommended / default model id. */
  modelId?: string;
  /** ISO timestamps when available. */
  createdAt?: string;
  updatedAt?: string;
  /** Public stats. */
  stats?: VeniceCharacterStats;
}

/** Request payload for `GET /characters`. All fields are optional; the
 *  service layer clamps and trims them before building the query string. */
export interface ListCharactersRequest {
  search?: string;
  tags?: string[];
  categories?: string[];
  modelId?: string;
  isAdult?: boolean;
  isPro?: boolean;
  isWebEnabled?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: CharacterSortBy;
  sortOrder?: CharacterSortOrder;
}

/** Response envelope for `GET /characters`. Some Venice responses
 *  return a bare array, others wrap in `{ data: [...] }` or
 *  `{ characters: [...] }`. The service normalizes all three. */
export interface ListCharactersResponse {
  data: VeniceCharacter[];
}

/** Single-character response envelope. */
export interface GetCharacterResponse {
  data: VeniceCharacter;
}

/** Persisted model preference for hosted character chats.
 *  `null` means "use the character's recommended modelId". */
export type CharacterChatModel = string | null;

/** Model option rendered in the Characters view model selector. */
export interface CharacterModelOption {
  id: string;
  name: string;
}
