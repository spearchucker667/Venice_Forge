import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from './settings-store'
import type { Theme } from '../theme'

describe('settings-store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSettingsStore.setState({
      activeTab: 'chat',
      sidebarOpen: true,
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
      expect(migrated.localFamilySafeModeEnabled).toBe(true)
      expect(migrated.veniceApiSafeMode).toBe(true)
    })

    it('merges state correctly', () => {
      const merge = useSettingsStore.persist.getOptions().merge as (persistedState: unknown, currentState: any) => any
      
      const merged = merge({ activeTab: 'image', sidebarOpen: false }, { activeTab: 'chat' })
      
      expect(merged.activeTab).toBe('image')
      // Merge should always force sidebarOpen to true
      expect(merged.sidebarOpen).toBe(true)
    })
    
    it('handles empty merge gracefully', () => {
      const merge = useSettingsStore.persist.getOptions().merge as (persistedState: unknown, currentState: any) => any
      
      const merged = merge(null, { activeTab: 'chat' })
      
      expect(merged.activeTab).toBe('chat')
      expect(merged.sidebarOpen).toBe(true)
    })
  })
})
