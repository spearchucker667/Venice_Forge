import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useVideo } from './use-video'
import { venice } from '../lib/venice-client'

vi.mock('../lib/venice-client', () => ({
  venice: vi.fn(),
}))

const mockedVenice = vi.mocked(venice)

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useVideo polling race conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  it('ignores stale responses after cancel', async () => {
    const deferreds: { resolve: (v: unknown) => void; reject: (e?: unknown) => void }[] = []
    mockedVenice.mockImplementation(() => {
      return new Promise((resolve, reject) => {
        deferreds.push({ resolve, reject })
      })
    })

    const { result } = renderHook(() => useVideo(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })

    await act(async () => {
      deferreds.shift()?.resolve({ queue_id: 'vq-1' })
      await Promise.resolve()
    })

    expect(result.current.status).toBe('queued')

    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    act(() => result.current.cancel())

    await act(async () => {
      deferreds.shift()?.resolve({ status: 'completed', video_url: 'http://video/1' })
      await Promise.resolve()
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.videoUrl).toBeNull()
  })

  it('ignores stale responses from an earlier generation', async () => {
    const deferreds: { resolve: (v: unknown) => void; reject: (e?: unknown) => void }[] = []
    mockedVenice.mockImplementation(() => {
      return new Promise((resolve, reject) => {
        deferreds.push({ resolve, reject })
      })
    })

    const { result } = renderHook(() => useVideo(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'first' })
    })
    await act(async () => {
      deferreds.shift()?.resolve({ queue_id: 'vq-1' })
      await Promise.resolve()
    })

    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'second' })
    })
    await act(async () => {
      deferreds.shift()?.resolve({ queue_id: 'vq-2' })
      await Promise.resolve()
    })

    await act(async () => {
      deferreds.shift()?.resolve({ status: 'completed', video_url: 'http://video/stale' })
      await Promise.resolve()
    })

    expect(result.current.status).toBe('queued')
    expect(result.current.videoUrl).toBeNull()

    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())
    await act(async () => {
      deferreds.shift()?.resolve({ status: 'completed', video_url: 'http://video/fresh' })
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.status).toBe('completed'))
    expect(result.current.videoUrl).toBe('http://video/fresh')
  })

  it('does not produce duplicate state updates from overlapping callbacks', async () => {
    const deferreds: { resolve: (v: unknown) => void; reject: (e?: unknown) => void }[] = []
    let callCount = 0
    mockedVenice.mockImplementation(() => {
      callCount += 1
      return new Promise((resolve, reject) => {
        deferreds.push({ resolve, reject })
      })
    })

    const { result } = renderHook(() => useVideo(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })
    await act(async () => {
      deferreds.shift()?.resolve({ queue_id: 'vq-1' })
      await Promise.resolve()
    })

    act(() => vi.advanceTimersByTime(3000))
    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    expect(callCount).toBe(2)

    await act(async () => {
      deferreds.shift()?.resolve({ status: 'queued' })
      await Promise.resolve()
    })

    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    expect(callCount).toBe(3)
  })

  it('preserves elapsed timer and max-attempts error handling', async () => {
    mockedVenice.mockResolvedValue({ status: 'queued' })

    const { result } = renderHook(() => useVideo(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })

    for (let i = 0; i < 201; i += 1) {
      act(() => vi.advanceTimersByTime(3000))
      await act(async () => Promise.resolve())
    }

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error).toContain('Generation took too long')
  })
})
