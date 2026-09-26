/**
 * @fileoverview Capability-driven model classification and feature discovery.
 * Replaces broad substring heuristics with upstream trait/type and capability metadata.
 */

export interface ModelMetadataLike {
  id: string;
  name?: string;
  type?: string;
  model_type?: string;
  modelType?: string;
  traits?: string[] | Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  model_spec?: {
    capabilities?: Record<string, unknown>;
    constraints?: {
      aspect_ratios?: string[];
      aspectRatios?: string[];
      resolutions?: string[];
      width_height_divisor?: number;
    };
  };
}

export type ModelSizingMode = 'widthHeight' | 'aspectRatio' | 'aspectResolution' | 'fixed';

/** Known inpaint / edit model IDs documented upstream */
export const KNOWN_IMAGE_EDIT_MODELS = new Set([
  'firered-image-edit',
  'qwen-edit',
  'qwen-edit-uncensored',
  'grok-imagine-edit',
  'grok-imagine-quality-edit',
  'grok-imagine-image-2-0-edit',
  'qwen-image-2-edit',
  'qwen-image-2-pro-edit',
  'wan-2-7-pro-edit',
  'flux-2-max-edit',
  'gpt-image-2-edit',
  'gpt-image-1-5-edit',
  'nano-banana-2-edit',
  'nano-banana-pro-edit',
  'nano-banana-2-lite-edit',
  'luma-uni-1-edit',
  'luma-uni-1-max-edit',
  'seedream-v5-lite-edit',
  'seedream-v5-pro-edit',
  'seedream-v4-edit',
  'qwen-image-3-edit',
  'qwen-image-3-pro-edit',
]);

/** Returns true if a model is an image editing / inpainting model */
export function isImageEditModel(model: ModelMetadataLike | string): boolean {
  if (typeof model === 'string') {
    const id = model.trim().toLowerCase();
    if (KNOWN_IMAGE_EDIT_MODELS.has(id)) return true;
    if (id.endsWith('-edit') || id.includes('-edit-') || id.includes('inpaint')) return true;
    return false;
  }

  const id = (model.id || '').trim().toLowerCase();
  const type = (model.type || model.model_type || model.modelType || '').trim().toLowerCase();

  // Tier 1: Explicit provider type from /models?type=inpaint or /models/traits
  if (type === 'inpaint' || type === 'image-edit') return true;
  if (type) return false;

  // Tier 2: Model traits
  if (Array.isArray(model.traits) && (model.traits.includes('inpaint') || model.traits.includes('edit'))) {
    return true;
  }

  // Tier 3: Exact known model ID
  if (KNOWN_IMAGE_EDIT_MODELS.has(id)) return true;

  // Tier 4: Conservative pattern match
  if (id.endsWith('-edit') || id.includes('-edit-') || id.includes('inpaint')) {
    return true;
  }

  return false;
}

/** Returns true if a model is an image generation (text-to-image) model */
export function isImageGenerateModel(model: ModelMetadataLike | string): boolean {
  if (isImageEditModel(model)) return false;
  if (typeof model === 'string') {
    return true;
  }
  const type = (model.type || model.model_type || model.modelType || '').trim().toLowerCase();
  if (type === 'image' || type === 'text-to-image' || type === 'image-generate') return true;
  return true;
}

/** Returns true if a model is a video generation or video upscaling model */
export function isVideoModel(model: ModelMetadataLike | string): boolean {
  if (typeof model === 'string') {
    const id = model.trim().toLowerCase();
    return id.includes('video') || id.includes('seedance') || id.includes('wan-') || id.includes('kling');
  }

  const type = (model.type || model.model_type || model.modelType || '').trim().toLowerCase();
  if (type === 'video' || type === 'text-to-video' || type === 'image-to-video') return true;

  if (Array.isArray(model.traits) && model.traits.some((t) => typeof t === 'string' && t.includes('video'))) {
    return true;
  }

  const id = (model.id || '').trim().toLowerCase();
  return id.includes('video') || id.includes('seedance') || id.includes('wan-') || id.includes('kling');
}

/** Model ID family pattern for the public Seedance 2.0 (including Fast) and
 *  2.5 models. Upstream documents `bitrate_mode` for exactly these families
 *  (guides/media/seedance-2-0.mdx; api-reference/endpoint/video/queue.mdx)
 *  and states other families (Wan, Kling, LTX, …) do not support the field.
 *  The upstream Swagger exposes no `bitrate_mode` capability flag in the
 *  video model constraints, so the documented model family is the only
 *  available discriminator. Fail closed: anything outside the family gets no
 *  control and the field is never sent. */
const SEEDANCE_BITRATE_CAPABLE_PATTERN = /^seedance-2-(?:0|5)-/i;

/** True only when the model belongs to the documented Seedance 2.0/2.5
 *  family that accepts the queue-only `bitrate_mode` field. Accepts a model
 *  record (reads `id`) or a bare model ID string; unknown/absent IDs fail
 *  closed. */
export function supportsVideoBitrateMode(
  model: { id?: string } | string | null | undefined,
): boolean {
  const id =
    typeof model === 'string'
      ? model.trim()
      : typeof model?.id === 'string'
        ? model.id.trim()
        : '';
  if (!id) return false;
  return SEEDANCE_BITRATE_CAPABLE_PATTERN.test(id);
}

/** Returns true if a model is an audio / music generation model */
export function isAudioMusicModel(model: ModelMetadataLike | string): boolean {
  if (typeof model === 'string') {
    const id = model.trim().toLowerCase();
    return id.includes('music') || id.includes('sound-effect') || id.includes('stable-audio') || id.includes('elevenlabs-music');
  }

  const type = (model.type || model.model_type || model.modelType || '').trim().toLowerCase();
  if (type === 'music' || type === 'audio') return true;

  if (Array.isArray(model.traits) && model.traits.includes('music')) {
    return true;
  }

  const id = (model.id || '').trim().toLowerCase();
  return id.includes('music') || id.includes('sound-effect') || id.includes('stable-audio') || id.includes('elevenlabs-music');
}

/** Returns true if a model is a text-to-speech model */
export function isAudioTtsModel(model: ModelMetadataLike | string): boolean {
  if (typeof model === 'string') {
    const id = model.trim().toLowerCase();
    return id.startsWith('tts') || id.includes('-tts') || id.includes('kokoro');
  }

  const type = (model.type || model.model_type || model.modelType || '').trim().toLowerCase();
  if (type === 'tts') return true;

  if (Array.isArray(model.traits) && model.traits.includes('tts')) {
    return true;
  }

  const id = (model.id || '').trim().toLowerCase();
  return id.startsWith('tts') || id.includes('-tts') || id.includes('kokoro');
}

/** Resolves the sizing mode for an image model based on constraints and model ID */
export function resolveModelSizingMode(
  modelId: string,
  constraints?: NonNullable<ModelMetadataLike['model_spec']>['constraints'],
): ModelSizingMode {
  const c = constraints;
  const aspectRatios = c?.aspect_ratios || c?.aspectRatios;
  const hasAspectRatios = Array.isArray(aspectRatios) && aspectRatios.length > 0;
  const hasResolutions = Array.isArray(c?.resolutions) && c!.resolutions!.length > 0;

  if (hasAspectRatios && hasResolutions) return 'aspectResolution';
  if (hasAspectRatios) return 'aspectRatio';

  const id = modelId.toLowerCase();
  if (id.includes('nano') || id.includes('seedream') || id.includes('qwen-image-2') || id.includes('gpt-image')) {
    return 'aspectRatio';
  }

  return 'widthHeight';
}

/**
 * Upstream default for `capabilities.maxInputImages` when the capability is
 * absent from a model's `/models` entry. The upstream Swagger docstring
 * states: "Absent means the default of 3 (or 1 when combineImages is false)."
 * Combine/multi-edit always uses 3 here because the `/image/multi-edit`
 * endpoint is what consumes this value; single-image edit endpoints take
 * exactly one image and do not consult the field.
 */
export const DEFAULT_MAX_INPUT_IMAGES = 3;

/** Shape of the per-model `capabilities` object exposed by `/models`. */
export interface ModelCapabilitiesLike {
  combineImages?: boolean | null;
  maxInputImages?: number | null;
  singleImageAspectRatio?: boolean | null;
  defaultResolution?: string | null;
  defaultQuality?: string | null;
  resolutions?: string[] | null;
}

/**
 * Returns the per-model maximum number of input images that
 * `/image/multi-edit` will accept, honoring the upstream default of 3 when
 * the capability is absent. The caller is responsible for surfacing this
 * value to the UI so the user can be warned before they exceed the limit.
 */
export function getMaxInputImages(model: ModelMetadataLike | null | undefined): number {
  if (!model || typeof model !== 'object') return DEFAULT_MAX_INPUT_IMAGES;
  const cap = model.capabilities;
  if (!cap || typeof cap !== 'object') return DEFAULT_MAX_INPUT_IMAGES;
  const v = (cap as ModelCapabilitiesLike).maxInputImages;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) return DEFAULT_MAX_INPUT_IMAGES;
  return Math.floor(v);
}

/**
 * Returns the per-model aspect-ratio control flag for single-image edit
 * payloads. `false` means the model preserves input dimensions on single-
 * image edits and ignores `aspect_ratio`. Multi-image edits are unaffected.
 * Defaults to `true` to match the documented default.
 */
export function supportsSingleImageAspectRatio(
  model: ModelMetadataLike | null | undefined,
): boolean {
  if (!model || typeof model !== 'object') return true;
  const cap = model.capabilities;
  if (!cap || typeof cap !== 'object') return true;
  const v = (cap as ModelCapabilitiesLike).singleImageAspectRatio;
  return v !== false;
}

/** Returns the list of supported resolutions for an edit-capable model,
 *  or undefined when the model does not advertise any usable resolutions. */
export function getModelResolutions(
  model: ModelMetadataLike | null | undefined,
): string[] | undefined {
  if (!model || typeof model !== 'object') return undefined;
  const cap = model.capabilities;
  if (!cap || typeof cap !== 'object') return undefined;
  const v = (cap as ModelCapabilitiesLike).resolutions;
  if (!Array.isArray(v)) return undefined;
  const filtered = v.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  return filtered.length > 0 ? filtered : undefined;
}
