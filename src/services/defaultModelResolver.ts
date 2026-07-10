import type { VeniceModel } from '../types/venice'

export const CONFIGURED_DEFAULT_CHAT_MODEL = 'zai-org-glm-4.6'

export interface DefaultModelResolution {
  modelId: string
  source: 'venice-default-metadata' | 'configured-default' | 'known-fallback'
}

const NON_CHAT_PATTERNS = [
  /\bimage\b/,
  /flux/,
  /sdxl/,
  /stable-diffusion/,
  /\baudio\b/,
  /\bmusic\b/,
  /\btts\b/,
  /\bembedding\b/,
  /\bvideo\b/,
  /\bupscale\b/,
  /kokoro/,
  /\bwan[-.]/,
  /\bkling\b/,
  /\bveo\b/,
  /\bltx\b/,
  /\bpixverse\b/,
  /\bseedance\b/,
  /\brunway\b/,
  /\btopaz\b/,
  /\besrgan\b/,
  /\brealesrgan\b/,
  /\bclarity\b/,
]

function isTextChatModel(model: VeniceModel): boolean {
  if (model.model_spec?.offline) return false
  const constraints = model.model_spec?.constraints
  if (constraints && typeof constraints === 'object') {
    // Image/video/audio models expose generation constraints (aspect ratios,
    // durations, etc.). Chat models have no generation constraints block.
    if (
      'aspectRatios' in constraints ||
      'resolutions' in constraints ||
      'durations' in constraints ||
      'model_type' in constraints
    ) {
      return false
    }
  }
  const id = model.id.toLowerCase()
  if (NON_CHAT_PATTERNS.some((pattern) => pattern.test(id))) return false
  return true
}

export function resolveDefaultChatModel(models: readonly VeniceModel[]): DefaultModelResolution {
  const available = models.filter(isTextChatModel)
  const metadataDefault = available.find((model) => model.model_spec?.traits?.includes('default'))
  if (metadataDefault) {
    return { modelId: metadataDefault.id, source: 'venice-default-metadata' }
  }
  if (available.some((model) => model.id === CONFIGURED_DEFAULT_CHAT_MODEL)) {
    return { modelId: CONFIGURED_DEFAULT_CHAT_MODEL, source: 'configured-default' }
  }
  return {
    modelId: available[0]?.id ?? CONFIGURED_DEFAULT_CHAT_MODEL,
    source: available.length > 0 ? 'known-fallback' : 'configured-default',
  }
}
