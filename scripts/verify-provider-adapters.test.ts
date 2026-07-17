import { describe, it, expect } from 'vitest'
import {
  AVAILABLE_FALLBACK_PROVIDER_IDS,
  DEFERRED_PROVIDER_IDS,
  PROVIDER_CAPABILITIES,
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

  it('routes every advertised fallback capability through a real adapter and matching catalog type', () => {
    for (const providerId of AVAILABLE_FALLBACK_PROVIDER_IDS) {
      for (const capability of PROVIDER_CAPABILITIES[providerId]) {
        expect(capability.implemented).toBe(true)
        expect(PROVIDER_REGISTRY[providerId].supportedTypes).toContain(capability.feature)
        expect(providerAdapters[providerId]('model', 'test-key', capability.route, {})).not.toBeNull()
        const expectedType = capability.feature === 'chat' ? 'text' : capability.feature
        expect(FALLBACK_MODELS[providerId].some((model) => model._type === expectedType)).toBe(true)
      }
    }
  })

  it('does not advertise deferred or unsupported endpoint capabilities', () => {
    for (const providerId of DEFERRED_PROVIDER_IDS) {
      expect(PROVIDER_CAPABILITIES[providerId]).toEqual([])
      expect(PROVIDER_REGISTRY[providerId].supportedTypes).toEqual([])
    }
    expect(PROVIDER_REGISTRY.groq.supportedTypes).toEqual(['chat'])
    expect(PROVIDER_REGISTRY.fireworks.supportedTypes).toEqual(['chat'])
    expect(PROVIDER_REGISTRY.google_gemini.supportedTypes).toEqual(['chat'])
    expect(PROVIDER_REGISTRY.mistral.supportedTypes).toEqual(['chat'])
    expect(PROVIDER_REGISTRY.anthropic.supportedTypes).toEqual(['chat'])
  })

  // We could add more contract tests per provider here
})
