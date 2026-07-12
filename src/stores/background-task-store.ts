import { create } from 'zustand'
import { veniceFetch } from '../services/veniceClient/fetch'
import { toUserFacingVideoError } from '../hooks/use-video'
import { toUserFacingMusicError, SAFE_ERROR_MESSAGES as MUSIC_SAFE_ERROR_MESSAGES } from '../hooks/use-music'
import type { BackgroundTask, BackgroundTaskStatus } from '../types/background-task'
import type { VideoRetrieveResponse, MusicRetrieveResponse } from '../types/venice'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 200
// Increased timeout for video generation - 5 minutes for video models
const MAX_GENERATION_MS = 300000 // 5 minutes (was 2 minutes)

interface BackgroundTaskState {
  tasks: Record<string, BackgroundTask>
  activePolls: Record<string, ReturnType<typeof setInterval>>
  
  // Actions
  registerQueueTask: (taskId: string, type: BackgroundTask['type'], queueId: string, metadata?: Record<string, unknown>) => void
  updateTask: (taskId: string, updates: Partial<BackgroundTask>) => void
  cancelTask: (taskId: string) => void
  clearTask: (taskId: string) => void
  
  // Internal Polling Actions
  startPolling: (taskId: string) => void
  stopPolling: (taskId: string) => void
}

export const useBackgroundTaskStore = create<BackgroundTaskState>((set, get) => ({
  tasks: {},
  activePolls: {},

  registerQueueTask: (taskId, type, queueId, metadata) => {
    const now = Date.now()
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskId]: {
          id: taskId,
          type,
          status: 'queued',
          queueId,
          createdAt: now,
          updatedAt: now,
          metadata
        }
      }
    }))
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
  },

  cancelTask: (taskId) => {
    get().stopPolling(taskId)
    get().updateTask(taskId, { status: 'aborted', error: 'Cancelled by user' })
  },

  clearTask: (taskId) => {
    get().stopPolling(taskId)
    set((state) => {
      const { [taskId]: _, ...rest } = state.tasks
      return { tasks: rest }
    })
  },

  startPolling: (taskId) => {
    const { tasks, activePolls, stopPolling, updateTask } = get()
    const task = tasks[taskId]
    if (!task || !task.queueId) return

    // Sync tasks don't need polling
    if (task.type === 'image' || task.type === 'research') return

    if (activePolls[taskId]) {
      clearInterval(activePolls[taskId])
    }

    let attempts = 0
    const startedAt = Date.now()
    let isPolling = false
    
    const capTimeout = (reason: string) => {
      stopPolling(taskId)
      updateTask(taskId, { status: 'timeout', error: reason })
    }

    const pollInterval = setInterval(async () => {
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
        capTimeout(isVideoTask 
          ? 'Video generation is taking longer than expected. The process will continue in the background.' 
          : 'Generation exceeded budget. Cancel and try again.')
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
          const result = await veniceFetch<VideoRetrieveResponse>('/video/retrieve', {
            method: 'POST',
            body: { 
              model: task.metadata?.model || 'default-video-model', 
              queue_id: task.queueId, 
              delete_media_on_completion: false 
            },
            retry: false,
          })
          
          const s = result.data.status
          updateTask(taskId, { 
            status: s,
            progress: result.data.progress 
          })

          if (s === 'completed' && result.data.video_url) {
            updateTask(taskId, { resultUrl: result.data.video_url })
            stopPolling(taskId)
          } else if (s === 'failed') {
            updateTask(taskId, { error: toUserFacingVideoError(result.data.error, 'Video generation failed') })
            stopPolling(taskId)
          }
        } else if (task.type === 'music') {
          const result = await veniceFetch<MusicRetrieveResponse>('/audio/retrieve', {
            method: 'POST',
            body: { id: task.queueId },
            retry: false,
          })
          
          const s = result.data.status.toLowerCase() as BackgroundTaskStatus
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
          }
        }
        // TODO: implement image and research types if needed
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (err as any)?.status
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
          stopPolling(taskId)
          updateTask(taskId, { status: 'failed', error: 'Generation failed' })
          return
        }
      } finally {
        isPolling = false
      }
    }, POLL_INTERVAL_MS)

    set((state) => ({
      activePolls: {
        ...state.activePolls,
        [taskId]: pollInterval
      }
    }))
  },

  stopPolling: (taskId) => {
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
