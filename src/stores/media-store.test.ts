import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMediaStore, filterMedia, sortMedia, searchMedia } from './media-store'
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
      patchMedia: vi.fn(async (id: string, patch: Partial<MediaItem>) => {
        const existing = store.get(id)
        if (!existing) throw new Error('not found')
        const next = { ...existing, ...patch, id, timestamp: existing.timestamp }
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
})

describe('media filter / sort / search', () => {
  const items: MediaItem[] = [
    makeItem({ id: '1', mediaType: 'image', operation: 'generate', favorite: true, tags: ['hero'], note: 'a copper city' }),
    makeItem({ id: '2', mediaType: 'video', operation: 'video-generate', favorite: false, tags: [], note: '' }),
    makeItem({ id: '3', mediaType: 'image', operation: 'upscale', favorite: false, tags: ['landscape'] }),
    makeItem({ id: '4', mediaType: 'image', operation: 'edit', favorite: true, tags: ['hero', 'portrait'] }),
  ]

  it('filter by favorites', () => {
    expect(filterMedia(items, 'favorites').map((i) => i.id)).toEqual(['1', '4'])
  })

  it('filter by media type', () => {
    expect(filterMedia(items, 'image').map((i) => i.id)).toEqual(['1', '3', '4'])
    expect(filterMedia(items, 'video').map((i) => i.id)).toEqual(['2'])
  })

  it('filter by operation buckets', () => {
    expect(filterMedia(items, 'upscaled').map((i) => i.id)).toEqual(['3'])
    expect(filterMedia(items, 'edited').map((i) => i.id)).toEqual(['4'])
  })

  it('sort by model name', () => {
    const out = sortMedia(items, 'model')
    expect(out.map((i) => i.id)).toEqual(['1', '2', '3', '4'])
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
})
