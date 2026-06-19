import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMediaStore, filterMedia, sortMedia, searchMedia, selectById, selectChildren, selectParent, MEDIA_IN_MEMORY_CACHE_MAX } from './media-store'
import { useSettingsStore } from './settings-store'
import { toast, useToastStore } from './toast-store'
import { MEDIA_ITEM_VERSION, type MediaItem } from '../types/media'

vi.mock('../services/storageService', () => {
  const store = new Map<string, MediaItem>()
  return {
    default: {
      getItemsPageWithMeta: vi.fn(async (_name: string, options: { offset?: number; limit?: number } = {}) => {
        const offset = options.offset ?? 0
        const limit = options.limit ?? 60
        const all = Array.from(store.values()).sort((a, b) => b.timestamp - a.timestamp)
        return {
          items: all.slice(offset, offset + limit),
          decryptFailures: 0,
          total: all.length,
          offset,
          limit,
          hasMore: offset + limit < all.length,
        }
      }),
      getItem: vi.fn(async (_name: string, id: string) => {
        return store.get(id) ?? null
      }),
      putMedia: vi.fn(async (item: MediaItem) => {
        const next = { ...item, mediaItemVersion: MEDIA_ITEM_VERSION }
        store.set(next.id, next)
        return next
      }),
      patchMedia: vi.fn(async (id: string, patch: Partial<MediaItem> | ((existing: MediaItem) => Partial<MediaItem>)) => {
        const existing = store.get(id)
        if (!existing) throw new Error('not found')
        const patchRecord = typeof patch === 'function' ? patch(existing) : patch
        const next = { ...existing, ...patchRecord, id, timestamp: existing.timestamp }
        store.set(id, next)
        return next
      }),
      bulkPatchMedia: vi.fn(async (ids: string[], patch: Partial<MediaItem>) => {
        let n = 0
        for (const id of ids) {
          const existing = store.get(id)
          if (!existing) continue
          store.set(id, { ...existing, ...patch, id, timestamp: existing.timestamp })
          n += 1
        }
        return n
      }),
      deleteMedia: vi.fn(async (id: string) => {
        return store.delete(id)
      }),
      deleteMediaMany: vi.fn(async (ids: string[]) => {
        let n = 0
        for (const id of ids) {
          if (store.delete(id)) n += 1
        }
        return n
      }),
      __reset: () => store.clear(),
      __seed: (item: MediaItem) => {
        store.set(item.id, item)
      },
      __all: () => Array.from(store.values()),
    },
  }
})

import StorageService from '../services/storageService'

type MockedService = typeof StorageService & {
  __reset: () => void
  __seed: (item: MediaItem) => void
  __all: () => MediaItem[]
}

const mockService = StorageService as unknown as MockedService

vi.spyOn(toast, 'error')

function makeItem(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: over.id ?? crypto.randomUUID(),
    image: over.image ?? 'data:image/png;base64,AAA',
    prompt: over.prompt ?? 'a copper city',
    model: over.model ?? 'flux-dev',
    timestamp: over.timestamp ?? 1700000000000,
    mediaItemVersion: MEDIA_ITEM_VERSION,
    mediaType: over.mediaType ?? 'image',
    operation: over.operation ?? 'generate',
    parentId: over.parentId ?? null,
    childrenIds: over.childrenIds ?? [],
    tags: over.tags ?? [],
    note: over.note ?? '',
    favorite: over.favorite ?? false,
    viewCount: over.viewCount ?? 0,
    ...over,
  }
}

describe('mediaStore', () => {
  beforeEach(() => {
    mockService.__reset()
    useMediaStore.setState({
      items: [],
      loading: false,
      loadingMore: false,
      loaded: false,
      totalCount: 0,
      hasMore: false,
      nextOffset: 0,
      lastError: null,
    })
    useSettingsStore.setState({ activeProjectId: null } as never)
    useToastStore.setState({ toasts: [] })
    vi.mocked(toast.error).mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('refresh() hydrates from IDB and migrates legacy records', async () => {
    // Seed IDB with a legacy record (no mediaItemVersion).
    mockService.__seed({
      id: 'legacy-1',
      image: 'data:image/png;base64,XYZ',
      prompt: 'old',
      model: 'm',
      timestamp: 1,
    } as unknown as MediaItem)

    await useMediaStore.getState().refresh()
    const items = useMediaStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].mediaItemVersion).toBe(MEDIA_ITEM_VERSION)
    expect(items[0].mediaType).toBe('image')
    expect(items[0].operation).toBe('generate')
    expect(useMediaStore.getState().loaded).toBe(true)
  })

  it('upsert() inserts a new record and prepends it sorted by timestamp', async () => {
    const old = makeItem({ id: 'old', timestamp: 1 })
    mockService.__seed(old)
    await useMediaStore.getState().refresh()

    const newer = makeItem({ id: 'new', timestamp: 99 })
    await useMediaStore.getState().upsert(newer)
    const items = useMediaStore.getState().items
    expect(items.map((i) => i.id)).toEqual(['new', 'old'])
  })

  it('upsert() updates existing item and does not increment totalCount', async () => {
    const old = makeItem({ id: 'existing', timestamp: 1 })
    mockService.__seed(old)
    await useMediaStore.getState().refresh()

    const updated = makeItem({ id: 'existing', timestamp: 99, note: 'updated' })
    await useMediaStore.getState().upsert(updated)
    const items = useMediaStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].note).toBe('updated')
    expect(useMediaStore.getState().totalCount).toBe(1)
  })

  it('loadMore() ignores call if already loading or has no more', async () => {
    vi.mocked(StorageService.getItemsPageWithMeta).mockClear()
    useMediaStore.setState({ loading: true, hasMore: true })
    await useMediaStore.getState().loadMore()
    expect(StorageService.getItemsPageWithMeta).not.toHaveBeenCalled()

    useMediaStore.setState({ loading: false, loadingMore: true, hasMore: true })
    await useMediaStore.getState().loadMore()
    expect(StorageService.getItemsPageWithMeta).not.toHaveBeenCalled()
  })

  // VERIFY-042: project attachment is explicit and limited to generated media.
  it('attaches the active project only when generated media opts in', async () => {
    useSettingsStore.setState({ activeProjectId: 'project-a' } as never)
    const generated = await useMediaStore.getState().upsert(
      makeItem({ id: 'generated', projectId: undefined }),
      { attachActiveProject: true, source: 'generated' },
    )
    const imported = await useMediaStore.getState().upsert(
      makeItem({ id: 'imported', projectId: undefined, operation: 'import' }),
      { attachActiveProject: false, source: 'imported' },
    )
    expect(generated.projectId).toBe('project-a')
    expect(imported.projectId).toBeUndefined()
  })

  it('does not retag existing unscoped or already-scoped media', async () => {
    useSettingsStore.setState({ activeProjectId: 'project-a' } as never)
    const unscoped = makeItem({ id: 'unscoped', projectId: undefined })
    const scoped = makeItem({ id: 'scoped', projectId: 'project-b' })
    mockService.__seed(unscoped)
    mockService.__seed(scoped)
    await useMediaStore.getState().refresh()

    await useMediaStore.getState().upsert({ ...unscoped, note: 'updated' })
    await useMediaStore.getState().upsert(
      { ...scoped, note: 'updated' },
      { attachActiveProject: true, source: 'generated' },
    )
    expect(useMediaStore.getState().byId('unscoped')?.projectId).toBeUndefined()
    expect(useMediaStore.getState().byId('scoped')?.projectId).toBe('project-b')
  })

  it('switching the active project does not mutate persisted media', async () => {
    const item = makeItem({ id: 'stable', projectId: 'project-a' })
    mockService.__seed(item)
    await useMediaStore.getState().refresh()
    useSettingsStore.setState({ activeProjectId: 'project-b' } as never)
    expect(useMediaStore.getState().byId('stable')?.projectId).toBe('project-a')
    expect(mockService.__all().find((record) => record.id === 'stable')?.projectId).toBe('project-a')
  })

  it('upsertDerivative() persists the child and updates the parent once', async () => {
    const parent = makeItem({ id: 'parent', childrenIds: [] })
    mockService.__seed(parent)
    await useMediaStore.getState().refresh()

    const child = makeItem({ id: 'child', operation: 'regenerate', parentId: 'parent' })
    await useMediaStore.getState().upsertDerivative(child, 'parent')

    expect(useMediaStore.getState().byId('child')).toMatchObject({
      operation: 'regenerate',
      parentId: 'parent',
    })
    expect(useMediaStore.getState().byId('parent')?.childrenIds).toEqual(['child'])

    await useMediaStore.getState().upsertDerivative(child, 'parent')
    expect(useMediaStore.getState().byId('parent')?.childrenIds).toEqual(['child'])
  })

  it('upsertDerivative() removes the child when the parent patch fails', async () => {
    const parent = makeItem({ id: 'parent' })
    mockService.__seed(parent)
    await useMediaStore.getState().refresh()
    vi.mocked(StorageService.patchMedia).mockRejectedValueOnce(new Error('write failed'))

    await expect(
      useMediaStore.getState().upsertDerivative(makeItem({ id: 'child' }), 'parent'),
    ).rejects.toThrow('write failed')
    expect(mockService.__all().some((item) => item.id === 'child')).toBe(false)
    expect(useMediaStore.getState().byId('child')).toBeUndefined()
  })

  it('upsertDerivative() throws if parent is not found', async () => {
    vi.mocked(StorageService.getItem).mockResolvedValueOnce(null)
    await expect(
      useMediaStore.getState().upsertDerivative(makeItem({ id: 'child' }), 'missing'),
    ).rejects.toThrow('Parent media item not found: missing')
  })

  // T-190 regression guard: load and rollback errors must not expose raw
  // exception text (paths, secrets, or upstream diagnostics) in UI state or
  // toast notifications.
  describe('media store safe error handling (T-190)', () => {
    it('refresh() surfaces a safe message and redacts diagnostics on failure', async () => {
      vi.mocked(StorageService.getItemsPageWithMeta).mockRejectedValueOnce(
        new Error('IDB failure: /Users/admin/data and sk-leaked123'),
      )
      await useMediaStore.getState().refresh()

      const lastError = useMediaStore.getState().lastError
      expect(lastError).toBe('Media Studio failed to load. Please try again.')
      expect(lastError).not.toContain('IDB failure')
      expect(lastError).not.toContain('/Users/admin')
      expect(lastError).not.toContain('sk-leaked123')

      expect(toast.error).toHaveBeenCalledWith(
        'Media Studio failed to load. Please try again.',
        expect.any(String),
      )
      const description = vi.mocked(toast.error).mock.calls[0][1] as string
      expect(description).not.toContain('sk-leaked123')
      expect(description).not.toContain('/Users/admin')
    })

    it('loadMore() surfaces a safe message and redacts diagnostics on failure', async () => {
      for (let index = 0; index < 65; index += 1) {
        mockService.__seed(makeItem({ id: `item-${index}`, timestamp: index }))
      }
      await useMediaStore.getState().refresh()
      vi.mocked(StorageService.getItemsPageWithMeta).mockRejectedValueOnce(
        new Error('IDB failure: /Users/admin/data and Bearer token_leak'),
      )

      await useMediaStore.getState().loadMore()

      const lastError = useMediaStore.getState().lastError
      expect(lastError).toBe('Media Studio failed to load more. Please try again.')
      expect(lastError).not.toContain('IDB failure')
      expect(lastError).not.toContain('/Users/admin')
      expect(lastError).not.toContain('Bearer')

      expect(toast.error).toHaveBeenCalledWith(
        'Media Studio failed to load more. Please try again.',
        expect.any(String),
      )
      const description = vi.mocked(toast.error).mock.calls[0][1] as string
      expect(description).not.toContain('token_leak')
      expect(description).not.toContain('/Users/admin')
    })

    it('upsertDerivative() rollback success surfaces a safe lastError and removes the child', async () => {
      const parent = makeItem({ id: 'parent' })
      mockService.__seed(parent)
      await useMediaStore.getState().refresh()
      vi.mocked(StorageService.patchMedia).mockRejectedValueOnce(new Error('parent write failed'))

      await expect(
        useMediaStore.getState().upsertDerivative(makeItem({ id: 'child' }), 'parent'),
      ).rejects.toThrow('parent write failed')

      expect(useMediaStore.getState().lastError).toBe('Derivative save failed. Please try again.')
      expect(useMediaStore.getState().lastError).not.toContain('parent write failed')
      expect(useMediaStore.getState().byId('child')).toBeUndefined()
    })

    it('upsertDerivative() rollback failure surfaces a safe message and redacts diagnostics', async () => {
      const parent = makeItem({ id: 'parent' })
      mockService.__seed(parent)
      await useMediaStore.getState().refresh()
      vi.mocked(StorageService.patchMedia).mockRejectedValueOnce(new Error('parent write failed'))
      vi.mocked(StorageService.deleteMedia).mockRejectedValueOnce(
        new Error('delete failed: /Users/admin and sk-rollback123'),
      )

      await expect(
        useMediaStore.getState().upsertDerivative(makeItem({ id: 'child' }), 'parent'),
      ).rejects.toThrow('parent write failed')

      const lastError = useMediaStore.getState().lastError
      expect(lastError).toBe(
        'Derivative save failed and could not be cleaned up. Please try again.',
      )
      expect(lastError).not.toContain('parent write failed')
      expect(lastError).not.toContain('/Users/admin')
      expect(lastError).not.toContain('sk-rollback123')

      expect(toast.error).toHaveBeenCalledWith(
        'Derivative save failed and could not be cleaned up. Please try again.',
        expect.any(String),
      )
      const description = vi.mocked(toast.error).mock.calls[0][1] as string
      expect(description).not.toContain('sk-rollback123')
      expect(description).not.toContain('/Users/admin')
    })
  })

  // VERIFY-028: Media Studio hydrates incrementally instead of loading the full encrypted store.
  it('refreshes one page and loadMore appends the next timestamp-ordered page', async () => {
    for (let index = 0; index < 65; index += 1) {
      mockService.__seed(makeItem({ id: `item-${index}`, timestamp: index }))
    }

    await useMediaStore.getState().refresh()
    expect(useMediaStore.getState()).toMatchObject({ totalCount: 65, hasMore: true, nextOffset: 60 })
    expect(useMediaStore.getState().items).toHaveLength(60)

    await useMediaStore.getState().loadMore()
    expect(useMediaStore.getState()).toMatchObject({ totalCount: 65, hasMore: false, nextOffset: 65 })
    expect(useMediaStore.getState().items).toHaveLength(65)
    expect(useMediaStore.getState().items[0].id).toBe('item-64')
  })

  it('patch() updates only the targeted record', async () => {
    const a = makeItem({ id: 'a', favorite: false })
    const b = makeItem({ id: 'b', favorite: false })
    mockService.__seed(a)
    mockService.__seed(b)
    await useMediaStore.getState().refresh()

    await useMediaStore.getState().patch('a', { favorite: true, note: 'hello' })
    const items = useMediaStore.getState().items
    const a2 = items.find((i) => i.id === 'a')!
    const b2 = items.find((i) => i.id === 'b')!
    expect(a2.favorite).toBe(true)
    expect(a2.note).toBe('hello')
    expect(b2.favorite).toBe(false)
    expect(b2.note).toBe('')
  })

  it('patch() returns null when the record does not exist', async () => {
    await useMediaStore.getState().refresh()
    const result = await useMediaStore.getState().patch('missing', { favorite: true })
    expect(result).toBeNull()
  })

  it('toggleFavorite flips the flag and persists', async () => {
    const a = makeItem({ id: 'a', favorite: false })
    mockService.__seed(a)
    await useMediaStore.getState().refresh()

    await useMediaStore.getState().toggleFavorite('a')
    expect(useMediaStore.getState().byId('a')?.favorite).toBe(true)
    await useMediaStore.getState().toggleFavorite('a')
    expect(useMediaStore.getState().byId('a')?.favorite).toBe(false)
  })

  it('removeMany() only removes the specified ids', async () => {
    const a = makeItem({ id: 'a' })
    const b = makeItem({ id: 'b' })
    const c = makeItem({ id: 'c' })
    mockService.__seed(a)
    mockService.__seed(b)
    mockService.__seed(c)
    await useMediaStore.getState().refresh()

    const removed = await useMediaStore.getState().removeMany(['a', 'c'])
    expect(removed).toBe(2)
    expect(useMediaStore.getState().items.map((i) => i.id)).toEqual(['b'])
  })

  it('addTagsMany dedupes and normalizes tag casing', async () => {
    const a = makeItem({ id: 'a', tags: ['hero'] })
    const b = makeItem({ id: 'b', tags: [] })
    mockService.__seed(a)
    mockService.__seed(b)
    await useMediaStore.getState().refresh()

    await useMediaStore.getState().addTagsMany(['a', 'b'], [' Hero ', 'CITY', 'hero'])
    const items = useMediaStore.getState().items
    expect(items.find((i) => i.id === 'a')?.tags).toEqual(['hero', 'city'])
    expect(items.find((i) => i.id === 'b')?.tags).toEqual(['hero', 'city'])
  })

  it('addTagsMany is a no-op for empty / invalid tag input', async () => {
    const a = makeItem({ id: 'a', tags: ['x'] })
    mockService.__seed(a)
    await useMediaStore.getState().refresh()
    await useMediaStore.getState().addTagsMany(['a'], ['', '   ', 'a'.repeat(40)])
    expect(useMediaStore.getState().byId('a')?.tags).toEqual(['x'])
  })

  it('removeTagMany removes a single tag across records', async () => {
    const a = makeItem({ id: 'a', tags: ['x', 'y'] })
    const b = makeItem({ id: 'b', tags: ['x', 'z'] })
    mockService.__seed(a)
    mockService.__seed(b)
    await useMediaStore.getState().refresh()

    await useMediaStore.getState().removeTagMany(['a', 'b'], ' X ')
    expect(useMediaStore.getState().byId('a')?.tags).toEqual(['y'])
    expect(useMediaStore.getState().byId('b')?.tags).toEqual(['z'])
  })

  it('childrenOf / parentOf walk lineage', async () => {
    const root = makeItem({ id: 'root' })
    const child = makeItem({ id: 'child', parentId: 'root' })
    mockService.__seed(root)
    mockService.__seed(child)
    await useMediaStore.getState().refresh()

    expect(useMediaStore.getState().childrenOf('root').map((i) => i.id)).toEqual(['child'])
    expect(useMediaStore.getState().parentOf('child')?.id).toEqual('root')
    expect(useMediaStore.getState().parentOf('root')).toBeUndefined()
  })

  it('patchMany() updates multiple records', async () => {
    const a = makeItem({ id: 'a', favorite: false })
    const b = makeItem({ id: 'b', favorite: false })
    mockService.__seed(a)
    mockService.__seed(b)
    await useMediaStore.getState().refresh()

    const count = await useMediaStore.getState().patchMany(['a', 'b'], { favorite: true })
    expect(count).toBe(2)
    const items = useMediaStore.getState().items
    expect(items.find((i) => i.id === 'a')?.favorite).toBe(true)
    expect(items.find((i) => i.id === 'b')?.favorite).toBe(true)
  })

  it('patchMany() does not update state if no records matched', async () => {
    await useMediaStore.getState().refresh()
    const count = await useMediaStore.getState().patchMany(['missing'], { favorite: true })
    expect(count).toBe(0)
  })

  it('setFavoriteMany() updates favorite on multiple records', async () => {
    const a = makeItem({ id: 'a', favorite: false })
    const b = makeItem({ id: 'b', favorite: false })
    mockService.__seed(a)
    mockService.__seed(b)
    await useMediaStore.getState().refresh()

    await useMediaStore.getState().setFavoriteMany(['a', 'b'], true)
    const items = useMediaStore.getState().items
    expect(items.find((i) => i.id === 'a')?.favorite).toBe(true)
    expect(items.find((i) => i.id === 'b')?.favorite).toBe(true)
  })

  it('remove() removes a single record', async () => {
    const a = makeItem({ id: 'a' })
    const b = makeItem({ id: 'b' })
    mockService.__seed(a)
    mockService.__seed(b)
    await useMediaStore.getState().refresh()

    const ok = await useMediaStore.getState().remove('a')
    expect(ok).toBe(true)
    expect(useMediaStore.getState().items.map((i) => i.id)).toEqual(['b'])
    expect(useMediaStore.getState().totalCount).toBe(1)
  })

  it('remove() does not update state if delete fails', async () => {
    const a = makeItem({ id: 'a' })
    mockService.__seed(a)
    await useMediaStore.getState().refresh()
    vi.mocked(StorageService.deleteMedia).mockResolvedValueOnce(false)
    
    const ok = await useMediaStore.getState().remove('a')
    expect(ok).toBe(false)
    expect(useMediaStore.getState().items.map((i) => i.id)).toEqual(['a'])
  })

  it('removeMany() does not update state if no records removed', async () => {
    await useMediaStore.getState().refresh()
    const count = await useMediaStore.getState().removeMany(['missing'])
    expect(count).toBe(0)
  })

  it('addTagsMany surfaces error on partial failure', async () => {
    const a = makeItem({ id: 'a', tags: [] })
    mockService.__seed(a)
    await useMediaStore.getState().refresh()
    vi.mocked(StorageService.patchMedia).mockRejectedValueOnce(new Error('write failed'))
    
    await useMediaStore.getState().addTagsMany(['a'], ['tag'])
    
    expect(useMediaStore.getState().lastError).toContain('addTagsMany failed for a')
    expect(toast.error).toHaveBeenCalledWith('Tag update partially failed', expect.any(String))
  })

  it('removeTagMany surfaces error on partial failure', async () => {
    const a = makeItem({ id: 'a', tags: ['tag'] })
    mockService.__seed(a)
    await useMediaStore.getState().refresh()
    vi.mocked(StorageService.patchMedia).mockRejectedValueOnce(new Error('write failed'))
    
    await useMediaStore.getState().removeTagMany(['a'], 'tag')
    
    expect(useMediaStore.getState().lastError).toContain('removeTagMany failed for a')
    expect(toast.error).toHaveBeenCalledWith('Tag removal partially failed', expect.any(String))
  })
})

describe('media filter / sort / search', () => {
  const items: MediaItem[] = [
    makeItem({ id: '1', mediaType: 'image', operation: 'generate', favorite: true, tags: ['hero'], note: 'a copper city' }),
    makeItem({ id: '2', mediaType: 'video', operation: 'video-generate', favorite: false, tags: [], note: '' }),
    makeItem({ id: '3', mediaType: 'image', operation: 'upscale', favorite: false, tags: ['landscape'] }),
    makeItem({ id: '4', mediaType: 'image', operation: 'edit', favorite: true, tags: ['hero', 'portrait'] }),
  ]

  it('filter by all', () => {
    expect(filterMedia(items, 'all')).toEqual(items)
  })

  it('filter by favorites', () => {
    expect(filterMedia(items, 'favorites').map((i) => i.id)).toEqual(['1', '4'])
  })

  it('filter fallback to default', () => {
    expect(filterMedia(items, 'unknown' as any)).toEqual(items)
  })

  it('filter by media type', () => {
    expect(filterMedia(items, 'image').map((i) => i.id)).toEqual(['1', '3', '4'])
    expect(filterMedia(items, 'video').map((i) => i.id)).toEqual(['2'])
  })

  it('filter by operation buckets', () => {
    expect(filterMedia(items, 'upscaled').map((i) => i.id)).toEqual(['3'])
    expect(filterMedia(items, 'edited').map((i) => i.id)).toEqual(['4'])
  })

  it('filter by has-recipe / no-recipe / has-seed (Phase 2A)', () => {
    const withRecipe: MediaItem = makeItem({ id: 'r1', recipe: { prompt: 'x', model: 'flux-dev' } })
    const withSeed: MediaItem = makeItem({ id: 's1', seed: 42 })
    const plain: MediaItem = makeItem({ id: 'p1' })
    const set = [withRecipe, withSeed, plain]
    expect(filterMedia(set, 'has-recipe').map((i) => i.id)).toEqual(['r1'])
    expect(filterMedia(set, 'no-recipe').map((i) => i.id)).toEqual(['s1', 'p1'])
    expect(filterMedia(set, 'has-seed').map((i) => i.id)).toEqual(['s1'])
  })

  it('filter by no-seed / no-project (Phase 2B)', () => {
    const a: MediaItem = makeItem({ id: 'a', seed: 42, projectId: 'p1' })
    const b: MediaItem = makeItem({ id: 'b', seed: undefined, projectId: 'p1' })
    const c: MediaItem = makeItem({ id: 'c', seed: 99, projectId: undefined })
    expect(filterMedia([a, b, c], 'no-seed').map((i) => i.id)).toEqual(['b'])
    expect(filterMedia([a, b, c], 'no-project').map((i) => i.id)).toEqual(['c'])
  })

  it('applyDynamicFilter: projectId / model / tag / operation', async () => {
    const { applyDynamicFilter } = await import('./media-store')
    const a: MediaItem = makeItem({ id: 'a', model: 'flux-dev', projectId: 'p1', operation: 'generate', tags: ['hero'] })
    const b: MediaItem = makeItem({ id: 'b', model: 'nano-banana-v1', projectId: 'p2', operation: 'edit', tags: ['landscape'] })
    const c: MediaItem = makeItem({ id: 'c', model: 'flux-dev', projectId: 'p1', operation: 'upscale', tags: ['hero', 'portrait'] })
    const set = [a, b, c]
    expect(applyDynamicFilter(set, { projectId: 'p1' }).map((i) => i.id)).toEqual(['a', 'c'])
    expect(applyDynamicFilter(set, { model: 'flux-dev' }).map((i) => i.id)).toEqual(['a', 'c'])
    expect(applyDynamicFilter(set, { tag: 'hero' }).map((i) => i.id)).toEqual(['a', 'c'])
    expect(applyDynamicFilter(set, { operation: 'edit' }).map((i) => i.id)).toEqual(['b'])
    expect(applyDynamicFilter(set, null)).toEqual(set)
  })

  it('sort by project / has-recipe / has-seed is stable and deterministic', () => {
    const a: MediaItem = makeItem({ id: 'a', projectId: 'p1', recipe: { prompt: 'x', model: 'flux-dev' }, seed: 1, timestamp: 3 })
    const b: MediaItem = makeItem({ id: 'b', projectId: 'p2', seed: 2, timestamp: 1 })
    const c: MediaItem = makeItem({ id: 'c', projectId: 'p1', seed: undefined, timestamp: 2 })
    const set = [a, b, c]
    expect(sortMedia(set, 'project').map((i) => i.id)).toEqual(['a', 'c', 'b']) // p1 first (a ts3 before c ts2), then p2
    expect(sortMedia(set, 'has-recipe').map((i) => i.id)).toEqual(['a', 'c', 'b']) // a (recipe) first, then c ts2, then b ts1
    expect(sortMedia(set, 'has-seed').map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('sort by oldest', () => {
    const a: MediaItem = makeItem({ id: 'a', timestamp: 10 })
    const b: MediaItem = makeItem({ id: 'b', timestamp: 5 })
    const c: MediaItem = makeItem({ id: 'c', timestamp: 15 })
    const out = sortMedia([a, b, c], 'oldest')
    expect(out.map((i) => i.id)).toEqual(['b', 'a', 'c'])
  })

  it('sort by newest', () => {
    const a: MediaItem = makeItem({ id: 'a', timestamp: 10 })
    const b: MediaItem = makeItem({ id: 'b', timestamp: 5 })
    const c: MediaItem = makeItem({ id: 'c', timestamp: 15 })
    const out = sortMedia([a, b, c], 'newest')
    expect(out.map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('sort by model name', () => {
    const out = sortMedia(items, 'model')
    expect(out.map((i) => i.id)).toEqual(['1', '2', '3', '4'])
  })

  it('sort by decoded media byte size', () => {
    const a: MediaItem = makeItem({ id: 'a', mediaType: 'image', image: 'data:image/png;base64,AA==' }) // 1 byte
    const b: MediaItem = makeItem({ id: 'b', mediaType: 'video', image: 'data:video/mp4;base64,AAAA' }) // 3 bytes
    const c: MediaItem = makeItem({ id: 'c', mediaType: 'image', image: 'AAA=' }) // 2 bytes
    const set = [a, b, c]
    // desc order: b (3), c (2), a (1)
    expect(sortMedia(set, 'size').map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('sort fallback to default', () => {
    const a: MediaItem = makeItem({ id: 'a', timestamp: 1 })
    const b: MediaItem = makeItem({ id: 'b', timestamp: 2 })
    const set = [a, b]
    expect(sortMedia(set, 'unknown' as any).map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('search matches across prompt, model, note, tags', () => {
    expect(searchMedia(items, 'copper').map((i) => i.id).length).toBe(4)
    expect(searchMedia(items, 'portrait').map((i) => i.id)).toEqual(['4'])
    expect(searchMedia(items, 'hero').map((i) => i.id).sort()).toEqual(['1', '4'])
    expect(searchMedia(items, 'landscape').map((i) => i.id)).toEqual(['3'])
  })

  it('search with empty query returns all items unchanged', () => {
    expect(searchMedia(items, '   ')).toEqual(items)
  })
})

// BUG-008 regression guard: the gallery inspector must be able to
// resolve the parent/children of an inspected record even when those
// records are not in the currently loaded page. The store exposes
// `loadById(id)` which fetches a single record from IDB, migrates it
// to the canonical MediaItem shape, and merges it into the in-memory
// cache. Without this, a user who has scrolled past page 1 cannot see
// lineage information for a record whose parent/children live on
// page 1.
describe('media store — BUG-008 loadById', () => {
  beforeEach(() => {
    mockService.__reset()
    useMediaStore.setState({
      items: [],
      loading: false,
      loadingMore: false,
      loaded: false,
      totalCount: 0,
      hasMore: false,
      nextOffset: 0,
      lastError: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for an unknown id', async () => {
    const result = await useMediaStore.getState().loadById('does-not-exist')
    expect(result).toBeNull()
  })

  it('returns the cached record without an IDB fetch when already loaded', async () => {
    const cached = makeItem({ id: 'cached-1' })
    useMediaStore.setState({ items: [cached] })
    const getItemSpy = vi.mocked(StorageService.getItem)
    getItemSpy.mockClear()
    const result = await useMediaStore.getState().loadById('cached-1')
    expect(result?.id).toBe('cached-1')
    expect(getItemSpy).not.toHaveBeenCalled()
  })

  it('fetches from IDB and merges the record into the in-memory cache when missing', async () => {
    const remote = makeItem({ id: 'remote-1', parentId: null })
    mockService.__seed(remote)
    // Simulate "not in the loaded page" by leaving the in-memory items empty.
    const result = await useMediaStore.getState().loadById('remote-1')
    expect(result?.id).toBe('remote-1')
    // The in-memory cache now contains the fetched record, so the next
    // selector call hits the cache instead of the IDB.
    const cached = useMediaStore.getState().byId('remote-1')
    expect(cached?.id).toBe('remote-1')
  })

  it('exposes the parent of an inspected record when the parent lives on a different page', async () => {
    const parent = makeItem({ id: 'p', mediaType: 'image', operation: 'generate', parentId: null })
    const child = makeItem({ id: 'c', mediaType: 'image', operation: 'upscale', parentId: 'p' })
    mockService.__seed(parent)
    mockService.__seed(child)
    // Pre-load only the child (e.g. the user scrolled to a newer page
    // and the older parent is no longer in `items`).
    useMediaStore.setState({ items: [child] })
    const resolved = await useMediaStore.getState().loadById('p')
    expect(resolved?.id).toBe('p')
    // After the fetch, the in-memory cache contains both records so
    // `parentOf` works.
    const parentOfChild = useMediaStore.getState().parentOf('c')
    expect(parentOfChild?.id).toBe('p')
  })

  it('returns null if storage throws', async () => {
    vi.mocked(StorageService.getItem).mockRejectedValueOnce(new Error('fail'))
    const result = await useMediaStore.getState().loadById('error-id')
    expect(result).toBeNull()
  })

  it('avoids duplicate insertion if state changed during fetch', async () => {
    const remote = makeItem({ id: 'race', parentId: null })
    mockService.__seed(remote)
    
    // Intercept getItem to mutate state before it resolves
    vi.mocked(StorageService.getItem).mockImplementationOnce(async () => {
      // simulate the cache being populated while we are fetching
      useMediaStore.setState({ items: [remote] })
      return remote as unknown
    })
    
    const result = await useMediaStore.getState().loadById('race')
    expect(result?.id).toBe('race')
    expect(useMediaStore.getState().items).toHaveLength(1)
  })
})

describe('media store in-memory cache bound', () => {
  it('caps refresh() results at MEDIA_IN_MEMORY_CACHE_MAX, keeping the most recent', async () => {
    const overage = 10
    const seeded: MediaItem[] = []
    for (let i = 0; i < MEDIA_IN_MEMORY_CACHE_MAX + overage; i++) {
      const item = makeItem({ id: `seed-${i}`, timestamp: 1000 + i })
      seeded.push(item)
      mockService.__seed(item)
    }
    // Force a single oversized page so the cache bound is exercised.
    vi.mocked(StorageService.getItemsPageWithMeta).mockResolvedValueOnce({
      items: seeded as unknown[],
      decryptFailures: 0,
      total: seeded.length,
      offset: 0,
      limit: seeded.length,
      hasMore: false,
    })
    await useMediaStore.getState().refresh()
    expect(useMediaStore.getState().items).toHaveLength(MEDIA_IN_MEMORY_CACHE_MAX)
    // Most recent timestamp should win.
    expect(useMediaStore.getState().items[0].timestamp).toBe(1000 + MEDIA_IN_MEMORY_CACHE_MAX + overage - 1)
  })

  it('caps loadMore() results at MEDIA_IN_MEMORY_CACHE_MAX', async () => {
    const total = MEDIA_IN_MEMORY_CACHE_MAX + 50
    for (let i = 0; i < total; i++) {
      mockService.__seed(makeItem({ id: `page-${i}`, timestamp: 2000 + i }))
    }
    await useMediaStore.getState().refresh()
    // Refresh loaded the first page (60 by default), so loadMore keeps going.
    await useMediaStore.getState().loadMore()
    await useMediaStore.getState().loadMore()
    await useMediaStore.getState().loadMore()
    await useMediaStore.getState().loadMore()
    await useMediaStore.getState().loadMore()
    expect(useMediaStore.getState().items.length).toBeLessThanOrEqual(MEDIA_IN_MEMORY_CACHE_MAX)
  })

  it('caps upsert() results at MEDIA_IN_MEMORY_CACHE_MAX', async () => {
    for (let i = 0; i < MEDIA_IN_MEMORY_CACHE_MAX + 5; i++) {
      await useMediaStore.getState().upsert(makeItem({ id: `upsert-${i}`, timestamp: 3000 + i }))
    }
    expect(useMediaStore.getState().items).toHaveLength(MEDIA_IN_MEMORY_CACHE_MAX)
  })

  it('caps loadById() results at MEDIA_IN_MEMORY_CACHE_MAX', async () => {
    useMediaStore.setState({
      items: Array.from({ length: MEDIA_IN_MEMORY_CACHE_MAX }, (_, i) =>
        makeItem({ id: `loaded-${i}`, timestamp: 4000 + i }),
      ),
    })
    mockService.__seed(makeItem({ id: 'fetched', timestamp: 9999 }))
    await useMediaStore.getState().loadById('fetched')
    expect(useMediaStore.getState().items).toHaveLength(MEDIA_IN_MEMORY_CACHE_MAX)
    expect(useMediaStore.getState().byId('fetched')).toBeTruthy()
  })
})

describe('media store pure selectors', () => {
  const items = [
    makeItem({ id: 'root', parentId: null }),
    makeItem({ id: 'child', parentId: 'root' })
  ]
  const state = { items } as any

  it('selectById', () => {
    expect(selectById(state, 'root')?.id).toBe('root')
    expect(selectById(state, 'missing')).toBeUndefined()
  })

  it('selectChildren', () => {
    expect(selectChildren(state, 'root').map((i) => i.id)).toEqual(['child'])
    expect(selectChildren(state, 'missing')).toEqual([])
  })

  it('selectParent', () => {
    expect(selectParent(state, 'child')?.id).toBe('root')
    expect(selectParent(state, 'root')).toBeUndefined()
    expect(selectParent(state, 'missing')).toBeUndefined()
  })
})
