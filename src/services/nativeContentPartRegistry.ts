/** @fileoverview Renderer runtime registry for provider-native content parts
 *  (FEAT-006 / VF-20260916-P1-004).
 *
 *  Native `file` / `video_url` parts carry payloads the provider needs only
 *  AT SEND TIME (e.g. a base64 data URL up to ~33 MB for a 25 MiB file).
 *  Persisting those payloads into the durable conversation record would bloat
 *  the store, the IPC flush, and the on-disk backup for no benefit — after a
 *  restart the provider no longer needs the bytes for history rendering.
 *
 *  Instead, the durable user message persists only lightweight
 *  `NativeContentPartRef` records (id + display metadata) in
 *  `metadata.nativeParts`; the actual part payload lives here, in a bounded,
 *  renderer-process-only registry. The chat prompt compiler expands refs via
 *  `resolveNativePartRef` when building the outgoing request. After an app
 *  restart the refs remain for display but resolve to null and the part is
 *  omitted from new requests (the transcript text is unaffected).
 *
 *  The registry is bounded by entry count AND total payload bytes; when a
 *  bound is exceeded the oldest entries are evicted first. It never persists,
 *  never leaves the renderer process, and must never carry local filesystem
 *  paths (enforced by `validateContentPart` on registration). */

import type { ContentPart } from "../types/venice";
import type { NativeContentPartRef } from "../types/chatAttachment";
import { validateContentPart } from "../shared/contentPartValidation";
import { MIB } from "../shared/limits";

export const MAX_NATIVE_PART_REGISTRY_ENTRIES = 16;
export const MAX_NATIVE_PART_REGISTRY_BYTES = 128 * MIB;

/** FIFO eviction order — insertion order is preserved by the Map. */
const registry = new Map<string, ContentPart>();
let totalPayloadBytes = 0;

function payloadBytes(part: ContentPart): number {
  if (part.type === "file") return part.file?.file_data?.length ?? 0;
  if (part.type === "video_url") return part.video_url?.url?.length ?? 0;
  return 0;
}

/** Registers a validated native part and returns its durable reference.
 *  Throws when the part fails the canonical content-part validator — callers
 *  in the send path validate earlier to surface localized errors; this is
 *  defense-in-depth so an invalid part can never enter the registry. */
export function registerNativePart(
  id: string,
  part: ContentPart,
): NativeContentPartRef {
  const error = validateContentPart(part, 0);
  if (error) {
    throw new Error(
      `registerNativePart: invalid ${part.type} part (${error.reason})`,
    );
  }
  if (registry.has(id)) {
    totalPayloadBytes -= payloadBytes(registry.get(id)!);
    registry.delete(id);
  }
  registry.set(id, part);
  totalPayloadBytes += payloadBytes(part);

  while (
    registry.size > MAX_NATIVE_PART_REGISTRY_ENTRIES ||
    totalPayloadBytes > MAX_NATIVE_PART_REGISTRY_BYTES
  ) {
    const oldest = registry.keys().next().value;
    if (oldest === undefined) break;
    totalPayloadBytes -= payloadBytes(registry.get(oldest)!);
    registry.delete(oldest);
  }

  const ref: NativeContentPartRef = { id, type: part.type as "file" | "video_url" };
  if (part.type === "file") {
    const fileName = part.file?.filename;
    if (fileName) ref.filename = fileName;
  }
  return ref;
}

/** Resolves a durable ref to its runtime part payload. Returns null when the
 *  entry was evicted or the app restarted since the message was sent — the
 *  caller omits the part from the outgoing request. */
export function resolveNativePartRef(
  ref: NativeContentPartRef,
): ContentPart | null {
  const part = registry.get(ref.id);
  if (!part || part.type !== ref.type) return null;
  // Re-validate at the boundary: an evicted-then-replaced or corrupted entry
  // must never reach the wire.
  if (validateContentPart(part, 0)) {
    registry.delete(ref.id);
    return null;
  }
  return part;
}

/** Drops entries (used by tests and future message-deletion cleanup). */
export function releaseNativeParts(ids: string[]): void {
  for (const id of ids) {
    const part = registry.get(id);
    if (!part) continue;
    totalPayloadBytes -= payloadBytes(part);
    registry.delete(id);
  }
}

/** Test helper — clears every entry. */
export function clearNativePartRegistry(): void {
  registry.clear();
  totalPayloadBytes = 0;
}
