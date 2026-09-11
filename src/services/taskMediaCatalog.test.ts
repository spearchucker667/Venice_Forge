import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackgroundTask } from '../types/background-task'
import type { MediaItem } from '../types/media'
import { useMediaStore } from '../stores/media-store'
import { persistCompletedTaskMedia } from './taskMediaCatalog'

// VERIFY-095 regression guard: durable browser task-media insertion and idempotent reuse.
vi.mock('../stores/media-store', () => ({
  useMediaStore: { getState: vi.fn() },
}))

const task: BackgroundTask = {
  id: 'music-one',
  type: 'music',
  status: 'completed',
  queueId: 'queue-one',
  resultUrl: `venice-media://${'a'.repeat(64)}`,
  profileId: 'default',
  createdAt: 1,
  updatedAt: 2,
  metadata: { model: 'music-model', request: { model: 'music-model', prompt: 'test prompt' }, mimeType: 'audio/mpeg' },
}

describe('persistCompletedTaskMedia', () => {
  const loadById = vi.fn()
  const upsert = vi.fn()

  beforeEach(() => {
    loadById.mockReset()
    upsert.mockReset()
    vi.mocked(useMediaStore.getState).mockReset()
  })

  it('persists and returns a new browser media item', async () => {
    loadById.mockResolvedValue(null)
    upsert.mockImplementation(async (item: MediaItem) => item)
    vi.mocked(useMediaStore.getState).mockReturnValue({ items: [], loadById, upsert } as never)

    const saved = await persistCompletedTaskMedia(task)

    expect(loadById).toHaveBeenCalledWith('task-result-music-one')
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-result-music-one',
      queueId: 'queue-one',
      image: task.resultUrl,
      downloadUrl: task.resultUrl,
      mediaType: 'audio',
      operation: 'music-generate',
      mimeType: 'audio/mpeg',
    }), { attachActiveProject: true, source: 'generated' })
    expect(saved).toMatchObject({ id: 'task-result-music-one', queueId: 'queue-one' })
  })

  it('returns an existing queue result without inserting a duplicate', async () => {
    const existing = { id: 'existing-media', queueId: 'queue-one' } as MediaItem
    vi.mocked(useMediaStore.getState).mockReturnValue({ items: [existing], loadById, upsert } as never)

    const saved = await persistCompletedTaskMedia(task)

    expect(saved).toBe(existing)
    expect(loadById).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('reconciles a durable video task with safe restart metadata and media ID', async () => {
    loadById.mockResolvedValue(null)
    upsert.mockImplementation(async (item: MediaItem) => item)
    vi.mocked(useMediaStore.getState).mockReturnValue({ items: [], loadById, upsert } as never)
    const videoTask: BackgroundTask = {
      ...task,
      id: 'video-one',
      type: 'video',
      resultUrl: `venice-media://${'a'.repeat(64)}`,
      resultMediaId: 'a'.repeat(64),
      metadata: { model: 'video-model', requestedDuration: '10s', requestedResolution: '720p', requestedAspectRatio: '16:9', mimeType: 'video/mp4' },
    }
    await persistCompletedTaskMedia(videoTask)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-result-video-one',
      generatedMediaId: 'a'.repeat(64),
      duration: '10s',
      resolution: '720p',
      aspectRatio: '16:9',
    }), { attachActiveProject: true, source: 'generated' })
  })

  it('refuses https, data, and blob URLs as gallery records', async () => {
    vi.mocked(useMediaStore.getState).mockReturnValue({ items: [], loadById, upsert } as never)
    for (const resultUrl of [
      'https://signed.example/video.mp4',
      'data:video/mp4;base64,AAAA',
      'blob:http://localhost/abc',
    ]) {
      const saved = await persistCompletedTaskMedia({ ...task, id: `skip-${resultUrl.slice(0, 8)}`, resultUrl })
      expect(saved).toBeNull()
    }
    expect(upsert).not.toHaveBeenCalled()
  })
})
