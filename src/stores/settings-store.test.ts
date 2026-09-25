import { describe, it, expect, beforeEach } from 'vitest'
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, useSettingsStore } from './settings-store'
import type { Theme, CodeSyntaxPresetId } from '../theme'
import { completeThemeTokens, completeCodeThemeConfig } from '../theme'

function makeTheme(id: string, name: string, mode: 'light' | 'dark', codePreset: CodeSyntaxPresetId): Theme {
  const tokens = completeThemeTokens(mode, {
    background: mode === 'light' ? '#ffffff' : '#0a0a0c',
    surface: mode === 'light' ? '#f3f4f6' : '#13131a',
    surfaceElevated: mode === 'light' ? '#ffffff' : '#1a1a24',
    border: mode === 'light' ? '#e5e7eb' : '#2a2a3a',
    textPrimary: mode === 'light' ? '#111827' : '#f3f4f6',
    textSecondary: mode === 'light' ? '#4b5563' : '#9ca3af',
    textMuted: mode === 'light' ? '#6b7280' : '#6b7280',
    accent: mode === 'light' ? '#2563eb' : '#63b3ed',
    accentHover: mode === 'light' ? '#1d4ed8' : '#4299e1',
    accentForeground: '#ffffff',
    success: mode === 'light' ? '#16a34a' : '#4ade80',
    warning: mode === 'light' ? '#ca8a04' : '#facc15',
    danger: mode === 'light' ? '#dc2626' : '#f87171',
    info: mode === 'light' ? '#0891b2' : '#67e8f9',
    focusRing: mode === 'light' ? '#3b82f6' : '#93c5fd',
    overlay: mode === 'light' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.6)',
    glow: mode === 'light' ? 'rgba(37,99,235,0.2)' : 'rgba(99,179,237,0.2)',
  });
  const code = completeCodeThemeConfig(mode, { preset: codePreset }, { mode, tokens });
  return { id, name, mode, tokens, code };
}

describe('settings-store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSettingsStore.setState({
      activeTab: 'chat',
      sidebarOpen: true,
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      selectedModels: {},
      playgroundAgentModel: '',
      selectedThemeId: 'builtin-venice',
      customTheme: null,
      appearanceMode: 'dark',
      imageDownloadDirectory: '',
      redTeamMode: false,
      localFamilySafeModeEnabled: true,
      veniceApiSafeMode: true,
      showInspector: false,
      enableRecording: true,
      enableMemoryRetrieval: true,
      showPulledContextBeforeSending: true,
      useAISummaries: false,
      activeProjectId: null,
      characterSceneGenerationEnabled: false,
      characterSceneGenerationMode: 'manual',
      favoriteHostedCharacterSlugs: [],
    })
  })

  describe('tabs and sidebar', () => {
    it('clamps, resets, and preserves the expanded width while collapsed', () => {
      const store = useSettingsStore.getState()
      store.setSidebarWidth(999)
      expect(useSettingsStore.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH)
      store.setSidebarWidth(1)
      expect(useSettingsStore.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH)
      store.setSidebarWidth(320)
      store.setSidebarOpen(false)
      expect(useSettingsStore.getState().sidebarWidth).toBe(320)
      store.setSidebarOpen(true)
      expect(useSettingsStore.getState().sidebarWidth).toBe(320)
      store.resetSidebarWidth()
      expect(useSettingsStore.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
    })
    it('setActiveTab normalises valid tabs', () => {
      const store = useSettingsStore.getState()
      store.setActiveTab('image')
      expect(useSettingsStore.getState().activeTab).toBe('image')
    })

    it('setActiveTab normalises legacy aliases (e.g. gallery -> media)', () => {
      const store = useSettingsStore.getState()
      store.setActiveTab('gallery' as any)
      expect(useSettingsStore.getState().activeTab).toBe('media')
    })

    it('setActiveTab falls back to chat for unknown or invalid tabs', () => {
      const store = useSettingsStore.getState()
      // @ts-expect-error Testing invalid string values
      store.setActiveTab('does-not-exist')
      expect(useSettingsStore.getState().activeTab).toBe('chat')

      // @ts-expect-error Testing null
      store.setActiveTab(null)
      expect(useSettingsStore.getState().activeTab).toBe('chat')
    })

    it('toggles sidebar state', () => {
      const store = useSettingsStore.getState()
      expect(store.sidebarOpen).toBe(true)

      store.setSidebarOpen(false)
      expect(useSettingsStore.getState().sidebarOpen).toBe(false)

      useSettingsStore.getState().toggleSidebar()
      expect(useSettingsStore.getState().sidebarOpen).toBe(true)
    })
  })

  describe('models', () => {
    it('sets selected models by tab', () => {
      useSettingsStore.getState().setSelectedModel('chat', 'model-a')
      expect(useSettingsStore.getState().selectedModels.chat).toBe('model-a')

      useSettingsStore.getState().setSelectedModel('image', 'model-b')
      expect(useSettingsStore.getState().selectedModels.chat).toBe('model-a')
      expect(useSettingsStore.getState().selectedModels.image).toBe('model-b')
    })

    it('sets playground agent model', () => {
      useSettingsStore.getState().setPlaygroundAgentModel('model-playground')
      expect(useSettingsStore.getState().playgroundAgentModel).toBe('model-playground')
    })
  })

  describe('theme settings', () => {
    it('sets selectedThemeId', () => {
      useSettingsStore.getState().setSelectedThemeId('my-theme')
      expect(useSettingsStore.getState().selectedThemeId).toBe('my-theme')
    })

    it('sets customTheme', () => {
      const mockTheme: Theme = { id: 'custom', name: 'Custom Theme', mode: 'dark', tokens: {} } as any
      useSettingsStore.getState().setCustomTheme(mockTheme)
      expect(useSettingsStore.getState().customTheme).toEqual(mockTheme)
    })

    it('sets appearanceMode', () => {
      useSettingsStore.getState().setAppearanceMode('light')
      expect(useSettingsStore.getState().appearanceMode).toBe('light')
    })

    it('saveCustomTheme preserves code config and appends to customThemes', () => {
      const darkTheme = makeTheme('user-dark', 'User Dark', 'dark', 'dracula')
      const lightTheme = makeTheme('user-light', 'User Light', 'light', 'github-light')

      useSettingsStore.getState().saveCustomTheme(darkTheme)
      useSettingsStore.getState().saveCustomTheme(lightTheme)

      const state = useSettingsStore.getState()
      expect(state.customThemes).toHaveLength(2)
      expect(state.customThemes[0].code.preset).toBe('dracula')
      expect(state.customThemes[1].code.preset).toBe('github-light')
      expect(state.customThemes[0].code.tokens.keyword).toBe(darkTheme.code.tokens.keyword)
      expect(state.customThemes[1].code.tokens.keyword).toBe(lightTheme.code.tokens.keyword)
      expect(state.customThemes[0].code.tokens.keyword).not.toBe(state.customThemes[1].code.tokens.keyword)
      expect(state.customTheme?.id).toBe('user-light')
      expect(state.selectedThemeId).toBe('user-light')
    })

    it('setCustomTheme stores code config', () => {
      const theme = makeTheme('user-custom', 'User Custom', 'dark', 'nord')
      useSettingsStore.getState().setCustomTheme(theme)
      expect(useSettingsStore.getState().customTheme?.code.preset).toBe('nord')
      expect(useSettingsStore.getState().customTheme?.code.tokens.string).toBe(theme.code.tokens.string)
    })

    it('deleteCustomTheme preserves code config on remaining themes', () => {
      const darkTheme = makeTheme('user-dark', 'User Dark', 'dark', 'dracula')
      const lightTheme = makeTheme('user-light', 'User Light', 'light', 'github-light')

      useSettingsStore.getState().saveCustomTheme(darkTheme)
      useSettingsStore.getState().saveCustomTheme(lightTheme)
      useSettingsStore.getState().deleteCustomTheme('user-light')

      const state = useSettingsStore.getState()
      expect(state.customThemes).toHaveLength(1)
      expect(state.customThemes[0].code.preset).toBe('dracula')
    })

    it('bounds customThemes array to MAX_CUSTOM_THEMES (VF-AUD-20260912-P3-003)', () => {
      const themes = Array.from({ length: 100 }, (_, i) =>
        makeTheme(`theme-${i}`, `Theme ${i}`, 'dark', 'dracula')
      )
      useSettingsStore.getState().setCustomThemes(themes)
      expect(useSettingsStore.getState().customThemes).toHaveLength(100)

      const overflowTheme = makeTheme('theme-overflow', 'Theme Overflow', 'light', 'github-light')
      useSettingsStore.getState().saveCustomTheme(overflowTheme)

      const state = useSettingsStore.getState()
      expect(state.customThemes).toHaveLength(100)
      expect(state.customThemes[99].id).toBe('theme-overflow')
    })
  })

  describe('misc settings', () => {
    it('sets imageDownloadDirectory', () => {
      useSettingsStore.getState().setImageDownloadDirectory('/some/path')
      expect(useSettingsStore.getState().imageDownloadDirectory).toBe('/some/path')
    })

    it('sets redTeamMode', () => {
      useSettingsStore.getState().setRedTeamMode(true)
      expect(useSettingsStore.getState().redTeamMode).toBe(true)
    })

    it('sets safety modes', () => {
      useSettingsStore.getState().setLocalFamilySafeModeEnabled(false)
      expect(useSettingsStore.getState().localFamilySafeModeEnabled).toBe(false)

      useSettingsStore.getState().setVeniceApiSafeMode(false)
      expect(useSettingsStore.getState().veniceApiSafeMode).toBe(false)
    })

    it('sets showInspector', () => {
      useSettingsStore.getState().setShowInspector(true)
      expect(useSettingsStore.getState().showInspector).toBe(true)
    })
  })

  describe('memory settings', () => {
    it('sets enableRecording', () => {
      useSettingsStore.getState().setEnableRecording(false)
      expect(useSettingsStore.getState().enableRecording).toBe(false)
    })

    it('sets enableMemoryRetrieval', () => {
      useSettingsStore.getState().setEnableMemoryRetrieval(false)
      expect(useSettingsStore.getState().enableMemoryRetrieval).toBe(false)
    })

    it('sets showPulledContextBeforeSending', () => {
      useSettingsStore.getState().setShowPulledContextBeforeSending(false)
      expect(useSettingsStore.getState().showPulledContextBeforeSending).toBe(false)
    })

    it('sets useAISummaries', () => {
      useSettingsStore.getState().setUseAISummaries(true)
      expect(useSettingsStore.getState().useAISummaries).toBe(true)
    })
  })

  describe('project workspace', () => {
    it('sets activeProjectId', () => {
      useSettingsStore.getState().setActiveProjectId('project-123')
      expect(useSettingsStore.getState().activeProjectId).toBe('project-123')

      useSettingsStore.getState().setActiveProjectId(null)
      expect(useSettingsStore.getState().activeProjectId).toBe(null)
    })
  })

  describe('character scene generation', () => {
    it('sets characterSceneGenerationEnabled', () => {
      useSettingsStore.getState().setCharacterSceneGenerationEnabled(true)
      expect(useSettingsStore.getState().characterSceneGenerationEnabled).toBe(true)
    })

    it('sets characterSceneGenerationMode', () => {
      useSettingsStore.getState().setCharacterSceneGenerationMode('auto')
      expect(useSettingsStore.getState().characterSceneGenerationMode).toBe('auto')
    })
  })

  describe('hosted character preferences', () => {
    it('deduplicates and rejects invalid favorite slugs', () => {
      useSettingsStore.getState().setFavoriteHostedCharacterSlugs(['alan-watts', '../bad', 'alan-watts', 'valid_2'])
      expect(useSettingsStore.getState().favoriteHostedCharacterSlugs).toEqual(['alan-watts', 'valid_2'])
    })
  })

  describe('primary API route (FRATERNA routing)', () => {
    it('defaults to the venice route on a fresh store', () => {
      expect(useSettingsStore.getState().primaryApiRoute).toBe('venice')
    })

    it('accepts and round-trips the fraterna route', () => {
      useSettingsStore.getState().setPrimaryApiRoute('fraterna')
      expect(useSettingsStore.getState().primaryApiRoute).toBe('fraterna')
      useSettingsStore.getState().setPrimaryApiRoute('venice')
      expect(useSettingsStore.getState().primaryApiRoute).toBe('venice')
    })

    it('coerces unknown values to the default instead of persisting garbage', () => {
      useSettingsStore.getState().setPrimaryApiRoute('fraterna')
      // @ts-expect-error - intentional bad input to validate sanitizer.
      useSettingsStore.getState().setPrimaryApiRoute('not-a-route')
      expect(useSettingsStore.getState().primaryApiRoute).toBe('venice')
    })

    it('migrates a v18 (pre-routing) persisted state to the default', () => {
      const migrate = useSettingsStore.persist.getOptions().migrate as (persistedState: unknown, version: number) => any
      const migrated = migrate({}, 18)
      expect(migrated.primaryApiRoute).toBe('venice')
    })

    it('preserves an explicit persisted fraterna selection through migration', () => {
      const migrate = useSettingsStore.persist.getOptions().migrate as (persistedState: unknown, version: number) => any
      const migrated = migrate({ primaryApiRoute: 'fraterna' }, 18)
      expect(migrated.primaryApiRoute).toBe('fraterna')
    })

    it('drops a malformed persisted primaryApiRoute to the default', () => {
      const migrate = useSettingsStore.persist.getOptions().migrate as (persistedState: unknown, version: number) => any
      const migrated = migrate({ primaryApiRoute: 'bogus' }, 19)
      expect(migrated.primaryApiRoute).toBe('venice')
    })
  })

  describe('persistence migration and merge', () => {
    it('migrates older state objects', () => {
      const migrate = useSettingsStore.persist.getOptions().migrate as (persistedState: unknown, version: number) => any
      
      const migrated = migrate({
        activeTab: 'gallery',
        localFamilySafeModeEnabled: false,
        veniceApiSafeMode: false,
      }, 5)

      expect(migrated.activeTab).toBe('media')
      expect(migrated.sidebarOpen).toBe(true)
      expect(migrated.localFamilySafeModeEnabled).toBe(false)
      expect(migrated.veniceApiSafeMode).toBe(false)
      expect(migrated.activeProjectId).toBe(null)
      expect(migrated.characterSceneGenerationEnabled).toBe(false)
      expect(migrated.characterSceneGenerationMode).toBe('manual')
      expect(migrated.favoriteHostedCharacterSlugs).toEqual([])
    })

    it('handles empty migration gracefully', () => {
      const migrate = useSettingsStore.persist.getOptions().migrate as (persistedState: unknown, version: number) => any
      
      const migrated = migrate(null, 5)

      expect(migrated.activeTab).toBe('chat')
      expect(migrated.sidebarOpen).toBe(true)
      expect(migrated.localFamilySafeModeEnabled).toBe(false)
      expect(migrated.veniceApiSafeMode).toBe(false)
    })

    it('merges state correctly', () => {
      const merge = useSettingsStore.persist.getOptions().merge as (persistedState: unknown, currentState: any) => any
      
      const merged = merge({ activeTab: 'image', sidebarOpen: false }, { activeTab: 'chat' })
      
      expect(merged.activeTab).toBe('image')
      expect(merged.sidebarOpen).toBe(false)
      expect(merged.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
    })
    
    it('handles empty merge gracefully', () => {
      const merge = useSettingsStore.persist.getOptions().merge as (persistedState: unknown, currentState: any) => any
      
      const merged = merge(null, { activeTab: 'chat' })
      
      expect(merged.activeTab).toBe('chat')
      expect(merged.sidebarOpen).toBe(true)
    })

    it('v17: gives persisted audio preferences an audioStudio section defaulting to the model default', () => {
      const migrate = useSettingsStore.persist.getOptions().migrate as (persistedState: unknown, version: number) => any

      const legacy = migrate({
        audioPreferences: {
          uiSounds: { enabled: true, packId: 'glass', volume: 0.5 },
          chatTts: { showMessageControls: false, speed: 1.5, volume: 1, skipCodeBlocks: true, skipUrls: true, stopOnNewReply: true, cacheEnabled: true },
        },
      }, 16)

      expect(legacy.audioPreferences.uiSounds.packId).toBe('glass')
      expect(legacy.audioPreferences.chatTts.speed).toBe(1.5)
      expect(legacy.audioPreferences.audioStudio).toEqual({ ttsFormat: undefined })

      const explicit = migrate({
        audioPreferences: {
          uiSounds: { enabled: false, packId: 'soft', volume: 0.35 },
          chatTts: { showMessageControls: true, speed: 1, volume: 1, skipCodeBlocks: true, skipUrls: true, stopOnNewReply: true, cacheEnabled: true },
          audioStudio: { ttsFormat: 'flac' },
        },
      }, 17)

      expect(explicit.audioPreferences.audioStudio.ttsFormat).toBe('flac')
    })

    it('migrates legacy custom themes without code config to derived code config', () => {
      const migrate = useSettingsStore.persist.getOptions().migrate as (persistedState: unknown, version: number) => any
      const legacyTheme = makeTheme('legacy', 'Legacy Theme', 'dark', 'dracula')
      const { code: _, ...legacyWithoutCode } = legacyTheme

      const migrated = migrate({
        customTheme: legacyWithoutCode,
        customThemes: [legacyWithoutCode],
      }, 15)

      expect(migrated.customTheme).toBeDefined()
      expect(migrated.customTheme.code).toBeDefined()
      expect(migrated.customTheme.code.preset).toBeDefined()
      expect(typeof migrated.customTheme.code.tokens.keyword).toBe('string')
      expect(migrated.customThemes[0].code.tokens.keyword).toBe(migrated.customTheme.code.tokens.keyword)
    })

    it('round-trips distinct light and dark code palettes through migration', () => {
      const migrate = useSettingsStore.persist.getOptions().migrate as (persistedState: unknown, version: number) => any
      const darkTheme = makeTheme('user-dark', 'User Dark', 'dark', 'dracula')
      const lightTheme = makeTheme('user-light', 'User Light', 'light', 'github-light')

      const migrated = migrate({
        customThemes: [darkTheme, lightTheme],
      }, 15)

      expect(migrated.customThemes).toHaveLength(2)
      expect(migrated.customThemes[0].code.preset).toBe('dracula')
      expect(migrated.customThemes[1].code.preset).toBe('github-light')
      expect(migrated.customThemes[0].code.tokens.keyword).toBe(darkTheme.code.tokens.keyword)
      expect(migrated.customThemes[1].code.tokens.keyword).toBe(lightTheme.code.tokens.keyword)
      expect(migrated.customThemes[0].code.tokens.keyword).not.toBe(migrated.customThemes[1].code.tokens.keyword)
    })
  })

  describe('typography and font settings', () => {
    it('initializes with default font and size', () => {
      expect(useSettingsStore.getState().fontFamily).toBe('meslo')
      expect(useSettingsStore.getState().fontSize).toBe(16)
    })

    it('sets fontFamily and clamps fontSize', () => {
      useSettingsStore.getState().setFontFamily('inter')
      expect(useSettingsStore.getState().fontFamily).toBe('inter')

      useSettingsStore.getState().setFontSize(18)
      expect(useSettingsStore.getState().fontSize).toBe(18)

      // Clamping: below min (12)
      useSettingsStore.getState().setFontSize(8)
      expect(useSettingsStore.getState().fontSize).toBe(12)

      // Clamping: above max (24)
      useSettingsStore.getState().setFontSize(32)
      expect(useSettingsStore.getState().fontSize).toBe(24)
    })

    it('resets font settings to defaults', () => {
      useSettingsStore.getState().setFontFamily('lora')
      useSettingsStore.getState().setFontSize(20)

      useSettingsStore.getState().resetFontSettings()

      expect(useSettingsStore.getState().fontFamily).toBe('meslo')
      expect(useSettingsStore.getState().fontSize).toBe(16)
    })

    it('normalizes unknown font ids passed to setFontFamily', () => {
      useSettingsStore.getState().setFontFamily('not-a-real-font')
      expect(useSettingsStore.getState().fontFamily).toBe('meslo')

      useSettingsStore.getState().setFontFamily('jetbrains')
      expect(useSettingsStore.getState().fontFamily).toBe('jetbrains')
    })

    it('normalizes corrupted persisted font ids during migration', () => {
      const migrate = useSettingsStore.persist.getOptions().migrate as (persistedState: unknown, version: number) => any

      expect(migrate({ fontFamily: '' }, 16).fontFamily).toBe('meslo')
      expect(migrate({ fontFamily: 'not-a-real-font' }, 16).fontFamily).toBe('meslo')
      expect(migrate({ fontFamily: 42 }, 16).fontFamily).toBe('meslo')
      expect(migrate({ fontFamily: null }, 16).fontFamily).toBe('meslo')
      expect(migrate({ fontFamily: 'lora' }, 16).fontFamily).toBe('lora')
    })

    it('normalizes corrupted persisted font ids during merge', () => {
      const merge = useSettingsStore.persist.getOptions().merge as (persistedState: unknown, currentState: unknown) => any

      const merged = merge({ fontFamily: 'not-a-real-font', fontSize: 999 }, useSettingsStore.getState())
      expect(merged.fontFamily).toBe('meslo')
      expect(merged.fontSize).toBe(24)

      const valid = merge({ fontFamily: 'inter', fontSize: 14 }, useSettingsStore.getState())
      expect(valid.fontFamily).toBe('inter')
      expect(valid.fontSize).toBe(14)
    })
  })
})
