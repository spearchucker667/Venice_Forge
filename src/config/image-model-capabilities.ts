/** @fileoverview
 *  Model-aware image dimension capabilities. Single source of truth for
 *  which dimension mode, width/height options, presets, aspect ratios,
 *  and optional features (negative prompt, seed) each image model supports.
 *
 *  Sources of truth (verified against docs/Venice_swagger_api.yaml):
 *   - Venice swagger: width/height 64..1280, divisible by 64
 *   - /models endpoint returns ImageConstraints.constraints with
 *     aspectRatios[], resolutions[], steps{min,max,default},
 *     promptCharacterLimit
 *   - SD-classic models (flux-dev, z-image-turbo, hidream, sdxl): width/height
 *   - Nano Banana / modern models: aspect_ratio + optional resolution
 */

import type { ImageConstraints } from "../types/venice";

export type ImageDimensionMode =
  | "widthHeight"
  | "aspectRatio"
  | "fixed"
  | "unknown";

export interface ImageModelCapabilities {
  modelId: string;
  label: string;
  dimensionMode: ImageDimensionMode;
  widthHeightOptions?: Array<{ width: number; height: number; label: string }>;
  aspectRatios?: Array<{ id: string; label: string }>;
  resolutions?: Array<{ id: string; label: string }>;
  defaultDimensions: { width?: number; height?: number; aspectRatio?: string };
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
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
  { width: 1280, height: 1024, label: "1280×1024" },
  { width: 1280, height: 1280, label: "1280×1280" },
];

/**
 * Capability registry. Order does not matter; lookup uses `modelIdPatternMatch`
 * which checks the model id against each entry's patternMatch regex or exact id.
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
  },
  {
    modelId: "z-image-turbo",
    label: "Z Image Turbo",
    dimensionMode: "widthHeight",
    widthHeightOptions: SD_WIDTH_HEIGHT_PAIRS,
    defaultDimensions: { width: 1024, height: 1024 },
    supportsNegativePrompt: true,
    supportsSeed: true,
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
    patternMatch: /^sdxl/i,
  },
  {
    modelId: "nano-banana-v1",
    label: "Nano Banana",
    dimensionMode: "aspectRatio",
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultDimensions: { aspectRatio: "1:1" },
    supportsNegativePrompt: true,
    supportsSeed: true,
    patternMatch: /^nano/i,
  },
  {
    modelId: "venice-uncensored-1-2",
    label: "Venice Uncensored 1.2",
    dimensionMode: "aspectRatio",
    aspectRatios: COMMON_ASPECT_RATIOS,
    defaultDimensions: { aspectRatio: "1:1" },
    supportsNegativePrompt: true,
    supportsSeed: true,
    patternMatch: /^venice/i,
  },
];

/**
 * Returns the known capabilities for a given model ID.
 * Falls back to widthHeight mode with all common pairs for unknown models.
 */
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
  };
}

/**
 * Builds dimension options from model constraints in the /models endpoint
 * response. Falls back to known capabilities when constraints are missing.
 */
export function buildDimensionOptions(
  modelId: string,
  constraints?: ImageConstraints | null,
): Pick<
  ImageModelCapabilities,
  "dimensionMode" | "widthHeightOptions" | "aspectRatios" | "resolutions" | "defaultDimensions"
> {
  const known = getImageModelCapabilities(modelId);

  if (constraints) {
    const hasAspectRatios = constraints.aspectRatios && constraints.aspectRatios.length > 0;
    const hasResolutions = constraints.resolutions && constraints.resolutions.length > 0;

    if (hasAspectRatios) {
      return {
        dimensionMode: "aspectRatio",
        aspectRatios: constraints.aspectRatios!.map((a) => ({ id: a, label: a })),
        resolutions: hasResolutions
          ? constraints.resolutions!.map((r) => ({ id: r, label: r }))
          : undefined,
        defaultDimensions: {
          aspectRatio: constraints.defaultAspectRatio ?? constraints.aspectRatios![0],
        },
      };
    }
  }

  return {
    dimensionMode: known.dimensionMode,
    widthHeightOptions: known.widthHeightOptions,
    aspectRatios: known.aspectRatios,
    defaultDimensions: known.defaultDimensions,
  };
}