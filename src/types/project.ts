/** @fileoverview Core types for the new Project Workspace + Recipe system (Phase 1 minimal slice).
 * Follows the approved architecture in the session plan.md:
 * - First-class Project metadata (stored in IDB "projects").
 * - Lightweight tagging via (reused) projectRefs on assets.
 * - GenerationRecipe as a serializable, reusable payload surfaced from Media Studio.
 * All fields are additive where they touch existing types (Conversation, MediaItem).
 */

export const PROJECT_VERSION = 1 as const;

/** First-class Project container (per polish target A). */
export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
  metadata?: {
    color?: string;
    icon?: string;
    tags?: string[];
  };
  /** Version for future migrations (additive). */
  version?: typeof PROJECT_VERSION;
}

import type { ImageModelCapabilities } from '../config/image-model-capabilities'
import type { ImageGenerationDraft } from '../stores/image-workspace-store'
import type { MediaItem } from './media'

/** Stable, serializable generation contract shared by Media and Image Studio. */
export interface GenerationRecipe {
  id?: string;
  sourceMediaId?: string;
  sourceProjectId?: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  /** Existing Image Studio extension retained for aspect-resolution models. */
  resolution?: string;
  seed?: number | null;
  steps?: number;
  cfgScale?: number;
  /** Legacy alias accepted while old MediaItem recipes are normalized. */
  cfg?: number;
  variants?: number;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  /** Existing Image Studio extensions retained for current payload parity. */
  quality?: string;
  style?: string;
  operation?: string;
}

/** Patch shape for projects (used by project-store). */
export type ProjectPatch = Partial<
  Pick<Project, 'name' | 'description' | 'archivedAt' | 'metadata'>
>;

/** Handoff payload that can carry a recipe + target project context.
 * Generalizes the existing image-workspace handoff pattern.
 */
export type RecipeHandoffMode = 'use' | 'same-seed' | 'new-seed'

export interface RecipeHandoff {
  recipe: GenerationRecipe;
  mode: RecipeHandoffMode;
  draft: ImageGenerationDraft;
  autoGenerate: boolean;
  parentMediaId: string | null;
}

/** One issue found by `getRecipeCompatibilityReport`. */
export interface RecipeCompatIssue {
  field: string;
  message: string;
  severity: 'info' | 'warn' | 'blocker';
  kind: 'field-dropped' | 'field-defaulted' | 'field-truncated' | 'model-unknown';
}

export type RecipeCompatStatus = 'compatible' | 'partial' | 'incompatible'

export interface RecipeCompatibilityReport {
  status: RecipeCompatStatus
  issues: RecipeCompatIssue[]
  sanitizedRecipe: GenerationRecipe
  unsupportedFields: string[]
}

function optionalNumber(value: number | string | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Stable extraction of a GenerationRecipe from a MediaItem (or null if insufficient data).
 * Per polish target B.
 */
export function extractGenerationRecipe(item: MediaItem): GenerationRecipe | null {
  const stored = item.recipe
  if (stored) {
    if (!stored.prompt || !stored.model) return null
    const recipe: GenerationRecipe = {
      ...stored,
      sourceMediaId: stored.sourceMediaId ?? item.id,
      sourceProjectId: stored.sourceProjectId ?? item.projectId,
      cfgScale: stored.cfgScale ?? stored.cfg ?? optionalNumber(item.cfg),
      metadata: stored.metadata ? { ...stored.metadata } : undefined,
    }
    delete recipe.cfg
    return recipe
  }
  if (!item.prompt || !item.model) return null
  return {
    sourceMediaId: item.id,
    sourceProjectId: item.projectId,
    prompt: item.prompt,
    negativePrompt: item.negative,
    model: item.model,
    width: optionalNumber(item.width),
    height: optionalNumber(item.height),
    aspectRatio: item.aspectRatio,
    resolution: item.resolution,
    seed: item.seed ?? null,
    steps: optionalNumber(item.steps),
    cfgScale: optionalNumber(item.cfg),
    createdAt: new Date(item.timestamp).toISOString(),
    style: item.style,
    quality: item.quality,
    operation: item.operation,
  }
}

function supportedPair(
  width: number | undefined,
  height: number | undefined,
  options: ImageModelCapabilities['widthHeightOptions'],
): boolean {
  return typeof width === 'number' && typeof height === 'number'
    && !!options?.some((option) => option.width === width && option.height === height)
}

/** Returns a capability-safe copy without mutating the supplied recipe. */
export function sanitizeRecipeForModel(
  recipe: GenerationRecipe,
  capabilities: ImageModelCapabilities,
): GenerationRecipe {
  const out: GenerationRecipe = {
    ...recipe,
    cfgScale: recipe.cfgScale ?? recipe.cfg,
    metadata: recipe.metadata ? { ...recipe.metadata } : undefined,
  }
  delete out.cfg

  if (!capabilities.supportsSeed) out.seed = null
  if (!capabilities.supportsNegativePrompt) delete out.negativePrompt

  if (capabilities.supportsVariants) {
    if (typeof out.variants === 'number') out.variants = Math.max(1, Math.min(4, Math.trunc(out.variants)))
  } else {
    delete out.variants
  }

  if (capabilities.supportsSteps === false) delete out.steps
  if (capabilities.supportsCfgScale === false) delete out.cfgScale
  if (capabilities.supportsStyle === false) delete out.style

  if (capabilities.dimensionMode === 'widthHeight') {
    delete out.aspectRatio
    delete out.resolution
    if (!supportedPair(out.width, out.height, capabilities.widthHeightOptions)) {
      out.width = capabilities.defaultDimensions.width
      out.height = capabilities.defaultDimensions.height
    }
  } else if (
    capabilities.dimensionMode === 'aspectRatio'
    || capabilities.dimensionMode === 'aspectResolution'
  ) {
    delete out.width
    delete out.height
    const allowedRatios = capabilities.aspectRatios?.map((option) => option.id) ?? []
    if (!out.aspectRatio || !allowedRatios.includes(out.aspectRatio)) {
      out.aspectRatio = capabilities.defaultDimensions.aspectRatio
    }
    if (capabilities.dimensionMode === 'aspectResolution') {
      const allowedResolutions = capabilities.resolutions?.map((option) => option.id) ?? []
      if (!out.resolution || !allowedResolutions.includes(out.resolution)) {
        out.resolution = capabilities.defaultDimensions.resolution
      }
    } else {
      delete out.resolution
    }
  } else if (capabilities.dimensionMode === 'fixed') {
    out.width = capabilities.defaultDimensions.width
    out.height = capabilities.defaultDimensions.height
    out.aspectRatio = capabilities.defaultDimensions.aspectRatio
    out.resolution = capabilities.defaultDimensions.resolution
  } else {
    delete out.width
    delete out.height
    delete out.aspectRatio
    delete out.resolution
  }

  return out
}

export function recipeToImageFormState(recipe: GenerationRecipe): ImageGenerationDraft {
  const draft: ImageGenerationDraft = {
    model: recipe.model,
    prompt: recipe.prompt,
  }
  if (recipe.negativePrompt !== undefined) draft.negativePrompt = recipe.negativePrompt
  if (recipe.style !== undefined) draft.style = recipe.style
  if (recipe.steps !== undefined) draft.steps = recipe.steps
  if (recipe.cfgScale !== undefined) draft.cfgScale = recipe.cfgScale
  if (recipe.variants !== undefined) draft.imageCount = recipe.variants
  if (recipe.width !== undefined) draft.width = recipe.width
  if (recipe.height !== undefined) draft.height = recipe.height
  if (recipe.aspectRatio !== undefined) draft.aspectRatio = recipe.aspectRatio
  if (recipe.resolution !== undefined) draft.resolution = recipe.resolution
  if (recipe.quality !== undefined) draft.quality = recipe.quality
  if (recipe.seed !== undefined) draft.seed = recipe.seed
  return draft
}

export function createRecipeHandoff(
  recipe: GenerationRecipe,
  mode: RecipeHandoffMode,
): RecipeHandoff {
  const handoffRecipe: GenerationRecipe = {
    ...recipe,
    metadata: recipe.metadata ? { ...recipe.metadata } : undefined,
    seed: mode === 'new-seed' ? null : recipe.seed,
  }
  return {
    recipe: handoffRecipe,
    mode,
    draft: recipeToImageFormState(handoffRecipe),
    autoGenerate: mode !== 'use',
    parentMediaId: mode === 'use' ? null : handoffRecipe.sourceMediaId ?? null,
  }
}

/** Pure, non-mutating. Returns a structured compatibility report by
 *  diffing the original recipe against `sanitizeRecipeForModel`'s output
 *  and against the live capability contract. The status is
 *  `incompatible` only when the model is unknown AND the prompt is empty,
 *  or when a blocker issue (e.g. a recipe with no prompt at all) is found.
 *  Otherwise any sanitization findings surface as `partial`. */
export function getRecipeCompatibilityReport(
  recipe: GenerationRecipe,
  capabilities: ImageModelCapabilities,
  modelIsKnown: boolean = true,
): RecipeCompatibilityReport {
  const issues: RecipeCompatIssue[] = []
  const unsupportedFields: string[] = []

  if (!recipe.prompt || recipe.prompt.trim() === '') {
    issues.push({
      field: 'prompt',
      message: 'Recipe is missing a prompt.',
      severity: 'blocker',
      kind: 'field-truncated',
    })
  }
  if (!recipe.model) {
    issues.push({
      field: 'model',
      message: 'Recipe is missing a target model.',
      severity: 'blocker',
      kind: 'field-truncated',
    })
  }
  if (!modelIsKnown) {
    issues.push({
      field: 'model',
      message: `Model "${capabilities.modelId}" is not in the known registry — defaults applied.`,
      severity: 'warn',
      kind: 'model-unknown',
    })
  }

  if (!capabilities.supportsNegativePrompt && recipe.negativePrompt !== undefined) {
    issues.push({
      field: 'negativePrompt',
      message: `${capabilities.modelId} does not support a negative prompt — it will be dropped.`,
      severity: 'warn',
      kind: 'field-dropped',
    })
    unsupportedFields.push('negativePrompt')
  }
  if (!capabilities.supportsSeed && recipe.seed !== undefined && recipe.seed !== null) {
    issues.push({
      field: 'seed',
      message: `${capabilities.modelId} does not support a seed — it will be dropped.`,
      severity: 'warn',
      kind: 'field-dropped',
    })
    unsupportedFields.push('seed')
  }
  if (!capabilities.supportsVariants && recipe.variants !== undefined) {
    issues.push({
      field: 'variants',
      message: `${capabilities.modelId} does not support multiple variants — value will be dropped.`,
      severity: 'warn',
      kind: 'field-dropped',
    })
    unsupportedFields.push('variants')
  }
  if (capabilities.supportsSteps === false && recipe.steps !== undefined) {
    issues.push({
      field: 'steps',
      message: `${capabilities.modelId} does not support steps — value will be dropped.`,
      severity: 'warn',
      kind: 'field-dropped',
    })
    unsupportedFields.push('steps')
  }
  if (capabilities.supportsCfgScale === false && recipe.cfgScale !== undefined) {
    issues.push({
      field: 'cfgScale',
      message: `${capabilities.modelId} does not support CFG scale — value will be dropped.`,
      severity: 'warn',
      kind: 'field-dropped',
    })
    unsupportedFields.push('cfgScale')
  }
  if (capabilities.supportsStyle === false && recipe.style !== undefined) {
    issues.push({
      field: 'style',
      message: `${capabilities.modelId} does not support a style preset — value will be dropped.`,
      severity: 'warn',
      kind: 'field-dropped',
    })
    unsupportedFields.push('style')
  }

  if (capabilities.dimensionMode !== 'widthHeight') {
    if (recipe.width !== undefined) {
      issues.push({
        field: 'width/height',
        message: `${capabilities.modelId} uses aspect-ratio sizing — pixel width/height will be dropped.`,
        severity: 'info',
        kind: 'field-dropped',
      })
      unsupportedFields.push('width')
    }
    if (recipe.height !== undefined) {
      unsupportedFields.push('height')
    }
  }
  if (
    capabilities.dimensionMode !== 'aspectRatio'
    && capabilities.dimensionMode !== 'aspectResolution'
    && recipe.aspectRatio !== undefined
  ) {
    issues.push({
      field: 'aspectRatio',
      message: `${capabilities.modelId} uses pixel sizing — aspect ratio will be dropped.`,
      severity: 'info',
      kind: 'field-dropped',
    })
    unsupportedFields.push('aspectRatio')
  }
  if (
    capabilities.dimensionMode !== 'aspectResolution'
    && recipe.resolution !== undefined
  ) {
    issues.push({
      field: 'resolution',
      message: `${capabilities.modelId} does not support a resolution preset — value will be dropped.`,
      severity: 'info',
      kind: 'field-dropped',
    })
    unsupportedFields.push('resolution')
  }

  const sanitizedRecipe = sanitizeRecipeForModel(recipe, capabilities)

  if (capabilities.dimensionMode === 'widthHeight') {
    const originalPair = `${recipe.width}x${recipe.height}`
    const finalPair = `${sanitizedRecipe.width}x${sanitizedRecipe.height}`
    if (recipe.width !== undefined && recipe.height !== undefined && originalPair !== finalPair) {
      issues.push({
        field: 'width/height',
        message: `Dimensions ${originalPair} are not supported — defaulted to ${finalPair}.`,
        severity: 'info',
        kind: 'field-defaulted',
      })
    }
  } else if (
    capabilities.dimensionMode === 'aspectRatio'
    || capabilities.dimensionMode === 'aspectResolution'
  ) {
    const allowed = (capabilities.aspectRatios ?? []).map((o) => o.id)
    if (
      recipe.aspectRatio
      && allowed.length > 0
      && !allowed.includes(recipe.aspectRatio)
    ) {
      issues.push({
        field: 'aspectRatio',
        message: `Aspect ratio "${recipe.aspectRatio}" is not supported — defaulted to ${sanitizedRecipe.aspectRatio}.`,
        severity: 'info',
        kind: 'field-defaulted',
      })
    }
    if (capabilities.dimensionMode === 'aspectResolution') {
      const allowedRes = (capabilities.resolutions ?? []).map((o) => o.id)
      if (
        recipe.resolution
        && allowedRes.length > 0
        && !allowedRes.includes(recipe.resolution)
      ) {
        issues.push({
          field: 'resolution',
          message: `Resolution "${recipe.resolution}" is not supported — defaulted to ${sanitizedRecipe.resolution}.`,
          severity: 'info',
          kind: 'field-defaulted',
        })
      }
    }
  }

  const hasBlocker = issues.some((i) => i.severity === 'blocker')
  const status: RecipeCompatStatus = hasBlocker
    ? 'incompatible'
    : issues.length > 0
      ? 'partial'
      : 'compatible'

  return {
    status,
    issues,
    sanitizedRecipe,
    unsupportedFields,
  }
}
