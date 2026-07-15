import { describe, it, expect } from 'vitest'
import {
  AVAILABLE_FALLBACK_PROVIDER_IDS,
  DEFERRED_PROVIDER_IDS,
  PROVIDER_REGISTRY,
} from '../src/types/provider'
import { providerAdapters } from '../electron/services/providerAdapters'
import { FALLBACK_MODELS } from '../src/config/provider-models'

describe('Provider Adapters Contract', () => {
  it('should have an adapter for every non-venice provider', () => {
    const providers = Object.values(PROVIDER_REGISTRY)
      .filter(p => p.id !== 'venice')

    for (const provider of providers) {
      expect(providerAdapters).toHaveProperty(provider.id)
      expect(typeof providerAdapters[provider.id]).toBe('function')
    }
  })

  it('keeps deferred providers fail-closed and out of the advertised fallback catalog', () => {
    expect(DEFERRED_PROVIDER_IDS).toEqual([
      'replicate',
      'aws_bedrock',
      'google_vertex',
      'azure_openai',
      'huggingface',
      'cohere',
    ])
    for (const providerId of DEFERRED_PROVIDER_IDS) {
      expect(PROVIDER_REGISTRY[providerId].unavailable).toBe(true)
      expect(FALLBACK_MODELS[providerId]).toEqual([])
    }
  })

  it('gives every advertised fallback provider a real adapter and model catalog', () => {
    for (const providerId of AVAILABLE_FALLBACK_PROVIDER_IDS) {
      expect(PROVIDER_REGISTRY[providerId].unavailable).not.toBe(true)
      expect(typeof providerAdapters[providerId]).toBe('function')
      expect(FALLBACK_MODELS[providerId].length).toBeGreaterThan(0)
    }
  })

  // We could add more contract tests per provider here
})
