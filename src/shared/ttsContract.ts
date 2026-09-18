/**
 * @fileoverview Typed contract for the Text-to-Speech pipeline.
 *
 * The previous implementation used a wide object with optional fields plus
 * a boolean `ok` flag, which conflated policy denials (HTTP 402),
 * provider rejections (HTTP 400), invalid audio bytes, transport failures,
 * and browser-side playback errors into the same "TTS error" condition.
 *
 * This discriminated union lets callers branch on the **specific** failure
 * class — useful both for end-user messaging and for the application's
 * telemetry/observability layer.
 */

/** Failure code taxonomy for TTS synthesis and playback. */
export type SpeechFailureCode =
  | "PROVIDER_HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "INVALID_AUDIO"
  | "EMPTY_AUDIO"
  | "POLICY_BLOCK"
  | "RATE_LIMIT"
  | "BILLING_REQUIRED"
  | "NETWORK_ERROR"
  | "ABORTED"
  | "PLAYBACK_ERROR"
  | "CACHE_ERROR"
  | "UNSUPPORTED_MODEL";

/** Structured failure detail attached to unsuccessful SpeechResult variants. */
export interface SpeechFailureDetail {
  code: SpeechFailureCode;
  status?: number;
  message: string;
  /** Optional upstream provider error code (e.g., Venice-specific token). */
  providerCode?: string;
  /** Whether the caller can retry this exact request without changing inputs. */
  retryable?: boolean;
}

export type SpeechResult =
  | {
      ok: true;
      /** Source playable URL (renderer-only object URL or venice-tts:// custom protocol). */
      sourceUrl: string;
      /** Detected MIME type of the audio bytes. */
      mimeType: string;
      /** Audio byte count (after decoding from base64 / streaming the blob). */
      bytes: number;
      /** Whether the bytes were served from the main-process profile cache. */
      cached: boolean;
      /** Optional profile id when serving from cache. */
      profileId?: string;
      /** Optional cache id when persisting for later reuse. */
      cacheId?: string;
    }
  | {
      ok: false;
      failure: SpeechFailureDetail;
    };

/** Construct a successful SpeechResult. */
export function speechResultOk(input: {
  sourceUrl: string;
  mimeType: string;
  bytes: number;
  cached: boolean;
  profileId?: string;
  cacheId?: string;
}): SpeechResult {
  return {
    ok: true,
    sourceUrl: input.sourceUrl,
    mimeType: input.mimeType,
    bytes: input.bytes,
    cached: input.cached,
    profileId: input.profileId,
    cacheId: input.cacheId,
  };
}

/** Construct a failed SpeechResult with structured detail. */
export function speechResultFail(
  code: SpeechFailureCode,
  message: string,
  extra: { status?: number; providerCode?: string; retryable?: boolean } = {},
): SpeechResult {
  return {
    ok: false,
    failure: {
      code,
      message,
      status: extra.status,
      providerCode: extra.providerCode,
      retryable: extra.retryable,
    },
  };
}

/**
 * Maps an HTTP status code (if known) to the most specific SpeechFailureCode.
 * The mapping is intentionally conservative — when in doubt, fall through to
 * PROVIDER_HTTP_ERROR and let the caller surface the raw status.
 */
export function mapHttpStatusToFailureCode(status?: number): SpeechFailureCode {
  if (status === undefined) return "PROVIDER_HTTP_ERROR";
  if (status === 402 || status === 403) return "POLICY_BLOCK";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "NETWORK_ERROR";
  return "PROVIDER_HTTP_ERROR";
}
