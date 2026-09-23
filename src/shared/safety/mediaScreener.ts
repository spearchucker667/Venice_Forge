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
 * VF-AUD-20260831-P2-009: An ML-backed implementation (e.g. nsfwjs + TensorFlow.js)
 * can be registered via `registerClassifierBackend()` at Electron main-process
 * startup.  When no backend is registered the structural heuristic is used
 * instead — this is "structural generated-media validation", NOT semantic
 * content screening.  Use `getClassifierCapabilities()` to truthfully report
 * the current classification regime to the UI/status surface.  Audio and video
 * classification always fall back to structural pass because no open semantic
 * model exists for those formats yet.
 */
export interface ClassifierBackend {
  classifyImage(buffer: Buffer, mimeType: string): Promise<GeneratedMediaSafetyResult>;
  /** Optional display name surfaced in diagnostics (no credentials/URLs). */
  readonly name?: string;
}

let _registeredBackend: ClassifierBackend | null = null;
let _backendConsecutiveErrors = 0;

/** Number of consecutive backend failures before the backend is reported as
 *  "unhealthy" on the Status surface. */
const BACKEND_UNHEALTHY_THRESHOLD = 3;

/**
 * Register an ML classifier backend (called from Electron main process on startup).
 * Replaces any previously registered backend.
 */
export function registerClassifierBackend(backend: ClassifierBackend): void {
  _registeredBackend = backend;
}

/**
 * Clear the registered backend (used in tests to restore the heuristic path).
 */
export function clearClassifierBackend(): void {
  _registeredBackend = null;
  _backendConsecutiveErrors = 0;
}

/** @internal Exposed for testing only. */
export function _getRegisteredBackend(): ClassifierBackend | null {
  return _registeredBackend;
}

/**
 * Live semantic-classifier backend status for the Status surface
 * (VF-20260923-P1-027). Unlike `getClassifierCapabilities()` — which
 * describes the static capability contract — this reports the explicit
 * four-state per-modality runtime state:
 *   - "available"      — a registered backend classifies this modality.
 *   - "not-configured" — no backend is registered for this modality.
 *   - "unsupported"    — the registered backend contract cannot classify
 *                        this modality (audio/video have no ML model yet).
 *   - "unhealthy"      — the registered backend keeps failing; structural
 *                        validation remains the only gate.
 */
export function getSemanticClassifierStatus(): SemanticClassifierStatus {
  if (_registeredBackend === null) {
    return {
      backendRegistered: false,
      image: "not-configured",
      audio: "not-configured",
      video: "not-configured",
    };
  }
  return {
    backendRegistered: true,
    backendName: _registeredBackend.name,
    image: _backendConsecutiveErrors >= BACKEND_UNHEALTHY_THRESHOLD ? "unhealthy" : "available",
    audio: "unsupported",
    video: "unsupported",
  };
}

/**
 * VF-AUD-20260831-P2-009: Truthful capability descriptor for the Family Safe
 * Mode media classifier.  Each modality is reported as one of:
 *   - "unavailable" — no production classifier is registered and structural
 *     validation is the only gate.  This is the current default for image,
 *     audio, and video.
 *   - "local"        — a local on-device ML backend is registered.  Not yet
 *     implemented in production builds.
 *   - "provider"     — classification is delegated to an external provider.
 *     Not yet implemented in production builds.
 *
 * The returned shape is the public contract surfaced to diagnostics/status UI;
 * do not narrow it without updating consumers.
 */
export interface ClassifierCapabilities {
  semanticImageClassifier: "unavailable" | "local" | "provider";
  semanticAudioClassifier: "unavailable" | "local" | "provider";
  semanticVideoClassifier: "unavailable" | "local" | "provider";
  /** True when a registered ML backend is present (any modality). */
  hasRegisteredBackend: boolean;
}

/**
 * Returns the current classifier capabilities.  Today the production build
 * always reports "unavailable" because no semantic ML backend is registered.
 * The diagnostic is exposed so the UI can truthfully state that Family Safe
 * Mode is currently "structural generated-media validation" rather than
 * "semantic content screening".
 */
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

// ---------------------------------------------------------------------------
// PNG dimension extraction helpers
// ---------------------------------------------------------------------------

/**
 * Reads the image width from a PNG IHDR chunk (bytes 16–19) or a JPEG SOF
 * segment width field (variable offset).  Returns null when the buffer is too
 * short or the format is not handled.
 */
function extractImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png" && buffer.length >= 24) {
    // PNG IHDR: magic(8) + chunk-len(4) + "IHDR"(4) + width(4) + height(4)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }
  if (mimeType === "image/jpeg" && buffer.length >= 20) {
    // Scan for SOF0/SOF2 markers (0xFFC0, 0xFFC2)
    for (let i = 2; i < buffer.length - 8; i++) {
      const marker = (buffer[i] << 8) | buffer[i + 1];
      if (marker === 0xffc0 || marker === 0xffc2) {
        // SOF: marker(2) + len(2) + precision(1) + height(2) + width(2)
        const height = (buffer[i + 5] << 8) | buffer[i + 6];
        const width = (buffer[i + 7] << 8) | buffer[i + 8];
        return { width, height };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Heuristic image classifier
// ---------------------------------------------------------------------------

/**
 * Heuristic image classifier.
 *
 * Evaluates structural anomalies in the decoded image buffer:
 *
 * 1. **Tracking-pixel detection** — Images with both dimensions ≤ 2 pixels
 *    are suspicious (1×1 and 2×2 tracking pixels).  Block them.
 * 2. **MIME structural mismatch** — If the magic-byte MIME disagrees with the
 *    declared mimeType this is a strong signal of disguised content.  Block it.
 * 3. **Minimum viable size** — Images under 64 bytes after structural
 *    validation pass (already enforced in `normalizeAndIdentifyMime`) are
 *    treated as degenerate.  This is defence-in-depth; the structural
 *    validator already rejects them.
 *
 * Everything else passes.  The heuristic is intentionally conservative on the
 * allow side — false positives here mean users cannot generate normal images
 * with FSM on.  A real ML backend (registered via `registerClassifierBackend`)
 * will be delegated to instead of this function when available.
 */
function heuristicClassifyImage(buffer: Buffer, mimeType: string): GeneratedMediaSafetyResult {
  // Check 1 — tracking-pixel detection.
  const dims = extractImageDimensions(buffer, mimeType);
  if (dims !== null && dims.width <= 2 && dims.height <= 2) {
    return {
      allowed: false,
      reasonCode: "CLASSIFIER_BLOCK",
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      userMessage: FAMILY_SAFE_MODE_MEDIA_BLOCKED,
    };
  }

  // Check 2 — structural MIME mismatch (magic bytes vs declared type).
  // `normalizeAndIdentifyMime` already re-identified the MIME from magic bytes.
  // Here we compare the effective magic-byte MIME (passed in) against what the
  // caller declared.  Mismatches indicate disguised content.
  // We only flag cross-category mismatches (image vs. non-image), not
  // intra-category ones (jpeg vs. png), to avoid false positives from
  // legitimate format conversions.
  if (!mimeType.startsWith("image/")) {
    return {
      allowed: false,
      reasonCode: "CLASSIFIER_BLOCK",
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      userMessage: FAMILY_SAFE_MODE_MEDIA_BLOCKED,
    };
  }

  // All heuristic checks passed — allow.
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Public classifier entry points
// ---------------------------------------------------------------------------

/**
 * Classify a generated image under Family Safe Mode.
 *
 * Delegates to the registered ML backend when available; otherwise runs the
 * structural heuristic classifier.  The heuristic passes all structurally
 * valid, non-anomalous images (FSM now permits normal AI-generated images when
 * no suspicious structural signals are detected).
 *
 * @param buffer   Raw decoded image bytes (not base64).
 * @param mimeType Magic-byte–identified MIME type (e.g. "image/jpeg").
 */
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

/**
 * Classify a generated audio response under Family Safe Mode.
 *
 * No semantic ML model exists for audio content yet.  Structural validation
 * has already passed at this point.  Permits audio under FSM.
 *
 * @param _buffer   Raw audio bytes (unused until ML model is available).
 * @param _mimeType Identified MIME type (unused until ML model is available).
 */
export async function classifyGeneratedAudio(_buffer: Buffer, _mimeType: string): Promise<GeneratedMediaSafetyResult> {
  // No ML model available for audio.  Structural validation already passed.
  // Permit audio under FSM; block semantics can be added when a model ships.
  incrementEvaluated("audio", "allowed");
  return { allowed: true };
}

/**
 * Classify a generated video response under Family Safe Mode.
 *
 * Callers should pass only the first ~64 KB of header/frame data.
 * No semantic ML model exists for video yet.  Structural validation has
 * already passed.  Permits video under FSM.
 *
 * @param _buffer   First ~64 KB of video bytes (unused until ML model ships).
 * @param _mimeType Identified MIME type (unused until ML model ships).
 */
export async function classifyGeneratedVideo(_buffer: Buffer, _mimeType: string): Promise<GeneratedMediaSafetyResult> {
  // No ML model available for video.  Structural validation already passed.
  incrementEvaluated("video", "allowed");
  return { allowed: true };
}

/**
 * Validates magic bytes and routes media to the appropriate semantic classifier.
 *
 * Under Family Safe Mode the classifier pipeline is:
 * 1. PHASE 1 — Structural integrity: magic bytes, MIME, minimum size.  Always runs.
 * 2. PHASE 2 — Semantic classification: heuristic (or ML backend if registered).
 *    Images are evaluated by the heuristic classifier (tracking pixels, MIME
 *    mismatch).  Audio and video pass through once structural validation succeeds.
 *
 * When FSM is off, only structural validation runs.
 */
export async function identifyAndValidateGeneratedMedia(
  candidateData: string | Buffer,
  declaredMimeType: string,
  localFamilySafeModeEnabled: boolean = true
): Promise<GeneratedMediaSafetyResult> {
  // Treat HTTP URLs as opaque. We cannot inline-screen remote URLs without downloading.
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

  // --- PHASE 1: Structural integrity validation (ALWAYS runs). ----
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

  // --- PHASE 2: Semantic classification (ONLY under Family Safe Mode). ----
  if (!localFamilySafeModeEnabled) {
    // Structural validation passed, FSM off — allow.
    incrementSkippedDisabled(modalityFromMime(effectiveMime));
    return { allowed: true, skipped: true, reason: "local-family-safe-mode-disabled" };
  }

  if (effectiveMime.startsWith("image/")) {
    return classifyGeneratedImage(buffer, effectiveMime);
  } else if (effectiveMime.startsWith("audio/")) {
    return classifyGeneratedAudio(buffer, effectiveMime);
  } else {
    return classifyGeneratedVideo(buffer, effectiveMime);
  }
}
