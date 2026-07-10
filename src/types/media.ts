/** @fileoverview MediaItem — the unified record shape for the Media Studio. */

import type { GalleryImage } from "./storage";

export const MEDIA_ITEM_VERSION = 1 as const;

/** Source operation that produced this media item. */
export type MediaOperation =
  | "generate"
  | "upscale"
  | "edit"
  | "background-remove"
  | "variation"
  | "regenerate"
  | "video-generate"
  | "video-upscale"
  | "music-generate"
  | "import";

/** Supported media types. */
export type MediaType = "image" | "video" | "audio";

/** A line in a media item's lineage chain (parent or child reference). */
export interface MediaLineageRef {
  id: string;
  operation: MediaOperation;
  timestamp: number;
}

/**
 * The canonical MediaItem. This is the in-memory / on-the-wire shape used by
 * the Media Studio. It is persisted in the same `images` IDB store as the
 * legacy `GalleryImage` shape; the migrator in `mediaMigration.ts` adds the
 * new fields lazily on read.
 */
export interface MediaItem extends GalleryImage {
  /** Schema version of this record. New records always set this to 1. */
  mediaItemVersion?: typeof MEDIA_ITEM_VERSION;
  /** Discriminated type. Defaults to 'image' for legacy records. */
  mediaType: MediaType;
  /** How this item was produced. Defaults to 'generate' for legacy images. */
  operation: MediaOperation;
  /** Parent media item id, if this item is a derivative (upscale, edit, etc.). */
  parentId: string | null;
  /** IDs of direct children (derivatives of this item). Populated by the store. */
  childrenIds: string[];
  /** SHA-256 of the bytes, hex-encoded. Used for dedupe and as the thumb key. */
  sha256?: string;
  /** User-applied tags (lowercased, deduped). */
  tags: string[];
  /** User note (free-form). */
  note: string;
  /** Whether the user has favorited this item. */
  favorite: boolean;
  /** Stable id of the thumbnail cache entry (sha-derived). */
  thumbHash?: string;
  /** Number of times the user has opened the detail dialog for this item. */
  viewCount?: number;
  /**
   * Optional reference to a tracked filesystem copy created via export / routed
   * image save. When set, the inspector offers an "Open file location" action
   * that resolves to this path. Renderer never receives an unvalidated path;
   * this field is treated as opaque and only round-trips through IPC.
   */
  exportedPathToken?: string;

  /** Phase 1 Recipe support (per approved workspace plan).
   * Captured at generation time so the item can be "replayed" or used as a preset.
   * Stored directly on the MediaItem for simplicity (additive, optional).
   */
  recipe?: import('./project').GenerationRecipe;

  /** Project scoping for Phase 1 hardening.
   * Attached at generation/save time from the active project.
   * Legacy items without it are "unscoped" / visible in All.
   */
  projectId?: string;

  /** API cost metadata captured at generation time. */
  cost?: MediaCost;
  // ---- Phase 2G Sync Metadata ----
  deletedAt?: number | null;
  schemaVersion?: number;
  revisionId?: string;
  baseRevisionId?: string;
  deviceId?: string;
}

export interface MediaCost {
  /** Venice API input pricing (USD per token, from model spec). */
  inputPrice?: number;
  /** Venice API output pricing (USD per token, from model spec). */
  outputPrice?: number;
  /** Estimated cost in USD. */
  estimatedCost?: number;
}

/** Patch payload used by `mediaStore.patch` for partial updates. */
export type MediaItemPatch = Partial<
  Pick<
    MediaItem,
    | "tags"
    | "note"
    | "favorite"
    | "thumbHash"
    | "parentId"
    | "childrenIds"
    | "operation"
    | "viewCount"
    | "exportedPathToken"
    | "negative"
    | "style"
    | "prompt"
    | "seed"
    | "enhancedPrompt"
    | "originalPrompt"
    | "remixPrompt"
    | "source"
    | "quality"
    | "recipe"
    | "projectId"
    | "cost"
  >
>;

/** Internal guard: a record is at least shape-compatible with a MediaItem. */
export function isMediaItemLike(value: unknown): value is MediaItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.image === "string" && typeof v.model === "string" && typeof v.prompt === "string";
}
