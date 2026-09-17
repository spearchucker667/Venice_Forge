import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queueMock = vi.fn()
const resetMock = vi.fn()
const cancelMock = vi.fn()
const { saveMediaAs } = vi.hoisted(() => ({ saveMediaAs: vi.fn() }))
let videoState = { videoUrl: null as string | null, resultMediaId: null as string | null }

vi.mock('../../hooks/use-video', () => ({
  useVideo: () => ({
    queue: queueMock,
    isQueueing: false,
    status: 'idle',
    videoUrl: videoState.videoUrl,
    resultMediaId: videoState.resultMediaId,
    error: null,
    reset: resetMock,
    cancel: cancelMock,
    elapsedMs: 0,
    queueId: null,
    lastRequest: null,
  }),
}))

vi.mock('../../services/desktopBridge', () => ({ desktopMedia: { saveMediaAs } }))

const mockUseVideoQuote = vi.fn<(...args: any[]) => { data?: { costUsd: number } | null; isLoading: boolean }>(() => ({
  data: undefined,
  isLoading: false,
}))
vi.mock('../../hooks/use-video-quote', () => ({
  useVideoQuote: (...args: any[]) => mockUseVideoQuote(...args),
}))

vi.mock('../../hooks/use-models', () => ({
  useVideoModels: () => ({
    groups: [
      {
        name: 'Priced Group',
        textModel: {
          id: 'text-to-video-priced',
          model_spec: {
            name: 'Priced Text-to-Video',
            constraints: {
              model_type: 'text-to-video',
              durations: ['4s', '8s'],
              resolutions: ['480p', '720p'],
              aspect_ratios: ['16:9', '9:16'],
            },
            pricing: { durations: { '4s': { usd: 0.123 } } },
          },
        },
        imageModel: {
          id: 'image-to-video-priced',
          model_spec: {
            name: 'Priced Image-to-Video',
            constraints: {
              model_type: 'image-to-video',
              durations: ['4s', '8s'],
              resolutions: ['480p', '720p'],
              aspect_ratios: ['16:9', '9:16'],
            },
            pricing: { durations: { '4s': { usd: 0.234 } } },
          },
        },
        sets: [],
      },
      {
        name: 'Fallback Group',
        textModel: {
          id: 'fallback-text-to-video',
          model_spec: {
            name: 'Fallback Text-to-Video',
            constraints: {
              model_type: 'text-to-video',
              durations: ['4s'],
              resolutions: ['480p'],
              aspect_ratios: ['16:9'],
            },
          },
        },
        sets: [],
      },
      {
        name: 'No Text Model',
        imageModel: {
          id: 'image-only-video',
          model_spec: {
            name: 'Image-Only Video',
            constraints: {
              model_type: 'image-to-video',
              durations: ['4s'],
              resolutions: ['480p'],
              aspect_ratios: ['16:9'],
            },
          },
        },
        sets: [],
      },
      {
        name: 'Limited Group',
        textModel: {
          id: 'limited-text-to-video',
          model_spec: {
            name: 'Limited Text-to-Video',
            prompt_character_limit: 10,
            constraints: {
              model_type: 'text-to-video',
              durations: ['4s'],
              resolutions: ['480p'],
              aspect_ratios: ['16:9'],
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
import { useSettingsStore } from '../../stores/settings-store'

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
    saveMediaAs.mockReset()
    mockUseVideoQuote.mockReturnValue({ data: undefined, isLoading: false })
    videoState = { videoUrl: null, resultMediaId: null }
    useSettingsStore.setState({ selectedVideoMode: 'text', selectedVideoModelGroup: undefined, selectedVideoModelId: undefined })
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
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    fireEvent.click(dropzone)
    expect(clickSpy).toHaveBeenCalled()
  })

  it('activates the file picker on Enter key', async () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    const dropzone = screen.getByRole('button', { name: 'Choose reference image' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    await userEvent.type(dropzone, '{Enter}')
    expect(clickSpy).toHaveBeenCalled()
  })

  it('activates the file picker on Space key', async () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    const dropzone = screen.getByRole('button', { name: 'Choose reference image' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    await userEvent.type(dropzone, ' ')
    expect(clickSpy).toHaveBeenCalled()
  })

  it('displays the uploaded reference image and a remove button', async () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))

    screen.getByRole('button', { name: 'Choose reference image' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

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

    screen.getByRole('button', { name: 'Choose reference image' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
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

    screen.getByRole('button', { name: 'Choose reference image' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
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

    screen.getByRole('button', { name: 'Choose reference image' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
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

  it('shows schema-qualified pricing in the model selector for text-to-video mode and suppresses Price unavailable', () => {
    render(<VideoView />)
    const modelButton = screen.getByRole('button', { name: 'Model' })
    fireEvent.click(modelButton)
    expect(screen.getAllByText('Priced Text-to-Video (from $0.12/generation (4s))').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Fallback Text-to-Video').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('No Text Model').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/Price unavailable/)).toBeNull()
  })

  it('switches cost label to the image-to-video model when mode changes and suppresses Price unavailable', () => {
    render(<VideoView />)
    fireEvent.click(screen.getByRole('button', { name: 'Image to Video' }))
    const modelButton = screen.getByRole('button', { name: 'Model' })
    fireEvent.click(modelButton)
    expect(screen.getAllByText('Priced Image-to-Video (from $0.23/generation (4s))').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Image-Only Video').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/Price unavailable/)).toBeNull()
  })

  it('renders dynamic video quote estimate badge when quote is available', () => {
    mockUseVideoQuote.mockReturnValue({ data: { costUsd: 0.15 }, isLoading: false })
    render(<VideoView />)
    const quoteBadge = screen.getByTestId('video-estimated-cost')
    expect(quoteBadge).toBeInTheDocument()
    expect(quoteBadge).toHaveTextContent('$0.15')
  })

  it('auto-switches to image mode when an image-only model group is selected', async () => {
    render(<VideoView />)
    expect(screen.getByRole('button', { name: 'Text to Video' })).toHaveAttribute('aria-pressed', 'true')

    const modelButton = screen.getByRole('button', { name: 'Model' })
    fireEvent.click(modelButton)
    const options = screen.getAllByRole('option')
    const noTextOption = options.find((o) => o.textContent?.includes('No Text Model'))
    expect(noTextOption).toBeDefined()
    if (noTextOption) fireEvent.click(noTextOption)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Image to Video' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('falls back to the group name when the active-mode model is missing', () => {
    render(<VideoView />)
    // The "No Text Model" group has no text model, so in text mode its label
    // should simply be the group name.
    const modelButton = screen.getByRole('button', { name: 'Model' })
    fireEvent.click(modelButton)
    expect(screen.getAllByText('No Text Model').length).toBeGreaterThanOrEqual(1)
  })

  it('routes completed videos through the canonical Save As service', async () => {
    videoState = { videoUrl: 'venice-media://video-id', resultMediaId: 'video-id' }
    saveMediaAs.mockResolvedValueOnce({ status: 'saved', filename: 'venice-video.mp4' })
    render(<VideoView />)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() => expect(saveMediaAs).toHaveBeenCalledWith({
      source: 'venice-media://video-id',
      mediaId: 'video-id',
      suggestedName: 'venice-video.mp4',
    }))
    expect(toast.success).toHaveBeenCalled()
  })
})

describe('VideoView prompt character limit (VF-20260916-P2-006)', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      selectedVideoMode: 'text',
      selectedVideoModelGroup: 'Limited Group',
      selectedVideoModelId: undefined,
    })
  })

  it('blocks Generate while the prompt exceeds the per-model limit instead of truncating', async () => {
    render(<VideoView />)

    const promptInput = screen.getByPlaceholderText(/Cinematic drone shot/i)
    // Model advertises prompt_character_limit: 10 — 11 characters is over.
    fireEvent.change(promptInput, { target: { value: 'a'.repeat(11) } })

    const meter = await screen.findByTestId('video-prompt-meter')
    expect(meter).toHaveAttribute('data-over-limit', 'true')
    expect(meter).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', { name: /Generate Video/i })).toBeDisabled()
    expect(queueMock).not.toHaveBeenCalled()
  })

  it('allows Generate once the prompt fits the per-model limit', async () => {
    render(<VideoView />)

    const promptInput = screen.getByPlaceholderText(/Cinematic drone shot/i)
    fireEvent.change(promptInput, { target: { value: 'fit-in-ten' } })

    const meter = await screen.findByTestId('video-prompt-meter')
    expect(meter).not.toHaveAttribute('data-over-limit')
    expect(screen.getByRole('button', { name: /Generate Video/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /Generate Video/i }))
    expect(queueMock).toHaveBeenCalledTimes(1)
  })

  it('uses the Swagger default (2500) when the model advertises no limit', async () => {
    useSettingsStore.setState({ selectedVideoModelGroup: 'Priced Group' })
    render(<VideoView />)

    const promptInput = screen.getByPlaceholderText(/Cinematic drone shot/i)
    fireEvent.change(promptInput, { target: { value: 'x'.repeat(2501) } })

    const meter = await screen.findByTestId('video-prompt-meter')
    expect(meter).toHaveTextContent('2,501/2,500')
    expect(meter).toHaveAttribute('data-over-limit', 'true')
  })
})
