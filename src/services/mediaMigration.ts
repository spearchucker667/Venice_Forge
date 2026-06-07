/** @fileoverview Pure, idempotent migrator from GalleryImage → MediaItem. */

import type { GalleryImage } from "../types/storage";
import { MEDIA_ITEM_VERSION, type MediaItem } from "../types/media";

/**
 * Normalize a string|number|undefined dimension to a number, or undefined.
 * Accepts API responses that may return either type.
 */
function asDimension(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/**
 * Convert any record shape (legacy GalleryImage, or a partially-formed
 * MediaItem) into a canonical MediaItem. Idempotent: re-running on an
 * already-migrated record is a no-op.
 */
export function migrateGalleryImageToMediaItem(record: unknown): MediaItem {
  const base = (record ?? {}) as Record<string, unknown> & Partial<GalleryImage> & Partial<MediaItem>;

  // Default `mediaType`. Legacy records have no field; pre-existing `mediaType: 'video'`
  // is honored. New fields default to "image".
  const rawMediaType = base.mediaType;
  const mediaType: MediaItem["mediaType"] = rawMediaType === "video" ? "video" : "image";

  // Default `operation`. Legacy records have no field; pre-existing `upscaled: true`
  // gets a best-effort `upscale` label; videos get `video-generate`.
  let operation: MediaItem["operation"];
  if (base.operation && typeof base.operation === "string") {
    operation = base.operation as MediaItem["operation"];
  } else if (base.upscaled === true) {
    operation = "upscale";
  } else if (mediaType === "video") {
    operation = "video-generate";
  } else {
    operation = "generate";
  }

  const tags = Array.isArray(base.tags)
    ? Array.from(
        new Set(
          (base.tags as unknown[])
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0 && t.length <= 32),
        ),
      )
    : [];

  return {
    ...(base as object),
    id: String(base.id ?? ""),
    image: String(base.image ?? ""),
    prompt: String(base.prompt ?? ""),
    negative: typeof base.negative === "string" ? base.negative : undefined,
    model: String(base.model ?? "unknown"),
    width: asDimension(base.width),
    height: asDimension(base.height),
    aspectRatio: typeof base.aspectRatio === "string" ? base.aspectRatio : undefined,
    style: typeof base.style === "string" ? base.style : undefined,
    cfg: base.cfg as number | string | undefined,
    steps: base.steps as number | string | undefined,
    safeMode: typeof base.safeMode === "boolean" ? base.safeMode : undefined,
    disableWatermark: typeof base.disableWatermark === "boolean" ? base.disableWatermark : undefined,
    batchId: typeof base.batchId === "string" ? base.batchId : null,
    batchIndex: typeof base.batchIndex === "number" ? base.batchIndex : null,
    batchCount: typeof base.batchCount === "number" ? base.batchCount : null,
    timestamp: typeof base.timestamp === "number" ? base.timestamp : Date.now(),
    upscaled: typeof base.upscaled === "boolean" ? base.upscaled : undefined,
    workflow: typeof base.workflow === "string" ? base.workflow : undefined,
    queueId: typeof base.queueId === "string" ? base.queueId : undefined,
    downloadUrl: typeof base.downloadUrl === "string" ? base.downloadUrl : undefined,
    duration: typeof base.duration === "string" ? base.duration : undefined,
    resolution: typeof base.resolution === "string" ? base.resolution : undefined,
    upscaleFactor: typeof base.upscaleFactor === "number" ? base.upscaleFactor : undefined,
    audio: typeof base.audio === "boolean" ? base.audio : undefined,
    seed: base.seed === null ? null : typeof base.seed === "number" ? base.seed : undefined,
    source: typeof base.source === "string" ? base.source : undefined,
    enhancedPrompt: typeof base.enhancedPrompt === "string" ? base.enhancedPrompt : null,
    originalPrompt: typeof base.originalPrompt === "string" ? base.originalPrompt : null,
    remixPrompt: typeof base.remixPrompt === "string" ? base.remixPrompt : null,
    mediaItemVersion: MEDIA_ITEM_VERSION,
    mediaType,
    operation,
    parentId: typeof base.parentId === "string" ? base.parentId : null,
    childrenIds: Array.isArray(base.childrenIds)
      ? (base.childrenIds as unknown[]).filter((c): c is string => typeof c === "string")
      : [],
    sha256: typeof base.sha256 === "string" ? base.sha256 : undefined,
    tags,
    note: typeof base.note === "string" ? base.note : "",
    favorite: base.favorite === true,
    thumbHash: typeof base.thumbHash === "string" ? base.thumbHash : undefined,
    viewCount: typeof base.viewCount === "number" ? base.viewCount : 0,
    exportedPathToken: typeof base.exportedPathToken === "string" ? base.exportedPathToken : undefined,
  };
}

/** Migrate a list of records. Empty / null entries are dropped. */
export function migrateAll(records: readonly unknown[]): MediaItem[] {
  if (!Array.isArray(records)) return [];
  return records.filter(Boolean).map(migrateGalleryImageToMediaItem);
}

/** Returns true if the record is already a migrated MediaItem at current version. */
export function isMigrated(record: unknown): record is MediaItem {
  if (!record || typeof record !== "object") return false;
  const v = (record as Partial<MediaItem>).mediaItemVersion;
  return v === MEDIA_ITEM_VERSION;
}
