import type { VeniceModel } from '../types/venice'
import { ProviderId } from '../types/provider'
import { useSettingsStore } from '../stores/settings-store'

// A static catalog of fallback models mapped to their respective providers.
// These are mocked into the VeniceModel format so the UI components can seamlessly
// render them in the model dropdowns and capability resolvers.

// We wrap the VeniceModel with a local type property so we can filter by ?type=text|image
export type FallbackModelDef = VeniceModel & { _type: 'text' | 'image' }

export const FALLBACK_MODELS: Record<ProviderId, FallbackModelDef[]> = {
  venice: [], // Venice is the primary provider; its models come from the live /models API.
  google_gemini: [],
  together: [
    {
      id: 'together:meta-llama/Llama-3-70b-chat-hf',
      object: 'model',
      created: Date.now(),
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
      created: Date.now(),
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
      created: Date.now(),
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
      created: Date.now(),
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
      created: Date.now(),
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
      created: Date.now(),
      owned_by: 'anthropic',
      _type: 'text',
      model_spec: {
        name: 'Claude 3 Opus',
        capabilities: { supportsVision: true, supportsFunctionCalling: true },
      }
    }
  ],
  fireworks: [],
  replicate: [],
  aws_bedrock: [],
  google_vertex: [],
  azure_openai: [],
  huggingface: [],
  mistral: [
    {
      id: 'mistral:mistral-large-latest',
      object: 'model',
      created: Date.now(),
      owned_by: 'mistral',
      _type: 'text',
      model_spec: {
        name: 'Mistral Large',
        capabilities: { supportsVision: false, supportsFunctionCalling: true },
      }
    }
  ],
  perplexity: [],
  cohere: []
}

/**
 * Merges live Venice models with models from enabled fallback providers.
 * Assigns `owned_by` so the provider adapter can route the request correctly.
 */
export function getEnabledProviderModels(type?: string): VeniceModel[] {
  const enabledProviders = useSettingsStore.getState().enabledProviders
  const models: VeniceModel[] = []

  const normalizedType = type === 'chat' ? 'text' : type === 'embeddings' ? 'embedding' : type;

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
