/**
 * @fileoverview Typed interfaces and schemas for canonical Venice media operations.
 * Sourced directly from veniceai/api-docs swagger.yaml (Schema Version 20260814.194349).
 */

// ============================================================================
// Seedance Face-Media Consent Types
// ============================================================================

export interface SeedanceConsentObject {
  confirmed_terms_and_privacy: true;
  confirmed_legal_right: true;
  confirmed_screening_acknowledged: true;
}

export type FaceMediaRole = 'image' | 'end_image' | 'reference_image' | 'reference_video';

export interface SeedanceConsentChallenge {
  error: {
    code: 'needs_consent';
    message: string;
  };
  consent_flow: 'seedance';
  face_media_roles?: FaceMediaRole[];
  consent?: {
    consent_version?: string;
    policy_text?: string;
  };
  docs_url?: string;
}

// ============================================================================
// Quote and Approval Types
// ============================================================================

export type QuoteOperation = 'video' | 'audio';

export type QuoteApprovalState = 'approved' | 'claimed' | 'finalized' | 'released';

export interface QuoteApproval {
  id: string;
  operation: QuoteOperation;
  requestHash: string;
  quoteId?: string;
  quotedCostUsd: number;
  maxApprovedCostUsd: number;
  approvedAt: number;
  expiresAt: number;
  state: QuoteApprovalState;
  claimedAt?: number;
  finalizedAt?: number;
}

// ============================================================================
// Logical Request Inputs (App-Level)
// ============================================================================

export interface ImageGenerateLogicalRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  steps?: number;
  cfgScale?: number;
  stylePreset?: string;
  seed?: number | null;
  hideWatermark?: boolean;
  safeMode?: boolean;
  variants?: number;
  returnBinary?: boolean;
  enableWebSearch?: boolean;
  enhancePrompt?: boolean;
  disablePromptOptimizationThinking?: boolean;
  styleReferences?: Array<{
    image: string;
    strength?: number;
  }>;
}

export interface ImageEditLogicalRequest {
  model: string;
  prompt: string;
  image: string; // data URL, raw base64, or http(s) URL
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: 'jpeg' | 'png' | 'webp';
  safeMode?: boolean;
  enhancePrompt?: boolean;
  disablePromptOptimizationThinking?: boolean;
}

export interface ImageMultiEditLogicalRequest {
  modelId: string;
  prompt: string;
  images: string[]; // up to 3 images (base, layers/masks)
  aspectRatio?: string;
  outputFormat?: 'jpeg' | 'png' | 'webp';
  safeMode?: boolean;
  enhancePrompt?: boolean;
}

export interface ImageUpscaleLogicalRequest {
  image: string;
  scale?: 2 | 4;
  creativity?: number; // 0..0.02
}

export interface ImageBackgroundRemoveLogicalRequest {
  image?: string; // base64 or file
  imageUrl?: string; // http(s) url
}

export interface VideoQuoteLogicalRequest {
  model: string;
  /** Required by QuoteVideoRequest; e.g. "5s", "10s". */
  duration: string;
  resolution?: string;
  aspectRatio?: string;
  upscaleFactor?: 1 | 2 | 4;
  audio?: boolean;
  /** For upscale models, the video to upscale (required for auto-detect pricing). */
  videoUrl?: string;
  /** For R2V models: aggregate duration in seconds of all reference videos. */
  referenceVideoTotalDuration?: number;
}

/** Seedance 2.0 (incl. Fast) / 2.5 output encode bitrate per upstream
 *  guides/media/seedance-2-0.mdx — "standard" (default) or "high".
 *  Queue-only: `/video/quote` does not accept the field. */
export type VideoBitrateMode = 'standard' | 'high';

export const VIDEO_BITRATE_MODES: readonly VideoBitrateMode[] = ['standard', 'high'];

/** Queue `aspect_ratio` tokens that make Seedance 2.x R2V output match the
 *  source clip instead of a fixed ratio (swagger QueueVideoRequest enum;
 *  requires reference_video_urls). */
export const VIDEO_SOURCE_MATCHED_ASPECT_VALUES = ['adaptive', 'auto'] as const;

/** Queue `duration` tokens that make Seedance 2.5 R2V edit output match the
 *  source clip length instead of a fixed duration (swagger QueueVideoRequest
 *  enum; requires reference_video_urls, source must be 4–30s). */
export const VIDEO_SOURCE_MATCHED_DURATION_VALUES = ['-1', 'auto', 'Auto'] as const;

export function isVideoSourceMatchedAspectRatio(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (VIDEO_SOURCE_MATCHED_ASPECT_VALUES as readonly string[]).includes(value)
  );
}

export function isVideoSourceMatchedDuration(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (VIDEO_SOURCE_MATCHED_DURATION_VALUES as readonly string[]).includes(value)
  );
}

export interface VideoQueueLogicalRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  /** Required by QueueVideoRequest; e.g. "5s", "10s". */
  duration: string;
  resolution?: string; // "720p", "1080p"
  aspectRatio?: string; // "16:9", "9:16", "adaptive" (Seedance 2.x R2V, requires referenceVideoUrls)
  upscaleFactor?: 1 | 2 | 4;
  audio?: boolean;
  imageUrl?: string;
  endImageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceAudioUrls?: string[];
  sceneImageUrls?: string[];
  /** Seedance 2.0/2.5 only. "standard" equals omitting the field. */
  bitrateMode?: VideoBitrateMode;
  consents?: {
    seedance?: SeedanceConsentObject;
  };
}

export interface VideoRetrieveLogicalRequest {
  model: string;
  queueId: string;
  deleteMediaOnCompletion?: boolean;
}

export interface AudioQuoteLogicalRequest {
  model: string;
  durationSeconds?: number;
}

export interface AudioQueueLogicalRequest {
  model: string;
  prompt: string;
  durationSeconds?: number;
  forceInstrumental?: boolean;
  lyricsPrompt?: string;
  loop?: boolean;
  voice?: string;
  language?: string;
  speed?: number;
}

export interface AudioRetrieveLogicalRequest {
  model: string;
  queueId: string;
  deleteMediaOnCompletion?: boolean;
}

export interface AudioSpeechLogicalRequest {
  model: string;
  input: string;
  voice?: string;
  speed?: number;
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}

// ============================================================================
// Provider Wire Payloads (Matching swagger.yaml schemas)
// ============================================================================

export interface GenerateImageWirePayload {
  model: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  aspect_ratio?: string;
  resolution?: string;
  quality?: 'low' | 'medium' | 'high';
  steps?: number;
  cfg_scale?: number;
  style_preset?: string;
  seed?: number;
  hide_watermark?: boolean;
  safe_mode?: boolean;
  variants?: number;
  return_binary?: boolean;
  enable_web_search?: boolean;
  enhance_prompt?: boolean;
  disable_prompt_optimization_thinking?: boolean;
  format?: 'jpeg' | 'png' | 'webp';
  style_references?: Array<{
    image: string;
    strength?: number;
  }>;
}

export interface EditImageWirePayload {
  image: string;
  prompt: string;
  model: string;
  aspect_ratio?: string;
  resolution?: string;
  output_format?: 'jpeg' | 'png' | 'webp';
  safe_mode?: boolean;
  enhance_prompt?: boolean;
  disable_prompt_optimization_thinking?: boolean;
}

export interface MultiEditImageWirePayload {
  modelId: string;
  prompt: string;
  images: string[];
  aspect_ratio?: string;
  output_format?: 'jpeg' | 'png' | 'webp';
  safe_mode?: boolean;
  enhance_prompt?: boolean;
}

export interface UpscaleImageWirePayload {
  image: string;
  scale?: number;
  creativity?: number;
}

export interface BackgroundRemoveWirePayload {
  image?: string;
  image_url?: string;
}

export interface VideoQuoteWirePayload {
  model: string;
  duration: string;
  resolution?: string;
  aspect_ratio?: string;
  upscale_factor?: 1 | 2 | 4;
  audio?: boolean;
  video_url?: string;
  reference_video_total_duration?: number;
}

export interface VideoQueueWirePayload {
  model: string;
  prompt: string;
  negative_prompt?: string;
  duration: string;
  resolution?: string;
  aspect_ratio?: string;
  upscale_factor?: 1 | 2 | 4;
  audio?: boolean;
  image_url?: string;
  end_image_url?: string;
  audio_url?: string;
  video_url?: string;
  reference_image_urls?: string[];
  reference_video_urls?: string[];
  reference_audio_urls?: string[];
  scene_image_urls?: string[];
  consents?: {
    seedance?: {
      confirmed_terms_and_privacy: boolean;
      confirmed_legal_right: boolean;
      confirmed_screening_acknowledged: boolean;
    };
  };
  /** Seedance 2.0/2.5 only; queue-only encoding option, does not change price.
   *  "standard" is the upstream default and is omitted from the wire. */
  bitrate_mode?: VideoBitrateMode;
}

export interface VideoRetrieveWirePayload {
  model: string;
  queue_id: string;
  delete_media_on_completion?: boolean;
}

export interface AudioQuoteWirePayload {
  model: string;
  duration_seconds?: number;
}

export interface AudioQueueWirePayload {
  model: string;
  prompt: string;
  duration_seconds?: number;
  force_instrumental?: boolean;
  lyrics_prompt?: string;
  loop?: boolean;
  voice?: string;
  /** ISO 639-1 language code per QueueAudioRequest.language_code. */
  language_code?: string;
  speed?: number;
}

export interface AudioRetrieveWirePayload {
  model: string;
  queue_id: string;
  delete_media_on_completion?: boolean;
}

export interface AudioSpeechWirePayload {
  model: string;
  input: string;
  voice?: string;
  speed?: number;
  response_format?: string;
}

// ============================================================================
// Response DTOs
// ============================================================================

export interface ImageGenerateResponseDto {
  images: Array<string | { b64_json?: string; url?: string }>;
  created?: number;
}

export interface VideoQuoteResponseDto {
  quote?: number;
  price?: number;
  cost?: number;
}

export interface VideoQueueResponseDto {
  model: string;
  queue_id: string;
  id?: string;
  status?: string;
  download_url?: string;
}

export interface VideoRetrieveResponseDto {
  status?: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  percentage?: number;
  download_url?: string;
  url?: string;
  error?: string;
}

export interface AudioQuoteResponseDto {
  quote: number;
}

export interface AudioQueueResponseDto {
  model: string;
  queue_id: string;
  id?: string;
  status?: string;
}

export interface AudioRetrieveResponseDto {
  status?: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  error?: string;
  url?: string;
  data?: string;
}
