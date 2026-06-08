/** @fileoverview VERIFY-042 + VERIFY-043 GenerationRecipe extraction, sanitization,
 *  handoff, and Phase 2A compatibility-report contracts. */

import { describe, expect, it } from 'vitest'
import type { ImageModelCapabilities } from '../config/image-model-capabilities'
import type { MediaItem } from './media'
import {
  createRecipeHandoff,
  extractGenerationRecipe,
  getRecipeCompatibilityReport,
  recipeToImageFormState,
  sanitizeRecipeForModel,
  type GenerationRecipe,
} from './project'

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media-1', image: 'data:image/png;base64,AA', prompt: 'Copper city', model: 'flux-dev',
    timestamp: 1_700_000_000_000, mediaType: 'image', operation: 'generate', parentId: null,
    childrenIds: [], tags: [], note: '', favorite: false, projectId: 'project-1',
    ...overrides,
  }
}

const restrictedCapabilities: ImageModelCapabilities = {
  modelId: 'restricted', label: 'Restricted', dimensionMode: 'aspectRatio',
  aspectRatios: [{ id: '1:1', label: 'Square' }],
  defaultDimensions: { aspectRatio: '1:1' }, supportsNegativePrompt: false,
  supportsSeed: false, supportsVariants: false, supportsSteps: false,
  supportsCfgScale: false, supportsStyle: false,
}

describe('GenerationRecipe contracts', () => {
  it('extracts and normalizes a complete stored recipe without mutating its source', () => {
    const metadata = { nested: 'value' }
    const item = media({
      recipe: {
        id: 'recipe-1', prompt: 'Stored prompt', negativePrompt: 'fog', model: 'flux-dev',
        width: 1024, height: 768, seed: 0, steps: 24, cfg: 6.5, variants: 3,
        createdAt: '2026-06-08T00:00:00.000Z', metadata,
      },
    })
    const snapshot = structuredClone(item)
    const recipe = extractGenerationRecipe(item)

    expect(recipe).toEqual(expect.objectContaining({
      id: 'recipe-1', sourceMediaId: 'media-1', sourceProjectId: 'project-1',
      prompt: 'Stored prompt', model: 'flux-dev', seed: 0, cfgScale: 6.5,
      variants: 3, createdAt: '2026-06-08T00:00:00.000Z',
    }))
    expect(recipe).not.toHaveProperty('cfg')
    expect(recipe?.metadata).toEqual(metadata)
    expect(recipe?.metadata).not.toBe(metadata)
    expect(item).toEqual(snapshot)
  })

  it('normalizes numeric legacy fields and creates a deterministic timestamp', () => {
    expect(extractGenerationRecipe(media({ width: '1024', height: '768', steps: '20', cfg: '7' })))
      .toEqual(expect.objectContaining({
        width: 1024, height: 768, steps: 20, cfgScale: 7,
        seed: null, createdAt: '2023-11-14T22:13:20.000Z',
      }))
  })

  it('returns null when prompt or model is missing', () => {
    expect(extractGenerationRecipe(media({ prompt: '' }))).toBeNull()
    expect(extractGenerationRecipe(media({ model: '' }))).toBeNull()
  })

  it('removes unsupported fields and leaves the original recipe unchanged', () => {
    const recipe: GenerationRecipe = {
      prompt: 'Prompt', model: 'restricted', negativePrompt: 'negative', seed: 42,
      width: 1024, height: 1024, aspectRatio: '16:9', variants: 8,
      steps: 30, cfgScale: 7, style: 'photo', metadata: { source: 'test' },
    }
    const snapshot = structuredClone(recipe)
    const sanitized = sanitizeRecipeForModel(recipe, restrictedCapabilities)

    expect(sanitized).toEqual(expect.objectContaining({
      prompt: 'Prompt', model: 'restricted', seed: null, aspectRatio: '1:1',
    }))
    expect(sanitized).not.toHaveProperty('negativePrompt')
    expect(sanitized).not.toHaveProperty('width')
    expect(sanitized).not.toHaveProperty('height')
    expect(sanitized).not.toHaveProperty('variants')
    expect(sanitized).not.toHaveProperty('steps')
    expect(sanitized).not.toHaveProperty('cfgScale')
    expect(sanitized).not.toHaveProperty('style')
    expect(recipe).toEqual(snapshot)
  })

  it('preserves supported dimensions and clamps supported variants', () => {
    const capabilities: ImageModelCapabilities = {
      modelId: 'pixel', label: 'Pixel', dimensionMode: 'widthHeight',
      widthHeightOptions: [{ width: 768, height: 512, label: '768x512' }],
      defaultDimensions: { width: 512, height: 512 }, supportsNegativePrompt: true,
      supportsSeed: true, supportsVariants: true,
    }
    const sanitized = sanitizeRecipeForModel(
      { prompt: 'Prompt', model: 'pixel', width: 768, height: 512, variants: 99, seed: null },
      capabilities,
    )
    expect(sanitized).toMatchObject({ width: 768, height: 512, variants: 4, seed: null })
  })

  it('maps recipe state and enforces same/new-seed handoff semantics', () => {
    const recipe: GenerationRecipe = {
      sourceMediaId: 'media-1', prompt: 'Prompt', model: 'flux-dev', seed: 0,
      variants: 2, width: 1024, height: 1024,
    }
    const recipeWithCfg = { ...recipe, cfgScale: 7 }
    expect(recipeToImageFormState(recipeWithCfg)).toMatchObject({ seed: 0, imageCount: 2, cfgScale: 7 })
    expect(createRecipeHandoff(recipe, 'same-seed')).toMatchObject({
      autoGenerate: true, parentMediaId: 'media-1', draft: { seed: 0 },
    })
    expect(createRecipeHandoff(recipe, 'new-seed')).toMatchObject({
      autoGenerate: true, parentMediaId: 'media-1', draft: { seed: null },
    })
    expect(createRecipeHandoff(recipe, 'use')).toMatchObject({
      autoGenerate: false, parentMediaId: null, draft: { seed: 0 },
    })
  })
})

describe('getRecipeCompatibilityReport (VERIFY-043)', () => {
  it('returns "compatible" for a fully-supported recipe', () => {
    const recipe: GenerationRecipe = {
      prompt: 'A copper city at dusk', model: 'flux-dev', width: 1024, height: 1024, seed: 0,
    }
    const caps: ImageModelCapabilities = {
      modelId: 'flux-dev', label: 'Flux Dev', dimensionMode: 'widthHeight',
      widthHeightOptions: [{ width: 1024, height: 1024, label: '1024x1024' }],
      defaultDimensions: { width: 1024, height: 1024 },
      supportsNegativePrompt: true, supportsSeed: true, supportsVariants: true,
    }
    const report = getRecipeCompatibilityReport(recipe, caps, true)
    expect(report.status).toBe('compatible')
    expect(report.issues).toHaveLength(0)
    expect(report.unsupportedFields).toHaveLength(0)
    expect(report.sanitizedRecipe).toMatchObject({ width: 1024, height: 1024 })
  })

  it('returns "partial" when a width/height pair must be defaulted', () => {
    const recipe: GenerationRecipe = {
      prompt: 'A copper city at dusk', model: 'flux-dev', width: 333, height: 333,
    }
    const caps: ImageModelCapabilities = {
      modelId: 'flux-dev', label: 'Flux Dev', dimensionMode: 'widthHeight',
      widthHeightOptions: [{ width: 1024, height: 1024, label: '1024x1024' }],
      defaultDimensions: { width: 1024, height: 1024 },
      supportsNegativePrompt: true, supportsSeed: true, supportsVariants: true,
    }
    const report = getRecipeCompatibilityReport(recipe, caps, true)
    expect(report.status).toBe('partial')
    expect(report.issues.some((i) => i.field === 'width/height')).toBe(true)
    expect(report.sanitizedRecipe).toMatchObject({ width: 1024, height: 1024 })
  })

  it('returns "partial" with unsupportedFields when the model does not support negativePrompt / seed / variants / steps / cfg / style', () => {
    const recipe: GenerationRecipe = {
      prompt: 'A copper city at dusk', model: 'restricted', aspectRatio: '1:1',
      negativePrompt: 'fog', seed: 1, variants: 2, steps: 20, cfgScale: 7, style: 'photo',
    }
    const report = getRecipeCompatibilityReport(recipe, restrictedCapabilities, true)
    expect(report.status).toBe('partial')
    expect(report.unsupportedFields).toEqual(expect.arrayContaining([
      'negativePrompt', 'seed', 'variants', 'steps', 'cfgScale', 'style',
    ]))
    expect(report.sanitizedRecipe).not.toHaveProperty('negativePrompt')
    // seed is normalized to null (not deleted) when the model does not support it.
    expect(report.sanitizedRecipe.seed).toBeNull()
    expect(report.sanitizedRecipe).not.toHaveProperty('variants')
    expect(report.sanitizedRecipe).not.toHaveProperty('steps')
    expect(report.sanitizedRecipe).not.toHaveProperty('cfgScale')
    expect(report.sanitizedRecipe).not.toHaveProperty('style')
  })

  it('returns "incompatible" when the prompt is empty', () => {
    const recipe: GenerationRecipe = { prompt: '', model: 'flux-dev' }
    const caps: ImageModelCapabilities = {
      modelId: 'flux-dev', label: 'Flux Dev', dimensionMode: 'widthHeight',
      defaultDimensions: { width: 1024, height: 1024 },
      supportsNegativePrompt: true, supportsSeed: true, supportsVariants: true,
    }
    const report = getRecipeCompatibilityReport(recipe, caps, true)
    expect(report.status).toBe('incompatible')
    expect(report.issues.some((i) => i.severity === 'blocker' && i.field === 'prompt')).toBe(true)
  })

  it('flags "model-unknown" when modelIsKnown=false', () => {
    const recipe: GenerationRecipe = { prompt: 'A copper city at dusk', model: 'unknown-model' }
    const caps: ImageModelCapabilities = {
      modelId: 'unknown-model', label: 'unknown-model', dimensionMode: 'unknown',
      defaultDimensions: {},
      supportsNegativePrompt: true, supportsSeed: true, supportsVariants: true,
    }
    const report = getRecipeCompatibilityReport(recipe, caps, false)
    expect(report.issues.some((i) => i.kind === 'model-unknown')).toBe(true)
  })
})
