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
})
