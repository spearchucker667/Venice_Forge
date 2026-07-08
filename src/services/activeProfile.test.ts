// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  DEFAULT_PROFILE_ID,
  getActiveProfileId,
  setActiveProfileId,
  subscribeActiveProfile,
  broadcastActiveProfileChange,
} from './activeProfile'

describe('activeProfile', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns default id when localStorage is empty', () => {
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID)
  })

  it('writes and reads the active profile id', () => {
    setActiveProfileId('work')
    expect(window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe('work')
    expect(getActiveProfileId()).toBe('work')
  })

  it('allows switching back to the default system profile', () => {
    // Regression guard: isValidProfileStorageId must accept 'default' so that
    // setActiveProfileId can write it after switching away from a custom profile.
    setActiveProfileId('work')
    expect(getActiveProfileId()).toBe('work')
    setActiveProfileId(DEFAULT_PROFILE_ID)
    expect(window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe(DEFAULT_PROFILE_ID)
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID)
  })

  it('rejects invalid profile ids', () => {
    // Invalid ids must not be written to localStorage.
    setActiveProfileId('bad id with spaces')
    expect(window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBeNull()
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID)
  })

  it('broadcasts exactly once per actual change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeActiveProfile(listener)

    setActiveProfileId('work')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('work', 'default')

    // Same id is idempotent: no write, no broadcast.
    setActiveProfileId('work')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('broadcastActiveProfileChange dedupes identical-to-current id', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeActiveProfile(listener)

    setActiveProfileId('work')
    expect(listener).toHaveBeenCalledTimes(1)

    broadcastActiveProfileChange('work')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })
})
