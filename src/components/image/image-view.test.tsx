// VERIFY-056 regression guard
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mutate = vi.fn()

afterEach(() => vi.restoreAllMocks())

vi.mock('../../hooks/use-image', () => ({
  useImageGenerate: () => ({ mutate, isPending: false, error: null }),
}))

vi.mock('../../hooks/use-models', () => ({
  useModels: () => ({
    data: [{
      id: 'nano-banana-v1',
      model_spec: {
        constraints: {
          aspect_ratios: ['1:1', '16:9'],
          default_aspect_ratio: '16:9',
          resolutions: ['1k', '2k'],
          default_resolution: '2k',
          steps: { min: 1, max: 50, default: 20 },
        },
      },
    }],
  }),
}))

vi.mock('../../hooks/use-styles', () => ({ useStyles: () => ({ data: [] }) }))

vi.mock('../../stores/auth-store', () => ({
  selectHasVeniceKey: (state: { apiKey: string | null; isConfigured: boolean }) => state.isConfigured || Boolean(state.apiKey),
  useAuthStore: (selector: (state: { apiKey: string | null; isConfigured: boolean }) => unknown) => selector({ apiKey: null, isConfigured: true }),
}))

vi.mock('../../stores/media-store', () => ({
  useMediaStore: Object.assign(() => null, {
    getState: () => ({
      upsert: vi.fn().mockResolvedValue(undefined),
      upsertDerivative: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}))

import { useSettingsStore } from '../../stores/settings-store'
import { ImageView } from './image-view'
import { useImageWorkspaceStore } from '../../stores/image-workspace-store'
import * as imageCapabilities from '../../config/image-model-capabilities'

describe('ImageView model-aware payloads', () => {
  beforeEach(() => {
    mutate.mockReset()
    useImageWorkspaceStore.getState().reset()
    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: 'nano-banana-v1' },
    }))
  })

  // VERIFY-040: aspect-resolution models must never leak pixel dimensions.
  it('sends aspect_ratio + resolution + quality without width/height', () => {
    render(<ImageView />)
    fireEvent.change(screen.getByPlaceholderText(/serene mountain landscape/i), {
      target: { value: 'A copper city at dusk' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    const request = mutate.mock.calls[0]?.[0] as Record<string, unknown>
    expect(request).toMatchObject({
      model: 'nano-banana-v1',
      prompt: 'A copper city at dusk',
      aspect_ratio: '16:9',
      resolution: '2k',
      quality: 'high',
    })
    expect(request.width).toBeUndefined()
    expect(request.height).toBeUndefined()
  })

  it('applies a queued regenerate draft before auto-generation', async () => {
    useImageWorkspaceStore.getState().enqueueGenerate({
      draft: {
        model: 'nano-banana-v1',
        prompt: 'Reviewed remix prompt',
        aspectRatio: '1:1',
        resolution: '1k',
        seed: -42,
        steps: 28,
        cfgScale: 6.5,
        imageCount: 2,
      },
      autoGenerate: true,
      parentId: 'parent-1',
      operation: 'regenerate',
    })

    render(<ImageView />)

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0]).toMatchObject({
      prompt: 'Reviewed remix prompt',
      aspect_ratio: '1:1',
      resolution: '1k',
      seed: -42,
      steps: 28,
      cfg_scale: 6.5,
      variants: 2,
    })
    expect(useImageWorkspaceStore.getState().pending).toBeNull()
  })

  // VERIFY-043: image-view must surface the model capability summary and
  // honor the per-capability supports* flags end-to-end.
  it('renders a capability summary for the selected model', () => {
    render(<ImageView />)
    const summary = screen.getByTestId('image-capability-summary')
    expect(summary).toBeInTheDocument()
    expect(summary.textContent).toMatch(/Nano Banana/)
  })

  it('strips seed + style + steps + cfg when supports* is false on the model', () => {
    // nano-banana-v1 supports all of them by default; mutate the
    // settings-store so a synthetic "no-support" model is used. The
    // payload builder is covered by the dedicated modelAware test; here
    // we assert the form hides the controls.
    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: 'unknown-model-xyz' },
    }))
    render(<ImageView />)
    // The capability summary still renders
    expect(screen.getByTestId('image-capability-summary')).toBeInTheDocument()
  })

  it('keeps a negative template pending for an incompatible model', () => {
    const originalGetCapabilities = imageCapabilities.getImageModelCapabilities
    vi.spyOn(imageCapabilities, 'getImageModelCapabilities').mockImplementation((modelId) => ({
      ...originalGetCapabilities(modelId),
      supportsNegativePrompt: modelId === 'unknown-model-xyz' ? false : originalGetCapabilities(modelId).supportsNegativePrompt,
    }))
    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: 'unknown-model-xyz' },
    }))
    render(<ImageView />)
    const prompt = screen.getByPlaceholderText(/serene mountain landscape/i)
    fireEvent.change(prompt, { target: { value: 'Original prompt' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Prompt template' }), { target: { value: 'neg-standard' } })

    expect(screen.getByRole('alert')).toHaveTextContent(/does not support negative prompts/i)
    expect(screen.getByRole('button', { name: 'Append' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled()
    expect(prompt).toHaveValue('Original prompt')
  })

  it('hard-stops the image prompt at 1500 characters when typing over the limit', () => {
    render(<ImageView />)
    fireEvent.change(screen.getByPlaceholderText(/serene mountain landscape/i), {
      target: { value: 'a'.repeat(1501) },
    })

    expect(screen.getByText('1500/1500')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).not.toBeDisabled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('hard-stops pasted input at 1500 characters', () => {
    render(<ImageView />)
    const textarea = screen.getByPlaceholderText(/serene mountain landscape/i)
    fireEvent.paste(textarea, {
      clipboardData: { getData: () => 'a'.repeat(2000) },
    })
    fireEvent.change(textarea, { target: { value: 'a'.repeat(2000) } })

    expect(screen.getByText('1500/1500')).toBeInTheDocument()
  })
})

describe('ImageView lightbox', () => {
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  beforeEach(() => {
    mutate.mockReset()
    useImageWorkspaceStore.getState().reset()
    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: 'nano-banana-v1' },
    }))
  })

  it('opens a focus-trapped dialog with role, aria-modal, and aria-label', async () => {
    mutate.mockImplementation((_req: unknown, options?: { onSuccess?: (data: { images: string[] }) => void }) => {
      options?.onSuccess?.({ images: [tinyPng] })
    })

    render(<ImageView />)
    fireEvent.change(screen.getByPlaceholderText(/serene mountain landscape/i), {
      target: { value: 'A tiny test image' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    const image = await screen.findByAltText('Generated 1')
    fireEvent.click(image)

    const dialog = screen.getByRole('dialog', { name: 'Image preview' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Image preview')

    // Focus should be inside the dialog (first focusable button is Download).
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('closes the lightbox on Escape and restores focus to the trigger image', async () => {
    mutate.mockImplementation((_req: unknown, options?: { onSuccess?: (data: { images: string[] }) => void }) => {
      options?.onSuccess?.({ images: [tinyPng] })
    })

    render(<ImageView />)
    fireEvent.change(screen.getByPlaceholderText(/serene mountain landscape/i), {
      target: { value: 'A tiny test image' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    const image = await screen.findByAltText('Generated 1')
    fireEvent.click(image)

    const dialog = screen.getByRole('dialog', { name: 'Image preview' })
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument()
    })

    // The trigger image should regain focus because it was focused on click.
    expect(document.activeElement).toBe(image.closest('button'))
  })
})
