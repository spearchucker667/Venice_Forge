import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/storageService', () => ({
  default: {
    getItems: vi.fn(),
    deleteItem: vi.fn(),
  },
}))
vi.mock('../../utils/download', () => ({ downloadImage: vi.fn() }))

import StorageService from '../../services/storageService'
import { GalleryView } from './gallery-view'

describe('GalleryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(StorageService.getItems).mockResolvedValue([{
      id: 'image-1',
      image: 'data:image/png;base64,abc',
      prompt: 'Copper city at dusk',
      model: 'flux-dev',
      timestamp: 1,
    }])
    vi.mocked(StorageService.deleteItem).mockResolvedValue(true)
  })

  it('loads generated images from the images store', async () => {
    render(<GalleryView />)

    expect(await screen.findByAltText('Copper city at dusk')).toBeInTheDocument()
    expect(StorageService.getItems).toHaveBeenCalledWith('images')
  })

  it('deletes an image from storage and the visible library', async () => {
    render(<GalleryView />)
    await screen.findByText('Copper city at dusk')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(StorageService.deleteItem).toHaveBeenCalledWith('images', 'image-1'))
    expect(screen.queryByText('Copper city at dusk')).not.toBeInTheDocument()
  })
})
