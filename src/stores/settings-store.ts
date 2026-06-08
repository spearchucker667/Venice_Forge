import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeStorage } from '../lib/safe-storage'
import type { Theme } from '../theme'
import { normaliseTab, type TabId } from '../config/tabs'

/**
 * Legacy alias re-exports. The canonical type lives in `src/config/tabs.ts`;
 * this re-export keeps existing call sites compiling without churn.
 * `Tab` and `TabId` are interchangeable — both resolve through `normaliseTab`
 * at runtime, so legacy persisted values like `'gallery'` continue to work.
 */
export type Tab = TabId

function safeNormaliseTab(id: string | null | undefined): TabId {
  if (typeof id !== 'string' || !id) return 'chat'
  return normaliseTab(id)
}

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
  imageDownloadDirectory: string
  setImageDownloadDirectory: (dir: string) => void
  redTeamMode: boolean
  setRedTeamMode: (mode: boolean) => void
  localFamilySafeModeEnabled: boolean
  setLocalFamilySafeModeEnabled: (enabled: boolean) => void
  veniceApiSafeMode: boolean
  setVeniceApiSafeMode: (enabled: boolean) => void
  showInspector: boolean
  setShowInspector: (show: boolean) => void
  
  // Memory Settings
  enableRecording: boolean
  setEnableRecording: (enable: boolean) => void
  enableMemoryRetrieval: boolean
  setEnableMemoryRetrieval: (enable: boolean) => void
  showPulledContextBeforeSending: boolean
  setShowPulledContextBeforeSending: (show: boolean) => void
  useAISummaries: boolean
  setUseAISummaries: (use: boolean) => void

  // Project Workspace (Phase 1 minimal slice per approved plan)
  // activeProjectId is the user's current context. New assets (chats, media, etc.)
  // default to this project via projectRefs tagging. Null/undefined = "All / unscoped".
  activeProjectId: string | null
  setActiveProjectId: (projectId: string | null) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      activeTab: 'chat' as Tab,
      setActiveTab: (tab) => set({ activeTab: safeNormaliseTab(tab) as Tab }),
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
      imageDownloadDirectory: '',
      setImageDownloadDirectory: (dir) => set({ imageDownloadDirectory: dir }),
      redTeamMode: false,
      setRedTeamMode: (mode) => set({ redTeamMode: mode }),
      localFamilySafeModeEnabled: true,
      setLocalFamilySafeModeEnabled: (enabled) => set({ localFamilySafeModeEnabled: enabled }),
      veniceApiSafeMode: true,
      setVeniceApiSafeMode: (enabled) => set({ veniceApiSafeMode: enabled }),
      showInspector: false,
      setShowInspector: (show) => set({ showInspector: show }),

      // Memory settings defaults
      enableRecording: true,
      setEnableRecording: (enable) => set({ enableRecording: enable }),
      enableMemoryRetrieval: true,
      setEnableMemoryRetrieval: (enable) => set({ enableMemoryRetrieval: enable }),
      showPulledContextBeforeSending: true,
      setShowPulledContextBeforeSending: (show) => set({ showPulledContextBeforeSending: show }),
      useAISummaries: false,
      setUseAISummaries: (use) => set({ useAISummaries: use }),

      // Project Workspace defaults (Phase 1). null means "global / unscoped view".
      activeProjectId: null,
      setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
    }),
    {
      name: 'venice-settings',
      version: 4,
      storage: createJSONStorage(() => createSafeStorage()),
      migrate: (persisted) => {
        const state = persisted && typeof persisted === 'object'
          ? persisted as Partial<SettingsState>
          : {}
        return {
          ...state,
          localFamilySafeModeEnabled: state.localFamilySafeModeEnabled ?? true,
          veniceApiSafeMode: state.veniceApiSafeMode ?? true,
          // v3: normalise legacy tab aliases (e.g. 'gallery' → 'media').
          activeTab: safeNormaliseTab(state.activeTab) as Tab,
          // v4 (workspace): ensure activeProjectId exists for Project switcher.
          activeProjectId: state.activeProjectId ?? null,
        } as SettingsState
      },
    },
  ),
)
