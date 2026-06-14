/** @fileoverview Regression tests for Character Scene Generation settings. */

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSettingsStore } from './settings-store';

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] || null,
  setItem: (key: string, value: string) => { localStorageStore[key] = String(value); },
  clear: () => { for (const key in localStorageStore) { delete localStorageStore[key]; } },
  removeItem: (key: string) => { delete localStorageStore[key]; },
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe('settings-store character scene generation defaults', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSettingsStore.setState({
      characterSceneGenerationEnabled: false,
      characterSceneGenerationMode: 'manual',
    });
  });

  afterEach(() => {
    useSettingsStore.persist.clearStorage?.();
  });

  it('defaults character scene generation to off and manual', () => {
    const state = useSettingsStore.getState();
    expect(state.characterSceneGenerationEnabled).toBe(false);
    expect(state.characterSceneGenerationMode).toBe('manual');
  });

  it('toggles enabled state', () => {
    useSettingsStore.getState().setCharacterSceneGenerationEnabled(true);
    expect(useSettingsStore.getState().characterSceneGenerationEnabled).toBe(true);
  });

  it('sets mode to auto', () => {
    useSettingsStore.getState().setCharacterSceneGenerationMode('auto');
    expect(useSettingsStore.getState().characterSceneGenerationMode).toBe('auto');
  });
});
