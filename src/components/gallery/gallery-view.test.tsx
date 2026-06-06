import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/storageService', () => ({
  default: {
    getItems: vi.fn(),
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
    useMediaStore.setState({ items: [], loading: false, loaded: false, lastError: null })
    vi.mocked(StorageService.getItems).mockResolvedValue([sampleRecord])
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
    expect(StorageService.getItems).toHaveBeenCalledWith('images')
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
})
