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

/** Canonical sub-section id within the Settings tab. Used by the
 *  onboarding "Create Profile" deep-link and any future external entry
 *  points to land users on the right surface (Profiles, API Keys, …). */
export type SettingsSection =
  | 'profiles'
  | 'api-keys'
  | 'defaults'
  | 'safety'
  | 'vault'
  | 'appearance'
  | 'data'
  | 'about'
  | 'updates'
  | 'config'
  | 'providers'
  | 'audio-speech'

const VALID_SETTINGS_SECTIONS = new Set<SettingsSection>([
  'profiles',
  'providers',
  'api-keys',
  'defaults',
  'safety',
  'vault',
  'appearance',
  'data',
  'about',
  'updates',
  'config',
  'audio-speech',
])

/** Defensive coercion: returns null when the value is not a known
 *  SettingsSection. Stops stray IPC / external callers from forcing a
 *  SettingsView into an undefined render state. */
function coerceSettingsSection(value: unknown): SettingsSection | null {
  if (typeof value !== 'string') return null
  return VALID_SETTINGS_SECTIONS.has(value as SettingsSection)
    ? (value as SettingsSection)
    : null
}

function safeNormaliseTab(id: string | null | undefined): TabId {
  if (typeof id !== 'string' || !id) return 'chat'
  return normaliseTab(id)
}

export type UiSoundPackId = 'soft' | 'tactile' | 'glass' | 'retro' | 'minimal'

export interface AudioPreferences {
  uiSounds: {
    enabled: boolean;
    packId: UiSoundPackId;
    volume: number;
  };

  chatTts: {
    showMessageControls: boolean;
    autoReadDefault: boolean;
    model?: string;
    voice?: string;
    speed: number;
    volume: number;
    skipCodeBlocks: boolean;
    skipUrls: boolean;
    stopOnNewReply: boolean;
    cacheEnabled: boolean;
  };
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  uiSounds: {
    enabled: false,
    packId: 'soft',
    volume: 0.35,
  },
  chatTts: {
    showMessageControls: true,
    autoReadDefault: false,
    model: undefined,
    voice: undefined,
    speed: 1,
    volume: 1,
    skipCodeBlocks: true,
    skipUrls: true,
    stopOnNewReply: true,
    cacheEnabled: true,
  },
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

  /** One-shot deep-link used by the onboarding splash (and any future
   *  external entry points). When set, `SettingsView` will activate the
   *  referenced section and immediately clear the field. Never persisted. */
  pendingSettingsSection: SettingsSection | null
  setPendingSettingsSection: (section: SettingsSection | null) => void
  
  // Video Model canonical selection
  selectedVideoModelGroup: string | null
  setSelectedVideoModelGroup: (group: string | null) => void
  selectedVideoMode: string | null
  setSelectedVideoMode: (mode: string | null) => void
  selectedVideoModelId: string | null
  setSelectedVideoModelId: (modelId: string | null) => void
  
  // Theme settings
  selectedThemeId: string
  setSelectedThemeId: (id: string) => void
  customTheme: Theme | null
  setCustomTheme: (theme: Theme | null) => void
  customThemes: Theme[]
  setCustomThemes: (themes: Theme[]) => void
  saveCustomTheme: (theme: Theme) => void
  deleteCustomTheme: (id: string) => void
  appearanceMode: 'dark' | 'light'
  setAppearanceMode: (mode: 'dark' | 'light') => void
  imageDownloadDirectory: string
  setImageDownloadDirectory: (dir: string) => void
  // `redTeamMode` is the persisted Zustand slice whose visible switch is
  // labelled "Traffic Inspector" in the sidebar (`src/components/layout/sidebar.tsx`).
  // The internal key was retained for backwards compatibility with persisted
  // state from earlier builds; do NOT rename without a migrate() bump and a
  // coordinated update to `src/components/chat/message-bubble.tsx` which reads
  // it as the opt-in for showing the inspector badge on each message bubble.
  redTeamMode: boolean
  setRedTeamMode: (mode: boolean) => void
  localFamilySafeModeEnabled: boolean
  setLocalFamilySafeModeEnabled: (enabled: boolean) => void
  veniceApiSafeMode: boolean
  setVeniceApiSafeMode: (enabled: boolean) => void
  showInspector: boolean
  inspectorWidth: number
  setShowInspector: (show: boolean) => void
  setInspectorWidth: (width: number) => void
  
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

  // Character Chat Scene Generation
  characterSceneGenerationEnabled: boolean
  setCharacterSceneGenerationEnabled: (enabled: boolean) => void
  characterSceneGenerationMode: 'manual' | 'auto'
  setCharacterSceneGenerationMode: (mode: 'manual' | 'auto') => void

  // Sync Provider Settings
  syncFolderPath: string
  setSyncFolderPath: (path: string) => void
  // VERIFY-130: Sync media opt-in. Defaults to false — sync ingestion and
  // outgoing packets skip `images | files | rp_assets` unless the user ticks.
  syncIncludeMedia: boolean
  setSyncIncludeMedia: (includeMedia: boolean) => void

  // Fallback Providers
  enabledProviders: Record<string, boolean>
  setEnabledProvider: (providerId: string, enabled: boolean) => void
  autoFallbackEnabled: boolean
  setAutoFallbackEnabled: (enabled: boolean) => void
  fallbackOrdering: string[]
  setFallbackOrdering: (ordering: string[]) => void
  favoriteHostedCharacterSlugs: string[]
  setFavoriteHostedCharacterSlugs: (slugs: string[]) => void

  // Audio and Speech
  audioPreferences: AudioPreferences
  setAudioPreferences: (prefs: Partial<AudioPreferences>) => void
  setUiSoundPreferences: (prefs: Partial<AudioPreferences['uiSounds']>) => void
  setChatTtsPreferences: (prefs: Partial<AudioPreferences['chatTts']>) => void

  // Phase 9 Developer-Portal Error Intake: prompt opt-in. Off by default —
  // we NEVER include raw prompt text in the safe diagnostics snapshot
  // unless the user explicitly opts in. The toggle is wired into the
  // Diagnostics drawer; opt-in only changes what appears in
  // `computeSafeDiagnosticsSnapshot()`'s `stores.prompts.redactedExcerpts`,
  // never any raw `conversationVault` or chat-store payload.
  diagnosticsIncludePrompts: boolean
  setDiagnosticsIncludePrompts: (includePrompts: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
  activeTab: 'chat' as Tab,
  setActiveTab: (tab) => set({ activeTab: safeNormaliseTab(tab) as Tab }),
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  pendingSettingsSection: null,
  setPendingSettingsSection: (section) => set({ pendingSettingsSection: section }),
  selectedModels: {},
      setSelectedModel: (tab, modelId) =>
        set((s) => ({ selectedModels: { ...s.selectedModels, [tab]: modelId } })),
      playgroundAgentModel: '',
      setPlaygroundAgentModel: (modelId) => set({ playgroundAgentModel: modelId }),

      selectedVideoModelGroup: null,
      setSelectedVideoModelGroup: (group) => set({ selectedVideoModelGroup: group }),
      selectedVideoMode: null,
      setSelectedVideoMode: (mode) => set({ selectedVideoMode: mode }),
      selectedVideoModelId: null,
      setSelectedVideoModelId: (modelId) => set({ selectedVideoModelId: modelId }),

      // Theme settings defaults
      selectedThemeId: 'builtin-venice',
      setSelectedThemeId: (id) => set({ selectedThemeId: id }),
      customTheme: null,
      setCustomTheme: (theme) => set({ customTheme: theme }),
      customThemes: [],
      setCustomThemes: (themes) => set({ customThemes: themes }),
      saveCustomTheme: (theme) => set((state) => {
        const existingIdx = state.customThemes.findIndex((t) => t.id === theme.id);
        const updated = existingIdx >= 0
          ? state.customThemes.map((t, idx) => (idx === existingIdx ? theme : t))
          : [...state.customThemes, theme];
        return {
          customThemes: updated,
          customTheme: theme,
          selectedThemeId: theme.id,
          appearanceMode: theme.mode,
        };
      }),
      deleteCustomTheme: (id) => set((state) => {
        const filtered = state.customThemes.filter((t) => t.id !== id);
        const wasActive = state.selectedThemeId === id || (id === 'custom' && state.selectedThemeId === 'custom');
        const fallbackTheme = filtered.length > 0 ? filtered[0] : null;
        return {
          customThemes: filtered,
          customTheme: wasActive ? fallbackTheme : state.customTheme,
          selectedThemeId: wasActive ? (fallbackTheme ? fallbackTheme.id : 'builtin-venice') : state.selectedThemeId,
          appearanceMode: wasActive ? (fallbackTheme ? fallbackTheme.mode : 'dark') : state.appearanceMode,
        };
      }),
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
      inspectorWidth: 480,
      setShowInspector: (show) => set({ showInspector: show }),
      setInspectorWidth: (width) => set({ inspectorWidth: width }),

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

      // Character Chat Scene Generation defaults — OFF by default.
      characterSceneGenerationEnabled: false,
      setCharacterSceneGenerationEnabled: (enabled) => set({ characterSceneGenerationEnabled: enabled }),
      characterSceneGenerationMode: 'manual',
      setCharacterSceneGenerationMode: (mode) => set({ characterSceneGenerationMode: mode }),

      syncFolderPath: '',
      setSyncFolderPath: (path) => set({ syncFolderPath: path }),

      // VERIFY-130: media is never auto-synced without explicit user opt-in.
      syncIncludeMedia: false,
      setSyncIncludeMedia: (includeMedia) => set({ syncIncludeMedia: includeMedia }),

      // Fallback Providers
      enabledProviders: {},
      setEnabledProvider: (providerId, enabled) => set((state) => ({
        enabledProviders: { ...state.enabledProviders, [providerId]: enabled }
      })),
      autoFallbackEnabled: false,
      setAutoFallbackEnabled: (enabled) => set({ autoFallbackEnabled: enabled }),
      fallbackOrdering: [],
      setFallbackOrdering: (ordering) => set({ fallbackOrdering: ordering }),
      favoriteHostedCharacterSlugs: [],
      setFavoriteHostedCharacterSlugs: (slugs) => set({
        favoriteHostedCharacterSlugs: [...new Set(slugs.filter((slug) => /^[A-Za-z0-9_-]{1,128}$/.test(slug)))].slice(0, 100),
      }),
      audioPreferences: DEFAULT_AUDIO_PREFERENCES,
      setAudioPreferences: (prefs) => set((s) => ({
        audioPreferences: { ...s.audioPreferences, ...prefs }
      })),
      setUiSoundPreferences: (prefs) => set((s) => ({
        audioPreferences: {
          ...s.audioPreferences,
          uiSounds: { ...s.audioPreferences.uiSounds, ...prefs }
        }
      })),
      setChatTtsPreferences: (prefs) => set((s) => ({
        audioPreferences: {
          ...s.audioPreferences,
          chatTts: { ...s.audioPreferences.chatTts, ...prefs }
        }
      })),
      // Phase 9: prompt opt-in defaults off — copy diagnostic bundle
      // strips raw prompt text unless the user ticks the toggle.
      diagnosticsIncludePrompts: false,
      setDiagnosticsIncludePrompts: (includePrompts) => set({ diagnosticsIncludePrompts: includePrompts }),
    }),
    {
      name: 'venice-settings',
      version: 12,
      storage: createJSONStorage(() => createSafeStorage()),
      migrate: (persisted) => {
        const state = persisted && typeof persisted === 'object'
          ? persisted as Partial<SettingsState>
          : {}
        return {
          ...state,
          // v6: collapsed state is session-only. Old false/corrupt values must
          // never hide the labeled desktop menu on the next launch.
          sidebarOpen: true,
          localFamilySafeModeEnabled: state.localFamilySafeModeEnabled ?? true,
          veniceApiSafeMode: state.veniceApiSafeMode ?? true,
          // v3: normalise legacy tab aliases (e.g. 'gallery' → 'media').
          activeTab: safeNormaliseTab(state.activeTab) as Tab,
          // v4 (workspace): ensure activeProjectId exists for Project switcher.
          activeProjectId: state.activeProjectId ?? null,
          // v5 (character scene generation): default off.
          characterSceneGenerationEnabled: state.characterSceneGenerationEnabled ?? false,
          characterSceneGenerationMode: state.characterSceneGenerationMode ?? 'manual',
          // Session-only: never persisted (covered by `partialize`), but defend
          // against a hand-edited localStorage entry by coercing back to null.
          pendingSettingsSection: coerceSettingsSection(state.pendingSettingsSection),
          syncFolderPath: state.syncFolderPath ?? '',
          
          selectedVideoModelGroup: state.selectedVideoModelGroup ?? null,
          selectedVideoMode: state.selectedVideoMode ?? null,
          selectedVideoModelId: state.selectedVideoModelId ?? null,

          // v7 (providers): enabled state for fallback providers
          enabledProviders: state.enabledProviders ?? {},
          favoriteHostedCharacterSlugs: Array.isArray(state.favoriteHostedCharacterSlugs)
            ? [...new Set(state.favoriteHostedCharacterSlugs.filter((slug): slug is string => typeof slug === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(slug)))].slice(0, 100)
            : [],
            
          // v9 (audio): audio preferences
          audioPreferences: {
            uiSounds: {
              ...DEFAULT_AUDIO_PREFERENCES.uiSounds,
              ...(state.audioPreferences?.uiSounds ?? {}),
            },
            chatTts: {
              ...DEFAULT_AUDIO_PREFERENCES.chatTts,
              ...(state.audioPreferences?.chatTts ?? {}),
            }
          },
          // v10 (VERIFY-130): backup/sync media opt-in defaults to off. We
          // never auto-persist the user's first media opt-out; we only
          // perserve an explicit on-state that already lives in storage.
          syncIncludeMedia: state.syncIncludeMedia === true,
          // v11 (Phase 9): diagnostics prompt opt-in defaults to off. Raw
          // prompt text is never exported/copied unless explicitly opted in;
          // we only preserve an explicit on-state that already lives in storage.
          diagnosticsIncludePrompts: state.diagnosticsIncludePrompts === true,
          // v12: customThemes array migration. Existing single customTheme is preserved.
          customThemes: Array.isArray(state.customThemes)
            ? state.customThemes
            : (state.customTheme ? [state.customTheme] : []),
        } as SettingsState
      },
      merge: (persisted, current) => ({
        ...current,
        ...(persisted && typeof persisted === 'object' ? persisted : {}),
        sidebarOpen: true,
      }),
    },
  ),
)
