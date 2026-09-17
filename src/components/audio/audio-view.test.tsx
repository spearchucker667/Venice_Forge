/** @fileoverview Audio view accessibility (Wave 2) + persisted TTS format
 *  flow (Phase 4C): the persisted Audio Studio format choice must reach the
 *  TTS request payload, and an unsupported persisted choice must be repaired
 *  against live model metadata with a non-blocking notice. */

import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AudioView } from './audio-view'

const mocks = vi.hoisted(() => ({
  saveMediaAs: vi.fn(),
  setAudioStudioPreferences: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastFromError: vi.fn(),
  ttsMutate: vi.fn(),
  modelsData: [] as Array<Record<string, unknown>>,
  ttsFormatPref: undefined as string | undefined,
}))

vi.mock('../../services/desktopBridge', () => ({
  desktopMedia: { saveMediaAs: mocks.saveMediaAs },
}))

vi.mock('../../hooks/use-models', () => ({
  useModels: () => ({ data: mocks.modelsData }),
}))

vi.mock('../../hooks/use-audio', () => ({
  useTTS: () => ({ mutate: mocks.ttsMutate, isPending: false, error: null }),
  useTranscription: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))

vi.mock('../../hooks/use-blob-url', () => ({
  useBlobUrl: () => ['blob:mock-audio-url', vi.fn(), vi.fn()],
}))

vi.mock('../../stores/auth-store', () => ({
  selectHasVeniceKey: (state: { apiKey: string | null; isConfigured: boolean }) => state.isConfigured || Boolean(state.apiKey),
  useAuthStore: (selector: (state: { apiKey: string | null; isConfigured: boolean }) => unknown) => selector({ apiKey: null, isConfigured: true }),
}))

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: {
    selectedModels: { audio: string }
    audioPreferences: { audioStudio: { ttsFormat: string | undefined } }
    setAudioStudioPreferences: (prefs: { ttsFormat: string }) => void
  }) => unknown) => selector({
    selectedModels: { audio: 'tts-kokoro' },
    audioPreferences: { audioStudio: { ttsFormat: mocks.ttsFormatPref } },
    setAudioStudioPreferences: mocks.setAudioStudioPreferences,
  }),
}))

vi.mock('../../stores/toast-store', () => ({
  toast: {
    fromError: mocks.toastFromError,
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
  },
}))

vi.mock('../../services/promptStarterService', () => ({
  getPromptStartersForCategory: () => ['Hello', 'World'],
}))

function typeText(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
    target: { value },
  })
}

function clickGenerate() {
  fireEvent.click(screen.getByRole('button', { name: 'Generate Speech' }))
}

describe('AudioView accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.modelsData = []
    mocks.ttsFormatPref = undefined
  })

  it('associates visible labels with text, voice, and format controls', () => {
    render(<AudioView />)
    expect(screen.getByRole('textbox', { name: 'Text' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Format' })).toBeInTheDocument()
  })

  it('shows an unsupported codec message when the audio element errors', () => {
    const { container } = render(<AudioView />)
    const audio = container.querySelector('audio')
    expect(audio).toBeInTheDocument()
    // jsdom does not fully implement HTMLMediaElement.error, so set it directly.
    // MEDIA_ERR_SRC_NOT_SUPPORTED === 4
    Object.defineProperty(audio!, 'error', {
      value: { code: 4 },
      configurable: true,
    })
    fireEvent.error(audio!)
    expect(screen.getByText(/not supported/i)).toBeInTheDocument()
  })

  it('routes TTS audio downloads through the canonical Save As service', async () => {
    mocks.saveMediaAs.mockResolvedValueOnce({ status: 'cancelled' })
    render(<AudioView />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(mocks.saveMediaAs).toHaveBeenCalledWith({
      source: 'blob:mock-audio-url',
      mimeType: 'audio/mpeg',
      suggestedName: 'venice-speech.mp3',
    }))
  })
})

describe('AudioView persisted TTS format (Phase 4C)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ttsFormatPref = undefined
    mocks.modelsData = [
      {
        id: 'tts-kokoro',
        model_spec: { supported_formats: ['mp3', 'wav'], default_format: 'mp3' },
      },
    ]
  })

  it('sends the persisted format choice to the TTS request payload', () => {
    mocks.ttsFormatPref = 'wav'
    render(<AudioView />)
    typeText('Hello Venice')
    clickGenerate()
    expect(mocks.ttsMutate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: 'wav' }),
      expect.anything(),
    )
  })

  it('repairs an unsupported persisted format to the model default and notices the user', async () => {
    mocks.ttsFormatPref = 'opus'
    mocks.modelsData = [
      {
        id: 'tts-kokoro',
        model_spec: { supported_formats: ['mp3'], default_format: 'mp3' },
      },
    ]
    render(<AudioView />)
    await waitFor(() =>
      expect(mocks.setAudioStudioPreferences).toHaveBeenCalledWith({ ttsFormat: 'mp3' }),
    )
    expect(mocks.toastInfo).toHaveBeenCalledTimes(1)
    // The wire payload uses the repaired value, never the invalid persisted one.
    typeText('Hello Venice')
    clickGenerate()
    expect(mocks.ttsMutate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: 'mp3' }),
      expect.anything(),
    )
  })

  it('does not repair or notice when the persisted format is valid for the model', () => {
    mocks.ttsFormatPref = 'wav'
    render(<AudioView />)
    expect(mocks.setAudioStudioPreferences).not.toHaveBeenCalled()
    expect(mocks.toastInfo).not.toHaveBeenCalled()
  })

  it('drives the format selector options from live model metadata', () => {
    mocks.modelsData = [
      {
        id: 'tts-kokoro',
        model_spec: { supported_formats: ['flac', 'mp3'], default_format: 'flac' },
      },
    ]
    render(<AudioView />)
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    expect(screen.getByRole('option', { name: 'FLAC' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'MP3' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'WAV' })).not.toBeInTheDocument()
  })
})
