import { create } from 'zustand'
import { veniceFetch } from '../services/veniceClient/fetch'
import { isElectron } from '../services/desktopBridge'
import { desktopBackgroundTask } from '../services/desktopBridge'
import { MUSIC_SAFE_ERROR_MESSAGES, toUserFacingMusicError, toUserFacingVideoError } from '../services/task-errors'
import { normalizeVideoRetrieveResult } from '../services/video-retrieve-normalizer'
import type { BackgroundTask, BackgroundTaskCreateInput, BackgroundTaskIpcEnvelope, BackgroundTaskStatus } from '../types/background-task'
import type { MusicRetrieveResponse } from '../types/venice'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 200
const MAX_GENERATION_MS = 300000 // 5 minutes for video models

interface BackgroundTaskState {
  tasks: Record<string, BackgroundTask>
  activePolls: Record<string, ReturnType<typeof setInterval>>
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
  applyEnvelope: (envelope: BackgroundTaskIpcEnvelope) => void
  ensureDesktopSubscription: () => Promise<void>
}

export const useBackgroundTaskStore = create<BackgroundTaskState>((set, get) => ({
  tasks: {},
  activePolls: {},
  desktopSubscribed: false,

  applyEnvelope: (envelope) => {
    set((state) => {
      if (envelope.kind === 'snapshot' && envelope.tasks) {
        const tasks = Object.fromEntries(envelope.tasks.map((t) => [t.id, t]))
        return { tasks }
      }
      if (envelope.kind === 'created' || envelope.kind === 'updated') {
        const updates: Record<string, BackgroundTask> = { ...state.tasks }
        for (const task of envelope.tasks ?? []) {
          updates[task.id] = task
        }
        return { tasks: updates }
      }
      if (envelope.kind === 'removed' && envelope.taskId) {
        const { [envelope.taskId]: _, ...rest } = state.tasks
        return { tasks: rest }
      }
      return state
    })
  },

  ensureDesktopSubscription: async () => {
    if (!isElectron() || get().desktopSubscribed) return
    set({ desktopSubscribed: true })
    try {
      const unsubscribe = desktopBackgroundTask.onUpdate((envelope) => {
        get().applyEnvelope(envelope)
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
      queueId,
      createdAt: now,
      updatedAt: now,
      metadata
    }
    set((state) => ({ tasks: { ...state.tasks, [taskId]: localTask } }))

    if (isElectron()) {
      get().ensureDesktopSubscription()
      const input: BackgroundTaskCreateInput = {
        id: taskId,
        type,
        queueId,
        metadata,
      }
      void desktopBackgroundTask.create(input)
      return
    }

    get().startPolling(taskId)
  },

  updateTask: (taskId, updates) => {
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

    if (isElectron()) {
      get().ensureDesktopSubscription()
      void desktopBackgroundTask.update(taskId, updates)
    }
  },

  cancelTask: (taskId) => {
    get().updateTask(taskId, { status: 'aborted', error: 'Cancelled by user' })
    if (isElectron()) {
      get().ensureDesktopSubscription()
      void desktopBackgroundTask.cancel(taskId)
      return
    }
    get().stopPolling(taskId)
  },

  clearTask: (taskId) => {
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
    if (!task || !task.queueId) return
    get().updateTask(taskId, { status: 'queued', error: undefined })
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

    // Sync tasks don't need polling
    if (task.type === 'image' || task.type === 'research' || task.type === 'document') return

    if (activePolls[taskId]) {
      clearInterval(activePolls[taskId])
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
      const isVideoTask = task.type === 'video'
      const effectiveTimeout = isVideoTask ? MAX_GENERATION_MS : 120000 // 2 minutes for non-video tasks
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
        if (task.type === 'video') {
          const result = await veniceFetch<unknown>('/video/retrieve', {
            method: 'POST',
            body: {
              model: task.metadata?.model || 'default-video-model',
              queue_id: task.queueId,
              delete_media_on_completion: false
            },
            retry: false,
          })

          const latestVideoTask = get().tasks[taskId]
          if (!latestVideoTask || ['completed', 'failed', 'aborted', 'timeout'].includes(latestVideoTask.status)) return
          const normalized = normalizeVideoRetrieveResult(result.data, result.headers)
          consecutiveRetryableFailures = 0
          if (normalized.kind === 'completed') {
            updateTask(taskId, { status: 'completed', progress: 1, resultUrl: normalized.mediaUrl })
            stopPolling(taskId)
          } else if (normalized.kind === 'failed') {
            updateTask(taskId, { status: 'failed', error: toUserFacingVideoError(normalized.error, 'Video generation failed') })
            stopPolling(taskId)
          } else {
            updateTask(taskId, { status: 'processing', progress: normalized.progressRatio })
            schedule(POLL_INTERVAL_MS)
          }
        } else if (task.type === 'music') {
          const result = await veniceFetch<MusicRetrieveResponse>('/audio/retrieve', {
            method: 'POST',
            body: { id: task.queueId },
            retry: false,
          })

          const s = result.data.status.toLowerCase() as BackgroundTaskStatus
          consecutiveRetryableFailures = 0
          updateTask(taskId, { status: s })

          if (s === 'completed') {
            if (!result.data.audio_url?.trim()) {
              updateTask(taskId, { status: 'failed', error: MUSIC_SAFE_ERROR_MESSAGES.empty })
            } else {
              updateTask(taskId, { resultUrl: result.data.audio_url })
            }
            stopPolling(taskId)
          } else if (s === 'failed') {
            updateTask(taskId, { error: toUserFacingMusicError(result.data.error, MUSIC_SAFE_ERROR_MESSAGES.generation) })
            stopPolling(taskId)
          } else {
            schedule(POLL_INTERVAL_MS)
          }
        }
        // TODO: implement image and research types if needed
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
        clearInterval(poll)
      }
      const { [taskId]: _, ...rest } = state.activePolls
      return { activePolls: rest }
    })
  }
}))
