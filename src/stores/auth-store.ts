import { create } from 'zustand'
import { desktopApiKey, desktopJinaApiKey, desktopProviderApiKey, desktopProviderSettings } from '../services/desktopBridge' // TARGET Bridge
import { PROVIDER_REGISTRY, type ProviderId } from '../types/provider'
import { redactErrorMessage } from '../shared/redaction'
import { invalidateModelQueries } from '../services/modelQueryCoordinator'
import { useModelCatalogRuntimeStore } from './model-catalog-runtime-store'

export type AuthHydrationStatus = 'idle' | 'checking' | 'ready' | 'error'

export interface AuthState {
  apiKey: string | null
  hasEncrypted: boolean
  isConfigured: boolean
  jinaApiKey: string | null
  jinaIsConfigured: boolean
  hydrationStatus: AuthHydrationStatus
  hydrationError: string | null
  checkConfiguration: () => Promise<void>
  setApiKey: (key: string, remember?: { passphrase?: string }) => Promise<void>
  clearApiKey: () => Promise<void>
  setJinaApiKey: (key: string) => Promise<void>
  clearJinaApiKey: () => Promise<void>
  
  configuredProviders: Record<string, boolean>
  setProviderApiKey: (providerId: string, key: string) => Promise<void>
  clearProviderApiKey: (providerId: string) => Promise<void>
}

/** True when Venice requests can authenticate without exposing a persisted key. */
export function selectHasVeniceKey(state: Pick<AuthState, 'apiKey' | 'isConfigured'>): boolean {
  return state.isConfigured || Boolean(state.apiKey)
}

export const useAuthStore = create<AuthState>()((set) => ({
  apiKey: null,
  hasEncrypted: true, // Managed by OS natively
  isConfigured: false,
  jinaApiKey: null,
  jinaIsConfigured: false,
  hydrationStatus: 'idle',
  hydrationError: null,
  configuredProviders: {},

  checkConfiguration: async () => {
    set({ hydrationStatus: 'checking', hydrationError: null })
    const providerIds = Object.keys(PROVIDER_REGISTRY) as ProviderId[]
    try {
      const previousConfigured = useAuthStore.getState().isConfigured
      const configured = await desktopApiKey.isConfigured()
      set({ isConfigured: configured })
      if (configured !== previousConfigured) void invalidateModelQueries()

      const jinaConfigured = await desktopJinaApiKey.isConfigured()
      set({ jinaIsConfigured: jinaConfigured })

      await desktopProviderSettings.get()
      const providerConfigs = await Promise.all(
        providerIds.map(id => desktopProviderApiKey.isConfigured(id)),
      )
      const configuredProviders = providerIds.reduce((acc, id, index) => {
        acc[id] = providerConfigs[index]
        return acc
      }, {} as Record<string, boolean>)
      set({ configuredProviders, hydrationStatus: 'ready', hydrationError: null })
    } catch (error) {
      set({ hydrationStatus: 'error', hydrationError: redactErrorMessage(error) })
    }
  },

  setApiKey: async (key) => {
    const result = await desktopApiKey.set(key)
    if (!result.ok) {
      throw new Error("Failed to save API key.")
    }
    set({ isConfigured: true, apiKey: null })
    useModelCatalogRuntimeStore.getState().reset()
    await invalidateModelQueries()
  },

  clearApiKey: async () => {
    await desktopApiKey.delete()
    set({ isConfigured: false, apiKey: null })
    useModelCatalogRuntimeStore.getState().reset()
    await invalidateModelQueries()
  },

  setJinaApiKey: async (key) => {
    const result = await desktopJinaApiKey.set(key)
    if (!result.ok) {
      throw new Error("Failed to save Jina API key.")
    }
    set({ jinaIsConfigured: true, jinaApiKey: null })
  },

  clearJinaApiKey: async () => {
    await desktopJinaApiKey.delete()
    set({ jinaIsConfigured: false, jinaApiKey: null })
  },

  setProviderApiKey: async (providerId, key) => {
    const result = await desktopProviderApiKey.set(providerId, key)
    if (!result.ok) {
      throw new Error(`Failed to save API key for ${providerId}.`)
    }
    set((s) => ({
      configuredProviders: { ...s.configuredProviders, [providerId]: true }
    }))
  },

  clearProviderApiKey: async (providerId) => {
    await desktopProviderApiKey.delete(providerId)
    set((s) => ({
      configuredProviders: { ...s.configuredProviders, [providerId]: false }
    }))
  },
}))
