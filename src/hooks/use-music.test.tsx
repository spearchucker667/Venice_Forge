import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useMusic, SAFE_ERROR_MESSAGES } from './use-music'
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

describe('useMusic polling race conditions', () => {
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

    const { result } = renderHook(() => useMusic(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })

    // First queue call resolves with queue_id
    await act(async () => {
      deferreds.shift()?.resolve({ queue_id: 'q-1' })
      await Promise.resolve()
    })

    expect(result.current.status).toBe('queued')

    // Advance to trigger first poll; it will hang.
    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    // Cancel while the first poll is in-flight.
    act(() => result.current.cancel())

    // The in-flight poll now resolves with completed — must be ignored.
    await act(async () => {
      deferreds.shift()?.resolve({ status: 'COMPLETED', audio_url: 'http://audio/1' })
      await Promise.resolve()
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.audioUrl).toBeNull()
  })

  it('ignores stale responses from an earlier generation', async () => {
    const deferreds: { resolve: (v: unknown) => void; reject: (e?: unknown) => void }[] = []
    mockedVenice.mockImplementation(() => {
      return new Promise((resolve, reject) => {
        deferreds.push({ resolve, reject })
      })
    })

    const { result } = renderHook(() => useMusic(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'first' })
    })
    await act(async () => {
      deferreds.shift()?.resolve({ queue_id: 'q-1' })
      await Promise.resolve()
    })

    // Trigger poll, leave it in-flight.
    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    // Start a second request (new generation).
    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'second' })
    })
    await act(async () => {
      deferreds.shift()?.resolve({ queue_id: 'q-2' })
      await Promise.resolve()
    })

    // The first-generation poll now resolves with completed — must be ignored.
    await act(async () => {
      deferreds.shift()?.resolve({ status: 'COMPLETED', audio_url: 'http://audio/stale' })
      await Promise.resolve()
    })

    // Status should still reflect the new queued state, and no stale URL.
    expect(result.current.status).toBe('queued')
    expect(result.current.audioUrl).toBeNull()

    // New-generation poll resolves — should be accepted.
    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())
    await act(async () => {
      deferreds.shift()?.resolve({ status: 'COMPLETED', audio_url: 'http://audio/fresh' })
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.status).toBe('completed'))
    expect(result.current.audioUrl).toBe('http://audio/fresh')
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

    const { result } = renderHook(() => useMusic(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })
    await act(async () => {
      deferreds.shift()?.resolve({ queue_id: 'q-1' })
      await Promise.resolve()
    })

    // Fire interval twice quickly before the first venice call resolves.
    act(() => vi.advanceTimersByTime(3000))
    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    // Only one retrieve should be in-flight due to isPollingRef guard.
    expect(callCount).toBe(2) // 1 queue + 1 retrieve

    // Resolve the only in-flight retrieve as still queued.
    await act(async () => {
      deferreds.shift()?.resolve({ status: 'QUEUED' })
      await Promise.resolve()
    })

    // Next interval can fire now.
    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    expect(callCount).toBe(3)
  })

  it('preserves elapsed timer and max-attempts error handling', async () => {
    mockedVenice.mockResolvedValue({ status: 'QUEUED' })

    const { result } = renderHook(() => useMusic(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })

    // Burn through attempts quickly.
    for (let i = 0; i < 121; i += 1) {
      act(() => vi.advanceTimersByTime(3000))
      await act(async () => Promise.resolve())
    }

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error).toBe('Generation took too long. Cancel and try again.')
  })
})

describe('useMusic safe error handling (T-121/T-122)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  it('does not surface raw queue mutation errors', async () => {
    const rawError = new Error('Internal server error at /etc/secrets/key.pem: socket hang up')
    mockedVenice.mockRejectedValue(rawError)

    const { result } = renderHook(() => useMusic(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error).toBe(SAFE_ERROR_MESSAGES.queue)
    expect(result.current.error).not.toContain('/etc/secrets')
    expect(result.current.error).not.toContain('socket hang up')
  })

  it('does not surface raw retrieve failure error payloads', async () => {
    mockedVenice.mockResolvedValueOnce({ queue_id: 'q-1' })
    mockedVenice.mockResolvedValue({ status: 'FAILED', error: 'Database connection failed: s" + "k-abc123-def456' })

    const { result } = renderHook(() => useMusic(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })

    act(() => vi.advanceTimersByTime(3000))
    await act(async () => Promise.resolve())

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error).toBe(SAFE_ERROR_MESSAGES.generation)
    expect(result.current.error).not.toContain('Database connection failed')
    expect(result.current.error).not.toContain('sk-abc123')
  })

  it('does not surface raw polling exception messages', async () => {
    mockedVenice.mockResolvedValueOnce({ queue_id: 'q-1' })
    mockedVenice.mockRejectedValue(new Error('ENOENT: /Users/bob/.venice/config.json'))

    const { result } = renderHook(() => useMusic(), { wrapper: createWrapper() })

    await act(async () => {
      result.current.queue({ model: 'test', prompt: 'hello' })
    })

    // Burn through attempts until the catch block records a failure.
    for (let i = 0; i < 120; i += 1) {
      act(() => vi.advanceTimersByTime(3000))
      await act(async () => Promise.resolve())
    }

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.error).toBe(SAFE_ERROR_MESSAGES.polling)
    expect(result.current.error).not.toContain('ENOENT')
    expect(result.current.error).not.toContain('/Users/bob')
  })
})
