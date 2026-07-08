/** @fileoverview Audio view accessibility (Wave 2). */

import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AudioView } from './audio-view'

vi.mock('../../hooks/use-models', () => ({
  useModels: () => ({ data: [] }),
}))

vi.mock('../../hooks/use-audio', () => ({
  useTTS: () => ({ mutate: vi.fn(), isPending: false, error: null }),
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
  useSettingsStore: (selector: (state: { selectedModels: { audio: string } }) => unknown) => selector({ selectedModels: { audio: 'tts-kokoro' } }),
}))

vi.mock('../../stores/toast-store', () => ({
  toast: { fromError: vi.fn() },
}))

vi.mock('../../services/promptStarterService', () => ({
  getPromptStartersForCategory: () => ['Hello', 'World'],
}))

describe('AudioView accessibility', () => {
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
})
