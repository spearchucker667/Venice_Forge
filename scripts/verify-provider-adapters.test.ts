import { describe, it, expect } from 'vitest'
import { PROVIDER_REGISTRY } from '../src/types/provider'
import { providerAdapters } from '../electron/services/providerAdapters'

describe('Provider Adapters Contract', () => {
  it('should have an adapter for every non-venice provider', () => {
    const providers = Object.values(PROVIDER_REGISTRY)
      .filter(p => p.id !== 'venice')

    for (const provider of providers) {
      expect(providerAdapters).toHaveProperty(provider.id)
      expect(typeof providerAdapters[provider.id]).toBe('function')
    }
  })

  // We could add more contract tests per provider here
})
