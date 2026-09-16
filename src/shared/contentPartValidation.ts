/** @fileoverview Phase 6 — Native file and video input validation.
 *
 *  Provides the canonical validators for `ContentPart` extensions:
 *  - `file` (data URL or public URL; never a raw filesystem path)
 *  - `video_url` (direct URL, YouTube URL, or base64 data URL)
 *
 *  Validators fail closed — an invalid part surfaces a structured
 *  `ContentPartValidationError` rather than throwing, so callers can
 *  surface a precise error to the user without losing context. The
 *  capability gates that decide whether `video_url` / `file` may be
 *  sent at all live separately in `src/shared/modelCapabilities.ts`.
 *
 *  Local filesystem paths are explicitly rejected — Venice expects a
 *  data URL or a public URL, never an absolute path on the user's
 *  machine. Sending a raw path would leak device-local paths into the
 *  outbound request, violating §9.4 of the 2026-09-16 feature-gap
 *  handoff and the broader "no secrets / no device paths over the
 *  wire" rule in AGENTS.md.
 */

import type { ContentPart } from "../types/venice";

export const MAX_VIDEO_URL_PARTS_PER_REQUEST = 3;

/** Accepted upstream video URL MIME-prefixes / file extensions for
 *  `video_url.url` (verbatim from the Swagger description for
 *  `VideoUrl.url`). */
export const SUPPORTED_VIDEO_URL_FORMATS = [
  "mp4",
  "mpeg",
  "mov",
  "webm",
] as const;

/** Accepted file `file_data` MIME types (verbatim from the Swagger
 *  description for `File.file_data`). */
export const SUPPORTED_FILE_DATA_MIME_PREFIXES = [
  "data:application/pdf",
  "data:application/epub",
  "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "data:application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "data:application/vnd.ms-excel",
  "data:text/plain",
  "data:text/markdown",
  "data:text/csv",
  "data:application/json",
] as const;

export interface ContentPartValidationError {
  partIndex: number;
  reason:
    | "unsupported-type"
    | "missing-payload"
    | "invalid-url"
    | "raw-local-path"
    | "unsupported-format"
    | "too-many-video-urls";
  message: string;
}

/** True when the value looks like a raw absolute filesystem path
 *  (Unix-style, Windows-style, or file:// URI). Venice expects either a
 *  data URL or a publicly accessible URL — never a local path. */
export function looksLikeLocalFilesystemPath(value: string): boolean {
  if (!value) return false;
  if (/^file:\/\//i.test(value)) return true;
  if (/^\/[A-Za-z0-9_\-./]/.test(value)) return true;
  if (/^[A-Za-z]:[\\/][A-Za-z0-9_\-./ ]+/.test(value)) return true;
  return false;
}

/** True when the value is a data URL (RFC 2397). */
export function isDataUrl(value: string): boolean {
  return /^data:[a-zA-Z0-9./+-]+;base64,/.test(value);
}

/** True when the value is an http(s) URL. */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** True when the video URL is in an accepted format. Accepts:
 *  - http(s) URLs in any of the documented formats (validated by
 *    extension substring, e.g. `.../foo.mp4`)
 *  - data URLs whose MIME matches the documented video MIME prefixes
 *  - YouTube URLs (some providers accept them; validated by host). */
export function isSupportedVideoUrl(url: string): boolean {
  if (looksLikeLocalFilesystemPath(url)) return false;
  if (isDataUrl(url)) {
    return /^data:video\//i.test(url);
  }
  if (!isHttpUrl(url)) return false;
  // YouTube is accepted for some providers per upstream description.
  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) return true;
  const lower = url.toLowerCase().split("?")[0].split("#")[0];
  return SUPPORTED_VIDEO_URL_FORMATS.some((ext) => lower.endsWith(`.${ext}`));
}

/** True when the file `file_data` is in an accepted format. Accepts:
 *  - data URLs whose MIME prefix is on `SUPPORTED_FILE_DATA_MIME_PREFIXES`
 *  - public http(s) URLs (the upstream accepts "publicly accessible URL"
 *    for the file_data field)
 *  - rejects raw filesystem paths
 */
export function isSupportedFileData(fileData: string): boolean {
  if (!fileData) return false;
  if (looksLikeLocalFilesystemPath(fileData)) return false;
  if (isDataUrl(fileData)) {
    return SUPPORTED_FILE_DATA_MIME_PREFIXES.some((prefix) =>
      fileData.toLowerCase().startsWith(prefix),
    );
  }
  return isHttpUrl(fileData);
}

/** Validates a single ContentPart. Returns the structured error when the
 *  part is invalid; returns null on success. */
export function validateContentPart(
  part: ContentPart,
  partIndex: number,
): ContentPartValidationError | null {
  switch (part.type) {
    case "text":
      if (typeof part.text !== "string" || part.text.length === 0) {
        return {
          partIndex,
          reason: "missing-payload",
          message: "text content part must include a non-empty `text` field",
        };
      }
      return null;
    case "image_url":
      if (typeof part.image_url?.url !== "string" || !part.image_url.url) {
        return {
          partIndex,
          reason: "missing-payload",
          message: "image_url content part must include a `url`",
        };
      }
      if (looksLikeLocalFilesystemPath(part.image_url.url)) {
        return {
          partIndex,
          reason: "raw-local-path",
          message:
            "image_url.url must be a data URL or a public URL, never a local filesystem path",
        };
      }
      return null;
    case "input_audio":
      if (
        typeof part.input_audio?.data !== "string" ||
        !part.input_audio.data ||
        typeof part.input_audio.format !== "string"
      ) {
        return {
          partIndex,
          reason: "missing-payload",
          message:
            "input_audio content part must include base64 `data` and a `format`",
        };
      }
      return null;
    case "file":
      if (!part.file?.file_data) {
        return {
          partIndex,
          reason: "missing-payload",
          message: "file content part must include `file.file_data`",
        };
      }
      if (looksLikeLocalFilesystemPath(part.file.file_data)) {
        return {
          partIndex,
          reason: "raw-local-path",
          message:
            "file.file_data must be a data URL or a public http(s) URL, never a raw local filesystem path",
        };
      }
      if (!isSupportedFileData(part.file.file_data)) {
        return {
          partIndex,
          reason: "unsupported-format",
          message:
            "file.file_data must be a data URL with a supported MIME prefix or a public http(s) URL",
        };
      }
      return null;
    case "video_url":
      if (!part.video_url?.url) {
        return {
          partIndex,
          reason: "missing-payload",
          message: "video_url content part must include a `url`",
        };
      }
      if (looksLikeLocalFilesystemPath(part.video_url.url)) {
        return {
          partIndex,
          reason: "raw-local-path",
          message:
            "video_url.url must be a data URL or a public URL, never a local filesystem path",
        };
      }
      if (!isSupportedVideoUrl(part.video_url.url)) {
        return {
          partIndex,
          reason: "unsupported-format",
          message:
            "video_url.url must use one of the supported formats: mp4, mpeg, mov, webm (YouTube links are accepted for some providers)",
        };
      }
      return null;
    default:
      return {
        partIndex,
        reason: "unsupported-type",
        message: `unknown content part type: ${String((part as { type?: unknown }).type)}`,
      };
  }
}

/** Validates an array of content parts and additionally enforces the
 *  upstream "at most 3 video_url parts per request" limit. */
export function validateContentParts(
  parts: ContentPart[],
): ContentPartValidationError[] {
  const errors: ContentPartValidationError[] = [];
  let videoCount = 0;
  parts.forEach((part, i) => {
    const err = validateContentPart(part, i);
    if (err) {
      errors.push(err);
      return;
    }
    if (part.type === "video_url") videoCount++;
  });
  if (videoCount > MAX_VIDEO_URL_PARTS_PER_REQUEST) {
    errors.push({
      partIndex: -1,
      reason: "too-many-video-urls",
      message: `at most ${MAX_VIDEO_URL_PARTS_PER_REQUEST} video_url parts are allowed per request (got ${videoCount})`,
    });
  }
  return errors;
}
