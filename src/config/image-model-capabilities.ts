/** @fileoverview
 *  Model-aware image dimension capabilities. Single source of truth for
 *  which dimension mode, width/height options, presets, aspect ratios,
 *  optional resolution, optional quality, and features (negative
 *  prompt, seed) each image model supports.
 *
 *  Seedream model families (verified against docs/Venice_swagger_api.yaml):
 *   - seedream-v5-pro, seedream-v5-lite, seedream-v4: text-to-image
 *     via POST /api/v1/image/generate; aspect_ratio mode per live constraints.
 *   - seedream-v5-pro-edit, seedream-v5-lite-edit, seedream-v4-edit:
 *     image-edit via POST /api/v1/image/edit; EditImageRequest schema
 *     (image, model, prompt, aspect_ratio, resolution, output_format,
 *     safe_mode). NO return_binary, NO modelId in new code.
 *
 *  Sources of truth (verified against docs/Venice_swagger_api.yaml):
 *   - Venice swagger: width/height 64..1280, divisible by 64
 *   - /models endpoint returns `model.model_spec.constraints` with
 *     `aspect_ratios` / `aspectRatios`, `resolutions`, `steps`,
 *     `promptCharacterLimit`, and `width_height_divisor`.
 *   - SD-classic models (flux-dev, z-image-turbo, hidream, sdxl): pixel sizing
 *   - Nano Banana and similar modern models: aspect_ratio (+ optional
 *     resolution); nano-banana-v1 is `aspectResolution` per the live
 *     constraints.
 *   - The prompt-enhancer / chat model `venice-uncensored-1-2` is a
 *     text model and MUST NOT appear in the image registry.
 */

import type { ImageConstraints, VeniceModel } from "../types/venice";

export type ImageDimensionMode =
  "widthHeight" | "aspectRatio" | "aspectResolution" | "fixed" | "unknown";

/**
 * Discriminates between text-to-image models (POST /api/v1/image/generate)
 * and image-edit models (POST /api/v1/image/edit).
 * Defaults to 'text-to-image' when omitted for backwards compatibility.
 */
export type ImageModelOperation = "text-to-image" | "image-edit";

export type ImageQuality = "low" | "medium" | "high" | "auto";
export interface LocalizedImageOption {
  label?: string;
  labelKey?: string;
}

export interface ImageModelCapabilities {
  modelId: string;
  label: string;
  /**
   * Discriminates between text-to-image (POST /api/v1/image/generate) and
   * image-edit (POST /api/v1/image/edit) models. Omitted entries default to
   * 'text-to-image' to preserve backwards compatibility.
   */
  operation?: ImageModelOperation;
  dimensionMode: ImageDimensionMode;
  widthHeightOptions?: Array<
    { width: number; height: number } & LocalizedImageOption
  >;
  aspectRatios?: Array<{ id: string } & LocalizedImageOption>;
  resolutions?: Array<{ id: string } & LocalizedImageOption>;
  qualities?: Array<{ id: ImageQuality } & LocalizedImageOption>;
  defaultDimensions: {
    width?: number;
    height?: number;
    aspectRatio?: string;
    resolution?: string;
  };
  defaultQuality?: ImageQuality;
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
  supportsVariants: boolean;
  supportsSteps?: boolean;
  supportsCfgScale?: boolean;
  supportsStyle?: boolean;
  /**
   * Whether the model accepts the `hide_watermark` field. Some strict
   * model classes reject foreign fields with `additionalProperties: false`,
   * so callers can opt out by declaring `false`. Defaults to `true` when
   * the field is undefined to preserve historical behavior.
   */
  supportsHideWatermark?: boolean;
  /**
   * Whether the model accepts the `return_binary` field. Same rationale
   * as `supportsHideWatermark`. Defaults to `true` for backwards compat.
   */
  supportsReturnBinary?: boolean;
  /**
   * Whether the image model supports reference images (e.g. character
   * consistency or style references). When `false` or undefined the
   * payload builder drops reference images and generation falls back to
   * text-only, which is the safe default for the current Venice image
   * endpoint matrix.
   */
  supportsReferences?: boolean;
  /**
   * Maximum number of reference images the model accepts in a single
   * request. Omitted or zero means no references are accepted.
   */
  referenceLimit?: number;
  /** Whether per-reference `strength` is honored on `style_references`.
   *  Mirrors `model_spec.constraints.supportsStyleReferenceStrength`.
   *  Absent means the model accepts strength (omitted strength defaults to
   *  0.5 per the Swagger). */
  supportsStyleReferenceStrength?: boolean;
  /** Map from canonical model ID patterns — used for models not yet in the catalog. */
  patternMatch?: RegExp;
}

export const IMAGE_ASPECT_PRESETS = [
  { id: "1:1", labelKey: "imageOptions.squareDefault" },
  { id: "3:2", labelKey: "imageOptions.landscape32" },
  { id: "16:9", labelKey: "imageOptions.cinema169" },
  { id: "21:9", labelKey: "imageOptions.widescreen219" },
  { id: "9:16", labelKey: "imageOptions.tall916" },
  { id: "2:3", labelKey: "imageOptions.portrait23" },
  { id: "3:4", labelKey: "imageOptions.instagram34" },
] as const;

export type ImageAspectRatioPreset = (typeof IMAGE_ASPECT_PRESETS)[number];

/** Common aspect ratio presets used across Venice models. */
const COMMON_ASPECT_RATIOS = [...IMAGE_ASPECT_PRESETS];

/**
 * Aspect ratio presets for image-edit models (EditImageRequest schema).
 * Source: docs/Venice_swagger_api.yaml EditImageRequest.aspect_ratio enum.
 * Includes "auto" which infers the closest ratio from the input image.
 */
const EDIT_ASPECT_RATIOS = [
  { id: "auto", labelKey: "imageOptions.autoInfer" },
  { id: "1:1", labelKey: "imageOptions.square11" },
  { id: "3:2", labelKey: "imageOptions.photo32" },
  { id: "16:9", labelKey: "imageOptions.landscape169" },
  { id: "21:9", labelKey: "imageOptions.ultrawide219" },
  { id: "9:16", labelKey: "imageOptions.portrait916" },
  { id: "2:3", labelKey: "imageOptions.portrait23" },
  { id: "3:4", labelKey: "imageOptions.portrait34" },
  { id: "4:5", labelKey: "imageOptions.portrait45" },
];

/**
 * Resolution presets for image-edit models (EditImageRequest schema).
 * Source: docs/Venice_swagger_api.yaml EditImageRequest.resolution.
 * Note: Swagger uses uppercase "1K", "2K", "4K".
 */
const EDIT_RESOLUTIONS = [
  { id: "1K", label: "1K" },
  { id: "2K", label: "2K" },
  { id: "4K", label: "4K" },
];

/** Common resolution presets used by aspect-resolution models. */
const COMMON_RESOLUTIONS = [
  { id: "1k", label: "1K" },
  { id: "2k", label: "2K" },
  { id: "4k", label: "4K" },
];

/** Common quality presets for models that support explicit quality. */
const COMMON_QUALITIES = [
  { id: "low" as const, labelKey: "imageOptions.qualityLow" },
  { id: "medium" as const, labelKey: "imageOptions.qualityMedium" },
  { id: "high" as const, labelKey: "imageOptions.qualityHigh" },
];

/** Canonical width/height size options for SD-classic models, aligned to the 7 aspect ratio presets. */
const SD_WIDTH_HEIGHT_PAIRS: ImageModelCapabilities["widthHeightOptions"] = [
  { width: 1024, height: 1024, labelKey: "imageOptions.squareDefault" },
  { width: 1152, height: 768, labelKey: "imageOptions.landscape32" },
  { width: 1280, height: 704, labelKey: "imageOptions.cinema169" },
  { width: 1216, height: 512, labelKey: "imageOptions.widescreen219" },
  { width: 704, height: 1280, labelKey: "imageOptions.tall916" },
  { width: 768, height: 1152, labelKey: "imageOptions.portrait23" },
  { width: 768, height: 1024, labelKey: "imageOptions.instagram34" },
];

/**
 * Capability registry. Order does not matter; lookup uses `modelIdPatternMatch`
 * which checks the model id against each entry's patternMatch regex or exact id.
 *
 * Text-only models (e.g. `venice-uncensored-1-2`) MUST NOT be registered here
 * because they do not expose `/image/generate` constraints.
 *
 * IMPORTANT: Seedream = image generation/editing (NOT video, NOT Seedance).
 *   - Text-to-image: seedream-v5-pro, seedream-v5-lite, seedream-v4
 *     → POST /api/v1/image/generate
 *   - Image-edit: seedream-v5-pro-edit, seedream-v5-lite-edit, seedream-v4-edit
 *     → POST /api/v1/image/edit
 */
const IMAGE_MODEL_CAPABILITIES: ImageModelCapabilities[] = [
  {
    modelId: "flux-dev",
    // i18n-allow-next-line: provider-defined model display name
    label: "Flux Dev",
    operation: "text-to-image",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
    patternMatch: /^flux(?!.*edit)/i,
  },
  {
    modelId: "flux-dev-schnell",
    // i18n-allow-next-line: provider-defined model display name
    label: "Flux Dev Schnell",
    operation: "text-to-image",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
  },
  {
    modelId: "z-image-turbo",
    // i18n-allow-next-line: provider-defined model display name
    label: "Z Image Turbo",
    operation: "text-to-image",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
    patternMatch: /^z-image/i,
  },
  {
    modelId: "hidream-i-flux-dev",
    // i18n-allow-next-line: provider-defined model display name
    label: "HiDream I Flux Dev",
    operation: "text-to-image",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
    patternMatch: /^hidream/i,
  },
  {
    modelId: "wai-Illustrious",
    // i18n-allow-next-line: provider-defined model display name
    label: "Anime (WAI)",
    operation: "text-to-image",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
    patternMatch: /^wai/i,
  },
  {
    modelId: "lustify",
    // i18n-allow-next-line: provider-defined model display name
    label: "Lustify",
    operation: "text-to-image",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
    patternMatch: /^lustify/i,
  },
  {
    modelId: "sdxl",
    // i18n-allow-next-line: provider-defined model display name
    label: "SDXL",
    operation: "text-to-image",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
    patternMatch: /^sdxl/i,
  },
  {
    modelId: "nano-banana-v1",
    // i18n-allow-next-line: provider-defined model display name
    label: "Nano Banana",
    operation: "text-to-image",
    dimensionMode: "aspectResolution",
    aspectRatios: COMMON_ASPECT_RATIOS,
    resolutions: COMMON_RESOLUTIONS,
    defaultDimensions: { aspectRatio: "1:1", resolution: "1k" },
    qualities: COMMON_QUALITIES,
    defaultQuality: "high",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
    patternMatch: /^nano(?!.*edit)/i,
  },

  // ── Seedream text-to-image models ─────────────────────────────────────────
  // Source: POST /api/v1/image/generate (GenerateImageRequest schema).
  // These use aspect_ratio mode. Live /models constraints will refine
  // the exact ratios; COMMON_ASPECT_RATIOS is the safe static default.
  // NEVER use these models with /image/edit.
  {
    modelId: "seedream-v5-pro",
    // i18n-allow-next-line: provider-defined model display name
    label: "Seedream V5 Pro",
    operation: "text-to-image",
    dimensionMode: "aspectRatio",
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultDimensions: { aspectRatio: "1:1" },
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
    supportsHideWatermark: true,
    supportsReturnBinary: false,
  },
  {
    modelId: "seedream-v5-lite",
    // i18n-allow-next-line: provider-defined model display name
    label: "Seedream V5 Lite",
    operation: "text-to-image",
    dimensionMode: "aspectRatio",
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultDimensions: { aspectRatio: "1:1" },
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
    supportsHideWatermark: true,
    supportsReturnBinary: false,
  },
  {
    modelId: "seedream-v4",
    // i18n-allow-next-line: provider-defined model display name
    label: "Seedream V4",
    operation: "text-to-image",
    dimensionMode: "aspectRatio",
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultDimensions: { aspectRatio: "1:1" },
    supportsNegativePrompt: false,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
    supportsHideWatermark: true,
    supportsReturnBinary: false,
  },

  // ── Seedream image-edit models ────────────────────────────────────────────
  // Source: POST /api/v1/image/edit (EditImageRequest schema).
  // Fields: image (required), model, prompt (required), aspect_ratio,
  //         resolution, output_format, safe_mode.
  // DO NOT emit return_binary, modelId, enhance, enhancePrompt.
  // NEVER use these models with /image/generate.
  {
    modelId: "seedream-v5-pro-edit",
    // i18n-allow-next-line: provider-defined model display name
    label: "Seedream V5 Pro (Edit)",
    operation: "image-edit",
    dimensionMode: "aspectRatio",
    aspectRatios: EDIT_ASPECT_RATIOS,
    resolutions: EDIT_RESOLUTIONS,
    defaultDimensions: { aspectRatio: "auto", resolution: "1K" },
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsVariants: false,
    supportsReferences: false,
    referenceLimit: 0,
    supportsHideWatermark: false,
    supportsReturnBinary: false,
    supportsSteps: false,
    supportsCfgScale: false,
    supportsStyle: false,
  },
  {
    modelId: "seedream-v5-lite-edit",
    // i18n-allow-next-line: provider-defined model display name
    label: "Seedream V5 Lite (Edit)",
    operation: "image-edit",
    dimensionMode: "aspectRatio",
    aspectRatios: EDIT_ASPECT_RATIOS,
    resolutions: EDIT_RESOLUTIONS,
    defaultDimensions: { aspectRatio: "auto", resolution: "1K" },
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsVariants: false,
    supportsReferences: false,
    referenceLimit: 0,
    supportsHideWatermark: false,
    supportsReturnBinary: false,
    supportsSteps: false,
    supportsCfgScale: false,
    supportsStyle: false,
  },
  {
    modelId: "seedream-v4-edit",
    // i18n-allow-next-line: provider-defined model display name
    label: "Seedream V4 (Edit)",
    operation: "image-edit",
    dimensionMode: "aspectRatio",
    aspectRatios: EDIT_ASPECT_RATIOS,
    resolutions: EDIT_RESOLUTIONS,
    defaultDimensions: { aspectRatio: "auto", resolution: "1K" },
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsVariants: false,
    supportsReferences: false,
    referenceLimit: 0,
    supportsHideWatermark: false,
    supportsReturnBinary: false,
    supportsSteps: false,
    supportsCfgScale: false,
    supportsStyle: false,
    patternMatch: /^seedream.*edit/i,
  },
];

/** Picks the first string-array field that is non-empty. */
function pickStringArray(
  ...candidates: ReadonlyArray<unknown>
): string[] | undefined {
  for (const c of candidates) {
    if (
      Array.isArray(c) &&
      c.length > 0 &&
      c.every((v) => typeof v === "string")
    ) {
      return c as string[];
    }
  }
  return undefined;
}

function pickString(...candidates: ReadonlyArray<unknown>): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}

function pickNumber(...candidates: ReadonlyArray<unknown>): number | undefined {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return undefined;
}

/** Normalises a constraints block, accepting both camelCase and snake_case
 *  field names. Returns the most permissive view of the constraints
 *  available. */
function normaliseConstraints(
  raw: ImageConstraints | null | undefined,
): ImageConstraints | null {
  if (!raw || typeof raw !== "object") return raw ?? null;
  const r = raw as Record<string, unknown>;
  const aspectRatios = pickStringArray(r.aspectRatios, r.aspect_ratios);
  const defaultAspectRatio = pickString(
    r.defaultAspectRatio,
    r.default_aspect_ratio,
  );
  const resolutions = pickStringArray(r.resolutions);
  const defaultResolution = pickString(
    r.defaultResolution,
    r.default_resolution,
  );
  const widthHeightDivisor = pickNumber(
    r.widthHeightDivisor,
    r.width_height_divisor,
  );
  return {
    promptCharacterLimit: pickNumber(
      r.promptCharacterLimit,
      r.prompt_character_limit,
    ),
    aspectRatios,
    defaultAspectRatio,
    resolutions,
    defaultResolution,
    widthHeightDivisor,
    steps: r.steps as ImageConstraints["steps"],
  };
}

/**
 * Canonical IDs for the three Seedream text-to-image models.
 * Use these when you need to identify Seedream generate models programmatically.
 */
export const SEEDREAM_TEXT_TO_IMAGE_IDS: ReadonlySet<string> = new Set([
  "seedream-v5-pro",
  "seedream-v5-lite",
  "seedream-v4",
]);

/**
 * Canonical IDs for the three Seedream image-edit models.
 * These are used with POST /api/v1/image/edit, not /image/generate.
 */
export const SEEDREAM_EDIT_IDS: ReadonlySet<string> = new Set([
  "seedream-v5-pro-edit",
  "seedream-v5-lite-edit",
  "seedream-v4-edit",
]);

/** Returns the known capabilities for a given model ID.
 *  Falls back to widthHeight mode with all common pairs for unknown models. */
/** Runtime-first style-reference capability resolution (P1-004/P3-001).
 *  Authoritative source is runtime `/models` metadata:
 *  `model_spec.supportsStyleReferences` (presence gates the feature),
 *  `model_spec.constraints.maxStyleReferences` (count limit, absent while
 *  supported ⇒ conservative 1), and
 *  `model_spec.constraints.supportsStyleReferenceStrength` (absent ⇒
 *  strength accepted). When runtime metadata is absent (offline/fallback
 *  catalogs), the static registry is consulted as a conservative fallback;
 *  unknown models fail closed. Never hard-code production model IDs here. */
export interface StyleReferenceCapabilities {
  supported: boolean;
  maxReferences: number;
  supportsStrength: boolean;
}

export function resolveStyleReferenceCapabilities(
  modelId: string,
  runtimeModelSpec?: VeniceModel["model_spec"] | null,
): StyleReferenceCapabilities {
  if (
    runtimeModelSpec &&
    typeof runtimeModelSpec.supportsStyleReferences === "boolean"
  ) {
    const constraints = isImageConstraints(runtimeModelSpec.constraints)
      ? (runtimeModelSpec.constraints as ImageConstraints)
      : undefined;
    const supported = runtimeModelSpec.supportsStyleReferences;
    const maxStyleReferences = constraints?.maxStyleReferences;
    return {
      supported,
      maxReferences: supported ? Math.max(0, maxStyleReferences ?? 1) : 0,
      supportsStrength:
        supported && constraints?.supportsStyleReferenceStrength !== false,
    };
  }
  const staticCaps = getImageModelCapabilities(modelId);
  const staticSupported = staticCaps.supportsReferences === true;
  return {
    supported: staticSupported,
    maxReferences: staticSupported
      ? Math.max(1, staticCaps.referenceLimit ?? 1)
      : 0,
    supportsStrength:
      staticSupported && staticCaps.supportsStyleReferenceStrength !== false,
  };
}

/** True when a model_spec.constraints object is image-shaped (as opposed to
 *  text/video constraints). Image constraints declare at least one of the
 *  image-specific keys. */
function isImageConstraints(
  value: unknown,
): value is ImageConstraints {
  if (typeof value !== "object" || value === null) return false;
  return (
    "promptCharacterLimit" in value ||
    "maxStyleReferences" in value ||
    "supportsStyleReferenceStrength" in value ||
    "aspectRatios" in value ||
    "resolutions" in value
  );
}

export function getImageModelCapabilities(
  modelId: string,
): ImageModelCapabilities {
  const exact = IMAGE_MODEL_CAPABILITIES.find((c) => c.modelId === modelId);
  if (exact) return exact;

  const patternMatch = IMAGE_MODEL_CAPABILITIES.find(
    (c) => c.patternMatch && c.patternMatch.test(modelId),
  );
  if (patternMatch) return { ...patternMatch, modelId };

  return {
    modelId,
    label: modelId,
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    supportsCfgScale: true,
    supportsReferences: false,
    referenceLimit: 0,
  };
}

/**
 * Returns capabilities for a model, asserting it is a text-to-image model.
 * Returns null if the model is registered as an image-edit model.
 * Unknown models (not in registry) are assumed text-to-image (safe default).
 */
export function getTextToImageModelCapabilities(
  modelId: string,
): ImageModelCapabilities | null {
  const caps = getImageModelCapabilities(modelId);
  if (caps.operation === "image-edit") return null;
  return caps;
}

/**
 * Returns capabilities for a model, asserting it is an image-edit model.
 * Returns null if the model is not registered as an image-edit model.
 */
export function getEditModelCapabilities(
  modelId: string,
): ImageModelCapabilities | null {
  const caps = getImageModelCapabilities(modelId);
  if (caps.operation !== "image-edit") return null;
  return caps;
}

export function buildSupportedAspectPresets(
  supportedRatios: readonly string[] | undefined,
): Array<{ id: string } & LocalizedImageOption> {
  if (!supportedRatios || supportedRatios.length === 0) {
    return [...IMAGE_ASPECT_PRESETS];
  }
  const supportedSet = new Set(supportedRatios);
  const canonicalMatched = IMAGE_ASPECT_PRESETS.filter((p) =>
    supportedSet.has(p.id),
  );
  if (canonicalMatched.length > 0) {
    return canonicalMatched;
  }
  return supportedRatios.map((r) => ({ id: r, label: r }));
}

export function chooseDefaultAspectRatio(input: {
  supported: readonly string[];
  providerDefault?: string;
}): string {
  if (input.supported.includes("1:1")) return "1:1";
  if (
    input.providerDefault &&
    input.supported.includes(input.providerDefault)
  ) {
    return input.providerDefault;
  }
  return input.supported[0] ?? "1:1";
}

/** Build dimension options for the model, preferring live `/models`
 *  constraints over the static registry. */
export function buildDimensionOptions(
  modelId: string,
  constraints?: ImageConstraints | null,
): Pick<
  ImageModelCapabilities,
  | "dimensionMode"
  | "widthHeightOptions"
  | "aspectRatios"
  | "resolutions"
  | "defaultDimensions"
  | "qualities"
  | "defaultQuality"
> {
  const known = getImageModelCapabilities(modelId);
  const normalised = normaliseConstraints(constraints);

  if (
    normalised &&
    normalised.aspectRatios &&
    normalised.aspectRatios.length > 0
  ) {
    const aspectRatios = buildSupportedAspectPresets(normalised.aspectRatios);
    const supportedIds = aspectRatios.map((a) => a.id);
    const hasResolutions =
      Array.isArray(normalised.resolutions) &&
      normalised.resolutions.length > 0;
    const defaultAspectRatio = chooseDefaultAspectRatio({
      supported: supportedIds,
      providerDefault: normalised.defaultAspectRatio,
    });
    const defaultResolution = hasResolutions
      ? (normalised.defaultResolution ?? normalised.resolutions![0])
      : undefined;
    return {
      dimensionMode: hasResolutions ? "aspectResolution" : "aspectRatio",
      aspectRatios,
      resolutions: hasResolutions
        ? normalised.resolutions!.map((r) => ({ id: r, label: r }))
        : undefined,
      defaultDimensions: {
        aspectRatio: defaultAspectRatio,
        ...(defaultResolution ? { resolution: defaultResolution } : {}),
      },
      qualities: known.qualities,
      defaultQuality: known.defaultQuality,
    };
  }

  const aspectRatios = known.aspectRatios
    ? buildSupportedAspectPresets(known.aspectRatios.map((a) => a.id))
    : [...IMAGE_ASPECT_PRESETS];
  const supportedIds = aspectRatios.map((a) => a.id);
  const defaultAspectRatio = chooseDefaultAspectRatio({
    supported: supportedIds,
    providerDefault: known.defaultDimensions.aspectRatio,
  });

  return {
    dimensionMode: known.dimensionMode,
    widthHeightOptions: known.widthHeightOptions,
    aspectRatios,
    resolutions: known.resolutions,
    defaultDimensions: {
      ...known.defaultDimensions,
      ...(known.dimensionMode === "aspectRatio" ||
      known.dimensionMode === "aspectResolution"
        ? { aspectRatio: defaultAspectRatio }
        : {}),
    },
    qualities: known.qualities,
    defaultQuality: known.defaultQuality,
  };
}

/** Returns true when the supplied width/height pair is supported by the
 *  capability contract. Fixed/aspectRatio/aspectResolution models have no
 *  pixel pair to validate; unknown models accept anything (the payload
 *  builder will still clamp/normalize). */
export function isDimensionSupported(
  capabilities: ImageModelCapabilities,
  width: number | undefined,
  height: number | undefined,
): boolean {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return false;
  }
  switch (capabilities.dimensionMode) {
    case "widthHeight":
      return (capabilities.widthHeightOptions ?? []).some(
        (o) => o.width === width && o.height === height,
      );
    case "fixed":
      return (
        capabilities.defaultDimensions.width === width &&
        capabilities.defaultDimensions.height === height
      );
    case "aspectRatio":
    case "aspectResolution":
    case "unknown":
      return true;
    default:
      return false;
  }
}

/** Returns a capability-safe dimension view plus an optional human-readable
 *  warning when the supplied values had to be coerced. Pure (does not mutate
 *  the input). Used by the payload builder and by the form's reset effect. */
export interface NormalizeDimensionsResult {
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  warning?: string;
}

export function normalizeDimensionsForModel(
  capabilities: ImageModelCapabilities,
  input: {
    width?: number;
    height?: number;
    aspectRatio?: string;
    resolution?: string;
  } = {},
): NormalizeDimensionsResult {
  const out: NormalizeDimensionsResult = {};
  if (capabilities.dimensionMode === "widthHeight") {
    const opts = capabilities.widthHeightOptions ?? [];
    const found = opts.find(
      (o) => o.width === input.width && o.height === input.height,
    );
    if (found) {
      out.width = found.width;
      out.height = found.height;
    } else {
      out.width = capabilities.defaultDimensions.width;
      out.height = capabilities.defaultDimensions.height;
      if (input.width !== undefined || input.height !== undefined) {
        out.warning = `Adjusted dimensions to ${out.width}x${out.height} (model default).`;
      }
    }
    return out;
  }
  if (
    capabilities.dimensionMode === "aspectRatio" ||
    capabilities.dimensionMode === "aspectResolution"
  ) {
    const allowedRatios = (capabilities.aspectRatios ?? []).map((o) => o.id);
    out.aspectRatio =
      input.aspectRatio && allowedRatios.includes(input.aspectRatio)
        ? input.aspectRatio
        : capabilities.defaultDimensions.aspectRatio;
    if (
      input.aspectRatio &&
      allowedRatios.length > 0 &&
      !allowedRatios.includes(input.aspectRatio)
    ) {
      out.warning = `Adjusted aspect ratio to ${out.aspectRatio} (model default).`;
    }
    if (capabilities.dimensionMode === "aspectResolution") {
      const allowedRes = (capabilities.resolutions ?? []).map((o) => o.id);
      out.resolution =
        input.resolution && allowedRes.includes(input.resolution)
          ? input.resolution
          : capabilities.defaultDimensions.resolution;
      if (
        input.resolution &&
        allowedRes.length > 0 &&
        !allowedRes.includes(input.resolution) &&
        !out.warning
      ) {
        out.warning = `Adjusted resolution to ${out.resolution} (model default).`;
      }
    }
    return out;
  }
  if (capabilities.dimensionMode === "fixed") {
    out.width = capabilities.defaultDimensions.width;
    out.height = capabilities.defaultDimensions.height;
    if (capabilities.defaultDimensions.aspectRatio) {
      out.aspectRatio = capabilities.defaultDimensions.aspectRatio;
    }
    if (capabilities.defaultDimensions.resolution) {
      out.resolution = capabilities.defaultDimensions.resolution;
    }
    return out;
  }
  // unknown: pass through anything the caller supplied
  if (input.width !== undefined) out.width = input.width;
  if (input.height !== undefined) out.height = input.height;
  if (input.aspectRatio !== undefined) out.aspectRatio = input.aspectRatio;
  if (input.resolution !== undefined) out.resolution = input.resolution;
  return out;
}

/** Lists the recipe field names that are present in `recipe` but NOT
 *  supported by the supplied capabilities. Used by the compatibility
 *  report builder to surface stripped fields to the UI. */
export function getUnsupportedRecipeFields(
  recipe: { [k: string]: unknown },
  capabilities: ImageModelCapabilities,
): Array<keyof typeof recipe | string> {
  const blocked: Array<keyof typeof recipe | string> = [];
  if (
    recipe.negativePrompt !== undefined &&
    !capabilities.supportsNegativePrompt
  ) {
    blocked.push("negativePrompt");
  }
  if (recipe.seed !== undefined && !capabilities.supportsSeed) {
    blocked.push("seed");
  }
  if (recipe.variants !== undefined && !capabilities.supportsVariants) {
    blocked.push("variants");
  }
  if (recipe.steps !== undefined && capabilities.supportsSteps === false) {
    blocked.push("steps");
  }
  if (
    recipe.cfgScale !== undefined &&
    capabilities.supportsCfgScale === false
  ) {
    blocked.push("cfgScale");
  }
  if (recipe.style !== undefined && capabilities.supportsStyle === false) {
    blocked.push("style");
  }
  if (capabilities.dimensionMode !== "widthHeight") {
    if (recipe.width !== undefined) blocked.push("width");
    if (recipe.height !== undefined) blocked.push("height");
  }
  if (
    capabilities.dimensionMode !== "aspectRatio" &&
    capabilities.dimensionMode !== "aspectResolution"
  ) {
    if (recipe.aspectRatio !== undefined) blocked.push("aspectRatio");
  }
  if (capabilities.dimensionMode !== "aspectResolution") {
    if (recipe.resolution !== undefined) blocked.push("resolution");
  }
  return blocked;
}

/** Returns a short, human-readable summary of what a model supports — used
 *  by Image Studio and the Media Inspector as a "Capabilities" line. */
export interface RecipeCapabilityDescriptor {
  key: `imageCapabilities.${string}`;
  values?: Record<string, string | number>;
}

export function getRecipeCapabilityList(
  capabilities: ImageModelCapabilities,
): RecipeCapabilityDescriptor[] {
  const list: RecipeCapabilityDescriptor[] = [];
  switch (capabilities.dimensionMode) {
    case "widthHeight":
      list.push({
        key: "imageCapabilities.sizes",
        values: { count: capabilities.widthHeightOptions?.length ?? 0 },
      });
      break;
    case "aspectRatio":
      list.push({
        key: "imageCapabilities.ratios",
        values: { count: capabilities.aspectRatios?.length ?? 0 },
      });
      break;
    case "aspectResolution":
      list.push({
        key: "imageCapabilities.ratiosResolutions",
        values: {
          ratios: capabilities.aspectRatios?.length ?? 0,
          resolutions: capabilities.resolutions?.length ?? 0,
        },
      });
      break;
    case "fixed":
      list.push(
        capabilities.defaultDimensions.width &&
          capabilities.defaultDimensions.height
          ? {
              key: "imageCapabilities.fixedDimensions",
              values: {
                width: capabilities.defaultDimensions.width,
                height: capabilities.defaultDimensions.height,
              },
            }
          : { key: "imageCapabilities.fixedSize" },
      );
      break;
    default:
      list.push({ key: "imageCapabilities.unknownSizing" });
  }
  list.push({
    key: capabilities.supportsNegativePrompt
      ? "imageCapabilities.negativePrompt"
      : "imageCapabilities.noNegativePrompt",
  });
  list.push({
    key: capabilities.supportsSeed
      ? "imageCapabilities.seed"
      : "imageCapabilities.noSeed",
  });
  list.push({
    key: capabilities.supportsVariants
      ? "imageCapabilities.variants"
      : "imageCapabilities.singleOutput",
  });
  if (capabilities.supportsSteps === false)
    list.push({ key: "imageCapabilities.noSteps" });
  if (capabilities.supportsCfgScale === false)
    list.push({ key: "imageCapabilities.noCfg" });
  if (capabilities.supportsStyle === false)
    list.push({ key: "imageCapabilities.noStylePreset" });
  if (capabilities.supportsReferences) {
    list.push({
      key: "imageCapabilities.references",
      values: { count: capabilities.referenceLimit ?? 0 },
    });
  } else {
    list.push({ key: "imageCapabilities.noReferences" });
  }
  if (capabilities.qualities && capabilities.qualities.length > 0) {
    list.push({ key: "imageCapabilities.quality" });
  }
  return list;
}
