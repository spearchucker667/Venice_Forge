import { create } from 'zustand'
import { veniceFetch } from '../services/veniceClient/fetch'
import { isElectron } from '../services/desktopBridge'
import { desktopBackgroundTask } from '../services/desktopBridge'
import { MUSIC_SAFE_ERROR_MESSAGES, toUserFacingMusicError, toUserFacingVideoError } from '../services/task-errors'
import { normalizeVideoRetrieveResult } from '../services/video-retrieve-normalizer'
import {
  isProviderPolledBackgroundTaskType,
  type BackgroundTask,
  type BackgroundTaskCreateInput,
  type BackgroundTaskIpcEnvelope,
} from '../types/background-task'
import { getActiveProfileId } from '../services/activeProfile'
import { buildAudioRetrieveRequest, buildVideoRetrieveRequest } from '../services/media-request-adapter'
import { normalizeAudioRetrieveResponse } from '../services/audio-retrieve-normalizer'
import { persistCompletedTaskMedia } from '../services/taskMediaCatalog'
import { translateRuntime } from '../i18n/runtimeTranslator'
import { error as logError } from '../shared/logger'
import { toast } from './toast-store'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 200
const MAX_GENERATION_MS = 180000 // 3 minutes — above documented video P80 (145s)

function galleryPersistFailureTitle(): string {
  return translateRuntime(
    'runtimeGenerated.services.taskmediacatalog.notification.couldNotSaveGeneratedMedia',
    'Could not save generated media',
  )
}

function galleryPersistFailureDescription(): string {
  return translateRuntime(
    'runtimeGenerated.services.taskmediacatalog.notification.generationFinishedButGallerySaveFailed',
    'Generation finished, but the gallery record could not be saved.',
  )
}

function notifyGalleryPersistFailure(taskId: string): string {
  const title = galleryPersistFailureTitle()
  toast.upsertToast(`task:${taskId}`, {
    variant: 'error',
    title,
    description: galleryPersistFailureDescription(),
    persistent: true,
  })
  return title
}

function asAwaitingGalleryPersist(task: BackgroundTask): BackgroundTask {
  return {
    ...task,
    status: 'processing',
    stage: task.type === 'video' ? 'saving' : task.stage,
    progress: task.progress ?? 1,
  }
}

async function persistCompletedTaskOrFail(task: BackgroundTask): Promise<BackgroundTask> {
  try {
    const media = await persistCompletedTaskMedia(task)
    return media?.id ? { ...task, resultMediaId: media.id } : task
  } catch {
    logError('[background-task-store] persistCompletedTaskMedia failed', {
      taskId: task.id,
      type: task.type,
    })
    const title = notifyGalleryPersistFailure(task.id)
    return {
      ...task,
      status: 'failed',
      error: title,
      updatedAt: Date.now(),
    }
  }
}

async function persistWebCompletedMedia(
  task: BackgroundTask,
  dataUrl: string,
  objectUrl: string,
  mimeType: string,
  updateTask: (taskId: string, updates: Partial<BackgroundTask>) => void,
  stopPolling: (taskId: string) => void,
): Promise<void> {
  const metadata = { ...task.metadata, mimeType }
  let media: Awaited<ReturnType<typeof persistCompletedTaskMedia>> = null
  try {
    media = await persistCompletedTaskMedia({
      ...task,
      metadata,
      status: 'completed',
      progress: 1,
      resultUrl: dataUrl,
      updatedAt: Date.now(),
    })
  } catch {
    logError('[background-task-store] persistCompletedTaskMedia failed', {
      taskId: task.id,
      type: task.type,
    })
    const title = notifyGalleryPersistFailure(task.id)
    updateTask(task.id, {
      status: 'failed',
      error: title,
      resultUrl: objectUrl,
      metadata,
    })
    stopPolling(task.id)
    return
  }
  updateTask(task.id, {
    status: 'completed',
    progress: 1,
    resultUrl: objectUrl,
    resultMediaId: media?.id,
    metadata,
  })
  stopPolling(task.id)
}

function mergeEnvelopeTasks(
  state: Pick<BackgroundTaskState, 'tasks'>,
  envelope: BackgroundTaskIpcEnvelope,
  tasks: BackgroundTask[] | undefined,
): Pick<BackgroundTaskState, 'tasks'> | typeof state {
  const currentProfileId = getActiveProfileId()
  if (envelope.kind === 'snapshot') {
    return {
      tasks: Object.fromEntries(
        (tasks ?? [])
          .filter((task) => task.profileId === currentProfileId)
          .map((task) => [task.id, task]),
      ),
    }
  }
  if (envelope.kind === 'created' || envelope.kind === 'updated') {
    const updates: Record<string, BackgroundTask> = { ...state.tasks }
    for (const task of tasks ?? []) {
      if (task.profileId === currentProfileId || Boolean(state.tasks[task.id])) {
        updates[task.id] = task
      }
    }
    return { tasks: updates }
  }
  return state
}

let applyEnvelopeChain: Promise<void> = Promise.resolve()

function revokeObjectUrl(url: string | undefined): void {
  if (!url?.startsWith('blob:')) return
  URL.revokeObjectURL(url)
}

function createMediaObjectUrl(dataBase64: string, mimeType: string): string {
  const binary = atob(dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}

function objectUrlFromDataUrl(dataUrl: string, mimeType: string): string | null {
  if (!dataUrl.startsWith('data:')) return null
  const commaIndex = dataUrl.indexOf(',')
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : ''
  if (!base64) return null
  return createMediaObjectUrl(base64, mimeType)
}

interface BackgroundTaskState {
  tasks: Record<string, BackgroundTask>
  activePolls: Record<string, ReturnType<typeof setTimeout>>
  desktopSubscribed: boolean
  unsubscribe?: () => void

  // Actions
  registerQueueTask: (taskId: string, type: BackgroundTask['type'], queueId: string, metadata?: Record<string, unknown>) => void
  updateTask: (taskId: string, updates: Partial<BackgroundTask>) => void
  cancelTask: (taskId: string) => void
  clearTask: (taskId: string) => void
  retryTask: (taskId: string) => void

  // Internal Polling Actions
  startPolling: (taskId: string) => void
  stopPolling: (taskId: string) => void

  // Desktop sync
  applyEnvelope: (envelope: BackgroundTaskIpcEnvelope) => Promise<void>
  ensureDesktopSubscription: () => Promise<void>
}

export function selectActiveTaskCount(profileId: string) {
  return (state: Pick<BackgroundTaskState, 'tasks'>): number => Object.values(state.tasks).filter(
    (task) => task.profileId === profileId && (task.status === 'queued' || task.status === 'processing'),
  ).length
}

export const useBackgroundTaskStore = create<BackgroundTaskState>((set, get) => ({
  tasks: {},
  activePolls: {},
  desktopSubscribed: false,

  applyEnvelope: (envelope) => {
    const run = async () => {
      try {
        if (envelope.kind === 'removed' && envelope.taskId) {
          set((state) => {
            const { [envelope.taskId as string]: _, ...rest } = state.tasks
            return { tasks: rest }
          })
          return
        }

        if (envelope.kind === 'snapshot' && !envelope.tasks) return

        const incoming = envelope.tasks ?? []
        const completed = incoming.filter((task) => task.status === 'completed')
        const others = incoming.filter((task) => task.status !== 'completed')
        const placeholders = completed.map(asAwaitingGalleryPersist)
        set((state) => mergeEnvelopeTasks(state, envelope, [...others, ...placeholders]))

        if (completed.length === 0) return

        const finalized = await Promise.all(completed.map((task) => persistCompletedTaskOrFail(task)))
        const followUpKind = envelope.kind === 'snapshot' ? 'snapshot' : 'updated'
        set((state) => mergeEnvelopeTasks(
          state,
          { ...envelope, kind: followUpKind },
          followUpKind === 'snapshot' ? [...others, ...finalized] : finalized,
        ))
      } catch (error) {
        logError('[background-task-store] applyEnvelope failed', error)
      }
    }
    const queued = applyEnvelopeChain.then(run, run)
    applyEnvelopeChain = queued.then(() => undefined, () => undefined)
    return queued
  },

  ensureDesktopSubscription: async () => {
    if (!isElectron() || get().desktopSubscribed) return
    set({ desktopSubscribed: true })
    try {
      const unsubscribe = desktopBackgroundTask.onUpdate((envelope) => {
        void get().applyEnvelope(envelope)
      })
      const result = await desktopBackgroundTask.subscribe()
      if (!result.ok) {
        set({ desktopSubscribed: false })
        unsubscribe()
        return
      }
      set({ unsubscribe })
    } catch {
      set({ desktopSubscribed: false })
    }
  },

  registerQueueTask: (taskId, type, queueId, metadata) => {
    const now = Date.now()
    const localTask: BackgroundTask = {
      id: taskId,
      type,
      status: 'queued',
      stage: type === 'video' ? 'queued' : undefined,
      queueId,
      createdAt: now,
      updatedAt: now,
      profileId: getActiveProfileId(),
      metadata
    }
    set((state) => ({ tasks: { ...state.tasks, [taskId]: localTask } }))

    if (isElectron()) {
      get().ensureDesktopSubscription()
      const input: BackgroundTaskCreateInput = {
        id: taskId,
        type,
        queueId,
        profileId: getActiveProfileId(),
        metadata,
      }
      void desktopBackgroundTask.create(input)
      return
    }

    get().startPolling(taskId)
  },

  updateTask: (taskId, updates) => {
    const previousResultUrl = get().tasks[taskId]?.resultUrl
    set((state) => {
      const task = state.tasks[taskId]
      if (!task) return state
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            ...updates,
            updatedAt: Date.now()
          }
        }
      }
    })

    if (updates.resultUrl !== undefined && updates.resultUrl !== previousResultUrl) {
      revokeObjectUrl(previousResultUrl)
    }

    if (isElectron()) {
      get().ensureDesktopSubscription()
      void desktopBackgroundTask.update(taskId, updates)
    }
  },

  cancelTask: (taskId) => {
    const task = get().tasks[taskId]
    if (!task) return
    if (isProviderPolledBackgroundTaskType(task.type, task.providerId)) {
      get().updateTask(taskId, {
        status: 'aborted',
        error: 'Cancel requested (provider generation may still run)',
        metadata: { ...task.metadata, cancellationUnsupported: true },
      })
      if (isElectron()) {
        get().ensureDesktopSubscription()
        void desktopBackgroundTask.cancel(taskId)
      } else {
        get().stopPolling(taskId)
      }
      return
    }

    get().updateTask(taskId, { status: 'aborted', error: 'Cancelled by user' })
    if (isElectron()) {
      get().ensureDesktopSubscription()
      void desktopBackgroundTask.cancel(taskId)
      return
    }
    get().stopPolling(taskId)
  },

  clearTask: (taskId) => {
    revokeObjectUrl(get().tasks[taskId]?.resultUrl)
    set((state) => {
      const { [taskId]: _, ...rest } = state.tasks
      return { tasks: rest }
    })
    if (isElectron()) {
      get().ensureDesktopSubscription()
      void desktopBackgroundTask.clear(taskId)
      return
    }
    get().stopPolling(taskId)
  },

  retryTask: (taskId) => {
    const task = get().tasks[taskId]
    if (!task || !task.queueId || !isProviderPolledBackgroundTaskType(task.type, task.providerId)) return
    get().updateTask(taskId, { status: 'queued', stage: task.type === 'video' ? 'queued' : undefined, error: undefined })
    if (isElectron()) {
      get().ensureDesktopSubscription()
      void desktopBackgroundTask.retry(taskId)
      return
    }
    get().startPolling(taskId)
  },

  startPolling: (taskId) => {
    if (isElectron()) return

    const { tasks, activePolls, stopPolling, updateTask } = get()
    const task = tasks[taskId]
    if (!task || !task.queueId) return

    // Image, research, and document work is owned and completed by the
    // initiating request. Those task records are journals, not provider queues.
    if (!isProviderPolledBackgroundTaskType(task.type, task.providerId)) return

    if (activePolls[taskId]) {
      clearTimeout(activePolls[taskId])
    }

    let attempts = 0
    let consecutiveRetryableFailures = 0
    const startedAt = Date.now()
    let isPolling = false

    const capTimeout = (reason: string) => {
      stopPolling(taskId)
      updateTask(taskId, { status: 'timeout', error: reason })
    }

    const schedule = (delayMs: number) => {
      const timeout = setTimeout(runPoll, delayMs)
      set((state) => ({
        activePolls: {
          ...state.activePolls,
          [taskId]: timeout,
        },
      }))
    }

    const retryDelayMs = (error: unknown): number => {
      if (error !== null && typeof error === 'object') {
        const record = error as Record<string, unknown>
        if (typeof record.retryAfterMs === 'number' && Number.isFinite(record.retryAfterMs)) {
          return Math.min(60_000, Math.max(POLL_INTERVAL_MS, record.retryAfterMs))
        }
        const headers = record.headers
        if (headers !== null && typeof headers === 'object') {
          const retryAfter = (headers as Record<string, unknown>)['retry-after']
          if (typeof retryAfter === 'string' && /^\d+$/.test(retryAfter.trim())) {
            return Math.min(60_000, Math.max(POLL_INTERVAL_MS, Number(retryAfter) * 1000))
          }
        }
      }
      return Math.min(30_000, POLL_INTERVAL_MS * 2 ** Math.min(consecutiveRetryableFailures, 4))
    }

    const runPoll = async () => {
      if (isPolling) return

      const currentTask = get().tasks[taskId]
      if (!currentTask || ['completed', 'failed', 'aborted', 'timeout'].includes(currentTask.status)) {
        stopPolling(taskId)
        return
      }

      isPolling = true
      attempts += 1

      // Check for video model specific timeout based on model metadata
      const effectiveTimeout = MAX_GENERATION_MS
      if (Date.now() - startedAt > effectiveTimeout) {
        capTimeout('Status checks stopped. Resume checking or try again.')
        isPolling = false
        return
      }

      if (attempts > MAX_ATTEMPTS) {
        capTimeout('Generation took too long. Cancel and try again.')
        isPolling = false
        return
      }

      try {
        const requestMetadata = task.metadata?.request && typeof task.metadata.request === 'object'
          ? task.metadata.request as Record<string, unknown>
          : undefined
        const taskModel = String(task.metadata?.model || task.modelId || requestMetadata?.model || '')
        if (task.type === 'video') {
          const result = await veniceFetch<unknown>('/video/retrieve', {
            method: 'POST',
            body: buildVideoRetrieveRequest(taskModel, task.queueId!),
            retry: false,
          })

          const latestVideoTask = get().tasks[taskId]
          if (!latestVideoTask || ['completed', 'failed', 'aborted', 'timeout'].includes(latestVideoTask.status)) return
          const normalized = normalizeVideoRetrieveResult(
            result.data,
            result.headers,
            typeof task.metadata?.queueDownloadUrl === 'string' ? task.metadata.queueDownloadUrl : undefined,
          )
          consecutiveRetryableFailures = 0
          const needsBytes =
            normalized.kind === 'needs-binary' ||
            normalized.kind === 'download' ||
            (normalized.kind === 'completed' && normalized.mediaUrl.startsWith('https://'))
          if (needsBytes) {
            const binaryResult = await veniceFetch<unknown>('/video/retrieve', {
              method: 'POST',
              body: buildVideoRetrieveRequest(taskModel, task.queueId!),
              headers: { Accept: 'video/mp4' },
              retry: false,
            })
            const latestAfterBinary = get().tasks[taskId]
            if (!latestAfterBinary || ['completed', 'failed', 'aborted', 'timeout'].includes(latestAfterBinary.status)) return
            const binaryNormalized = normalizeVideoRetrieveResult(binaryResult.data, binaryResult.headers)
            const objectUrl =
              binaryNormalized.kind === 'completed'
                ? objectUrlFromDataUrl(binaryNormalized.mediaUrl, binaryNormalized.mimeType)
                : null
            if (objectUrl && binaryNormalized.kind === 'completed') {
              await persistWebCompletedMedia(
                latestAfterBinary,
                binaryNormalized.mediaUrl,
                objectUrl,
                binaryNormalized.mimeType || 'video/mp4',
                updateTask,
                stopPolling,
              )
              return
            }
            updateTask(taskId, {
              status: 'failed',
              error: toUserFacingVideoError('Video completed without a playable video response.', 'Video generation failed'),
            })
            stopPolling(taskId)
            return
          }
          if (normalized.kind === 'completed') {
            const latestCompletedVideo = get().tasks[taskId]
            if (!latestCompletedVideo || ['completed', 'failed', 'aborted', 'timeout'].includes(latestCompletedVideo.status)) return
            const objectUrl = objectUrlFromDataUrl(normalized.mediaUrl, normalized.mimeType)
            if (objectUrl) {
              await persistWebCompletedMedia(
                latestCompletedVideo,
                normalized.mediaUrl,
                objectUrl,
                normalized.mimeType,
                updateTask,
                stopPolling,
              )
            } else {
              updateTask(taskId, { status: 'completed', progress: 1, resultUrl: normalized.mediaUrl })
              stopPolling(taskId)
            }
          } else if (normalized.kind === 'failed') {
            updateTask(taskId, { status: 'failed', error: toUserFacingVideoError(normalized.error, 'Video generation failed') })
            stopPolling(taskId)
          } else {
            updateTask(taskId, { status: 'processing', progress: normalized.progressRatio })
            schedule(POLL_INTERVAL_MS)
          }
        } else if (task.type === 'music') {
          const result = await veniceFetch<unknown>('/audio/retrieve', {
            method: 'POST',
            body: buildAudioRetrieveRequest(taskModel, task.queueId!),
            retry: false,
          })
          consecutiveRetryableFailures = 0
          const normalized = normalizeAudioRetrieveResponse(result.data, result.headers)
          if (normalized.kind === 'completed') {
            const dataUrl = `data:${normalized.mimeType};base64,${normalized.dataBase64}`
            const latestMusicTask = get().tasks[taskId]
            if (!latestMusicTask || ['completed', 'failed', 'aborted', 'timeout'].includes(latestMusicTask.status)) return
            const objectUrl = createMediaObjectUrl(normalized.dataBase64, normalized.mimeType)
            await persistWebCompletedMedia(
              latestMusicTask,
              dataUrl,
              objectUrl,
              normalized.mimeType,
              updateTask,
              stopPolling,
            )
          } else if (normalized.kind === 'failed') {
            updateTask(taskId, { status: 'failed', error: toUserFacingMusicError(normalized.error, MUSIC_SAFE_ERROR_MESSAGES.generation) })
            stopPolling(taskId)
          } else {
            updateTask(taskId, { status: 'processing', progress: normalized.progressRatio })
            schedule(POLL_INTERVAL_MS)
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const latestTask = get().tasks[taskId]
        if (!latestTask || ['completed', 'failed', 'aborted', 'timeout'].includes(latestTask.status)) return
        const status = err !== null && typeof err === 'object' && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
          stopPolling(taskId)
          updateTask(taskId, { status: 'failed', error: 'Generation failed' })
          return
        }
        consecutiveRetryableFailures += 1
        schedule(retryDelayMs(err))
      } finally {
        isPolling = false
      }
    }

    schedule(0)
  },

  stopPolling: (taskId) => {
    if (isElectron()) return
    set((state) => {
      const poll = state.activePolls[taskId]
      if (poll) {
        clearTimeout(poll)
      }
      const { [taskId]: _, ...rest } = state.activePolls
      return { activePolls: rest }
    })
  }
}))
