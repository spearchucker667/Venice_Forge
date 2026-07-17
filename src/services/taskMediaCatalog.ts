import type { BackgroundTask } from '../types/background-task'
import type { MediaItem } from '../types/media'
import { useMediaStore } from '../stores/media-store'

const inFlight = new Set<string>()

export async function persistCompletedTaskMedia(task: BackgroundTask): Promise<MediaItem | null> {
  if (task.status !== 'completed' || !task.resultUrl || !task.queueId) return null
  if (task.type !== 'video' && task.type !== 'music') return null
  const id = `task-result-${task.id}`
  if (inFlight.has(id)) return null
  inFlight.add(id)
  try {
    const store = useMediaStore.getState()
    const existing = store.items.find((item) => item.id === id || item.queueId === task.queueId)
      ?? await store.loadById(id)
    if (existing) return existing
    const request = task.metadata?.request && typeof task.metadata.request === 'object'
      ? task.metadata.request as Record<string, unknown>
      : {}
    const mimeType = typeof task.metadata?.mimeType === 'string'
      ? task.metadata.mimeType
      : task.resultUrl.match(/^data:([^;,]+)[;,]/i)?.[1]
    const item: MediaItem = {
      id,
      image: task.resultUrl,
      prompt: typeof request.prompt === 'string' ? request.prompt : `${task.type} generation`,
      model: typeof request.model === 'string' ? request.model : String(task.metadata?.model || task.modelId || 'venice'),
      timestamp: task.updatedAt,
      mediaType: task.type === 'video' ? 'video' : 'audio',
      operation: task.type === 'video' ? 'video-generate' : 'music-generate',
      parentId: null,
      childrenIds: [],
      tags: [],
      note: '',
      favorite: false,
      queueId: task.queueId,
      downloadUrl: task.resultUrl,
      ...(mimeType ? { mimeType } : {}),
      ...(typeof request.duration === 'string' ? { duration: request.duration } : {}),
      ...(typeof request.resolution === 'string' ? { resolution: request.resolution } : {}),
      ...(typeof request.aspect_ratio === 'string' ? { aspectRatio: request.aspect_ratio } : {}),
      ...(typeof request.audio === 'boolean' ? { audio: request.audio } : {}),
    }
    return await store.upsert(item, { attachActiveProject: true, source: 'generated' })
  } finally {
    inFlight.delete(id)
  }
}
