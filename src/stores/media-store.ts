/** @fileoverview Media Studio store. Holds the in-memory cache of MediaItem records, hydrated from IDB on first read. The IDB store remains the source of truth; this store is a thin cache + UI-state holder. */

import { create } from 'zustand'
import StorageService from '../services/storageService'
import { migrateAll, migrateGalleryImageToMediaItem } from '../services/mediaMigration'
import { isMediaItemLike, type MediaItem, type MediaItemPatch } from '../types/media'
import { toast } from './toast-store'
import { useSettingsStore } from './settings-store' // for attaching active project to new media (Phase 1 hardening)

interface MediaState {
  items: MediaItem[]
  loading: boolean
  loadingMore: boolean
  loaded: boolean
  totalCount: number
  hasMore: boolean
  nextOffset: number
  lastError: string | null

  /** Loads (or refreshes) the in-memory cache from IDB. Idempotent. */
  refresh: () => Promise<void>
  /** Loads the next timestamp-ordered page without replacing loaded records. */
  loadMore: () => Promise<void>
  /** Insert or update a single record. Returns the persisted record. */
  upsert: (item: MediaItem, options?: MediaUpsertOptions) => Promise<MediaItem>
  /** Persist a derivative and update its parent's child list as one logical operation. */
  upsertDerivative: (item: MediaItem, parentId: string) => Promise<MediaItem>
  /** Patch a single record by id. Returns the updated record, or null if missing. */
  patch: (id: string, patch: MediaItemPatch) => Promise<MediaItem | null>
  /** Patch many records at once. Returns the number of records updated. */
  patchMany: (ids: readonly string[], patch: MediaItemPatch) => Promise<number>
  /** Delete a single record. */
  remove: (id: string) => Promise<boolean>
  /** Delete many records. Returns the number actually removed. */
  removeMany: (ids: readonly string[]) => Promise<number>
  /** Toggle favorite on a single record. */
  toggleFavorite: (id: string) => Promise<void>
  /** Toggle favorite on many records. */
  setFavoriteMany: (ids: readonly string[], favorite: boolean) => Promise<void>
  /** Add tags to many records (de-duped, lowercased). */
  addTagsMany: (ids: readonly string[], tags: readonly string[]) => Promise<void>
  /** Remove a tag from many records. */
  removeTagMany: (ids: readonly string[], tag: string) => Promise<void>

  /** Selectors */
  byId: (id: string) => MediaItem | undefined
  childrenOf: (id: string) => MediaItem[]
  parentOf: (id: string) => MediaItem | undefined
  /** BUG-008 regression guard: fetch a single record by id from IDB. Used
   *  by the gallery inspector when the parent/child of the inspected
   *  record is outside the currently loaded page. The returned record is
   *  also merged into the in-memory cache so subsequent byId / childrenOf
   *  / parentOf lookups for the same id hit the in-memory path. */
  loadById: (id: string) => Promise<MediaItem | null>
}

export interface MediaUpsertOptions {
  attachActiveProject?: boolean
  source?: 'generated' | 'imported' | 'legacy' | 'manual' | 'migration'
}

export const MEDIA_PAGE_SIZE = 60

function reconcileList(current: MediaItem[], next: MediaItem[]): MediaItem[] {
  // Build a map of incoming items by id; any id present in `next` is considered
  // authoritative. Items only present in `current` (e.g. unrelated records) are
  // preserved as-is to keep their identity stable.
  const incoming = new Map(next.map((item) => [item.id, item] as const))
  const merged: MediaItem[] = []
  for (const item of current) {
    if (incoming.has(item.id)) {
      merged.push(incoming.get(item.id)!)
      incoming.delete(item.id)
    } else {
      merged.push(item)
    }
  }
  return merged
}

export const useMediaStore = create<MediaState>((set, get) => ({
  items: [],
  loading: false,
  loadingMore: false,
  loaded: false,
  totalCount: 0,
  hasMore: false,
  nextOffset: 0,
  lastError: null,

  refresh: async () => {
    set({ loading: true, lastError: null })
    try {
      const page = await StorageService.getItemsPageWithMeta<unknown>('images', { offset: 0, limit: MEDIA_PAGE_SIZE })
      const items = migrateAll(page.items).filter(isMediaItemLike)
      set({
        items,
        loading: false,
        loaded: true,
        totalCount: page.total,
        hasMore: page.hasMore,
        nextOffset: Math.min(page.total, page.offset + page.limit),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ loading: false, loaded: true, lastError: msg })
      toast.error('Media Studio failed to load', msg)
    }
  },

  loadMore: async () => {
    const state = get()
    if (state.loading || state.loadingMore || !state.hasMore) return
    set({ loadingMore: true, lastError: null })
    try {
      const page = await StorageService.getItemsPageWithMeta<unknown>('images', {
        offset: state.nextOffset,
        limit: MEDIA_PAGE_SIZE,
      })
      const incoming = migrateAll(page.items).filter(isMediaItemLike)
      set((current) => {
        const byId = new Map(current.items.map((item) => [item.id, item]))
        for (const item of incoming) byId.set(item.id, item)
        const items = Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp)
        return {
          items,
          loadingMore: false,
          totalCount: page.total,
          hasMore: page.hasMore,
          nextOffset: Math.min(page.total, page.offset + page.limit),
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ loadingMore: false, lastError: msg })
      toast.error('Media Studio failed to load more', msg)
    }
  },

  upsert: async (item, options) => {
    const alreadyLoaded = get().items.some((existing) => existing.id === item.id)
    const migrated = migrateGalleryImageToMediaItem({ ...item })
    const activeProjectId = useSettingsStore.getState().activeProjectId
    if (options?.attachActiveProject === true && activeProjectId && !migrated.projectId) {
      migrated.projectId = activeProjectId
    }
    const saved = await StorageService.putMedia<MediaItem>(migrated)
    set((state) => {
      const without = state.items.filter((existing) => existing.id !== saved.id)
      const next = [saved, ...without]
      next.sort((a, b) => b.timestamp - a.timestamp)
      return {
        items: next,
        totalCount: alreadyLoaded ? state.totalCount : state.totalCount + 1,
      }
    })
    return saved
  },

  upsertDerivative: async (item, parentId) => {
    const parent = get().items.find((candidate) => candidate.id === parentId) ?? await get().loadById(parentId)
    if (!parent) throw new Error(`Parent media item not found: ${parentId}`)

    const migrated = migrateGalleryImageToMediaItem({
      ...item,
      parentId,
      projectId: item.projectId ?? parent.projectId,
    })
    const saved = await StorageService.putMedia<MediaItem>(migrated)
    const childrenIds = Array.from(new Set([...parent.childrenIds, saved.id]))
    try {
      const updatedParent = await StorageService.patchMedia<MediaItem>(parentId, { childrenIds })
      set((state) => {
        const withoutChild = state.items.filter((existing) => existing.id !== saved.id)
        const items = reconcileList([saved, ...withoutChild], [updatedParent])
        items.sort((a, b) => b.timestamp - a.timestamp)
        return { items, totalCount: state.totalCount + (state.items.some((existing) => existing.id === saved.id) ? 0 : 1) }
      })
      return saved
    } catch (err) {
      // Attempt rollback: delete the child so we don't leave an orphan.
      let rollbackOk = false
      try {
        await StorageService.deleteMedia(saved.id)
        rollbackOk = true
      } catch (rollbackErr) {
        const rollbackMessage = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
        toast.error('Derivative save failed and rollback incomplete', `Parent update failed. Child record ${saved.id} could not be removed: ${rollbackMessage}`)
        // Keep the child in the in-memory cache so it matches IDB reality.
        set((state) => {
          const withoutChild = state.items.filter((existing) => existing.id !== saved.id)
          const items = reconcileList([saved, ...withoutChild], [])
          items.sort((a, b) => b.timestamp - a.timestamp)
          return { items, totalCount: state.totalCount + 1, lastError: `Derivative rollback incomplete: ${rollbackMessage}` }
        })
      }
      if (rollbackOk) {
        set({ lastError: `Derivative save failed for ${parentId}: ${err instanceof Error ? err.message : String(err)}` })
      }
      throw err
    }
  },

  patch: async (id, patch) => {
    const existing = get().items.find((item) => item.id === id)
    if (!existing) return null
    const updated = await StorageService.patchMedia<MediaItem>(id, patch)
    set((state) => ({ items: reconcileList(state.items, [updated]) }))
    return updated
  },

  patchMany: async (ids, patch) => {
    const count = await StorageService.bulkPatchMedia(ids, patch)
    if (count > 0) {
      const updatedSet = new Set(ids)
      set((state) => ({
        items: state.items.map((item) =>
          updatedSet.has(item.id) ? { ...item, ...patch, id: item.id, timestamp: item.timestamp } : item,
        ),
      }))
    }
    return count
  },

  remove: async (id) => {
    const ok = await StorageService.deleteMedia(id)
    if (ok) {
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
        totalCount: Math.max(0, state.totalCount - 1),
      }))
    }
    return ok
  },

  removeMany: async (ids) => {
    const removed = await StorageService.deleteMediaMany(ids)
    if (removed > 0) {
      const removedSet = new Set(ids)
      set((state) => ({
        items: state.items.filter((item) => !removedSet.has(item.id)),
        totalCount: Math.max(0, state.totalCount - removed),
      }))
    }
    return removed
  },

  toggleFavorite: async (id) => {
    const current = get().items.find((item) => item.id === id)
    if (!current) return
    await get().patch(id, { favorite: !current.favorite })
  },

  setFavoriteMany: async (ids, favorite) => {
    await get().patchMany(ids, { favorite })
  },

  addTagsMany: async (ids, tags) => {
    const cleaned = Array.from(
      new Set(
        tags
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0 && t.length <= 32),
      ),
    )
    if (cleaned.length === 0) return
    const state = get()
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const existing = state.items.find((item) => item.id === id)
        if (!existing) return { id, skipped: true }
        const merged = Array.from(new Set([...existing.tags, ...cleaned]))
        if (merged.length === existing.tags.length) return { id, skipped: true }
        await StorageService.patchMedia<MediaItem>(id, { tags: merged })
        return { id, skipped: false }
      }),
    )
    const succeededIds = new Set<string>()
    const failedIds: string[] = []
    for (let i = 0; i < results.length; i++) {
      const res = results[i]
      if (res.status === "fulfilled" && !res.value.skipped) {
        succeededIds.add(res.value.id)
      } else if (res.status === "rejected") {
        failedIds.push(ids[i])
      }
    }
    if (failedIds.length > 0) {
      toast.error('Tag update partially failed', `Could not update tags for ${failedIds.length} item(s).`)
      set({ lastError: `addTagsMany failed for ${failedIds.join(", ")}` })
    }
    set((state) => ({
      items: state.items.map((item) => {
        if (!succeededIds.has(item.id)) return item
        const merged = Array.from(new Set([...item.tags, ...cleaned]))
        return merged.length === item.tags.length ? item : { ...item, tags: merged }
      }),
    }))
  },

  removeTagMany: async (ids, tag) => {
    const normalized = tag.trim().toLowerCase()
    if (!normalized) return
    const state = get()
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const existing = state.items.find((item) => item.id === id)
        if (!existing || !existing.tags.includes(normalized)) return { id, skipped: true }
        const next = existing.tags.filter((t) => t !== normalized)
        await StorageService.patchMedia<MediaItem>(id, { tags: next })
        return { id, skipped: false }
      }),
    )
    const succeededIds = new Set<string>()
    const failedIds: string[] = []
    for (let i = 0; i < results.length; i++) {
      const res = results[i]
      if (res.status === "fulfilled" && !res.value.skipped) {
        succeededIds.add(res.value.id)
      } else if (res.status === "rejected") {
        failedIds.push(ids[i])
      }
    }
    if (failedIds.length > 0) {
      toast.error('Tag removal partially failed', `Could not remove tag for ${failedIds.length} item(s).`)
      set({ lastError: `removeTagMany failed for ${failedIds.join(", ")}` })
    }
    set((state) => ({
      items: state.items.map((item) => {
        if (!succeededIds.has(item.id)) return item
        if (!item.tags.includes(normalized)) return item
        return { ...item, tags: item.tags.filter((t) => t !== normalized) }
      }),
    }))
  },

  byId: (id) => get().items.find((item) => item.id === id),
  childrenOf: (id) => get().items.filter((item) => item.parentId === id),
  parentOf: (id) => {
    const item = get().items.find((i) => i.id === id)
    if (!item?.parentId) return undefined
    return get().items.find((i) => i.id === item.parentId)
  },

  loadById: async (id) => {
    const cached = get().items.find((item) => item.id === id)
    if (cached) return cached
    try {
      const raw = (await StorageService.getItem("images", id)) as unknown
      if (raw === null || raw === undefined) return null
      const migrated = migrateGalleryImageToMediaItem(raw)
      if (!isMediaItemLike(migrated)) return null
      // Merge into the in-memory cache so subsequent selectors hit.
      set((state) => {
        if (state.items.some((existing) => existing.id === migrated.id)) {
          return state
        }
        return {
          items: [migrated, ...state.items].sort((a, b) => b.timestamp - a.timestamp),
        }
      })
      return migrated
    } catch {
      return null
    }
  },
}))

/** Pure selector helpers (exported for use outside React). */
export const selectById = (state: MediaState, id: string) => state.items.find((item) => item.id === id)
export const selectChildren = (state: MediaState, id: string) =>
  state.items.filter((item) => item.parentId === id)
export const selectParent = (state: MediaState, id: string) => {
  const item = state.items.find((i) => i.id === id)
  if (!item?.parentId) return undefined
  return state.items.find((i) => i.id === item.parentId)
}

/** Lightweight filter/sort helpers, exported so views and tests can share them. */
export type MediaSort =
  | "newest"
  | "oldest"
  | "model"
  | "size"
  | "project"
  | "has-recipe"
  | "has-seed"
export type MediaFilter =
  | "all"
  | "image"
  | "video"
  | "favorites"
  | "upscaled"
  | "edited"
  | "has-recipe"
  | "no-recipe"
  | "has-seed"
  | "no-seed"
  | "no-project"

/** Phase 2B hard-filter options. These complement the categorical
 *  MediaFilter with dynamic-value filters (e.g. project id) that the
 *  toolbar can populate from the live project list. The view merges
 *  the static + dynamic filters into a single composed query. */
export interface MediaDynamicFilter {
  projectId?: string | null;
  model?: string | null;
  tag?: string | null;
  operation?: string | null;
}

export function applyDynamicFilter(
  items: MediaItem[],
  dynamic: MediaDynamicFilter | null | undefined,
): MediaItem[] {
  if (!dynamic) return items;
  let out = items;
  if (dynamic.projectId !== undefined && dynamic.projectId !== null) {
    out = out.filter((it) => it.projectId === dynamic.projectId);
  }
  if (dynamic.model !== undefined && dynamic.model !== null) {
    out = out.filter((it) => it.model === dynamic.model);
  }
  if (dynamic.tag !== undefined && dynamic.tag !== null) {
    const normalised = dynamic.tag.trim().toLowerCase();
    if (normalised.length > 0) {
      out = out.filter((it) => it.tags.includes(normalised));
    }
  }
  if (dynamic.operation !== undefined && dynamic.operation !== null) {
    out = out.filter((it) => it.operation === dynamic.operation);
  }
  return out;
}

export function filterMedia(items: MediaItem[], filter: MediaFilter): MediaItem[] {
  switch (filter) {
    case "all":
      return items
    case "image":
      return items.filter((item) => item.mediaType === "image")
    case "video":
      return items.filter((item) => item.mediaType === "video")
    case "favorites":
      return items.filter((item) => item.favorite)
    case "upscaled":
      return items.filter((item) => item.operation === "upscale" || item.upscaled === true)
    case "edited":
      return items.filter((item) => item.operation === "edit" || item.operation === "background-remove")
    case "has-recipe":
      return items.filter((item) => Boolean(item.recipe))
    case "no-recipe":
      return items.filter((item) => !item.recipe)
    case "has-seed":
      return items.filter((item) => typeof item.seed === "number" && Number.isInteger(item.seed))
    case "no-seed":
      return items.filter((item) => typeof item.seed !== "number" || !Number.isInteger(item.seed))
    case "no-project":
      return items.filter((item) => !item.projectId)
    default:
      return items
  }
}

export function sortMedia(items: MediaItem[], sort: MediaSort): MediaItem[] {
  const out = items.slice()
  switch (sort) {
    case "newest":
      out.sort((a, b) => b.timestamp - a.timestamp)
      break
    case "oldest":
      out.sort((a, b) => a.timestamp - b.timestamp)
      break
    case "model":
      out.sort((a, b) => a.model.localeCompare(b.model))
      break
    case "size": {
      out.sort((a, b) => {
        const aLen = typeof a.image === "string" ? a.image.length : 0
        const bLen = typeof b.image === "string" ? b.image.length : 0
        const aSize = a.mediaType === "video" ? aLen * 4 : aLen
        const bSize = b.mediaType === "video" ? bLen * 4 : bLen
        return bSize - aSize
      })
      break
    }
    case "project":
      // Stable: by projectId (ascending), then by timestamp (newest first)
      // so unscoped media sit at the bottom of each project bucket.
      out.sort((a, b) => {
        const ap = a.projectId ?? ""
        const bp = b.projectId ?? ""
        if (ap !== bp) return ap.localeCompare(bp)
        return b.timestamp - a.timestamp
      })
      break
    case "has-recipe":
      // Items with a recipe first; nulls last; within each bucket by
      // timestamp (newest first).
      out.sort((a, b) => {
        const ar = a.recipe ? 1 : 0
        const br = b.recipe ? 1 : 0
        if (ar !== br) return br - ar
        return b.timestamp - a.timestamp
      })
      break
    case "has-seed":
      out.sort((a, b) => {
        const as = typeof a.seed === "number" && Number.isInteger(a.seed) ? 1 : 0
        const bs = typeof b.seed === "number" && Number.isInteger(b.seed) ? 1 : 0
        if (as !== bs) return bs - as
        return b.timestamp - a.timestamp
      })
      break
    default:
      out.sort((a, b) => b.timestamp - a.timestamp)
  }
  return out
}

export function searchMedia(items: MediaItem[], query: string): MediaItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => {
    if (typeof item.prompt === "string" && item.prompt.toLowerCase().includes(q)) return true
    if (typeof item.model === "string" && item.model.toLowerCase().includes(q)) return true
    if (typeof item.note === "string" && item.note.toLowerCase().includes(q)) return true
    if (Array.isArray(item.tags) && item.tags.some((tag) => typeof tag === "string" && tag.includes(q))) return true
    return false
  })
}
