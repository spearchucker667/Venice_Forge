/** @fileoverview Browser helpers for downloading images and copying text to the clipboard. */

export interface DownloadImageResult {
  confirmed: boolean;
  usedFallback: boolean;
}

const MAX_FILENAME_LENGTH = 200;
const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif",
]);

/**
 * Sanitizes a suggested filename so it cannot be used as a path-traversal or
 * extension-spoofing vector. Removes path separators, control characters, and
 * reserved Windows characters, trims leading dots, and caps the length.
 */
export function sanitizeFilename(name: string): string {
  if (typeof name !== "string") return "download";
  return (
    name
      // Allow only printable ASCII that is safe across platforms; collapse
      // everything else (path separators, control chars, spaces, reserved
      // symbols, unicode private-use, etc.) into a single underscore.
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      // Prevent leading-dot names (e.g. ".htaccess") which can be dangerous.
      .replace(/^[.]+/, "")
      // Strip leading underscores left behind by path-separator replacement.
      .replace(/^_+/, "")
      .trim()
      .slice(0, MAX_FILENAME_LENGTH) || "download"
  );
}

/**
 * Validates that a URL is safe to hand to a browser download/navigation fallback.
 *
 * Allowed:
 *   - blob: URLs created from in-memory Blobs
 *   - data: URLs with an image/* MIME type
 *   - https: URLs
 *   - Same-origin relative app URLs (start with '/' but not '//')
 *
 * Rejected:
 *   - javascript:, file:, ftp:, data:text/html, unknown/malformed schemes
 */
export function isSafeDownloadUrl(url: string): boolean {
  if (typeof url !== "string" || !url) return false;

  // Safe schemes.
  if (/^blob:/i.test(url)) return true;
  const dataMime = /^data:([^;,]+)/i.exec(url)?.[1]?.toLowerCase();
  if (dataMime) return SAFE_IMAGE_MIME_TYPES.has(dataMime);
  if (/^https:\/\//i.test(url)) return true;

  // Same-origin relative app URLs only — absolute paths on the current origin.
  if (/^\/[^/]/i.test(url)) return true;

  // Explicitly block known dangerous schemes and plain http.
  if (/^(javascript|data|file|ftp|http):/i.test(url)) return false;

  // Reject unknown absolute schemes and strings that cannot be parsed as URLs.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const parsed = new URL(url);
  } catch {
    // Relative URLs without a protocol that don't start with '/' are too
    // ambiguous to allow in a fallback navigation context.
    return false;
  }

  return false;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
  }
}

/**
 * Downloads an image by fetching it as a blob and triggering a browser download.
 *
 * Falls back to a direct URL download if the blob fetch fails. The fallback is
 * gated by {@link isSafeDownloadUrl} so that malicious URLs cannot be used to
 * trigger navigation to javascript:, file:, or other dangerous schemes.
 *
 * @param url The image URL to download.
 * @param filename The suggested filename for the downloaded file.
 */
export async function downloadImage(url: string, filename: string): Promise<DownloadImageResult> {
  if (!url) throw new Error("No image URL to download.");

  const safeFilename = sanitizeFilename(filename);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image download failed with HTTP ${res.status}.`);
    const contentType = res.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!contentType || !SAFE_IMAGE_MIME_TYPES.has(contentType)) {
      throw new Error("Image download returned an unsupported content type.");
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    triggerDownload(blobUrl, safeFilename);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    return { confirmed: true, usedFallback: false };
  } catch {
    if (isSafeDownloadUrl(url)) {
      triggerDownload(url, safeFilename);
      return { confirmed: false, usedFallback: true };
    }
    return { confirmed: false, usedFallback: false };
  }
}

/**
 * Copies the provided text to the system clipboard.
 *
 * @param value The string to copy.
 * @returns A promise that resolves when the text has been written.
 */
export function copyText(value: string) {
  return navigator.clipboard.writeText(String(value || ""));
}
