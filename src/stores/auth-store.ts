import { create } from 'zustand'
import { desktopApiKey, desktopJinaApiKey } from '../services/desktopBridge' // TARGET Bridge

export interface AuthState {
  apiKey: string | null
  hasEncrypted: boolean
  isConfigured: boolean
  jinaApiKey: string | null
  jinaIsConfigured: boolean
  checkConfiguration: () => Promise<void>
  setApiKey: (key: string, remember?: { passphrase?: string }) => Promise<void>
  clearApiKey: () => Promise<void>
  setJinaApiKey: (key: string) => Promise<void>
  clearJinaApiKey: () => Promise<void>
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

  checkConfiguration: async () => {
    const [configured, jinaConfigured] = await Promise.all([
      desktopApiKey.isConfigured(),
      desktopJinaApiKey.isConfigured(),
    ])
    set({ isConfigured: configured, jinaIsConfigured: jinaConfigured })
  },

  setApiKey: async (key) => {
    const result = await desktopApiKey.set(key)
    if (!result.ok) {
      throw new Error("Failed to save API key.")
    }
    set({ isConfigured: true, apiKey: null })
  },

  clearApiKey: async () => {
    await desktopApiKey.delete()
    set({ isConfigured: false, apiKey: null })
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
}))
