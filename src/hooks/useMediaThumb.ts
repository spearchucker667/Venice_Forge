/** @fileoverview Media Studio thumbnail hook. Generates and caches small in-memory
 * data-URL thumbnails for MediaItems. The cache is intentionally tiny: only
 * the most recently used N entries are retained to avoid unbounded memory
 * growth on long sessions. A future iteration can swap this for an Electron
 * IPC-backed disk cache in `userData/metadata/media-thumbs/`.
 */

import { useEffect, useState } from "react";
import type { MediaItem } from "../types/media";
import { mediaItemSource } from "../utils/mediaItem";

const MAX_THUMBS = 256;
const MAX_THUMB_DIM = 256;

const cache = new Map<string, string>();

function cacheSet(key: string, url: string): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, url);
  while (cache.size > MAX_THUMBS) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    cache.delete(firstKey);
  }
}

function extractBase64(raw: string): string | null {
  if (raw.startsWith("data:")) {
    const comma = raw.indexOf(",");
    return comma >= 0 ? raw.slice(comma + 1) : raw;
  }
  return null;
}

function makeBlankThumb(width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "rgb(20, 20, 20)";
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}

function isCanvasAvailable(): boolean {
  try {
    return typeof document !== "undefined" && !!document.createElement("canvas").getContext("2d");
  } catch {
    return false;
  }
}

function makeImageThumb(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const ratio = Math.min(1, MAX_THUMB_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(makeBlankThumb(w, h));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/webp", 0.7));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

function makeVideoPoster(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    let settled = false;
    const finish = (url: string) => {
      if (settled) return;
      settled = true;
      resolve(url);
    };
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.5, (video.duration || 1) * 0.1);
      } catch {
        finish(makeBlankThumb(MAX_THUMB_DIM, MAX_THUMB_DIM));
      }
    };
    video.onseeked = () => {
      try {
        const ratio = Math.min(1, MAX_THUMB_DIM / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.max(1, Math.round(video.videoWidth * ratio));
        const h = Math.max(1, Math.round(video.videoHeight * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(makeBlankThumb(w, h));
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        finish(canvas.toDataURL("image/webp", 0.7));
      } catch {
        finish(makeBlankThumb(MAX_THUMB_DIM, MAX_THUMB_DIM));
      }
    };
    video.onerror = () => {
      finish(makeBlankThumb(MAX_THUMB_DIM, MAX_THUMB_DIM));
    };
    try {
      video.src = src;
    } catch (err) {
      reject(err);
    }
  });
}

export function clearMediaThumbCache(): void {
  cache.clear();
}

export function useMediaThumb(item: MediaItem | null | undefined): { url: string | null; loading: boolean; error: string | null } {
  const key = item?.id ?? null;
  const [url, setUrl] = useState<string | null>(() => (key && cache.has(key) ? cache.get(key)! : null));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (cache.has(item.id)) {
      setUrl(cache.get(item.id)!);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const source = mediaItemSource(item);
      if (!source) {
        if (!cancelled) {
          setUrl(makeBlankThumb(MAX_THUMB_DIM, MAX_THUMB_DIM));
          setLoading(false);
        }
        return;
      }
      try {
        let thumb = "";
        if (item.mediaType === "video") {
          thumb = await makeVideoPoster(source);
        } else if (item.mediaType === "audio") {
          thumb = source;
        } else if (source.startsWith("data:") || source.startsWith("http")) {
          if (!isCanvasAvailable()) {
            thumb = source;
          } else {
            const b64 = extractBase64(source);
            thumb = b64 && source.startsWith("data:image/png")
              ? `data:image/png;base64,${b64}`
              : await makeImageThumb(source);
          }
        }
        if (cancelled) return;
        cacheSet(item.id, thumb);
        setUrl(thumb);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        const blank = makeBlankThumb(MAX_THUMB_DIM, MAX_THUMB_DIM);
        cacheSet(item.id, blank);
        setUrl(blank);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, item]);

  return { url, loading, error };
}
