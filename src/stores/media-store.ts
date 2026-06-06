/** @fileoverview Media Studio store. Holds the in-memory cache of MediaItem records, hydrated from IDB on first read. The IDB store remains the source of truth; this store is a thin cache + UI-state holder. */

import { create } from 'zustand'
import StorageService from '../services/storageService'
import { migrateAll, migrateGalleryImageToMediaItem } from '../services/mediaMigration'
import { isMediaItemLike, type MediaItem, type MediaItemPatch } from '../types/media'
import { toast } from './toast-store'

interface MediaState {
  items: MediaItem[]
  loading: boolean
  loaded: boolean
  lastError: string | null

  /** Loads (or refreshes) the in-memory cache from IDB. Idempotent. */
  refresh: () => Promise<void>
  /** Insert or update a single record. Returns the persisted record. */
  upsert: (item: MediaItem) => Promise<MediaItem>
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
}

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
  loaded: false,
  lastError: null,

  refresh: async () => {
    set({ loading: true, lastError: null })
    try {
      const raw = await StorageService.getItems<unknown>('images')
      const items = migrateAll(raw).filter(isMediaItemLike)
      set({ items, loading: false, loaded: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ loading: false, loaded: true, lastError: msg })
      toast.error('Media Studio failed to load', msg)
    }
  },

  upsert: async (item) => {
    const migrated = migrateGalleryImageToMediaItem(item)
    const saved = await StorageService.putMedia<MediaItem>(migrated)
    set((state) => {
      const without = state.items.filter((existing) => existing.id !== saved.id)
      const next = [saved, ...without]
      next.sort((a, b) => b.timestamp - a.timestamp)
      return { items: next }
    })
    return saved
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
      set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
    }
    return ok
  },

  removeMany: async (ids) => {
    const removed = await StorageService.deleteMediaMany(ids)
    if (removed > 0) {
      const removedSet = new Set(ids)
      set((state) => ({ items: state.items.filter((item) => !removedSet.has(item.id)) }))
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
    await Promise.all(
      ids.map(async (id) => {
        const existing = state.items.find((item) => item.id === id)
        if (!existing) return
        const merged = Array.from(new Set([...existing.tags, ...cleaned]))
        if (merged.length === existing.tags.length) return
        await StorageService.patchMedia<MediaItem>(id, { tags: merged })
      }),
    )
    const idSet = new Set(ids)
    set((state) => ({
      items: state.items.map((item) => {
        if (!idSet.has(item.id)) return item
        const merged = Array.from(new Set([...item.tags, ...cleaned]))
        return merged.length === item.tags.length ? item : { ...item, tags: merged }
      }),
    }))
  },

  removeTagMany: async (ids, tag) => {
    const normalized = tag.trim().toLowerCase()
    if (!normalized) return
    const state = get()
    await Promise.all(
      ids.map(async (id) => {
        const existing = state.items.find((item) => item.id === id)
        if (!existing || !existing.tags.includes(normalized)) return
        const next = existing.tags.filter((t) => t !== normalized)
        await StorageService.patchMedia<MediaItem>(id, { tags: next })
      }),
    )
    const idSet = new Set(ids)
    set((state) => ({
      items: state.items.map((item) => {
        if (!idSet.has(item.id)) return item
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
export type MediaSort = "newest" | "oldest" | "model" | "size"
export type MediaFilter = "all" | "image" | "video" | "favorites" | "upscaled" | "edited"

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
        const aSize = a.mediaType === "video" ? a.image.length * 4 : a.image.length
        const bSize = b.mediaType === "video" ? b.image.length * 4 : b.image.length
        return bSize - aSize
      })
      break
    }
    default:
      out.sort((a, b) => b.timestamp - a.timestamp)
  }
  return out
}

export function searchMedia(items: MediaItem[], query: string): MediaItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => {
    if (item.prompt.toLowerCase().includes(q)) return true
    if (item.model.toLowerCase().includes(q)) return true
    if (item.note.toLowerCase().includes(q)) return true
    if (item.tags.some((tag) => tag.includes(q))) return true
    return false
  })
}
