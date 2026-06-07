/** @fileoverview
 *  Model-aware image dimension capabilities. Single source of truth for
 *  which dimension mode, width/height options, presets, aspect ratios,
 *  optional resolution, optional quality, and features (negative
 *  prompt, seed) each image model supports.
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

import type { ImageConstraints } from "../types/venice";

export type ImageDimensionMode =
  | "widthHeight"
  | "aspectRatio"
  | "aspectResolution"
  | "fixed"
  | "unknown";

export type ImageQuality = "low" | "medium" | "high" | "auto";

export interface ImageModelCapabilities {
  modelId: string;
  label: string;
  dimensionMode: ImageDimensionMode;
  widthHeightOptions?: Array<{ width: number; height: number; label: string }>;
  aspectRatios?: Array<{ id: string; label: string }>;
  resolutions?: Array<{ id: string; label: string }>;
  qualities?: Array<{ id: ImageQuality; label: string }>;
  defaultDimensions: { width?: number; height?: number; aspectRatio?: string; resolution?: string };
  defaultQuality?: ImageQuality;
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
  supportsVariants: boolean;
  /** Map from canonical model ID patterns — used for models not yet in the catalog. */
  patternMatch?: RegExp;
}

/** Common aspect ratio presets used across Venice models. */
const COMMON_ASPECT_RATIOS = [
  { id: "1:1", label: "Square (1:1)" },
  { id: "16:9", label: "Landscape (16:9)" },
  { id: "9:16", label: "Portrait (9:16)" },
  { id: "4:3", label: "Standard (4:3)" },
  { id: "3:2", label: "Photo (3:2)" },
  { id: "2:3", label: "Portrait (2:3)" },
  { id: "21:9", label: "Ultrawide (21:9)" },
];

/** Common resolution presets used by aspect-resolution models. */
const COMMON_RESOLUTIONS = [
  { id: "1k", label: "1K" },
  { id: "2k", label: "2K" },
  { id: "4k", label: "4K" },
];

/** Common quality presets for models that support explicit quality. */
const COMMON_QUALITIES = [
  { id: "low" as const, label: "Low" },
  { id: "medium" as const, label: "Medium" },
  { id: "high" as const, label: "High" },
];

/** Common width/height size options for SD-classic models. */
const SD_WIDTH_HEIGHT_PAIRS: ImageModelCapabilities["widthHeightOptions"] = [
  { width: 512, height: 512, label: "512×512" },
  { width: 512, height: 768, label: "512×768" },
  { width: 576, height: 1024, label: "576×1024" },
  { width: 768, height: 512, label: "768×512" },
  { width: 768, height: 768, label: "768×768" },
  { width: 768, height: 1024, label: "768×1024" },
  { width: 1024, height: 576, label: "1024×576" },
  { width: 1024, height: 768, label: "1024×768" },
  { width: 1024, height: 1024, label: "1024×1024" },
  { width: 1024, height: 1280, label: "1024×1280" },
  { width: 1280, height: 720, label: "1280×720" },
  { width: 1280, height: 1024, label: "1280×1280" },
  { width: 1280, height: 1280, label: "1280×1280" },
];

/**
 * Capability registry. Order does not matter; lookup uses `modelIdPatternMatch`
 * which checks the model id against each entry's patternMatch regex or exact id.
 *
 * Text-only models (e.g. `venice-uncensored-1-2`) MUST NOT be registered here
 * because they do not expose `/image/generate` constraints.
 */
const IMAGE_MODEL_CAPABILITIES: ImageModelCapabilities[] = [
  {
    modelId: "flux-dev",
    label: "Flux Dev",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    patternMatch: /^flux/i,
  },
  {
    modelId: "flux-dev-schnell",
    label: "Flux Dev Schnell",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
  },
  {
    modelId: "z-image-turbo",
    label: "Z Image Turbo",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    patternMatch: /^z-image/i,
  },
  {
    modelId: "hidream-i-flux-dev",
    label: "HiDream I Flux Dev",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    patternMatch: /^hidream/i,
  },
  {
    modelId: "sdxl",
    label: "SDXL",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    patternMatch: /^sdxl/i,
  },
  {
    modelId: "nano-banana-v1",
    label: "Nano Banana",
    dimensionMode: "aspectResolution",
    aspectRatios: COMMON_ASPECT_RATIOS,
    resolutions: COMMON_RESOLUTIONS,
    defaultDimensions: { aspectRatio: "1:1", resolution: "1k" },
    qualities: COMMON_QUALITIES,
    defaultQuality: "high",
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsVariants: true,
    patternMatch: /^nano/i,
  },
];

/** Picks the first string-array field that is non-empty. */
function pickStringArray(...candidates: ReadonlyArray<unknown>): string[] | undefined {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0 && c.every((v) => typeof v === "string")) {
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
  const defaultAspectRatio = pickString(r.defaultAspectRatio, r.default_aspect_ratio);
  const resolutions = pickStringArray(r.resolutions);
  const defaultResolution = pickString(r.defaultResolution, r.default_resolution);
  const widthHeightDivisor = pickNumber(r.widthHeightDivisor, r.width_height_divisor);
  return {
    promptCharacterLimit: pickNumber(r.promptCharacterLimit, r.prompt_character_limit),
    aspectRatios,
    defaultAspectRatio,
    resolutions,
    defaultResolution,
    widthHeightDivisor,
    steps: r.steps as ImageConstraints["steps"],
  };
}

/** Returns the known capabilities for a given model ID.
 *  Falls back to widthHeight mode with all common pairs for unknown models. */
export function getImageModelCapabilities(modelId: string): ImageModelCapabilities {
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
  };
}

/** Build dimension options for the model, preferring live `/models`
 *  constraints over the static registry. */
export function buildDimensionOptions(
  modelId: string,
  constraints?: ImageConstraints | null,
): Pick<
  ImageModelCapabilities,
  "dimensionMode" | "widthHeightOptions" | "aspectRatios" | "resolutions" | "defaultDimensions" | "qualities" | "defaultQuality"
> {
  const known = getImageModelCapabilities(modelId);
  const normalised = normaliseConstraints(constraints);

  if (normalised && normalised.aspectRatios && normalised.aspectRatios.length > 0) {
    const aspectRatios = normalised.aspectRatios.map((a) => ({ id: a, label: a }));
    const hasResolutions =
      Array.isArray(normalised.resolutions) && normalised.resolutions.length > 0;
    const defaultAspectRatio =
      normalised.defaultAspectRatio ?? normalised.aspectRatios[0];
    const defaultResolution = hasResolutions
      ? normalised.defaultResolution ?? normalised.resolutions![0]
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

  return {
    dimensionMode: known.dimensionMode,
    widthHeightOptions: known.widthHeightOptions,
    aspectRatios: known.aspectRatios,
    resolutions: known.resolutions,
    defaultDimensions: known.defaultDimensions,
    qualities: known.qualities,
    defaultQuality: known.defaultQuality,
  };
}
