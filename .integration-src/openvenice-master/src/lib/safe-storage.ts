import type { StateStorage } from 'zustand/middleware'

/**
 * Storage wrapper that:
 *   - Catches QuotaExceededError on write and tries to free space by trimming
 *     persisted "conversations" / "workflows" / "messages" arrays before retrying.
 *   - Catches all other read/write failures so a corrupted entry doesn't crash
 *     hydration.
 */
export function createSafeStorage(): StateStorage {
  return {
    getItem: (name) => {
      try { return localStorage.getItem(name) } catch { return null }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value)
      } catch (err) {
        if (!isQuotaErr(err)) { console.warn('[storage] setItem failed', name, err); return }
        const pruned = pruneOversized(value)
        if (pruned) {
          try { localStorage.setItem(name, pruned); return } catch { /* fall through */ }
        }
        try { localStorage.removeItem(name) } catch { /* noop */ }
        console.warn(`[storage] quota exceeded for ${name}; cleared persisted state`)
      }
    },
    removeItem: (name) => {
      try { localStorage.removeItem(name) } catch { /* noop */ }
    },
  }
}

function isQuotaErr(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false
  return err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014
}

function pruneOversized(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as { state?: Record<string, unknown>; version?: number }
    if (!parsed?.state) return null
    const state = parsed.state
    let modified = false
    for (const key of ['conversations', 'workflows', 'messages']) {
      const arr = state[key]
      if (Array.isArray(arr) && arr.length > 5) {
        state[key] = arr.slice(0, Math.max(5, Math.floor(arr.length / 2)))
        modified = true
      }
    }
    if (!modified) return null
    return JSON.stringify(parsed)
  } catch {
    return null
  }
}
