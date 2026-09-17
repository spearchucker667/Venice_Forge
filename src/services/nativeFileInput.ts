/** @fileoverview Reads a local File into a provider-native `file` part
 *  payload (`data:<mime>;base64,<data>`) for FEAT-006.
 *
 *  The composer keeps the original `File` only in transient state; when the
 *  user switches an attachment to "Native file" mode this module converts it
 *  to the canonical `file_data` data URL. Hard rules:
 *
 *   - Size cap: files above `VENICE_MAX_RAW_UPLOAD_BYTES` are rejected — the
 *     user is pointed at the local-context (Documents/extraction) path,
 *     which streams text into the context window instead of uploading bytes.
 *   - MIME allowlist: the data-URL MIME must match the upstream Swagger
 *     `File.file_data` allowlist (mirrored by `SUPPORTED_FILE_DATA_MIME_PREFIXES`
 *     in `contentPartValidation.ts`). Anything else fails closed.
 *   - Never produces a raw filesystem path — the output is always a data URL.
 *
 *  Model-capability note: unlike vision/E2EE there is currently NO runtime
 *  model capability flag for native file/video inputs in
 *  `src/shared/modelCapabilities.ts`, so the composer offers these modes for
 *  every model; the canonical validator remains the gatekeeper. */

import { VENICE_MAX_RAW_UPLOAD_BYTES } from "../shared/limits";

/** Extension → data-URL MIME for the upstream `File.file_data` allowlist.
 *  Values intentionally start with one of
 *  `SUPPORTED_FILE_DATA_MIME_PREFIXES`. */
export const NATIVE_FILE_EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
};

export type NativeFileInputErrorReason = "too-large" | "unsupported-type";

export class NativeFileInputError extends Error {
  readonly reason: NativeFileInputErrorReason;
  readonly sizeBytes?: number;
  readonly extension?: string;
  constructor(
    reason: NativeFileInputErrorReason,
    detail: { sizeBytes?: number; extension?: string } = {},
  ) {
    super(`native file input rejected: ${reason}`);
    this.name = "NativeFileInputError";
    this.reason = reason;
    this.sizeBytes = detail.sizeBytes;
    this.extension = detail.extension;
  }
}

/** Reads `file` as a canonical `file_data` data URL for a native `file`
 *  content part. Throws `NativeFileInputError` when the file exceeds the raw
 *  upload bound or its extension is outside the upstream allowlist. */
export async function readFileAsNativeFileDataUrl(
  file: File,
): Promise<string> {
  if (file.size > VENICE_MAX_RAW_UPLOAD_BYTES) {
    throw new NativeFileInputError("too-large", { sizeBytes: file.size });
  }
  const extension = (file.name.split(".").pop() ?? "").toLowerCase();
  const mime = NATIVE_FILE_EXTENSION_MIME[extension];
  if (!mime) {
    throw new NativeFileInputError("unsupported-type", { extension });
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
