/** @fileoverview Phase 2B Media Studio export bundle.
 *
 * Produces a self-contained export payload for a set of MediaItem
 * records. The payload can be serialised to JSON (browser + Electron
 * IPC) and used to drive a ZIP export via `jszip` or a manual save
 * dialog. This module is pure (no DOM, no Node imports) so it works
 * in both the renderer and main process; the caller is responsible
 * for the actual ZIP assembly + save.
 *
 * Safety:
 *   - Secrets, bearer tokens, api keys, raw authorization headers, and
 *     path tokens are stripped from the manifest, sidecar JSON, and
 *     any nested objects.
 *   - Circular references are broken by a `WeakSet` so the
 *     `JSON.stringify` step never throws.
 *   - Blobs / data URLs: sidecar includes the *file extension* and
 *     byte size of the base64 payload, but the raw data is NOT
 *     inlined into JSON (caller appends it to the ZIP separately).
 *   - Filenames are sanitised to avoid path traversal: only
 *     `[a-zA-Z0-9._-]`, max 80 chars.
 *
 * The bundle shape is:
 *   {
 *     "version": 1,
 *     "app": "Venice Forge",
 *     "exportedAt": "...",
 *     "items": [{ ... sidecar without raw image bytes ... }, ...],
 *     "items/[id]/media": written to a separate media/ subdir by the caller
 *   }
 */

import type { MediaItem } from "../types/media";
import { extractGenerationRecipe } from "../types/project";
import { redactSecrets } from "../shared/redaction";
import { getExtensionFromDataUrl } from "../utils/image";

export const EXPORT_BUNDLE_VERSION = 1 as const;
export const EXPORT_BUNDLE_APP = "Venice Forge" as const;

/** Subset of a MediaItem that is safe to ship in JSON. Image bytes are
 *  NOT included; the caller adds them to a separate media/ subdir. */
export interface MediaSidecar {
  version: typeof EXPORT_BUNDLE_VERSION;
  id: string;
  projectId?: string;
  type: "image" | "video" | "audio";
  model: string;
  prompt: string;
  negative?: string;
  recipe?: ReturnType<typeof extractGenerationRecipe>;
  lineage: {
    parentId: string | null;
    childrenIds: string[];
  };
  createdAt: string;
  source: {
    app: typeof EXPORT_BUNDLE_APP;
    operation: string;
  };
  /** File extension and size, NOT the raw bytes. */
  mediaFile: {
    extension: string;
    base64ByteLength: number;
  };
  /** A "tag" marker so the bundle is recognisable on disk. */
  provenance: "venice-forge-export";
}

/** Top-level bundle manifest. */
export interface ExportBundle {
  version: typeof EXPORT_BUNDLE_VERSION;
  app: typeof EXPORT_BUNDLE_APP;
  exportedAt: string;
  itemCount: number;
  items: MediaSidecar[];
}

const STRIPPED_KEYS = new Set([
  "apikey",
  "token",
  "bearer",
  "authorization",
  "exportedpathtoken",
  "image", // raw bytes go to media/ subdir
  "thumbhash",
  "sha256", // not needed for export
]);

const SECRET_KEY_NAME = /(authorization|api[-_ ]?key|token|secret|password)/i;

const SANITISED_FILENAME = /[^a-zA-Z0-9._-]/g;
const MAX_FILENAME = 80;

function sanitiseFilename(input: string): string {
  const cleaned = String(input ?? "")
    .replace(/[/\\]/g, "_")
    .replace(SANITISED_FILENAME, "_")
    .slice(0, MAX_FILENAME);
  return cleaned || "untitled";
}

function extensionFor(item: MediaItem): string {
  // Phase 2A: media items persist as base64 strings. Derive the
  // extension from the data URL MIME type; default to png for images
  // and mp4 for videos. The consumer can override via the
  // `mediaFile.extension` field.
  if (item.mediaType === "video") return "mp4";
  if (item.mediaType === "audio") return "mp3";
  if (typeof item.image === "string") return getExtensionFromDataUrl(item.image);
  return "png";
}

function safeBase64ByteLength(image: string | undefined): number {
  if (typeof image !== "string") return 0;
  // Strip the data-URL prefix if any, then count the base64 length.
  const comma = image.indexOf(",");
  const b64 = comma >= 0 ? image.slice(comma + 1) : image;
  // Base64 chars are 4 → 3 bytes, but padding may add slack. We
  // compute the strict upper bound and clamp negatives.
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  if (clean.length === 0) return 0;
  const padding = (clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0);
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function deepStrip(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return undefined; // break cycles
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((entry) => deepStrip(entry, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = k.toLowerCase().replace(/[-_ ]/g, "");
    if (STRIPPED_KEYS.has(normalizedKey) || SECRET_KEY_NAME.test(k)) continue;
    out[k] = deepStrip(v, seen);
  }
  return out;
}

/** Pure: builds a sidecar JSON-serialisable record for one item. */
export function buildSidecar(item: MediaItem, exportedAt: string): MediaSidecar {
  const recipe = extractGenerationRecipe(item);
  const ext = extensionFor(item);
  const sidecar: MediaSidecar = {
    version: EXPORT_BUNDLE_VERSION,
    id: item.id,
    type: item.mediaType ?? "image",
    model: item.model,
    prompt: redactSecrets(item.prompt ?? ""),
    createdAt: Number.isFinite(item.timestamp) ? new Date(item.timestamp).toISOString() : exportedAt,
    provenance: "venice-forge-export",
    lineage: {
      parentId: item.parentId ?? null,
      childrenIds: Array.isArray(item.childrenIds) ? item.childrenIds.slice() : [],
    },
    source: {
      app: EXPORT_BUNDLE_APP,
      operation: item.operation ?? "generate",
    },
    mediaFile: {
      extension: ext,
      base64ByteLength: safeBase64ByteLength(item.image),
    },
  };
  if (item.projectId) sidecar.projectId = item.projectId;
  if (item.negative) sidecar.negative = redactSecrets(item.negative);
  if (recipe) sidecar.recipe = redactSecrets(deepStrip(recipe)) as MediaSidecar["recipe"];
  return sidecar;
}

/** Pure: builds the full manifest for the supplied items. */
export function buildExportBundle(items: readonly MediaItem[], exportedAt: string = new Date().toISOString()): ExportBundle {
  const safe = Array.isArray(items) ? items : [];
  return {
    version: EXPORT_BUNDLE_VERSION,
    app: EXPORT_BUNDLE_APP,
    exportedAt,
    itemCount: safe.length,
    items: safe.map((item) => buildSidecar(item, exportedAt)),
  };
}

/** Pure: resolves the safe media filename for one item. The caller
 *  is responsible for writing the actual bytes; this only produces the
 *  filename so the on-disk layout is deterministic. */
export function buildMediaFilename(item: MediaItem): string {
  const ext = extensionFor(item);
  const stem = sanitiseFilename(item.prompt || item.id);
  const id = sanitiseFilename(item.id).slice(0, 12);
  return `${id}-${stem}.${ext}`;
}

/** Pure: validates that a sidecar shape is correct. Used by the
 *  caller when re-importing. Returns null on success or a string
 *  describing the failure. */
export function validateSidecar(input: unknown): string | null {
  if (!input || typeof input !== "object") return "Not an object";
  const v = input as Record<string, unknown>;
  if (v.version !== EXPORT_BUNDLE_VERSION) return `Bad version: ${String(v.version)}`;
  if (typeof v.id !== "string") return "Missing id";
  if (v.type !== "image" && v.type !== "video") return "Bad type";
  if (typeof v.model !== "string") return "Missing model";
  if (typeof v.prompt !== "string") return "Missing prompt";
  if (!v.lineage || typeof v.lineage !== "object") return "Missing lineage";
  const lin = v.lineage as Record<string, unknown>;
  if (lin.parentId !== null && typeof lin.parentId !== "string") {
    return "Bad parentId";
  }
  if (!Array.isArray(lin.childrenIds)) return "Bad childrenIds";
  if (!v.source || typeof v.source !== "object") return "Missing source";
  if (!v.mediaFile || typeof v.mediaFile !== "object") return "Missing mediaFile";
  const mf = v.mediaFile as Record<string, unknown>;
  if (typeof mf.extension !== "string") return "Bad mediaFile.extension";
  if (typeof mf.base64ByteLength !== "number") return "Bad mediaFile.base64ByteLength";
  return null;
}

/** Serialise the bundle to a JSON string. Uses a circular-reference-safe
 *  replacer keyed off a module-level WeakSet. */
export function serialiseBundle(bundle: ExportBundle): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(bundle, (_key, value) => {
    if (value && typeof value === "object") {
      const obj = value as object
      if (seen.has(obj)) return undefined
      seen.add(obj)
    }
    return value
  }, 2)
}
