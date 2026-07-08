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
