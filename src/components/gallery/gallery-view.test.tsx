// VERIFY-023 regression guard
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

// Mock the React Query–backed models hook so GalleryView can render the
// MediaInspector (and indirectly call `useModels`) without a
// QueryClientProvider. Returning no data makes `liveVisionSupports` resolve
// to `null` and the static `VISION_CAPABLE_MODEL_IDS` /
// `VISION_CAPABLE_PATTERNS` fallback path runs — the same behaviour these
// tests were originally written to cover.
vi.mock('../../hooks/use-models', () => ({
  useModels: () => ({ data: undefined }),
}))

import StorageService from '../../services/storageService'
import { useMediaStore } from '../../stores/media-store'
import { useMediaSelectionStore } from '../../stores/media-selection-store'
import { GalleryView } from './gallery-view'
import { useImageWorkspaceStore } from '../../stores/image-workspace-store'
import { useSettingsStore } from '../../stores/settings-store'
import { askDecision } from '../ui/modal-requests'

vi.mock('../ui/modal-requests', () => ({
  askDecision: vi.fn(),
  askText: vi.fn(),
}))

const sampleRecord = {
  id: 'image-1',
  image: 'data:image/png;base64,abc',
  prompt: 'Copper city at dusk',
  model: 'flux-dev',
  quality: 'high',
  timestamp: 1,
  mediaType: 'image',
}

describe('MediaStudioView (GalleryView)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useImageWorkspaceStore.getState().reset()
    useSettingsStore.setState({ activeProjectId: null, activeTab: 'media' } as never)
    useMediaStore.setState({
      items: [], loading: false, loadingMore: false, loaded: false,
      totalCount: 0, hasMore: false, nextOffset: 0, lastError: null,
    })
    useMediaSelectionStore.getState().clearSelection()
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

  // VERIFY-042: All Projects includes scoped and legacy media; project views are exact-match only.
  it('filters media by active project without mutating scoped or unscoped records', async () => {
    const records = [
      { ...sampleRecord, id: 'image-a', prompt: 'Project A image', projectId: 'project-a' },
      { ...sampleRecord, id: 'image-b', prompt: 'Project B image', projectId: 'project-b' },
      { ...sampleRecord, id: 'image-unscoped', prompt: 'Legacy unscoped image' },
    ]
    vi.mocked(StorageService.getItemsPageWithMeta).mockResolvedValue({
      items: records, decryptFailures: 0, total: 3, offset: 0, limit: 60, hasMore: false,
    })
    render(<GalleryView />)

    expect(await screen.findByText('Project A image')).toBeInTheDocument()
    expect(screen.getByText('Project B image')).toBeInTheDocument()
    expect(screen.getByText('Legacy unscoped image')).toBeInTheDocument()

    act(() => useSettingsStore.getState().setActiveProjectId('project-a'))
    expect(screen.getByText('Project A image')).toBeInTheDocument()
    expect(screen.queryByText('Project B image')).not.toBeInTheDocument()
    expect(screen.queryByText('Legacy unscoped image')).not.toBeInTheDocument()

    act(() => useSettingsStore.getState().setActiveProjectId('project-b'))
    expect(screen.queryByText('Project A image')).not.toBeInTheDocument()
    expect(screen.getByText('Project B image')).toBeInTheDocument()

    act(() => useSettingsStore.getState().setActiveProjectId(null))
    expect(screen.getByText('Legacy unscoped image')).toBeInTheDocument()
    expect(useMediaStore.getState().items.map(({ id, projectId }) => ({ id, projectId })))
      .toEqual(expect.arrayContaining([
        { id: 'image-a', projectId: 'project-a' },
        { id: 'image-b', projectId: 'project-b' },
        { id: 'image-unscoped', projectId: undefined },
      ]))
  })

  it('deletes an image via deleteMedia and removes it from the visible library', async () => {
    vi.mocked(askDecision).mockResolvedValueOnce(true)
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(StorageService.deleteMedia).toHaveBeenCalledWith('image-1'))
    await waitFor(() => expect(screen.queryByText('Copper city at dusk')).not.toBeInTheDocument())
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

  it('queues a production-safe regenerate handoff with source lineage', async () => {
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')
    fireEvent.doubleClick(screen.getByRole('button', { name: /open image: copper city at dusk/i }))
    fireEvent.click(await screen.findByTestId('inspector-regenerate'))

    expect(useImageWorkspaceStore.getState().pending).toMatchObject({
      target: 'generate',
      autoGenerate: true,
      parentId: 'image-1',
      operation: 'regenerate',
      draft: { prompt: 'Copper city at dusk', seed: null },
    })
  })

  it('queues Use settings without auto-generation or lineage', async () => {
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')
    fireEvent.doubleClick(screen.getByRole('button', { name: /open image: copper city at dusk/i }))
    fireEvent.click(await screen.findByTestId('inspector-use-settings'))

    expect(useImageWorkspaceStore.getState().pending).toMatchObject({
      target: 'generate',
      autoGenerate: false,
      parentId: null,
      operation: 'generate',
      draft: { prompt: 'Copper city at dusk', quality: 'high' },
    })
  })

  it('sanitizes recipe dimensions before handoff and does not mutate the source item', async () => {
    const record = {
      ...sampleRecord,
      model: 'nano-banana-v1',
      width: 1024,
      height: 768,
      aspectRatio: 'unsupported',
      recipe: {
        prompt: sampleRecord.prompt,
        model: 'nano-banana-v1',
        width: 1024,
        height: 768,
        aspectRatio: 'unsupported',
        variants: 2,
      },
    }
    vi.mocked(StorageService.getItemsPageWithMeta).mockResolvedValue({
      items: [record], decryptFailures: 0, total: 1, offset: 0, limit: 60, hasMore: false,
    })
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')
    const sourceBefore = structuredClone(useMediaStore.getState().items[0])
    fireEvent.doubleClick(screen.getByRole('button', { name: /open image: copper city at dusk/i }))
    fireEvent.click(await screen.findByTestId('inspector-use-recipe'))

    expect(useImageWorkspaceStore.getState().pending).toMatchObject({
      target: 'generate',
      autoGenerate: false,
      draft: { aspectRatio: '1:1', resolution: '1k', imageCount: 2 },
    })
    expect(useImageWorkspaceStore.getState().pending).not.toHaveProperty('draft.width')
    expect(useImageWorkspaceStore.getState().pending).not.toHaveProperty('draft.height')
    expect(useSettingsStore.getState().activeTab).toBe('image')
    expect(useMediaStore.getState().items[0]).toEqual(sourceBefore)
  })

  it('hides same-seed regeneration without a seed and copies canonical recipe JSON', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')
    fireEvent.doubleClick(screen.getByRole('button', { name: /open image: copper city at dusk/i }))
    expect(screen.queryByTestId('inspector-regenerate-same-seed')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByTestId('inspector-copy-recipe'))
    expect(writeText).toHaveBeenCalledOnce()
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(expect.objectContaining({
      sourceMediaId: 'image-1', prompt: 'Copper city at dusk', model: 'flux-dev', seed: null,
    }))
  })

  it('preserves an explicit seed for same-seed regeneration', async () => {
    vi.mocked(StorageService.getItemsPageWithMeta).mockResolvedValue({
      items: [{ ...sampleRecord, seed: -42 }],
      decryptFailures: 0, total: 1, offset: 0, limit: 60, hasMore: false,
    })
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')
    fireEvent.doubleClick(screen.getByRole('button', { name: /open image: copper city at dusk/i }))
    fireEvent.click(await screen.findByTestId('inspector-regenerate-same-seed'))

    expect(useImageWorkspaceStore.getState().pending).toMatchObject({
      target: 'generate',
      autoGenerate: true,
      parentId: 'image-1',
      operation: 'regenerate',
      draft: { seed: -42 },
    })
  })

  it('queues the selected media item for image-tools upscale', async () => {
    vi.mocked(StorageService.getItemsPageWithMeta).mockResolvedValue({
      items: [{ ...sampleRecord, model: 'esrgan-upscaler' }],
      decryptFailures: 0, total: 1, offset: 0, limit: 60, hasMore: false,
    })
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')
    fireEvent.doubleClick(screen.getByRole('button', { name: /open image: copper city at dusk/i }))
    const upscale = await screen.findByTestId('inspector-upscale')
    fireEvent.click(upscale)

    expect(useImageWorkspaceStore.getState().pending).toMatchObject({
      target: 'tools',
      tool: 'upscale',
      parentId: 'image-1',
      image: 'data:image/png;base64,abc',
    })
  })

  it('queues the selected media item for image-tools edit', async () => {
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')
    fireEvent.doubleClick(screen.getByRole('button', { name: /open image: copper city at dusk/i }))
    fireEvent.click(await screen.findByTestId('inspector-edit'))

    expect(useImageWorkspaceStore.getState().pending).toMatchObject({
      target: 'tools',
      tool: 'edit',
      parentId: 'image-1',
      image: 'data:image/png;base64,abc',
      prompt: 'Copper city at dusk',
    })
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

  it('exports a reusable recipe as a JSON download (AUDIT-IMG-001 regression)', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:recipe')
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = createObjectURL
    const clickSpy = vi.fn()
    const originalCreateElement = Document.prototype.createElement
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreateElement.call(document, tag)
      if (tag.toLowerCase() === 'a') el.click = clickSpy
      return el
    })

    const record = {
      ...sampleRecord,
      recipe: {
        prompt: sampleRecord.prompt,
        model: sampleRecord.model,
      },
    }
    vi.mocked(StorageService.getItemsPageWithMeta).mockResolvedValue({
      items: [record], decryptFailures: 0, total: 1, offset: 0, limit: 60, hasMore: false,
    })
    try {
      render(<GalleryView />)
      await screen.findByText('Copper city at dusk')
      fireEvent.doubleClick(screen.getByRole('button', { name: /open image: copper city at dusk/i }))
      fireEvent.click(await screen.findByTestId('inspector-export-recipe'))

      await waitFor(() => {
        expect(createObjectURL).toHaveBeenCalled()
        expect(clickSpy).toHaveBeenCalled()
      })
      const blob = createObjectURL.mock.calls[0][0] as Blob
      expect(blob.type).toBe('application/json')
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      vi.restoreAllMocks()
    }
  })

  it('exports the latest selected media after the media store changes without changing selection', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:bundle')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clickSpy = vi.fn()
    const originalCreateElement = Document.prototype.createElement
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreateElement.call(document, tag)
      if (tag.toLowerCase() === 'a') el.click = clickSpy
      return el
    })

    try {
      render(<GalleryView />)
      await screen.findByText('Copper city at dusk')
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      fireEvent.click(screen.getByTestId('bulk-select-all'))

      await waitFor(() => expect(screen.getByTestId('bulk-export')).toBeEnabled())
      act(() => {
        useMediaStore.setState({
          items: [{ ...useMediaStore.getState().items[0], prompt: 'Updated copper city' }],
        })
      })
      expect(await screen.findByText('Updated copper city')).toBeInTheDocument()

      fireEvent.click(screen.getByTestId('bulk-export'))

      await waitFor(() => expect(createObjectURL).toHaveBeenCalled())
      const blob = createObjectURL.mock.calls[0][0] as Blob
      const exported = JSON.parse(await blob.text())
      expect(exported.items[0].prompt).toBe('Updated copper city')
      expect(clickSpy).toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    }
  })
})
