/** @fileoverview Image normalization, extraction, and filename utilities for gallery items. */

/**
 * Strips the data URL scheme and base64 prefix from an image string.
 *
 * @param dataUrl A string that may contain a data URL prefix.
 * @returns The raw base64 payload with the prefix removed.
 */
export function stripDataUrlPrefix(dataUrl: string) {
  return String(dataUrl || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

/** Extracts a file extension from an image data URL based on its MIME type. */
export function getExtensionFromDataUrl(dataUrl: string): string {
  const match = String(dataUrl || "").match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/);
  if (!match) return "png";
  const subtype = match[1].toLowerCase();
  if (subtype === "jpeg" || subtype === "jpg") return "jpg";
  if (subtype === "png" || subtype === "webp" || subtype === "gif" || subtype === "avif") return subtype;
  return "png";
}

/**
 * Normalizes various image payload shapes into a standard data URL or HTTPS URL.
 *
 * @param value An unknown value that may represent image data.
 * @returns A normalized data URL or HTTPS URL, or null if the value is unrecognisable.
 */
export function normalizeImageData(value: unknown, seen = new WeakSet<object>()): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) return value;
    if (/^https:\/\//i.test(value)) return value;
    if (value.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(value)) {
      return "data:image/png;base64," + value.replace(/\s/g, "");
    }
    return null;
  }
  if (typeof value === "object") {
    if (seen.has(value)) return null;
    seen.add(value);
    const record = value as Record<string, unknown>;
    return normalizeImageData(
      record.b64_json ||
        record.b64 ||
        record.base64 ||
        record.dataBase64 ||  // Electron: binary PNG response serialized to base64
        record.dataUrl ||     // Web: binary PNG response converted to data URL
        record.image ||
        record.url ||
        record.data ||
        record.content,
      seen
    );
  }
  return null;
}

/**
 * Extracts and deduplicates image URLs from a Venice API payload.
 *
 * @param payload A response payload that may contain images in various fields.
 * @returns An array of unique normalised image URLs.
 */
export function extractImages(payload: unknown): string[] {
  const candidates: string[] = [];
  const push = (x: unknown) => {
    const normalized = normalizeImageData(x);
    if (normalized) candidates.push(normalized);
  };

  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;

  if (Array.isArray(record?.images)) record.images.forEach(push);
  if (Array.isArray(record?.data)) record.data.forEach(push);
  if (record?.image) push(record.image);
  if (record?.dataUrl) push(record.dataUrl);       // web: binary PNG response
  if (record?.dataBase64) push(record.dataBase64); // Electron: binary PNG response
  if (record?.b64_json) push(record.b64_json);
  if (record?.base64) push(record.base64);
  if (record?.url) push(record.url);

  if (!candidates.length && typeof payload === "string") push(payload);
  if (!candidates.length && record) {
    Object.values(record).forEach((v) => {
      if (Array.isArray(v)) v.forEach(push);
      else push(v);
    });
  }
  return Array.from(new Set(candidates));
}

/**
 * Builds a safe filename for a gallery image from its metadata.
 *
 * @param item A gallery record containing model and id fields.
 * @param index Fallback numeric index when id is missing.
 * @param suffix Optional suffix to append before the extension.
 * @returns A sanitised PNG filename.
 */
export function galleryFilename(item: unknown, index = 0, suffix = "") {
  const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const safeModel = String(record.model || "venice").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40);
  const id = String(record.id || index).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60);

  const ext =
    record.mediaType === "video"
      ? (/\.webm($|\?)/i.test(String(record.downloadUrl || record.image || "")) ? ".webm" : ".mp4")
      : record.mediaType === "audio"
        ? getAudioExtension(record.mimeType, String(record.downloadUrl || record.image || ""))
        : ".png";

  return `${safeModel}-${id}${suffix}${ext}`;
}

/** Maps a supported audio MIME type (or URL/data URL fallback) to its file extension. */
export function getAudioExtension(mimeType: unknown, source = ""): ".mp3" | ".wav" | ".flac" {
  const normalized = typeof mimeType === "string" ? mimeType.split(";", 1)[0].trim().toLowerCase() : "";
  if (normalized === "audio/wav" || normalized === "audio/x-wav") return ".wav";
  if (normalized === "audio/flac") return ".flac";
  if (/^(?:data:audio\/(?:x-)?wav[;,]|.*\.wav(?:$|\?))/i.test(source)) return ".wav";
  if (/^(?:data:audio\/flac[;,]|.*\.flac(?:$|\?))/i.test(source)) return ".flac";
  return ".mp3";
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to serialize generated media."));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Generated media serialization returned a non-string result."));
    };
    reader.readAsDataURL(blob);
  });
}
