// VERIFY regression guard for AUDIT-013: uiSoundController must store and invoke
// the unsubscribe handle returned by `useSettingsStore.subscribe(...)`. Without
// that, strict-mode React and hot reload (HMR) accumulate redundant listeners
// on every init/dispose cycle.

import { describe, it, expect, beforeEach, vi } from 'vitest'

import { resolveUiSoundAssetUrl, uiSoundController } from '../services/uiSoundController'
import { DEFAULT_AUDIO_PREFERENCES, useSettingsStore } from '../stores/settings-store'

type Subscriber = Parameters<typeof useSettingsStore.subscribe>[0]

interface MockStore {
  subscribers: Set<Subscriber>
  subscribe: (fn: Subscriber) => () => void
  audioPreferences: ReturnType<typeof useSettingsStore.getState>['audioPreferences']
}

const buildMockStore = (): MockStore => {
  const subscribers = new Set<Subscriber>()
  return {
    subscribers,
    audioPreferences: {
      ...DEFAULT_AUDIO_PREFERENCES,
      uiSounds: { enabled: false, volume: 0.35, packId: 'soft' },
    },
    subscribe(fn) {
      const wrappedFn: Subscriber = fn
      subscribers.add(wrappedFn)
      return () => subscribers.delete(wrappedFn)
    },
  }
}

const installMockStore = (mock: MockStore) => {
  // Bypass the real subscribe path so the test does not depend on Zustand
  // internals or write to the persisted settings store.
  vi.spyOn(useSettingsStore, 'subscribe').mockImplementation(
    ((fn: Subscriber) => mock.subscribe(fn)) as typeof useSettingsStore.subscribe,
  )
  vi.spyOn(useSettingsStore, 'getState').mockReturnValue({
    audioPreferences: mock.audioPreferences,
  } as ReturnType<typeof useSettingsStore.getState>)
}

describe('AUDIT-013 uiSoundController subscription lifecycle', () => {
  let mock: MockStore

  beforeEach(() => {
    mock = buildMockStore()
    installMockStore(mock)
    // Each test starts with a fresh controller instance to keep the
    // singleton state isolated.
  })

  it('initialize() registers exactly one listener on the settings store', () => {
    uiSoundController.dispose()
    ;(uiSoundController as unknown as { unsubscribeFromSettings: unknown }).unsubscribeFromSettings = null

    uiSoundController.initialize()

    expect(mock.subscribers.size).toBe(1)
  })

  it('dispose() removes the listener it added in initialize()', () => {
    uiSoundController.dispose()
    ;(uiSoundController as unknown as { unsubscribeFromSettings: unknown }).unsubscribeFromSettings = null
    uiSoundController.initialize()
    expect(mock.subscribers.size).toBe(1)

    uiSoundController.dispose()

    expect(mock.subscribers.size).toBe(0)
  })

  it('repeated initialize/dispose cycles do not accumulate listeners', () => {
    uiSoundController.dispose()
    ;(uiSoundController as unknown as { unsubscribeFromSettings: unknown }).unsubscribeFromSettings = null

    for (let i = 0; i < 5; i++) {
      uiSoundController.initialize()
      uiSoundController.dispose()
    }

    expect(mock.subscribers.size).toBe(0)
  })

  it('initialize() called twice in a row removes the first listener before adding the second', () => {
    uiSoundController.dispose()
    ;(uiSoundController as unknown as { unsubscribeFromSettings: unknown }).unsubscribeFromSettings = null

    uiSoundController.initialize()
    uiSoundController.initialize()

    // Only the latest subscription must remain — duplicate resets are idempotent.
    expect(mock.subscribers.size).toBe(1)

    uiSoundController.dispose()
    expect(mock.subscribers.size).toBe(0)
  })
})

describe('VERIFY-117 packaged UI sound paths', () => {
  it('resolves bundled sounds relative to packaged index.html', () => {
    expect(resolveUiSoundAssetUrl('audio/ui/soft/primary-click.ogg', 'file:///Applications/Venice%20Forge/resources/app.asar/dist/index.html'))
      .toBe('file:///Applications/Venice%20Forge/resources/app.asar/dist/audio/ui/soft/primary-click.ogg')
  })
})
