import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { veniceFetch } from '../services/veniceClient/fetch'
import type { MusicQueueRequest, MusicQueueResponse } from '../types/venice'
import { useBackgroundTaskStore } from '../stores/background-task-store'
import { MUSIC_SAFE_ERROR_MESSAGES, toUserFacingMusicError } from '../services/task-errors'

const QUEUE_TIMEOUT_MS = 30000

export function useMusic() {
  const activeMusicTask = useBackgroundTaskStore(s => {
    const tasks = Object.values(s.tasks).filter(t => t.type === 'music')
    const running = tasks.find(t => !['completed', 'failed', 'aborted', 'timeout'].includes(t.status))
    if (running) return running
    return tasks.sort((a, b) => b.createdAt - a.createdAt)[0] || null
  })

  const [localTaskId, setLocalTaskId] = useState<string | null>(null)
  const [queueSchemaError, setQueueSchemaError] = useState<string | null>(null)
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
      const qid = (data.queue_id || data.id || '').trim()
      if (!qid) {
        setQueueSchemaError('Music queue response did not include a queue ID.')
        return
      }
      setQueueSchemaError(null)
      const newTaskId = `music-${crypto.randomUUID()}`
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
    error: task?.error ?? queueSchemaError ?? (queueMutation.isError ? toUserFacingMusicError(queueMutation.error, MUSIC_SAFE_ERROR_MESSAGES.queue) : null),
    elapsedMs,
    cancel,
    reset,
    queueId: task?.queueId ?? null,
    lastRequest: (task?.metadata?.request as MusicQueueRequest | undefined) ?? null,
  }
}
