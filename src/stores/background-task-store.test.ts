import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { veniceFetch } from '../services/veniceClient/fetch'
import { useBackgroundTaskStore } from './background-task-store'

vi.mock('../services/veniceClient/fetch', () => ({ veniceFetch: vi.fn() }))

function resetStore(): void {
  const state = useBackgroundTaskStore.getState()
  for (const poll of Object.values(state.activePolls)) clearTimeout(poll)
  useBackgroundTaskStore.setState({ tasks: {}, activePolls: {} })
}

describe('background task polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T21:00:00Z'))
    vi.mocked(veniceFetch).mockReset()
    resetStore()
  })

  afterEach(() => {
    resetStore()
    vi.useRealTimers()
  })

  it('checks video status immediately and normalizes an Electron binary completion', async () => {
    vi.mocked(veniceFetch).mockResolvedValueOnce({
      data: { dataBase64: 'AAAA' },
      headers: { 'content-type': 'video/mp4' },
    } as never)

    useBackgroundTaskStore.getState().registerQueueTask('video-one', 'video', 'queue-one', { model: 'model-one' })
    await vi.advanceTimersByTimeAsync(0)

    expect(veniceFetch).toHaveBeenCalledTimes(1)
    expect(useBackgroundTaskStore.getState().tasks['video-one']).toMatchObject({
      status: 'completed',
      progress: 1,
      resultUrl: 'data:video/mp4;base64,AAAA',
    })
    expect(useBackgroundTaskStore.getState().activePolls['video-one']).toBeUndefined()
  })

  it('normalizes provider progress and schedules the next processing check', async () => {
    vi.mocked(veniceFetch).mockResolvedValue({
      data: { status: 'PROCESSING', progress: 50 },
      headers: { 'content-type': 'application/json' },
    } as never)

    useBackgroundTaskStore.getState().registerQueueTask('video-two', 'video', 'queue-two', { model: 'model-two' })
    await vi.advanceTimersByTimeAsync(0)

    expect(useBackgroundTaskStore.getState().tasks['video-two']).toMatchObject({
      status: 'processing',
      progress: 0.5,
    })
    expect(useBackgroundTaskStore.getState().activePolls['video-two']).toBeDefined()
  })

  it('stops honestly when the polling lifetime is exhausted and can resume', async () => {
    vi.mocked(veniceFetch).mockResolvedValue({
      data: { status: 'PROCESSING' },
      headers: { 'content-type': 'application/json' },
    } as never)

    useBackgroundTaskStore.getState().registerQueueTask('video-three', 'video', 'queue-three')
    vi.setSystemTime(new Date('2026-07-11T21:05:01Z'))
    await vi.advanceTimersByTimeAsync(0)

    expect(useBackgroundTaskStore.getState().tasks['video-three']).toMatchObject({
      status: 'timeout',
      error: 'Status checks stopped. Resume checking or try again.',
    })
    expect(useBackgroundTaskStore.getState().activePolls['video-three']).toBeUndefined()

    useBackgroundTaskStore.getState().retryTask('video-three')
    expect(useBackgroundTaskStore.getState().tasks['video-three']).toMatchObject({ status: 'queued' })
    expect(useBackgroundTaskStore.getState().activePolls['video-three']).toBeDefined()
  })

  it('uses retry-after for retryable polling failures', async () => {
    vi.mocked(veniceFetch)
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 429, headers: { 'retry-after': '10' } }))
      .mockResolvedValueOnce({
        data: { dataUrl: 'data:video/mp4;base64,BBBB' },
        headers: { 'content-type': 'video/mp4' },
      } as never)

    useBackgroundTaskStore.getState().registerQueueTask('video-four', 'video', 'queue-four', { model: 'model-four' })
    await vi.advanceTimersByTimeAsync(0)
    expect(veniceFetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(9_999)
    expect(veniceFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(veniceFetch).toHaveBeenCalledTimes(2)
    expect(useBackgroundTaskStore.getState().tasks['video-four'].status).toBe('completed')
  })

  it('keeps polling when the provider cannot cancel a paid task', async () => {
    vi.mocked(veniceFetch).mockResolvedValue({
      data: { status: 'PROCESSING', progress: 25 },
      headers: { 'content-type': 'application/json' },
    } as never)

    useBackgroundTaskStore.getState().registerQueueTask('video-five', 'video', 'queue-five', { model: 'model-five' })
    await vi.advanceTimersByTimeAsync(0)

    useBackgroundTaskStore.getState().cancelTask('video-five')

    expect(useBackgroundTaskStore.getState().tasks['video-five']).toMatchObject({
      status: 'processing',
      error: 'Provider cancellation is unavailable; generation is still running.',
      metadata: { cancellationUnsupported: true },
    })
    expect(useBackgroundTaskStore.getState().activePolls['video-five']).toBeDefined()
  })
})
