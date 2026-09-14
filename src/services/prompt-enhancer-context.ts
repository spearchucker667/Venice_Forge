import type {
  ImageDimensionMode,
  ImageModelCapabilities,
  StyleReferenceCapabilities,
} from "../config/image-model-capabilities";
import type { ImageConstraints, VeniceModel } from "../types/venice";
import { IMAGE_PROMPT_MAX_CHARS } from "../utils/payloadBuilders";

export interface PromptEnhancerDimensions {
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
}

export interface PromptEnhancerReferenceContext {
  count: number;
  role?: "style" | "character" | "composition" | "general";
  visualDescription?: string;
}

export interface PromptEnhancerModelFacts {
  id: string;
  promptCharacterLimit: number;
  dimensionMode?: ImageDimensionMode;
  supportsNegativePrompt?: boolean;
  supportsReferences?: boolean;
  referenceLimit?: number;
}

function finitePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}

/** Derives a compact, verified model snapshot from the existing runtime model
 * record and canonical capability registry result. No lookup or name-based
 * inference occurs here. */
export function derivePromptEnhancerModelFacts(input: {
  modelId: string;
  runtimeModel?: Pick<VeniceModel, "model_spec"> | null;
  capabilities: ImageModelCapabilities;
  dimensionMode?: ImageDimensionMode;
  referenceCapabilities?: StyleReferenceCapabilities;
}): PromptEnhancerModelFacts {
  const constraints = input.runtimeModel?.model_spec?.constraints as
    | ImageConstraints
    | undefined;
  const rawConstraints = constraints as Record<string, unknown> | undefined;
  const runtimeLimit = finitePositiveInteger(
    constraints?.promptCharacterLimit ??
      rawConstraints?.prompt_character_limit ??
      input.runtimeModel?.model_spec?.prompt_character_limit,
  );
  const promptCharacterLimit = Math.min(
    runtimeLimit ?? IMAGE_PROMPT_MAX_CHARS,
    IMAGE_PROMPT_MAX_CHARS,
  );
  const supportsReferences = input.referenceCapabilities
    ? input.referenceCapabilities.supported
    : input.capabilities.supportsReferences === true;

  return {
    id: input.modelId.trim().slice(0, 256),
    promptCharacterLimit,
    dimensionMode: input.dimensionMode ?? input.capabilities.dimensionMode,
    supportsNegativePrompt: input.capabilities.supportsNegativePrompt,
    supportsReferences,
    referenceLimit: supportsReferences
      ? Math.max(
          1,
          input.referenceCapabilities?.maxReferences ??
            input.capabilities.referenceLimit ??
            1,
        )
      : 0,
  };
}

export function effectiveEnhancerPromptLimit(
  targetModel?: PromptEnhancerModelFacts,
): number {
  const modelLimit = finitePositiveInteger(targetModel?.promptCharacterLimit);
  return Math.min(modelLimit ?? IMAGE_PROMPT_MAX_CHARS, IMAGE_PROMPT_MAX_CHARS);
}
