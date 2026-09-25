import { FSM_MEDIA_MAX_IMAGE_BYTES } from "../limits";
import {
  incrementEvaluated,
  incrementSkippedDisabled,
  incrementStructuralRejected,
  incrementStructuralValidated,
} from "./safetyCounters";
import type { SemanticClassifierStatus } from "./safetyRuntimeStatus";

export type GeneratedMediaSafetyResult =
  | { allowed: true; skipped?: boolean; reason?: string }
  | {
      allowed: false;
      reasonCode: "INVALID_MEDIA" | "UNSUPPORTED_MEDIA" | "CLASSIFIER_UNAVAILABLE" | "CLASSIFIER_BLOCK";
      category: string;
      userMessage?: string;
    };

/** Maps a MIME type to its semantic screening modality, when known. */
function modalityFromMime(mimeType: string): "image" | "audio" | "video" | undefined {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return undefined;
}

/** Minimum sensible byte count for each recognized media format. */
const MIN_BYTES_BY_MIME: Record<string, number> = {
  "image/jpeg": 3,
  "image/png": 4,
  "image/webp": 12,
  "image/gif": 4,
  "audio/mpeg": 4,
  "video/mp4": 8,
  "audio/ogg": 4,
  "audio/aac": 7,
  "audio/flac": 4,
  "audio/wav": 12,
  "audio/pcm": 1,
};

function normalizeDeclaredMime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.split(";")[0].trim().toLowerCase();
}

/**
 * Normalizes a base64 string, data URI, or raw Buffer into raw bytes for magic-byte
 * checking, and extracts the MIME type.
 */
export function normalizeAndIdentifyMime(
  candidate: string | Buffer,
  declaredMimeType?: string,
): { mime: string | null; valid: boolean; buffer: Buffer } {
  let buffer: Buffer;

  if (Buffer.isBuffer(candidate)) {
    buffer = candidate;
  } else {
    let b64 = candidate;
    const match = candidate.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      b64 = match[2];
    }

    // Ignore HTTP URLs for inline parsing
    if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
      return { mime: null, valid: false, buffer: Buffer.alloc(0) };
    }

    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return { mime: null, valid: false, buffer: Buffer.alloc(0) };
    }
  }

  if (buffer.length === 0) {
    return { mime: null, valid: false, buffer };
  }

  // PCM has no reliable magic bytes. It comes from a trusted endpoint
  // (/audio/speech), so accept it when the declared MIME matches and the
  // buffer is non-empty.
  const declared = normalizeDeclaredMime(declaredMimeType);
  if (declared === "audio/pcm") {
    return { mime: "audio/pcm", valid: true, buffer };
  }

  if (buffer.length < 3) {
    return { mime: null, valid: false, buffer };
  }

  const prefix = buffer.slice(0, 32);
  const asValid = (mime: string) => ({
    mime,
    valid: buffer.length >= (MIN_BYTES_BY_MIME[mime] ?? 1),
    buffer,
  });

  if (prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) {
    return asValid("image/jpeg");
  }

  if (buffer.length < 4) {
    return { mime: "application/octet-stream", valid: false, buffer };
  }
  if (prefix[0] === 0x89 && prefix[1] === 0x50 && prefix[2] === 0x4e && prefix[3] === 0x47) {
    return asValid("image/png");
  }
  if (prefix[0] === 0x52 && prefix[1] === 0x49 && prefix[2] === 0x46 && prefix[3] === 0x46) {
    if (buffer.length >= 12 && prefix[8] === 0x57 && prefix[9] === 0x45 && prefix[10] === 0x42 && prefix[11] === 0x50) {
      return asValid("image/webp");
    }
  }
  if (prefix[0] === 0x47 && prefix[1] === 0x49 && prefix[2] === 0x46 && prefix[3] === 0x38) {
    return asValid("image/gif");
  }

  // Audio/Video logic
  if (prefix[0] === 0x49 && prefix[1] === 0x44 && prefix[2] === 0x33) {
    return asValid("audio/mpeg"); // MP3 ID3
  }
  // MP3 without ID3 header: MPEG sync word (0xffe0 or 0xfffe pattern) with a
  // non-reserved layer (AAC ADTS uses 12-bit sync and layer bits == 00).
  if (prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0 && (prefix[1] & 0x06) !== 0x00) {
    return asValid("audio/mpeg");
  }
  // Basic MP4 signature check (ftyp)
  if (buffer.length >= 8 && prefix[4] === 0x66 && prefix[5] === 0x74 && prefix[6] === 0x79 && prefix[7] === 0x70) {
    return asValid("video/mp4");
  }
  // Ogg container (Opus, Vorbis, Theora, etc.) — OggS
  if (prefix[0] === 0x4f && prefix[1] === 0x67 && prefix[2] === 0x67 && prefix[3] === 0x53) {
    return asValid("audio/ogg");
  }
  // AAC ADTS: 0xfff0..0xffff sync word family (12-bit sync + 4-bit ID/layer/protection)
  if (prefix[0] === 0xff && (prefix[1] & 0xf0) === 0xf0 && (prefix[1] & 0x06) === 0x00) {
    // MPEG sync words were already matched above; AAC ADTS has layer bits == 00.
    return asValid("audio/aac");
  }
  // Basic FLAC signature
  if (prefix[0] === 0x66 && prefix[1] === 0x4c && prefix[2] === 0x61 && prefix[3] === 0x43) {
    return asValid("audio/flac");
  }
  // Basic WAV (RIFF...WAVE)
  if (prefix[0] === 0x52 && prefix[1] === 0x49 && prefix[2] === 0x46 && prefix[3] === 0x46 &&
      buffer.length >= 12 && prefix[8] === 0x57 && prefix[9] === 0x41 && prefix[10] === 0x56 && prefix[11] === 0x45) {
    return asValid("audio/wav");
  }

  return { mime: "application/octet-stream", valid: false, buffer };
}

/**
 * ClassifierBackend — optional interface for a real semantic classifier.
 *
 * VF-AUD-20260831-P2-009: An ML-backed implementation can be registered via
 * `registerClassifierBackend()` at Electron main-process startup. When no
 * backend is registered the structural heuristic is used instead — this is
 * structural generated-media validation, NOT semantic content screening.
 */
export interface ClassifierBackend {
  classifyImage(buffer: Buffer, mimeType: string): Promise<GeneratedMediaSafetyResult>;
  /** Optional display name surfaced in diagnostics (no credentials/URLs). */
  readonly name?: string;
}

let _registeredBackend: ClassifierBackend | null = null;
let _backendConsecutiveErrors = 0;
const BACKEND_UNHEALTHY_THRESHOLD = 3;

export function registerClassifierBackend(backend: ClassifierBackend): void {
  _registeredBackend = backend;
}

export function clearClassifierBackend(): void {
  _registeredBackend = null;
  _backendConsecutiveErrors = 0;
}

/** @internal Exposed for testing only. */
export function _getRegisteredBackend(): ClassifierBackend | null {
  return _registeredBackend;
}

export function getSemanticClassifierStatus(): SemanticClassifierStatus {
  if (_registeredBackend === null) {
    return { backendRegistered: false, image: "not-configured", audio: "not-configured", video: "not-configured" };
  }
  return {
    backendRegistered: true,
    backendName: _registeredBackend.name,
    image: _backendConsecutiveErrors >= BACKEND_UNHEALTHY_THRESHOLD ? "unhealthy" : "available",
    audio: "unsupported",
    video: "unsupported",
  };
}

export interface ClassifierCapabilities {
  semanticImageClassifier: "unavailable" | "local" | "provider";
  semanticAudioClassifier: "unavailable" | "local" | "provider";
  semanticVideoClassifier: "unavailable" | "local" | "provider";
  hasRegisteredBackend: boolean;
}

export function getClassifierCapabilities(): ClassifierCapabilities {
  const hasRegisteredBackend = _registeredBackend !== null;
  return {
    semanticImageClassifier: hasRegisteredBackend ? "local" : "unavailable",
    semanticAudioClassifier: "unavailable",
    semanticVideoClassifier: "unavailable",
    hasRegisteredBackend,
  };
}

const FAMILY_SAFE_MODE_MEDIA_BLOCKED =
  "Media generation is not available while Family Safe Mode is enabled.";

function extractImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === "image/jpeg" && buffer.length >= 20) {
    for (let i = 2; i < buffer.length - 8; i++) {
      const marker = (buffer[i] << 8) | buffer[i + 1];
      if (marker === 0xffc0 || marker === 0xffc2) {
        const height = (buffer[i + 5] << 8) | buffer[i + 6];
        const width = (buffer[i + 7] << 8) | buffer[i + 8];
        return { width, height };
      }
    }
  }
  return null;
}

function heuristicClassifyImage(buffer: Buffer, mimeType: string): GeneratedMediaSafetyResult {
  const dims = extractImageDimensions(buffer, mimeType);
  if (dims !== null && dims.width <= 2 && dims.height <= 2) {
    return {
      allowed: false,
      reasonCode: "CLASSIFIER_BLOCK",
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      userMessage: FAMILY_SAFE_MODE_MEDIA_BLOCKED,
    };
  }
  if (!mimeType.startsWith("image/")) {
    return {
      allowed: false,
      reasonCode: "CLASSIFIER_BLOCK",
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      userMessage: FAMILY_SAFE_MODE_MEDIA_BLOCKED,
    };
  }
  return { allowed: true };
}

export async function classifyGeneratedImage(buffer: Buffer, mimeType: string): Promise<GeneratedMediaSafetyResult> {
  if (_registeredBackend) {
    try {
      const result = await _registeredBackend.classifyImage(buffer, mimeType);
      _backendConsecutiveErrors = 0;
      incrementEvaluated("image", result.allowed ? "allowed" : "blocked");
      return result;
    } catch (err) {
      _backendConsecutiveErrors++;
      incrementEvaluated("image", "error");
      throw err;
    }
  }
  const result = heuristicClassifyImage(buffer, mimeType);
  incrementEvaluated("image", result.allowed ? "allowed" : "blocked");
  return result;
}

export async function classifyGeneratedAudio(_buffer: Buffer, _mimeType: string): Promise<GeneratedMediaSafetyResult> {
  incrementEvaluated("audio", "allowed");
  return { allowed: true };
}

export async function classifyGeneratedVideo(_buffer: Buffer, _mimeType: string): Promise<GeneratedMediaSafetyResult> {
  incrementEvaluated("video", "allowed");
  return { allowed: true };
}

/**
 * Validates magic bytes and routes media to the appropriate classifier.
 * Structural validation always runs; semantic image checks run only while
 * Family Safe Mode is enabled.
 */
export async function identifyAndValidateGeneratedMedia(
  candidateData: string | Buffer,
  declaredMimeType: string,
  localFamilySafeModeEnabled: boolean = true,
): Promise<GeneratedMediaSafetyResult> {
  if (typeof candidateData === "string" && (candidateData.startsWith("http://") || candidateData.startsWith("https://"))) {
    if (!localFamilySafeModeEnabled) {
      incrementSkippedDisabled(modalityFromMime(declaredMimeType));
      return { allowed: true, skipped: true, reason: "remote-url-not-screened" };
    }
    return {
      allowed: false,
      reasonCode: "CLASSIFIER_UNAVAILABLE",
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      userMessage: FAMILY_SAFE_MODE_MEDIA_BLOCKED,
    };
  }

  incrementStructuralValidated();
  const { valid, mime, buffer } = normalizeAndIdentifyMime(candidateData, declaredMimeType);
  if (!valid) {
    incrementStructuralRejected();
    return {
      allowed: false,
      reasonCode: "INVALID_MEDIA",
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      userMessage: "The generated media format is invalid or corrupted.",
    };
  }

  const effectiveMime = mime || declaredMimeType;
  if (!effectiveMime.startsWith("image/") && !effectiveMime.startsWith("audio/") && !effectiveMime.startsWith("video/")) {
    incrementStructuralRejected();
    return {
      allowed: false,
      reasonCode: "UNSUPPORTED_MEDIA",
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      userMessage: "The generated media format is unsupported by the safety filter.",
    };
  }

  if (!localFamilySafeModeEnabled) {
    incrementSkippedDisabled(modalityFromMime(effectiveMime));
    return { allowed: true, skipped: true, reason: "local-family-safe-mode-disabled" };
  }

  if (effectiveMime.startsWith("image/")) return classifyGeneratedImage(buffer, effectiveMime);
  if (effectiveMime.startsWith("audio/")) return classifyGeneratedAudio(buffer, effectiveMime);
  return classifyGeneratedVideo(buffer, effectiveMime);
}

/**
 * Validates and screens the documented /images/generations JSON envelope.
 * Remote URLs fail closed because this boundary must not fetch provider URLs.
 */
export async function identifyAndValidateOpenAiImageGenerationResponse(
  response: unknown,
): Promise<GeneratedMediaSafetyResult> {
  const invalidEnvelope: GeneratedMediaSafetyResult = {
    allowed: false,
    reasonCode: "INVALID_MEDIA",
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    userMessage: "Generated image response could not be screened.",
  };
  const classifierUnavailable: GeneratedMediaSafetyResult = {
    allowed: false,
    reasonCode: "CLASSIFIER_UNAVAILABLE",
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    userMessage: FAMILY_SAFE_MODE_MEDIA_BLOCKED,
  };
  const maxBase64Chars = 4 * Math.ceil(FSM_MEDIA_MAX_IMAGE_BYTES / 3);
  const maxDataUrlChars = maxBase64Chars + 64;
  const maxResponseItems = 32;
  const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const validBase64 = (value: string): boolean => {
    if (!value || value.length > maxBase64Chars || value.length % 4 !== 0 || !base64Pattern.test(value)) return false;
    const paddingBytes = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
    const decodedLength = (value.length / 4) * 3 - paddingBytes;
    if (!Number.isInteger(decodedLength) || decodedLength <= 0 || decodedLength > FSM_MEDIA_MAX_IMAGE_BYTES) return false;
    const lastSextet = base64Alphabet.indexOf(value[value.length - paddingBytes - 1]);
    if (paddingBytes === 2 && (lastSextet & 0x0f) !== 0) return false;
    if (paddingBytes === 1 && (lastSextet & 0x03) !== 0) return false;
    return true;
  };
  const decodeImage = (base64: string, declaredMime?: string): { buffer: Buffer; mime: string } | null => {
    if (!validBase64(base64)) return null;
    const paddingBytes = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const decodedLength = (base64.length / 4) * 3 - paddingBytes;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length !== decodedLength) return null;
    const identified = normalizeAndIdentifyMime(buffer, declaredMime);
    if (
      !identified.valid ||
      identified.buffer.length > FSM_MEDIA_MAX_IMAGE_BYTES ||
      !identified.mime?.startsWith("image/") ||
      (declaredMime && identified.mime !== declaredMime.toLowerCase())
    ) return null;
    return { buffer: identified.buffer, mime: identified.mime };
  };
  const screenImage = async (base64: string, declaredMime?: string): Promise<GeneratedMediaSafetyResult> => {
    const image = decodeImage(base64, declaredMime);
    if (!image) return invalidEnvelope;
    try {
      return await identifyAndValidateGeneratedMedia(image.buffer, image.mime, true);
    } catch {
      return classifierUnavailable;
    }
  };
  const screenCandidate = async (field: "b64_json" | "url", candidate: string): Promise<GeneratedMediaSafetyResult> => {
    if (field === "b64_json") return screenImage(candidate);
    if (/^https?:\/\//i.test(candidate)) {
      if (candidate.length > 8_192) return invalidEnvelope;
      return classifierUnavailable;
    }
    if (candidate.length > maxDataUrlChars) return invalidEnvelope;
    const dataUrlPrefix = /^data:(image\/[a-z0-9.+-]{1,32});base64,/i.exec(candidate);
    if (!dataUrlPrefix) return invalidEnvelope;
    return screenImage(candidate.slice(dataUrlPrefix[0].length), dataUrlPrefix[1].toLowerCase());
  };

  if (typeof response !== "object" || response === null || Array.isArray(response)) return invalidEnvelope;
  const envelope = response as Record<string, unknown>;
  if (
    !Number.isInteger(envelope.created) ||
    !Array.isArray(envelope.data) ||
    envelope.data.length === 0 ||
    envelope.data.length > maxResponseItems ||
    Object.keys(envelope).some((key) => key !== "created" && key !== "data")
  ) return invalidEnvelope;

  for (const item of envelope.data) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return invalidEnvelope;
    const image = item as Record<string, unknown>;
    const candidateFields = Object.keys(image);
    if (
      candidateFields.length !== 1 ||
      (candidateFields[0] !== "b64_json" && candidateFields[0] !== "url")
    ) return invalidEnvelope;
    const field = candidateFields[0] as "b64_json" | "url";
    const candidate = image[field];
    if (typeof candidate !== "string" || candidate.length === 0) return invalidEnvelope;
    const screened = await screenCandidate(field, candidate);
    if (!screened.allowed) return screened;
  }

  return { allowed: true };
}
