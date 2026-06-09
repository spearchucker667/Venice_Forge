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
    typeof width !== "number"
    || typeof height !== "number"
    || !Number.isFinite(width)
    || !Number.isFinite(height)
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
        capabilities.defaultDimensions.width === width
        && capabilities.defaultDimensions.height === height
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
    capabilities.dimensionMode === "aspectRatio"
    || capabilities.dimensionMode === "aspectResolution"
  ) {
    const allowedRatios = (capabilities.aspectRatios ?? []).map((o) => o.id);
    out.aspectRatio =
      input.aspectRatio && allowedRatios.includes(input.aspectRatio)
        ? input.aspectRatio
        : capabilities.defaultDimensions.aspectRatio;
    if (
      input.aspectRatio
      && allowedRatios.length > 0
      && !allowedRatios.includes(input.aspectRatio)
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
        input.resolution
        && allowedRes.length > 0
        && !allowedRes.includes(input.resolution)
        && !out.warning
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
  if (recipe.negativePrompt !== undefined && !capabilities.supportsNegativePrompt) {
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
  if (recipe.cfgScale !== undefined && capabilities.supportsCfgScale === false) {
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
    capabilities.dimensionMode !== "aspectRatio"
    && capabilities.dimensionMode !== "aspectResolution"
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
export function getRecipeCapabilityList(capabilities: ImageModelCapabilities): string[] {
  const list: string[] = [];
  switch (capabilities.dimensionMode) {
    case "widthHeight":
      list.push(`${capabilities.widthHeightOptions?.length ?? 0} sizes`);
      break;
    case "aspectRatio":
      list.push(`${capabilities.aspectRatios?.length ?? 0} ratios`);
      break;
    case "aspectResolution":
      list.push(
        `${capabilities.aspectRatios?.length ?? 0} ratios × ${capabilities.resolutions?.length ?? 0} resolutions`,
      );
      break;
    case "fixed":
      list.push(
        capabilities.defaultDimensions.width && capabilities.defaultDimensions.height
          ? `Fixed ${capabilities.defaultDimensions.width}x${capabilities.defaultDimensions.height}`
          : "Fixed size",
      );
      break;
    default:
      list.push("Unknown sizing");
  }
  list.push(capabilities.supportsNegativePrompt ? "Negative prompt" : "No negative prompt");
  list.push(capabilities.supportsSeed ? "Seed" : "No seed");
  list.push(capabilities.supportsVariants ? "Variants" : "Single output");
  if (capabilities.supportsSteps === false) list.push("No steps");
  if (capabilities.supportsCfgScale === false) list.push("No CFG");
  if (capabilities.supportsStyle === false) list.push("No style preset");
  if (capabilities.qualities && capabilities.qualities.length > 0) {
    list.push("Quality");
  }
  return list;
}
