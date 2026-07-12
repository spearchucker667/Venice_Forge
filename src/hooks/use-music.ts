import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { veniceFetch } from '../services/veniceClient/fetch'
import { sanitizeErrorText } from '../shared/redaction'
import type { MusicQueueRequest, MusicQueueResponse } from '../types/venice'
import { useBackgroundTaskStore } from '../stores/background-task-store'

const MAX_ERROR_LENGTH = 200
const QUEUE_TIMEOUT_MS = 30000

export const SAFE_ERROR_MESSAGES = {
  queue: 'Unable to queue music generation. Please try again.',
  polling: 'Unable to check generation status. Please try again.',
  generation: 'Music generation failed. Please try again.',
  timeout: 'Generation took too long. Cancel and try again.',
  empty: 'Music generation returned an empty audio file. Please try again.',
} as const

export function toUserFacingMusicError(value: unknown, fallback: string): string {
  const normalized = value || fallback
  const text = typeof normalized === 'string' ? normalized : normalized instanceof Error ? normalized.message : String(normalized)
  const redacted = sanitizeErrorText(text)
  return redacted.length > MAX_ERROR_LENGTH ? `${redacted.slice(0, MAX_ERROR_LENGTH)}…` : redacted
}

export function useMusic() {
  const activeMusicTask = useBackgroundTaskStore(s => {
    const tasks = Object.values(s.tasks).filter(t => t.type === 'music')
    const running = tasks.find(t => !['completed', 'failed', 'aborted', 'timeout'].includes(t.status))
    if (running) return running
    return tasks.sort((a, b) => b.createdAt - a.createdAt)[0] || null
  })

  const [localTaskId, setLocalTaskId] = useState<string | null>(null)
  const taskId = localTaskId || activeMusicTask?.id
  const task = useBackgroundTaskStore(s => taskId ? s.tasks[taskId] : null)

  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!task) {
      setElapsedMs(0)
      return
    }
    if (['completed', 'failed', 'aborted', 'timeout'].includes(task.status)) {
      setElapsedMs(Math.max(0, task.updatedAt - task.createdAt))
      return
    }
    const interval = setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - task.createdAt))
    }, 1000)
    setElapsedMs(Math.max(0, Date.now() - task.createdAt))
    return () => clearInterval(interval)
  }, [task?.status, task?.createdAt, task?.updatedAt])

  const queueMutation = useMutation({
    mutationFn: async (req: MusicQueueRequest) => {
      const result = await veniceFetch<MusicQueueResponse>('/audio/queue', {
        method: 'POST',
        body: req,
        timeoutMs: QUEUE_TIMEOUT_MS,
        retry: false,
      })
      return { data: result.data, req }
    },
    onSuccess: ({ data, req }) => {
      const qid = data.queue_id || data.id || ''
      const newTaskId = `music-${Date.now()}`
      setLocalTaskId(newTaskId)
      useBackgroundTaskStore.getState().registerQueueTask(newTaskId, 'music', qid, { request: req })
    },
    onError: (_err) => {
       // Optional: Could expose a queue error state if needed, or rely on component to show Toast
    }
  })

  const cancel = useCallback(() => {
    if (taskId) {
      useBackgroundTaskStore.getState().cancelTask(taskId)
    }
  }, [taskId])

  const reset = useCallback(() => {
    if (taskId) {
      useBackgroundTaskStore.getState().clearTask(taskId)
    }
    setLocalTaskId(null)
  }, [taskId])

  return {
    queue: queueMutation.mutate,
    isQueueing: queueMutation.isPending,
    status: task ? task.status : 'idle',
    audioUrl: task?.resultUrl ?? null,
    error: task?.error ?? (queueMutation.isError ? toUserFacingMusicError(queueMutation.error, SAFE_ERROR_MESSAGES.queue) : null),
    elapsedMs,
    cancel,
    reset,
    queueId: task?.queueId ?? null,
    lastRequest: task?.metadata?.request ?? null,
  }
}
