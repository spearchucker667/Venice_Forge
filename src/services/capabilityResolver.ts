import { PROVIDER_REGISTRY, ProviderId } from '../types/provider'
import { useAuthStore } from '../stores/auth-store'

export type FeatureKey = 'chat' | 'image' | 'video' | 'audio' | 'embeddings' | 'rerank' | 'vision'

export interface FeatureAvailability {
  isAvailable: boolean
  availableProviders: ProviderId[]
  activeProvider: ProviderId | null
  reason?: string
}

/**
 * Resolves feature availability based on configured providers and their supported types.
 * @param feature The feature type to check (e.g., 'chat', 'image')
 * @returns FeatureAvailability object detailing which providers can handle the feature.
 */
export function resolveFeatureAvailability(feature: FeatureKey): FeatureAvailability {
  const { configuredProviders, isConfigured } = useAuthStore.getState()
  
  const availableProviders: ProviderId[] = []
  
  // Venice is always implicitly available if it's configured natively
  if (isConfigured && PROVIDER_REGISTRY['venice'].supportedTypes.includes(feature)) {
    availableProviders.push('venice')
  }

  // Check fallback providers
  for (const [providerId, isProvConfigured] of Object.entries(configuredProviders)) {
    if (isProvConfigured) {
      const def = PROVIDER_REGISTRY[providerId as ProviderId]
      if (def && !def.unavailable && def.supportedTypes.includes(feature)) {
        availableProviders.push(providerId as ProviderId)
      }
    }
  }

  if (availableProviders.length === 0) {
    return {
      isAvailable: false,
      availableProviders: [],
      activeProvider: null,
      reason: `No configured providers support the '${feature}' feature.`
    }
  }

  return {
    isAvailable: true,
    availableProviders,
    activeProvider: availableProviders[0], // the first available, normally 'venice' or the fallback
  }
}
