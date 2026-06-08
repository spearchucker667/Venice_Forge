/** @fileoverview Pure helpers for the Media Studio view: source resolution, thumb URLs, dimension formatting, op filtering, and tag manipulation. */

import type { MediaItem } from "../types/media";
import {
  modelSupportsEdit,
  modelSupportsUpscale,
  modelSupportsVideo,
  modelSupportsVision,
} from "../constants/venice";

/**
 * Compact capability flags for the source model of a MediaItem. Rendered in
 * the inspector and used by future gallery actions to gate buttons.
 */
export interface MediaCapabilities {
  upscale: boolean;
  edit: boolean;
  video: boolean;
  vision: boolean;
}

/**
 * Optional live `/models` capability block for the source model of a
 * MediaItem. When present, the live `supportsVision` flag is the source
 * of truth and takes precedence over the static
 * `VISION_CAPABLE_MODEL_IDS` / `VISION_CAPABLE_PATTERNS` fallback in
 * `src/constants/venice.ts`. Persisted MediaItems only carry the model
 * id string, so this is best-effort: callers that can resolve the
 * model via `useModels()` should pass it through.
 */
export interface MediaItemWithLiveCapabilities {
  model: string;
  liveCapabilities?: { supportsVision?: boolean | undefined } | null | undefined;
}

/** Returns the set of capabilities recognised for `item.model`. */
export function mediaCapabilities(item: MediaItemWithLiveCapabilities): MediaCapabilities {
  const model = { id: item.model, name: item.model };
  return {
    upscale: modelSupportsUpscale(model),
    edit: modelSupportsEdit(model),
    video: modelSupportsVideo(model),
    vision: modelSupportsVision(item.model, item.liveCapabilities ?? null),
  };
}

/**
 * Resolve the displayable source for a MediaItem. Image bytes are stored as a
 * data URL or HTTPS URL in `item.image`; videos may be a blob URL, HTTPS URL,
 * or raw base64. Returns null if no displayable source is available.
 */
export function mediaItemSource(item: MediaItem): string | null {
  const raw = item.image;
  if (!raw) return null;
  if (item.mediaType === "video") {
    if (
      raw.startsWith("data:") ||
      raw.startsWith("blob:") ||
      raw.startsWith("http")
    ) {
      return raw;
    }
    return null;
  }
  if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("http")) {
    return raw;
  }
  return `data:image/png;base64,${raw}`;
}

export function isVideoItem(item: MediaItem): boolean {
  return item.mediaType === "video";
}

const DIMENSION_FORMAT = new Intl.NumberFormat("en-US");

export function formatDimensions(item: MediaItem): string | null {
  const w = typeof item.width === "number" ? item.width : Number(item.width);
  const h = typeof item.height === "number" ? item.height : Number(item.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return `${DIMENSION_FORMAT.format(Math.round(w))} × ${DIMENSION_FORMAT.format(Math.round(h))}`;
}

export function formatDuration(duration: string | undefined): string | null {
  if (!duration) return null;
  return duration;
}

export function formatBytesApprox(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function estimateItemBytes(item: MediaItem): number {
  const raw = item.image;
  if (!raw) return 0;
  if (raw.startsWith("data:")) {
    const comma = raw.indexOf(",");
    const b64 = comma >= 0 ? raw.slice(comma + 1) : raw;
    return Math.floor((b64.length * 3) / 4);
  }
  return raw.length;
}

export function normalizedTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const cleaned = tag.trim().toLowerCase();
    if (!cleaned || cleaned.length > 32) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export function splitTags(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 32);
}
