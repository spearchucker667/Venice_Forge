import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useVideo, toUserFacingVideoError } from './use-video'
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

  // T-095 regression guards: provider/polling/queue errors must not be stored as raw UI strings.
  it('redacts provider error messages before storing them in UI state (T-095)', async () => {
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

    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    await act(async () => {
      deferreds.shift()?.resolve({
        status: 'failed',
        error: 'Provider failure for vn-abc1234567890 with Bearer token1234567890',
      })
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error).toContain('[REDACTED]')
    expect(result.current.error).not.toContain('vn-abc')
    expect(result.current.error).not.toContain('token1234567890')
  })

  it('uses safe fallback when provider reports failed status without an error message (T-095)', async () => {
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

    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    await act(async () => {
      deferreds.shift()?.resolve({ status: 'failed' })
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error).toBe('Video generation failed')
  })

  it('redacts polling errors after max attempts before storing them in UI state (T-095)', async () => {
    const secretMessage = 'Polling failed for vn-abc1234567890'
    const deferreds: { resolve: (v: unknown) => void; reject: (e?: unknown) => void }[] = []
    mockedVenice.mockImplementation((endpoint: string) => {
      if (endpoint === '/video/queue') {
        return Promise.resolve({ queue_id: 'vq-1' })
      }
      return new Promise((resolve, reject) => {
        deferreds.push({ resolve, reject })
      })
    })

    const { result } = renderHook(() => useVideo(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })
    await act(async () => Promise.resolve())

    for (let i = 0; i < 199; i += 1) {
      act(() => vi.advanceTimersByTime(3000))
      await act(async () => Promise.resolve())
      await act(async () => {
        deferreds.shift()?.resolve({ status: 'queued' })
        await Promise.resolve()
      })
    }

    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())
    await act(async () => {
      deferreds.shift()?.reject(new Error(secretMessage))
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error).toContain('[REDACTED]')
    expect(result.current.error).not.toContain('vn-abc')
  })

  it('redacts queue errors before storing them in UI state (T-095)', async () => {
    mockedVenice.mockRejectedValue(new Error('Queue rejected because vn-abc1234567890 is invalid'))

    const { result } = renderHook(() => useVideo(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error).toContain('[REDACTED]')
    expect(result.current.error).not.toContain('vn-abc')
  })

  it('caps overly long error messages to avoid UI overflow (T-095)', async () => {
    const longError = 'x'.repeat(500)
    mockedVenice.mockRejectedValue(new Error(longError))

    const { result } = renderHook(() => useVideo(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error?.length).toBeLessThanOrEqual(201)
    expect(result.current.error?.endsWith('…')).toBe(true)
  })
})

describe('toUserFacingVideoError', () => {
  it('redacts Venice API keys from provider strings (T-095)', () => {
    expect(toUserFacingVideoError('Failed for vn-abc1234567890', 'Fallback')).toBe('Failed for [REDACTED]')
  })

  it('redacts bearer tokens from Error messages (T-095)', () => {
    const err = new Error('Authorization Bearer abc1234567890 failed')
    expect(toUserFacingVideoError(err, 'Fallback')).toBe('Authorization Bearer [REDACTED] failed')
  })

  it('redacts local paths from Error messages (T-095)', () => {
    const err = new Error('ENOENT: /Users/admin/secret/file.txt not found')
    expect(toUserFacingVideoError(err, 'Fallback')).toBe('ENOENT: [REDACTED-PATH] not found')
  })

  it('falls back to a safe message when value is empty (T-095)', () => {
    expect(toUserFacingVideoError('', 'Queue failed')).toBe('Queue failed')
    expect(toUserFacingVideoError(undefined, 'Polling failed')).toBe('Polling failed')
  })

  it('caps messages longer than MAX_ERROR_LENGTH (T-095)', () => {
    const long = 'x'.repeat(500)
    expect(toUserFacingVideoError(long, 'Fallback').length).toBe(201)
    expect(toUserFacingVideoError(long, 'Fallback').endsWith('…')).toBe(true)
  })
})
