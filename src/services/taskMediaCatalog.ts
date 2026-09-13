import { translateRuntime } from "../i18n/runtimeTranslator";
import type { BackgroundTask } from "../types/background-task";
import type { MediaItem } from "../types/media";
import { useMediaStore } from "../stores/media-store";
import { blobToDataUrl } from "../utils/image";
import { VALID_VENICE_MEDIA_RE } from "../utils/mediaItem";
import {
  VENICE_MAX_RAW_UPLOAD_BYTES,
  VENICE_MAX_SERIALIZED_UPLOAD_BYTES,
} from "../shared/limits";

const inFlight = new Set<string>();

/**
 * Resolve a task result into a durable gallery source.
 * Task records keep session blob URLs for playback; the gallery record
 * stores either a `venice-media://` id (desktop) or a bounded data URL
 * (web IndexedDB images store, matching Image Studio). Expiring https
 * URLs are never persisted.
 */
export async function resolveDurableGallerySource(
  resultUrl: string,
): Promise<string | null> {
  if (VALID_VENICE_MEDIA_RE.test(resultUrl)) return resultUrl;
  if (/^https?:\/\//i.test(resultUrl)) return null;
  if (resultUrl.startsWith("data:")) {
    if (resultUrl.length > VENICE_MAX_SERIALIZED_UPLOAD_BYTES) return null;
    return resultUrl;
  }
  if (resultUrl.startsWith("blob:") && typeof fetch === "function") {
    try {
      const response = await fetch(resultUrl);
      if (!response.ok) return null;
      const blob = await response.blob();
      if (blob.size > VENICE_MAX_RAW_UPLOAD_BYTES) return null;
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length > VENICE_MAX_SERIALIZED_UPLOAD_BYTES) return null;
      return dataUrl;
    } catch {
      return null;
    }
  }
  return null;
}

/** Callers must await this and handle rejection; do not fire-and-forget. */
export async function persistCompletedTaskMedia(
  task: BackgroundTask,
): Promise<MediaItem | null> {
  if (task.status !== "completed" || !task.resultUrl || !task.queueId)
    return null;
  if (task.type !== "video" && task.type !== "music" && task.type !== "image")
    return null;
  const durableUrl = await resolveDurableGallerySource(task.resultUrl);
  if (!durableUrl) return null;
  const id = `task-result-${task.id}`;
  if (inFlight.has(id)) return null;
  inFlight.add(id);
  try {
    const store = useMediaStore.getState();
    const existing =
      store.items.find(
        (item) =>
          item.id === id ||
          item.queueId === task.queueId ||
          (task.resultMediaId && item.id === task.resultMediaId),
      ) ??
      (await store.loadById(id)) ??
      (task.resultMediaId ? await store.loadById(task.resultMediaId) : null);
    if (existing) return existing;
    const request =
      task.metadata?.request && typeof task.metadata.request === "object"
        ? (task.metadata.request as Record<string, unknown>)
        : {};
    const mimeType =
      typeof task.metadata?.mimeType === "string"
        ? task.metadata.mimeType
        : durableUrl.match(/^data:([^;,]+)[;,]/i)?.[1];
    const item: MediaItem = {
      id,
      image: durableUrl,
      prompt:
        typeof request.prompt === "string"
          ? request.prompt
          : translateRuntime(
              "runtimeGenerated.services.taskmediacatalog.metadata.value1Generation",
              "{{value1}} generation",
              { value1: task.type },
            ),
      model:
        typeof request.model === "string"
          ? request.model
          : String(task.metadata?.model || task.modelId || "venice"),
      timestamp: task.updatedAt,
      mediaType:
        task.type === "video"
          ? "video"
          : task.type === "music"
            ? "audio"
            : "image",
      operation:
        task.type === "video"
          ? "video-generate"
          : task.type === "music"
            ? "music-generate"
            : "generate",
      parentId: null,
      childrenIds: [],
      tags: [],
      note: "",
      favorite: false,
      queueId: task.queueId,
      downloadUrl: durableUrl,
      ...(task.resultMediaId ? { generatedMediaId: task.resultMediaId } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(typeof request.duration === "string" ||
      typeof task.metadata?.requestedDuration === "string"
        ? {
            duration: String(
              request.duration ?? task.metadata?.requestedDuration,
            ),
          }
        : {}),
      ...(typeof request.resolution === "string" ||
      typeof task.metadata?.requestedResolution === "string"
        ? {
            resolution: String(
              request.resolution ?? task.metadata?.requestedResolution,
            ),
          }
        : {}),
      ...(typeof request.aspect_ratio === "string" ||
      typeof task.metadata?.requestedAspectRatio === "string"
        ? {
            aspectRatio: String(
              request.aspect_ratio ?? task.metadata?.requestedAspectRatio,
            ),
          }
        : {}),
      ...(typeof request.audio === "boolean" ? { audio: request.audio } : {}),
    };
    return await store.upsert(item, {
      attachActiveProject: true,
      source: "generated",
    });
  } finally {
    inFlight.delete(id);
  }
}
