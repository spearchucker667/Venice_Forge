import type { BackgroundTask } from '../types/background-task'
import type { MediaItem } from '../types/media'
import { useMediaStore } from '../stores/media-store'

const inFlight = new Set<string>()

export async function persistCompletedTaskMedia(task: BackgroundTask): Promise<MediaItem | null> {
  if (task.status !== 'completed' || !task.resultUrl || !task.queueId) return null
  if (task.type !== 'video' && task.type !== 'music' && task.type !== 'image') return null
  const id = `task-result-${task.id}`
  if (inFlight.has(id)) return null
  inFlight.add(id)
  try {
    const store = useMediaStore.getState()
    const existing = store.items.find((item) => item.id === id || item.queueId === task.queueId || (task.resultMediaId && item.id === task.resultMediaId))
      ?? await store.loadById(id)
      ?? (task.resultMediaId ? await store.loadById(task.resultMediaId) : null)
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
      mediaType: task.type === 'video' ? 'video' : task.type === 'music' ? 'audio' : 'image',
      operation: task.type === 'video' ? 'video-generate' : task.type === 'music' ? 'music-generate' : 'generate',
      parentId: null,
      childrenIds: [],
      tags: [],
      note: '',
      favorite: false,
      queueId: task.queueId,
      downloadUrl: task.resultUrl,
      ...(task.resultMediaId ? { generatedMediaId: task.resultMediaId } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(typeof request.duration === 'string' || typeof task.metadata?.requestedDuration === 'string'
        ? { duration: String(request.duration ?? task.metadata?.requestedDuration) } : {}),
      ...(typeof request.resolution === 'string' || typeof task.metadata?.requestedResolution === 'string'
        ? { resolution: String(request.resolution ?? task.metadata?.requestedResolution) } : {}),
      ...(typeof request.aspect_ratio === 'string' || typeof task.metadata?.requestedAspectRatio === 'string'
        ? { aspectRatio: String(request.aspect_ratio ?? task.metadata?.requestedAspectRatio) } : {}),
      ...(typeof request.audio === 'boolean' ? { audio: request.audio } : {}),
    }
    return await store.upsert(item, { attachActiveProject: true, source: 'generated' })
  } finally {
    inFlight.delete(id)
  }
}
