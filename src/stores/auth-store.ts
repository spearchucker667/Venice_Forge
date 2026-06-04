import { create } from 'zustand'
import { desktopApiKey } from '../services/desktopBridge' // TARGET Bridge

interface AuthState {
  apiKey: string | null
  hasEncrypted: boolean
  isConfigured: boolean
  checkConfiguration: () => Promise<void>
  setApiKey: (key: string, remember?: { passphrase?: string }) => Promise<void>
  clearApiKey: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set) => ({
  apiKey: null,
  hasEncrypted: true, // Managed by OS natively
  isConfigured: false,

  checkConfiguration: async () => {
    const configured = await desktopApiKey.isConfigured()
    set({ isConfigured: configured })
  },

  setApiKey: async (key) => {
    await desktopApiKey.set(key)
    set({ isConfigured: true, apiKey: key }) // Hold in memory for current session
  },

  clearApiKey: async () => {
    await desktopApiKey.delete()
    set({ isConfigured: false, apiKey: null })
  },
}))
