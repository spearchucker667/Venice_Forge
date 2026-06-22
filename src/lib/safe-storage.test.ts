// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest'

// Polyfill localStorage for Node 26+
const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = String(value) },
  removeItem: (key: string) => { delete localStorageStore[key] },
  clear: () => { for (const k of Object.keys(localStorageStore)) delete localStorageStore[k] },
  key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
  get length() { return Object.keys(localStorageStore).length },
}
;(globalThis as { localStorage?: Storage }).localStorage = localStorageMock as unknown as Storage

import { createSafeStorage } from './safe-storage'

describe('createSafeStorage', () => {
  beforeEach(() => {
    for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]
    vi.restoreAllMocks()
  })

  it('writes a value and reads it back', () => {
    const storage = createSafeStorage()
    storage.setItem('key', 'value')
    expect(storage.getItem('key')).toBe('value')
  })

  it('removes a value', () => {
    const storage = createSafeStorage()
    storage.setItem('key', 'value')
    storage.removeItem('key')
    expect(storage.getItem('key')).toBeNull()
  })

  it('returns null when localStorage.getItem throws', () => {
    vi.spyOn(localStorageMock, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const storage = createSafeStorage()
    expect(storage.getItem('key')).toBeNull()
  })

  it('silently swallows setItem errors that are not quota errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
      throw new Error('permission denied')
    })
    const storage = createSafeStorage()
    storage.setItem('key', 'value')
    expect(warn).toHaveBeenCalled()
  })

  it('clears the key when quota is exceeded and prune cannot help', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const quotaErr = new DOMException('quota', 'QuotaExceededError')
    vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
      throw quotaErr
    })
    const storage = createSafeStorage()
    storage.setItem('key', JSON.stringify({ state: { foo: 'bar' }, version: 1 }))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cleared persisted state'))
  })

  it('prunes oversized arrays and retries on quota error', () => {
    let attempts = 0
    const oversized = { state: { conversations: Array.from({ length: 100 }, (_, i) => ({ id: i })) }, version: 3 }
    vi.spyOn(localStorageMock, 'setItem').mockImplementation((key, value) => {
      attempts += 1
      if (attempts === 1) {
        throw new DOMException('quota', 'QuotaExceededError')
      }
      localStorageStore[key] = String(value)
    })
    const storage = createSafeStorage()
    storage.setItem('key', JSON.stringify(oversized))
    expect(attempts).toBe(2)

    // Verify retry happened and data was persisted in pruned form
    const written = localStorageStore['key']
    expect(written).toBeTruthy()
    const parsed = JSON.parse(written)
    expect(Array.isArray(parsed.state.conversations)).toBe(true)
    expect(parsed.state.conversations.length).toBeLessThan(100)
  })

  it('removes a value even if localStorage.removeItem throws', () => {
    vi.spyOn(localStorageMock, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const storage = createSafeStorage()
    expect(() => storage.removeItem('key')).not.toThrow()
  })
})
