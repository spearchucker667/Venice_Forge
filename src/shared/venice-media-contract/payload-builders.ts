/**
 * @fileoverview Canonical payload builders for all Venice media operations.
 * Enforces strict field allowlists, mutual exclusivity of sizing modes,
 * parameter clamping, and exact upstream field naming.
 */

import { applyVeniceApiSafeMode } from '../veniceSafeMode';
import type {
  AudioQueueLogicalRequest,
  AudioQueueWirePayload,
  AudioQuoteLogicalRequest,
  AudioQuoteWirePayload,
  AudioRetrieveLogicalRequest,
  AudioRetrieveWirePayload,
  AudioSpeechLogicalRequest,
  AudioSpeechWirePayload,
  BackgroundRemoveWirePayload,
  EditImageWirePayload,
  GenerateImageWirePayload,
  ImageBackgroundRemoveLogicalRequest,
  ImageEditLogicalRequest,
  ImageGenerateLogicalRequest,
  ImageMultiEditLogicalRequest,
  ImageUpscaleLogicalRequest,
  MultiEditImageWirePayload,
  UpscaleImageWirePayload,
  VideoQueueLogicalRequest,
  VideoQueueWirePayload,
  VideoQuoteLogicalRequest,
  VideoQuoteWirePayload,
  VideoRetrieveLogicalRequest,
  VideoRetrieveWirePayload,
} from './types';
import { isVideoSourceMatchedAspectRatio, isVideoSourceMatchedDuration } from './types';

// Hard limits per upstream swagger.yaml
export const MIN_IMAGE_DIMENSION = 64;
export const MAX_IMAGE_DIMENSION = 1280;
export const IMAGE_DIMENSION_DIVISOR = 64;
export const MIN_VARIANTS = 1;
export const MAX_VARIANTS = 4;
export const MIN_SEED = -999999999;
export const MAX_SEED = 999999999;
export const MAX_PROMPT_CHARS = 32768;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampDimension(value: unknown, fallback = 1024): number {
  const n = clampInt(value, MIN_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, fallback);
  return Math.round(n / IMAGE_DIMENSION_DIVISOR) * IMAGE_DIMENSION_DIVISOR;
}

function cleanString(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanRequiredString(val: unknown, fieldName: string): string {
  const cleaned = cleanString(val);
  if (!cleaned) throw new Error(`${fieldName} is required and cannot be empty.`);
  return cleaned;
}

// ============================================================================
// Image Operation Builders
// ============================================================================

export function buildCanonicalImageGeneratePayload(
  req: ImageGenerateLogicalRequest,
): GenerateImageWirePayload {
  const model = cleanRequiredString(req.model, 'model');
  const prompt = cleanRequiredString(req.prompt, 'prompt').slice(0, MAX_PROMPT_CHARS);

  const payload: GenerateImageWirePayload = {
    model,
    prompt,
    hide_watermark: req.hideWatermark ?? false,
    return_binary: req.returnBinary ?? false,
    format: 'png',
  };

  const negative = cleanString(req.negativePrompt);
  if (negative) payload.negative_prompt = negative.slice(0, MAX_PROMPT_CHARS);

  // Sizing mode: strict mutual exclusivity
  const aspectRatio = cleanString(req.aspectRatio);
  if (aspectRatio) {
    payload.aspect_ratio = aspectRatio;
    const resolution = cleanString(req.resolution);
    if (resolution) payload.resolution = resolution;
  } else {
    payload.width = clampDimension(req.width, 1024);
    payload.height = clampDimension(req.height, 1024);
  }

  if (req.quality && req.quality !== 'auto') {
    payload.quality = req.quality;
  }

  if (req.steps !== undefined) {
    payload.steps = clampInt(req.steps, 1, 50, 20);
  }

  if (req.cfgScale !== undefined) {
    payload.cfg_scale = clampFloat(req.cfgScale, 0.1, 20, 7.5);
  }

  const stylePreset = cleanString(req.stylePreset);
  if (stylePreset) payload.style_preset = stylePreset;

  if (typeof req.seed === 'number' && Number.isFinite(req.seed)) {
    payload.seed = clampInt(req.seed, MIN_SEED, MAX_SEED, 0);
  }

  if (typeof req.variants === 'number' && Number.isFinite(req.variants) && req.variants > 1) {
    payload.variants = clampInt(req.variants, MIN_VARIANTS, MAX_VARIANTS, 1);
  }

  if (req.enableWebSearch !== undefined) payload.enable_web_search = !!req.enableWebSearch;
  if (req.enhancePrompt !== undefined) payload.enhance_prompt = !!req.enhancePrompt;
  if (req.disablePromptOptimizationThinking !== undefined) {
    payload.disable_prompt_optimization_thinking = !!req.disablePromptOptimizationThinking;
  }

  if (Array.isArray(req.styleReferences) && req.styleReferences.length > 0) {
    payload.style_references = req.styleReferences
      .filter((ref) => typeof ref?.image === 'string' && ref.image.trim().length > 0)
      .map((ref) => ({
        image: ref.image.trim(),
        ...(typeof ref.strength === 'number' ? { strength: clampFloat(ref.strength, 0.1, 1.0, 0.5) } : {}),
      }));
  }

  return applyVeniceApiSafeMode('/image/generate', payload as unknown as Record<string, unknown>, req.safeMode) as unknown as GenerateImageWirePayload;
}

export function buildCanonicalImageEditPayload(
  req: ImageEditLogicalRequest,
): EditImageWirePayload {
  const model = cleanString(req.model) || 'firered-image-edit';
  const prompt = cleanRequiredString(req.prompt, 'prompt').slice(0, MAX_PROMPT_CHARS);
  const image = cleanRequiredString(req.image, 'image');

  const payload: EditImageWirePayload = {
    image,
    prompt,
    model,
    output_format: req.outputFormat || 'png',
  };

  const aspectRatio = cleanString(req.aspectRatio);
  if (aspectRatio) payload.aspect_ratio = aspectRatio;

  const resolution = cleanString(req.resolution);
  if (resolution) payload.resolution = resolution;

  if (req.enhancePrompt !== undefined) payload.enhance_prompt = !!req.enhancePrompt;
  if (req.disablePromptOptimizationThinking !== undefined) {
    payload.disable_prompt_optimization_thinking = !!req.disablePromptOptimizationThinking;
  }

  return applyVeniceApiSafeMode('/image/edit', payload as unknown as Record<string, unknown>, req.safeMode) as unknown as EditImageWirePayload;
}

export function buildCanonicalImageMultiEditPayload(
  req: ImageMultiEditLogicalRequest,
): MultiEditImageWirePayload {
  const modelId = cleanString(req.modelId) || 'firered-image-edit';
  const prompt = cleanRequiredString(req.prompt, 'prompt').slice(0, MAX_PROMPT_CHARS);

  if (!Array.isArray(req.images) || req.images.length === 0) {
    throw new Error('Multi-edit requires at least 1 image.');
  }
  const cleanImages = req.images.map((img, i) => cleanRequiredString(img, `images[${i}]`)).slice(0, 3);

  const payload: MultiEditImageWirePayload = {
    modelId,
    prompt,
    images: cleanImages,
    output_format: req.outputFormat || 'png',
  };

  const aspectRatio = cleanString(req.aspectRatio);
  if (aspectRatio) payload.aspect_ratio = aspectRatio;

  if (req.enhancePrompt !== undefined) payload.enhance_prompt = !!req.enhancePrompt;

  return applyVeniceApiSafeMode('/image/multi-edit', payload as unknown as Record<string, unknown>, req.safeMode) as unknown as MultiEditImageWirePayload;
}

export function buildCanonicalImageUpscalePayload(
  req: ImageUpscaleLogicalRequest,
): UpscaleImageWirePayload {
  const image = cleanRequiredString(req.image, 'image');
  const scale = req.scale === 4 ? 4 : 2;

  const payload: UpscaleImageWirePayload = {
    image,
    scale,
  };

  if (req.creativity !== undefined && typeof req.creativity === 'number') {
    payload.creativity = clampFloat(req.creativity, 0, 0.02, 0.01);
  }

  return payload;
}

export function buildCanonicalBackgroundRemovePayload(
  req: ImageBackgroundRemoveLogicalRequest,
): BackgroundRemoveWirePayload {
  const imageUrl = cleanString(req.imageUrl);
  if (imageUrl) return { image_url: imageUrl };

  const image = cleanString(req.image);
  if (image) return { image };

  throw new Error('Background removal requires an image or imageUrl.');
}

// ============================================================================
// Video Operation Builders
// ============================================================================

export function buildCanonicalVideoQuotePayload(
  req: VideoQuoteLogicalRequest,
): VideoQuoteWirePayload {
  const model = cleanRequiredString(req.model, 'model');
  // QuoteVideoRequest requires duration; an absent/empty value would create
  // an invalid quote body, so fail locally before any provider request.
  const duration = cleanRequiredString(req.duration, 'duration');

  const payload: VideoQuoteWirePayload = { model, duration };

  const resolution = cleanString(req.resolution);
  if (resolution) payload.resolution = resolution;

  const aspectRatio = cleanString(req.aspectRatio);
  if (aspectRatio) payload.aspect_ratio = aspectRatio;

  if (req.upscaleFactor === 1 || req.upscaleFactor === 2 || req.upscaleFactor === 4) {
    payload.upscale_factor = req.upscaleFactor;
  }

  if (req.audio !== undefined) payload.audio = !!req.audio;

  const videoUrl = cleanString(req.videoUrl);
  if (videoUrl) payload.video_url = videoUrl;

  if (typeof req.referenceVideoTotalDuration === 'number' && Number.isFinite(req.referenceVideoTotalDuration) && req.referenceVideoTotalDuration > 0) {
    payload.reference_video_total_duration = req.referenceVideoTotalDuration;
  }

  // Source-matched Seedance values (`duration: "-1"/"auto"`,
  // `aspect_ratio: "adaptive"/"auto") REQUIRE reference_video_total_duration
  // on the quote — upstream bills ceil(reference_video_total_duration)
  // seconds and the swagger marks the field required for these values.
  // Quoting without it would silently return the no-reference baseline.
  if (
    (isVideoSourceMatchedDuration(duration) ||
      isVideoSourceMatchedAspectRatio(payload.aspect_ratio)) &&
    payload.reference_video_total_duration === undefined
  ) {
    throw new Error(
      'Source-matched video duration/aspect requires referenceVideoTotalDuration for the quote.',
    );
  }

  return payload;
}

export function buildCanonicalVideoQueuePayload(
  req: VideoQueueLogicalRequest,
): VideoQueueWirePayload {
  const model = cleanRequiredString(req.model, 'model');
  const prompt = cleanRequiredString(req.prompt, 'prompt');
  // QueueVideoRequest requires model + prompt + duration. Fail locally
  // instead of dispatching a body the provider must reject.
  const duration = cleanRequiredString(req.duration, 'duration');

  const payload: VideoQueueWirePayload = {
    model,
    prompt,
    duration,
  };

  const negative = cleanString(req.negativePrompt);
  if (negative) payload.negative_prompt = negative;

  const resolution = cleanString(req.resolution);
  if (resolution) payload.resolution = resolution;

  const aspectRatio = cleanString(req.aspectRatio);
  if (aspectRatio) payload.aspect_ratio = aspectRatio;

  if (req.upscaleFactor === 1 || req.upscaleFactor === 2 || req.upscaleFactor === 4) {
    payload.upscale_factor = req.upscaleFactor;
  }

  if (req.audio !== undefined) payload.audio = !!req.audio;

  // `bitrate_mode` is Seedance 2.0/2.5-only, queue-only, and does not change
  // price (upstream seedance-2-0 guide). "standard" is the upstream default
  // and is omitted from the wire; anything outside the documented enum is
  // dropped rather than propagated to a provider that would reject it.
  if (req.bitrateMode === 'high') {
    payload.bitrate_mode = 'high';
  }

  const imageUrl = cleanString(req.imageUrl);
  if (imageUrl) payload.image_url = imageUrl;

  const endImageUrl = cleanString(req.endImageUrl);
  if (endImageUrl) payload.end_image_url = endImageUrl;

  const audioUrl = cleanString(req.audioUrl);
  if (audioUrl) payload.audio_url = audioUrl;

  const videoUrl = cleanString(req.videoUrl);
  if (videoUrl) payload.video_url = videoUrl;

  if (Array.isArray(req.referenceImageUrls) && req.referenceImageUrls.length > 0) {
    payload.reference_image_urls = req.referenceImageUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  }

  if (Array.isArray(req.referenceVideoUrls) && req.referenceVideoUrls.length > 0) {
    payload.reference_video_urls = req.referenceVideoUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  }

  if (Array.isArray(req.referenceAudioUrls) && req.referenceAudioUrls.length > 0) {
    payload.reference_audio_urls = req.referenceAudioUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  }

  if (Array.isArray(req.sceneImageUrls) && req.sceneImageUrls.length > 0) {
    payload.scene_image_urls = req.sceneImageUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  }

  if (req.consents?.seedance) {
    const s = req.consents.seedance;
    if (
      s.confirmed_terms_and_privacy === true &&
      s.confirmed_legal_right === true &&
      s.confirmed_screening_acknowledged === true
    ) {
      payload.consents = {
        seedance: {
          confirmed_terms_and_privacy: true,
          confirmed_legal_right: true,
          confirmed_screening_acknowledged: true,
        },
      };
    }
  }

  // Source-matched Seedance values (`duration: "-1"/"auto"`,
  // `aspect_ratio: "adaptive"/"auto") REQUIRE reference_video_urls on the
  // queue per the swagger QueueVideoRequest descriptions. Fail locally
  // instead of dispatching a body the provider must reject.
  if (
    (isVideoSourceMatchedDuration(duration) ||
      isVideoSourceMatchedAspectRatio(payload.aspect_ratio)) &&
    (!Array.isArray(payload.reference_video_urls) ||
      payload.reference_video_urls.length === 0)
  ) {
    throw new Error(
      'Source-matched video duration/aspect requires referenceVideoUrls on the queue request.',
    );
  }

  return payload;
}

export function buildCanonicalVideoRetrievePayload(
  req: VideoRetrieveLogicalRequest,
): VideoRetrieveWirePayload {
  const model = cleanRequiredString(req.model, 'model');
  const queue_id = cleanRequiredString(req.queueId, 'queueId');
  return {
    model,
    queue_id,
    delete_media_on_completion: req.deleteMediaOnCompletion ?? false,
  };
}

// ============================================================================
// Audio / Music / Speech Operation Builders
// ============================================================================

export function buildCanonicalAudioQuotePayload(
  req: AudioQuoteLogicalRequest,
): AudioQuoteWirePayload {
  const model = cleanRequiredString(req.model, 'model');
  const payload: AudioQuoteWirePayload = { model };

  if (typeof req.durationSeconds === 'number' && Number.isFinite(req.durationSeconds)) {
    payload.duration_seconds = Math.max(1, Math.round(req.durationSeconds));
  }

  return payload;
}

export function buildCanonicalAudioQueuePayload(
  req: AudioQueueLogicalRequest,
): AudioQueueWirePayload {
  const model = cleanRequiredString(req.model, 'model');
  const prompt = cleanRequiredString(req.prompt, 'prompt');

  const payload: AudioQueueWirePayload = {
    model,
    prompt,
  };

  if (typeof req.durationSeconds === 'number' && Number.isFinite(req.durationSeconds)) {
    payload.duration_seconds = Math.max(1, Math.round(req.durationSeconds));
  }

  if (req.forceInstrumental !== undefined) payload.force_instrumental = !!req.forceInstrumental;

  const lyrics = cleanString(req.lyricsPrompt);
  if (lyrics) payload.lyrics_prompt = lyrics;

  if (req.loop !== undefined) payload.loop = !!req.loop;

  const voice = cleanString(req.voice);
  if (voice) payload.voice = voice;

  // QueueAudioRequest declares language_code (ISO 639-1); the logical
  // `language` input maps to it — never to an undocumented `language` wire key.
  const language = cleanString(req.language);
  if (language) payload.language_code = language;

  if (typeof req.speed === 'number' && Number.isFinite(req.speed)) {
    payload.speed = clampFloat(req.speed, 0.25, 4.0, 1.0);
  }

  return payload;
}

export function buildCanonicalAudioRetrievePayload(
  req: AudioRetrieveLogicalRequest,
): AudioRetrieveWirePayload {
  const model = cleanRequiredString(req.model, 'model');
  const queue_id = cleanRequiredString(req.queueId, 'queueId');
  return {
    model,
    queue_id,
    delete_media_on_completion: req.deleteMediaOnCompletion ?? false,
  };
}

export function buildCanonicalAudioSpeechPayload(
  req: AudioSpeechLogicalRequest,
): AudioSpeechWirePayload {
  const model = cleanRequiredString(req.model, 'model');
  const input = cleanRequiredString(req.input, 'input');
  const explicitVoice = cleanString(req.voice);
  const voice = explicitVoice || (model.toLowerCase().includes('kokoro') ? 'af_sky' : undefined);

  const payload: AudioSpeechWirePayload = {
    model,
    input,
    speed: typeof req.speed === 'number' && Number.isFinite(req.speed) ? clampFloat(req.speed, 0.25, 4.0, 1.0) : 1.0,
    response_format: req.responseFormat || 'mp3',
  };
  if (voice) {
    payload.voice = voice;
  }

  return payload;
}
