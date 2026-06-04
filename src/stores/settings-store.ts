import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeStorage } from '../lib/safe-storage'
import type { Theme } from '../theme'

export type Tab = 'chat' | 'image' | 'audio' | 'music' | 'video' | 'embeddings' | 'workflows' | 'playground' | 'status' | 'settings' | 'search'

interface SettingsState {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  selectedModels: Record<string, string>
  setSelectedModel: (tab: string, modelId: string) => void
  playgroundAgentModel: string
  setPlaygroundAgentModel: (modelId: string) => void
  
  // Theme settings
  selectedThemeId: string
  setSelectedThemeId: (id: string) => void
  customTheme: Theme | null
  setCustomTheme: (theme: Theme | null) => void
  appearanceMode: 'dark' | 'light'
  setAppearanceMode: (mode: 'dark' | 'light') => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      activeTab: 'chat',
      setActiveTab: (tab) => set({ activeTab: tab }),
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      selectedModels: {},
      setSelectedModel: (tab, modelId) =>
        set((s) => ({ selectedModels: { ...s.selectedModels, [tab]: modelId } })),
      playgroundAgentModel: '',
      setPlaygroundAgentModel: (modelId) => set({ playgroundAgentModel: modelId }),

      // Theme settings defaults
      selectedThemeId: 'builtin-venice',
      setSelectedThemeId: (id) => set({ selectedThemeId: id }),
      customTheme: null,
      setCustomTheme: (theme) => set({ customTheme: theme }),
      appearanceMode: 'dark',
      setAppearanceMode: (mode) => set({ appearanceMode: mode }),
    }),
    {
      name: 'venice-settings',
      version: 1,
      storage: createJSONStorage(() => createSafeStorage()),
    },
  ),
)

