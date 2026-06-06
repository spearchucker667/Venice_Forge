import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/storageService', () => ({
  default: {
    getItemsPageWithMeta: vi.fn(),
    deleteItem: vi.fn(),
    deleteMedia: vi.fn(),
    deleteMediaMany: vi.fn(),
    patchMedia: vi.fn(),
    bulkPatchMedia: vi.fn(),
    putMedia: vi.fn(),
  },
}))

import StorageService from '../../services/storageService'
import { useMediaStore } from '../../stores/media-store'
import { GalleryView } from './gallery-view'

const sampleRecord = {
  id: 'image-1',
  image: 'data:image/png;base64,abc',
  prompt: 'Copper city at dusk',
  model: 'flux-dev',
  timestamp: 1,
  mediaType: 'image',
}

describe('MediaStudioView (GalleryView)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMediaStore.setState({
      items: [], loading: false, loadingMore: false, loaded: false,
      totalCount: 0, hasMore: false, nextOffset: 0, lastError: null,
    })
    vi.mocked(StorageService.getItemsPageWithMeta).mockResolvedValue({
      items: [sampleRecord], decryptFailures: 0, total: 1, offset: 0, limit: 60, hasMore: false,
    })
    vi.mocked(StorageService.deleteMedia).mockResolvedValue(true)
    vi.mocked(StorageService.deleteMediaMany).mockResolvedValue(1)
    vi.mocked(StorageService.patchMedia).mockImplementation(async (id, patch) => ({
      ...sampleRecord,
      ...patch,
      id,
    }))
    vi.mocked(StorageService.bulkPatchMedia).mockResolvedValue(1)
    vi.mocked(StorageService.putMedia).mockImplementation(async (item) => ({ ...(item as object), id: (item as { id: string }).id, timestamp: 1 }))
  })

  it('loads generated images from the images store', async () => {
    render(<GalleryView />)
    expect(await screen.findByText('Copper city at dusk')).toBeInTheDocument()
    expect(StorageService.getItemsPageWithMeta).toHaveBeenCalledWith('images', { offset: 0, limit: 60 })
  })

  it('deletes an image via deleteMedia and removes it from the visible library', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(StorageService.deleteMedia).toHaveBeenCalledWith('image-1'))
    await waitFor(() => expect(screen.queryByText('Copper city at dusk')).not.toBeInTheDocument())
    confirmSpy.mockRestore()
  })

  it('does NOT expose window.__veniceMediaDev when DEV mode is off (production)', async () => {
    // Simulate a production build by removing the DEV flag from
    // import.meta.env. The component's useEffect must short-circuit
    // and never attach the global.
    const w = window as unknown as { __veniceMediaDev?: { upsert: () => void } }
    delete w.__veniceMediaDev

    // Save and overwrite import.meta.env so the DEV guard treats us
    // as production. Vitest's esbuild target keeps `import.meta.env`
    // as an object literal; we mutate the field directly.
    const meta = import.meta as unknown as { env: Record<string, unknown> }
    const original = { ...meta.env }
    meta.env.DEV = false
    meta.env.MODE = 'production'
    try {
      render(<GalleryView />)
      await screen.findByText('Copper city at dusk')
      // Yield to the useEffect microtask.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(w.__veniceMediaDev).toBeUndefined()
    } finally {
      meta.env.DEV = original.DEV
      meta.env.MODE = original.MODE
    }
  })

  // VERIFY-035 regression guard: dangling parent/child references must
  // surface a one-click "Missing references" recovery section in the
  // inspector, NOT silently hide the parent block. After confirming
  // the section, the "Clear parent link" / "Clear missing refs" buttons
  // call `patchMedia` with the right partial update.
  it('surfaces a "Missing references" recovery section when the parent record is absent (VERIFY-035)', async () => {
    const record = {
      ...sampleRecord,
      id: 'image-orphan-1',
      parentId: 'parent-does-not-exist',
      childrenIds: ['child-does-not-exist-1', 'child-does-not-exist-2'],
      mediaType: 'image' as const,
      operation: 'generate' as const,
      tags: [],
      note: '',
      favorite: false,
    }
    // Make `patchMedia` return a complete MediaItem (the production
    // service merges the patch over the existing record). The default
    // mock spreads `sampleRecord`, which has no `tags` / `childrenIds`
    // and would crash `<MediaCardImpl>` on the next render.
    vi.mocked(StorageService.patchMedia).mockImplementation(async (id, patch) => {
      const existing = useMediaStore.getState().items.find((item) => item.id === id)
      return {
        ...(existing as object),
        ...(patch as object),
        id,
      }
    })
    vi.mocked(StorageService.getItemsPageWithMeta).mockResolvedValue({
      items: [record],
      decryptFailures: 0,
      total: 1,
      offset: 0,
      limit: 60,
      hasMore: false,
    })
    // loadById returns null for every id — both the missing parent
    // and the two missing children are truly absent from IDB.
    vi.mocked(StorageService).getItem = vi.fn().mockResolvedValue(null)

    useMediaStore.setState({ items: [record] })
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')

    // Open the inspector by double-clicking the card (the gallery
    // mounts the side inspector on `onDoubleClick` of the card).
    fireEvent.doubleClick(screen.getByRole('button', { name: /open image: copper city at dusk/i }))
    const missingSection = await screen.findByRole('region', { name: 'Missing references' })
    expect(missingSection).toBeInTheDocument()
    // The "Clear parent link" button calls patchMedia with parentId: null.
    const clearParent = screen.getByRole('button', { name: 'Clear parent link' })
    fireEvent.click(clearParent)
    await waitFor(() =>
      expect(StorageService.patchMedia).toHaveBeenCalledWith('image-orphan-1', { parentId: null }),
    )
    // The "Clear N missing refs" button is also present (2 missing children).
    const clearChildren = await screen.findByRole('button', { name: 'Clear 2 missing refs' })
    fireEvent.click(clearChildren)
    await waitFor(() =>
      expect(StorageService.patchMedia).toHaveBeenCalledWith('image-orphan-1', { childrenIds: [] }),
    )
  })
})
