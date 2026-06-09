import type { StateStorage } from 'zustand/middleware'
import * as logger from '../shared/logger'

/**
 * Storage wrapper that:
 *   - Catches QuotaExceededError on write and tries to free space by trimming
 *     persisted "conversations" / "workflows" / "messages" arrays before retrying.
 *   - Catches all other read/write failures so a corrupted entry doesn't crash
 *     hydration.
 *
 * LocalStorage access policy for Venice Forge:
 *   - Use `createSafeStorage()` for Zustand persist middleware (settings store).
 *   - Use `src/services/modelService.ts` `cacheStorage` for transient model-list
 *     cache only (no secrets, stale-while-revalidate, best-effort).
 *   - Use `src/services/storageMaintenance.ts` for clearing that same cache.
 *   - Use `src/hooks/useThemeLifecycle.ts` and `src/App.tsx` for the theme
 *     bootstrap cache only (prevents FOUC on cold load).
 *   - Use `src/services/promptStarterService.ts` for ephemeral prompt-starter
 *     rotation tracking only.
 *   - Use `src/App.tsx` for the first-run legal acknowledgment gate only.
 *   - Never store API keys, bearer tokens, conversation content, or raw prompts
 *     in localStorage; those belong in `safeStorage` (Electron) or encrypted
 *     IndexedDB (`ENCRYPTED_STORES`) / server-side `.env` (web).
 *
 * Every direct localStorage call site must be tagged with
 * `/* localStorage-allowed: <reason> *\/` and enforced by
 * `scripts/verify-storage-policy.cjs`.
 */
export function createSafeStorage(): StateStorage {
  return {
    getItem: (name) => {
      try { return localStorage.getItem(name) /* localStorage-allowed: zustand persist safeStorage wrapper */ } catch { return null }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value) /* localStorage-allowed: zustand persist safeStorage wrapper */
      } catch (err) {
        if (!isQuotaErr(err)) { logger.warn('[storage] setItem failed', name, err); return }
        const pruned = pruneOversized(value)
        if (pruned) {
          try { localStorage.setItem(name, pruned) /* localStorage-allowed: zustand persist safeStorage wrapper */; return } catch { /* fall through */ }
        }
        try { localStorage.removeItem(name) /* localStorage-allowed: zustand persist safeStorage wrapper */ } catch { /* noop */ }
        logger.warn(`[storage] quota exceeded for ${name}; cleared persisted state`)
      }
    },
    removeItem: (name) => {
      try { localStorage.removeItem(name) /* localStorage-allowed: zustand persist safeStorage wrapper */ } catch { /* noop */ }
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
