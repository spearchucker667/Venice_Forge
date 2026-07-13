import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { veniceBlob } from '../lib/venice-client'
import { useBackgroundRemove, useImageEdit, useImageUpscale } from './use-image-tools'

vi.mock('../lib/venice-client', () => ({ veniceBlob: vi.fn() }))
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAgAAAAIA'
const PNG = `data:image/png;base64,${PNG_BASE64}`

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }, children)
}

describe('image tool hooks', () => {
  beforeEach(() => vi.mocked(veniceBlob).mockResolvedValue(new Blob(['png'], { type: 'image/png' })))

  it('sends only canonical edit fields', async () => {
    const { result } = renderHook(() => useImageEdit(), { wrapper })
    await act(() => result.current.mutateAsync({ image: PNG, prompt: 'edit', model: 'flux-2-max-edit' }))
    expect(veniceBlob).toHaveBeenCalledWith('/image/edit', { image: PNG_BASE64, prompt: 'edit', model: 'flux-2-max-edit' })
  })

  it('sends only image, scale, and creativity for upscale', async () => {
    const { result } = renderHook(() => useImageUpscale(), { wrapper })
    await act(() => result.current.mutateAsync({ image: PNG, scale: 4, creativity: 0.01 }))
    expect(veniceBlob).toHaveBeenCalledWith('/image/upscale', { image: PNG_BASE64, scale: 4, creativity: 0.01 })
  })

  it('expects PNG for background removal', async () => {
    const { result } = renderHook(() => useBackgroundRemove(), { wrapper })
    await act(() => result.current.mutateAsync(PNG))
    expect(veniceBlob).toHaveBeenCalledWith('/image/background-remove', { image: PNG_BASE64 })
  })
})
