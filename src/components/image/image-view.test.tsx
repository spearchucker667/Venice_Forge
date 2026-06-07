import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mutate = vi.fn()

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

import { useSettingsStore } from '../../stores/settings-store'
import { ImageView } from './image-view'
import { useImageWorkspaceStore } from '../../stores/image-workspace-store'

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
    })
    expect(useImageWorkspaceStore.getState().pending).toBeNull()
  })
})
