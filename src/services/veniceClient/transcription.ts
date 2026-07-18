/**
 * @fileoverview Canonical client-side contract for POST /audio/transcriptions.
 *
 * The Swagger `CreateTranscriptionRequestSchema`
 * (docs/reference/Venice_swagger_api.yaml) restricts the `model` field to a
 * fixed enum and the `file` field to a fixed set of audio container MIME
 * types. The renderer MUST validate both before issuing the request —
 * shipping an unknown model slug or unsupported container routes the
 * request to the upstream 400 path with no useful debug surface.
 *
 * This module exports the allowlist constants and a single
 * `buildTranscriptionFormData` helper that:
 *   1. Validates the optional `model` against `VENICE_TRANSCRIPTION_MODELS`
 *      and falls back to the canonical default.
 *   2. Validates the incoming `File` MIME type against
 *      `VENICE_TRANSCRIPTION_AUDIO_FORMATS`. Unknown extensions are mapped
 *      via `AUDIO_EXTENSION_TO_FORMAT` (e.g. `.wav → audio/wav`).
 *   3. Appends safe defaults for `response_format` and `timestamps` when
 *      the caller does not provide them.
 *
 * The helper returns a Web `FormData` instance so the caller can stream it
 * to either `veniceFormData()` (raw FormData, web mode) or
 * `serializeFormData()` (Electron IPC bridge).
 */

export const VENICE_TRANSCRIPTION_DEFAULT_MODEL = "nvidia/parakeet-tdt-0.6b-v3";

/**
 * Closed allowlist of `model` slugs accepted by /audio/transcriptions.
 * Sourced directly from the Swagger `CreateTranscriptionRequestSchema.model.enum`.
 * Do not add slugs without first verifying them against
 * docs/reference/Venice_swagger_api.yaml.
 */
export const VENICE_TRANSCRIPTION_MODELS: readonly string[] = [
  "nvidia/parakeet-tdt-0.6b-v3",
  "openai/whisper-large-v3",
  "fal-ai/wizper",
  "elevenlabs/scribe-v2",
  "stt-xai-v1",
] as const;

/**
 * `file` field MIME type allowlist for /audio/transcriptions.
 * Mirrors the Swagger `CreateTranscriptionRequestSchema.file` description.
 * Order is intentional; the lookup helpers are case-insensitive.
 */
export const VENICE_TRANSCRIPTION_AUDIO_FORMATS: readonly string[] = [
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
  "audio/mp4",
  "audio/aac",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/oga",
  "audio/webm",
] as const;

/**
 * Maps well-known audio container file extensions to the Swagger
 * `audio/*` form MIME types. Used as a fallback when the browser's
 * `File.type` is empty (e.g. `.wav` recordings on some platforms).
 */
export const AUDIO_EXTENSION_TO_FORMAT: Record<string, string> = {
  ".wav": "audio/wav",
  ".wave": "audio/wav",
  ".flac": "audio/flac",
  ".m4a": "audio/m4a",
  ".aac": "audio/aac",
  ".mp4": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".oga": "audio/oga",
  ".webm": "audio/webm",
};

export const VENICE_TRANSCRIPTION_RESPONSE_FORMATS: readonly string[] = [
  "json",
  "text",
] as const;

export type VeniceTranscriptionResponseFormat =
  (typeof VENICE_TRANSCRIPTION_RESPONSE_FORMATS)[number];

export interface BuildTranscriptionFormDataOptions {
  /** Audio file. Must be a `File`, `Blob`, or `{ name, type }`. */
  file: File | Blob | { name: string; type?: string };
  /** Optional model slug; defaults to the Swagger canonical default. */
  model?: string;
  /** Optional output format. Defaults to `json`. */
  response_format?: VeniceTranscriptionResponseFormat;
  /** Optional ISO 639-1 hint (Whisper family only; ignored otherwise). */
  language?: string;
  /** Optional timestamp flag. Defaults to `false`. */
  timestamps?: boolean;
}

/** Error thrown by `buildTranscriptionFormData` for invalid inputs. */
export class TranscriptionInputError extends Error {
  readonly reason:
    | "invalid-model"
    | "invalid-format"
    | "missing-file";
  constructor(reason: TranscriptionInputError["reason"], message: string) {
    super(message);
    this.name = "TranscriptionInputError";
    this.reason = reason;
  }
}

function lookupFormat(file: BuildTranscriptionFormDataOptions["file"]): string | null {
  const rawType = (file as { type?: string }).type ?? "";
  if (rawType) {
    const lower = rawType.toLowerCase();
    if ((VENICE_TRANSCRIPTION_AUDIO_FORMATS as readonly string[]).includes(lower)) {
      return lower;
    }
  }
  const name = (file as { name?: string }).name ?? "";
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx < 0) return null;
  const ext = name.slice(dotIdx).toLowerCase();
  return AUDIO_EXTENSION_TO_FORMAT[ext] ?? null;
}

/**
 * Builds a Web `FormData` instance ready for `/audio/transcriptions`.
 *
 * - Validates the model against `VENICE_TRANSCRIPTION_MODELS`. Empty / whitespace
 *   overrides silently fall back to the canonical default so a stale UI selection
 *   never blocks the request. Non-empty unknown slugs throw
 *   `TranscriptionInputError("invalid-model", …)` because shipping an unknown
 *   slug to Venice produces an upstream 400 with no useful debug surface.
 * - Validates the file MIME (or extension) against
 *   `VENICE_TRANSCRIPTION_AUDIO_FORMATS`. If neither matches, throws
 *   `TranscriptionInputError("invalid-format", …)` so the caller can
 *   surface a real error message instead of letting the upstream 400
 *   hit the user.
 * - Appends `model`, `response_format` (default `json`), `timestamps`
 *   (default `false`), and optional `language` keys BEFORE the `file`
 *   entry so the multipart stream stays valid.
 */
export function buildTranscriptionFormData(
  options: BuildTranscriptionFormDataOptions,
): FormData {
  if (!options.file) {
    throw new TranscriptionInputError("missing-file", "Audio file is required.");
  }

  const format = lookupFormat(options.file);
  if (!format) {
    const name = (options.file as { name?: string }).name ?? "<unknown>";
    throw new TranscriptionInputError(
      "invalid-format",
      `Audio file "${name}" is not in the /audio/transcriptions container allowlist ` +
        `(WAV, WAVE, FLAC, M4A, AAC, MP4, MP3, OGG, OGA, WEBM).`,
    );
  }

  const requestedModel = options.model?.trim();
  const allowlistedModel =
    requestedModel &&
    (VENICE_TRANSCRIPTION_MODELS as readonly string[]).includes(requestedModel)
      ? requestedModel
      : VENICE_TRANSCRIPTION_DEFAULT_MODEL;
  if (requestedModel && requestedModel !== allowlistedModel) {
    throw new TranscriptionInputError(
      "invalid-model",
      `Transcription model "${requestedModel}" is not in the Swagger allowlist; ` +
        `falling back to "${VENICE_TRANSCRIPTION_DEFAULT_MODEL}".`,
    );
  }

  const responseFormat: VeniceTranscriptionResponseFormat =
    options.response_format &&
    (VENICE_TRANSCRIPTION_RESPONSE_FORMATS as readonly string[]).includes(
      options.response_format,
    )
      ? options.response_format
      : "json";

  const form = new FormData();
  if (options.language && options.language.trim()) {
    form.append("language", options.language.trim());
  }
  form.append("model", allowlistedModel);
  form.append("response_format", responseFormat);
  form.append("timestamps", String(Boolean(options.timestamps)));
  form.append("file", options.file as Blob);
  return form;
}
