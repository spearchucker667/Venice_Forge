import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

vi.mock('../../services/attachmentService', () => ({
  isSupportedImageFile: vi.fn((file: File) => file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp'),
  readImageAttachment: vi.fn(async (file: File) => ({
    id: 'mock-id',
    type: 'image' as const,
    name: file.name,
    content: `data:${file.type};base64,AAAA`,
    size: 1,
  })),
}))

vi.mock('../../stores/toast-store', () => ({ toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn(), fromError: vi.fn() } }))

import { VideoView } from './video-view'
import { isSupportedImageFile, readImageAttachment } from '../../services/attachmentService'
import { toast } from '../../stores/toast-store'

const mockIsSupportedImageFile = vi.mocked(isSupportedImageFile)
const mockReadImageAttachment = vi.mocked(readImageAttachment)
const mockToastWarn = vi.mocked(toast.warn)
const mockToastError = vi.mocked(toast.error)

describe('VideoView accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queueMock.mockReset()
    resetMock.mockReset()
    cancelMock.mockReset()
    mockIsSupportedImageFile.mockImplementation(
      (file: File) => file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp',
    )
    mockReadImageAttachment.mockImplementation(async (file: File) => ({
      id: 'mock-id',
      type: 'image' as const,
      name: file.name,
      content: `data:${file.type};base64,AAAA`,
      size: 1,
    }))
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

  it('exposes accessible names for model, resolution, and aspect selects', () => {
    render(<VideoView />)
    expect(screen.getByRole('button', { name: 'Model' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resolution/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aspect/i })).toBeInTheDocument()
  })

  it('exposes aria-label on the duration pill group', () => {
    render(<VideoView />)
    expect(screen.getByRole('radiogroup', { name: 'Video duration' })).toBeInTheDocument()
  })

  // P2-007: video-view reference-image upload MUST go through the
  // attachmentService pipeline (MIME validation, size cap, downscale)
  // instead of the raw FileReader.readAsDataURL fallback.
  it('routes video reference-image upload through attachmentService.readImageAttachment (P2-007)', async () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    const dropzone = screen.getByRole('button', { name: 'Choose reference image' })
    const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['dummy'], 'ref.png', { type: 'image/png' })

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    expect(mockReadImageAttachment).toHaveBeenCalledWith(file)
    await waitFor(() => {
      expect(screen.getByAltText('Reference')).toBeVisible()
    })
  })

  it('warns and skips an unsupported reference image MIME type (P2-007)', async () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    const dropzone = screen.getByRole('button', { name: 'Choose reference image' })
    const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement
    const bmp = new File(['dummy'], 'ref.bmp', { type: 'image/bmp' })

    await act(async () => {
      fireEvent.change(input, { target: { files: [bmp] } })
    })

    expect(mockIsSupportedImageFile).toHaveBeenCalledWith(bmp)
    expect(mockReadImageAttachment).not.toHaveBeenCalled()
    expect(mockToastWarn).toHaveBeenCalledWith(expect.stringContaining('Unsupported image type'))
    expect(screen.queryByAltText('Reference')).toBeNull()
  })

  it('surfaces a generic toast when readImageAttachment throws (P2-007, T-012)', async () => {
    mockReadImageAttachment.mockRejectedValueOnce(new Error('Authorization: Bearer secret /Users/private/image.png'))
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    const dropzone = screen.getByRole('button', { name: 'Choose reference image' })
    const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['dummy'], 'huge.png', { type: 'image/png' })

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Failed to read image',
        'Please choose a PNG, JPEG, or WEBP image under the size limit.',
      )
    })
    expect(JSON.stringify(mockToastError.mock.calls)).not.toContain('Bearer secret')
    expect(JSON.stringify(mockToastError.mock.calls)).not.toContain('/Users/private')
  })
})
