import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queueMock = vi.fn()
const resetMock = vi.fn()
const cancelMock = vi.fn()

vi.mock('../../hooks/use-video', () => ({
  useVideo: () => ({
    queue: queueMock,
    isQueueing: false,
    status: 'idle',
    videoUrl: null,
    error: null,
    reset: resetMock,
    cancel: cancelMock,
    elapsedMs: 0,
    queueId: null,
    lastRequest: null,
  }),
}))

vi.mock('../../hooks/use-models', () => ({
  useVideoModels: () => ({
    groups: [
      {
        name: 'Test Group',
        textModel: {
          id: 'text-to-video-model',
          model_spec: {
            constraints: {
              model_type: 'text-to-video',
              durations: ['4s', '8s'],
              resolutions: ['480p', '720p'],
              aspect_ratios: ['16:9', '9:16'],
            },
          },
        },
        imageModel: {
          id: 'image-to-video-model',
          model_spec: {
            constraints: {
              model_type: 'image-to-video',
              durations: ['4s', '8s'],
              resolutions: ['480p', '720p'],
              aspect_ratios: ['16:9', '9:16'],
            },
          },
        },
        sets: [],
      },
    ],
    isLoading: false,
  }),
}))

vi.mock('../../stores/auth-store', () => ({
  selectHasVeniceKey: (state: { apiKey: string | null; isConfigured: boolean }) => state.isConfigured || Boolean(state.apiKey),
  useAuthStore: (selector: (state: { apiKey: string | null; isConfigured: boolean }) => unknown) => selector({ apiKey: null, isConfigured: true }),
}))

vi.mock('../../stores/media-store', () => ({
  useMediaStore: Object.assign(() => null, {
    getState: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }),
  }),
}))

vi.mock('../../stores/toast-store', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { VideoView } from './video-view'

describe('VideoView accessibility', () => {
  beforeEach(() => {
    queueMock.mockReset()
    resetMock.mockReset()
    cancelMock.mockReset()

    // Minimal FileReader mock that fires onload synchronously for tests.
    class MockFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      readAsDataURL() {
        this.result = 'data:image/png;base64,AAAA'
        this.onload?.()
      }
    }
    Object.defineProperty(globalThis, 'FileReader', { value: MockFileReader, writable: true })
  })

  it('renders the reference image dropzone as an accessible button in image mode', () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    const dropzone = screen.getByRole('button', { name: 'Choose reference image' })
    expect(dropzone).toBeVisible()
  })

  it('activates the file picker on click', () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    const dropzone = screen.getByRole('button', { name: 'Choose reference image' })
    const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    fireEvent.click(dropzone)
    expect(clickSpy).toHaveBeenCalled()
  })

  it('activates the file picker on Enter key', async () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    const dropzone = screen.getByRole('button', { name: 'Choose reference image' })
    const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    await userEvent.type(dropzone, '{Enter}')
    expect(clickSpy).toHaveBeenCalled()
  })

  it('activates the file picker on Space key', async () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    const dropzone = screen.getByRole('button', { name: 'Choose reference image' })
    const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    await userEvent.type(dropzone, ' ')
    expect(clickSpy).toHaveBeenCalled()
  })

  it('displays the uploaded reference image and a remove button', async () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    const dropzone = screen.getByRole('button', { name: 'Choose reference image' })
    const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['dummy'], 'ref.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByAltText('Reference')).toBeVisible()
    })

    const removeBtn = screen.getByRole('button', { name: 'Remove reference image' })
    expect(removeBtn).toBeVisible()
  })
})
