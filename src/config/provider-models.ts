import type { VeniceModel } from '../types/venice'
import { ProviderId } from '../types/provider'
import { useSettingsStore } from '../stores/settings-store'

// A static catalog of fallback models mapped to their respective providers.
// These are mocked into the VeniceModel format so the UI components can seamlessly
// render them in the model dropdowns and capability resolvers.

// We wrap the VeniceModel with a local type property so we can filter by ?type=text|image
export type FallbackModelDef = VeniceModel & { _type: 'text' | 'image' }

const FALLBACK_MODEL_CATALOG_TIMESTAMP = 0

export const FALLBACK_MODELS: Record<ProviderId, FallbackModelDef[]> = {
  venice: [], // Venice is the primary provider; its models come from the live /models API.
  google_gemini: [
    {
      id: 'google_gemini:gemini-2.5-pro',
      object: 'model',
      created: FALLBACK_MODEL_CATALOG_TIMESTAMP,
      owned_by: 'google_gemini',
      _type: 'text',
      model_spec: {
        name: 'Gemini 2.5 Pro',
        capabilities: { supportsVision: true, supportsFunctionCalling: true },
      }
    }
  ],
  together: [
    {
      id: 'together:meta-llama/Llama-3-70b-chat-hf',
      object: 'model',
      created: FALLBACK_MODEL_CATALOG_TIMESTAMP,
      owned_by: 'together',
      _type: 'text',
      model_spec: {
        name: 'Llama 3 70B (Together)',
        capabilities: { supportsVision: false, supportsFunctionCalling: true },
      }
    },
    {
      id: 'together:black-forest-labs/FLUX.1-schnell-Free',
      object: 'model',
      created: FALLBACK_MODEL_CATALOG_TIMESTAMP,
      owned_by: 'together',
      _type: 'image',
      model_spec: {
        name: 'Flux Schnell (Together)',
        capabilities: { supportsVision: false, supportsFunctionCalling: false },
      }
    }
  ],
  groq: [
    {
      id: 'groq:llama3-70b-8192',
      object: 'model',
      created: FALLBACK_MODEL_CATALOG_TIMESTAMP,
      owned_by: 'groq',
      _type: 'text',
      model_spec: {
        name: 'Llama 3 70B (Groq)',
        capabilities: { supportsVision: false, supportsFunctionCalling: true },
      }
    },
    {
      id: 'groq:mixtral-8x7b-32768',
      object: 'model',
      created: FALLBACK_MODEL_CATALOG_TIMESTAMP,
      owned_by: 'groq',
      _type: 'text',
      model_spec: {
        name: 'Mixtral 8x7B (Groq)',
        capabilities: { supportsVision: false, supportsFunctionCalling: true },
      }
    }
  ],
  anthropic: [
    {
      id: 'anthropic:claude-3-5-sonnet-latest',
      object: 'model',
      created: FALLBACK_MODEL_CATALOG_TIMESTAMP,
      owned_by: 'anthropic',
      _type: 'text',
      model_spec: {
        name: 'Claude 3.5 Sonnet',
        capabilities: { supportsVision: true, supportsFunctionCalling: true },
      }
    },
    {
      id: 'anthropic:claude-3-opus-latest',
      object: 'model',
      created: FALLBACK_MODEL_CATALOG_TIMESTAMP,
      owned_by: 'anthropic',
      _type: 'text',
      model_spec: {
        name: 'Claude 3 Opus',
        capabilities: { supportsVision: true, supportsFunctionCalling: true },
      }
    }
  ],
  fireworks: [
    {
      id: 'fireworks:accounts/fireworks/models/llama-v3p1-70b-instruct',
      object: 'model',
      created: FALLBACK_MODEL_CATALOG_TIMESTAMP,
      owned_by: 'fireworks',
      _type: 'text',
      model_spec: {
        name: 'Llama 3.1 70B (Fireworks)',
        capabilities: { supportsVision: false, supportsFunctionCalling: true },
      }
    }
  ],
  replicate: [],
  aws_bedrock: [],
  google_vertex: [],
  azure_openai: [],
  huggingface: [],
  mistral: [
    {
      id: 'mistral:mistral-large-latest',
      object: 'model',
      created: FALLBACK_MODEL_CATALOG_TIMESTAMP,
      owned_by: 'mistral',
      _type: 'text',
      model_spec: {
        name: 'Mistral Large',
        capabilities: { supportsVision: false, supportsFunctionCalling: true },
      }
    }
  ],
  perplexity: [
    {
      id: 'perplexity:llama-3-sonar-large-32k-online',
      object: 'model',
      created: FALLBACK_MODEL_CATALOG_TIMESTAMP,
      owned_by: 'perplexity',
      _type: 'text',
      model_spec: {
        name: 'Sonar Large Online',
        capabilities: { supportsVision: false, supportsFunctionCalling: false },
      }
    }
  ],
  cohere: []
}

/**
 * Merges live Venice models with models from enabled fallback providers.
 * Assigns `owned_by` so the provider adapter can route the request correctly.
 */
export function getEnabledProviderModels(type?: string): VeniceModel[] {
  const enabledProviders = useSettingsStore.getState().enabledProviders
  const models: VeniceModel[] = []

  const normalizedType = type === 'chat' ? 'text' : type;

  if (normalizedType && normalizedType !== 'text' && normalizedType !== 'image') return []

  for (const [providerId, modelsForProvider] of Object.entries(FALLBACK_MODELS)) {
    if (enabledProviders[providerId]) {
      for (const m of modelsForProvider) {
        if (!normalizedType || m._type === normalizedType) {
          models.push(m)
        }
      }
    }
  }

  return models
}
