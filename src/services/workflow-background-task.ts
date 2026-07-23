import { useBackgroundTaskStore } from '../stores/background-task-store'
import { WorkflowExecutionError } from '../lib/workflow-errors'
import { toUserFacingVideoError } from './task-errors'

interface WorkflowVideoTaskInput {
  queueId: string
  model: string
  request: Record<string, unknown>
  queueDownloadUrl?: string
  signal?: AbortSignal
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'aborted', 'timeout'])

/**
 * Registers workflow video jobs with the same durable task owner used by Video
 * Studio, then waits for the compact persisted result URL. Raw reference media
 * is deliberately excluded from task metadata by the caller.
 */
export function awaitWorkflowVideoTask(input: WorkflowVideoTaskInput): Promise<string> {
  const taskId = `workflow-video-${crypto.randomUUID()}`
  return new Promise<string>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      unsubscribe()
      input.signal?.removeEventListener('abort', onAbort)
      callback()
    }
    const inspect = () => {
      const task = useBackgroundTaskStore.getState().tasks[taskId]
      if (!task || !TERMINAL_STATUSES.has(task.status)) return
      if (task.status === 'completed' && task.resultUrl) {
        finish(() => resolve(task.resultUrl!))
        return
      }
      const rawError = task?.error || (task?.status === 'timeout' ? 'Video generation timed out.' : 'Video generation failed.')
      const safeError = toUserFacingVideoError(rawError, 'Video generation failed.')
      finish(() => reject(new WorkflowExecutionError(safeError)))
    }
    const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')))
    const unsubscribe = useBackgroundTaskStore.subscribe(inspect)
    input.signal?.addEventListener('abort', onAbort, { once: true })

    useBackgroundTaskStore.getState().registerQueueTask(taskId, 'video', input.queueId, {
      model: input.model,
      request: input.request,
      source: 'workflow',
      ...(input.queueDownloadUrl ? { queueDownloadUrl: input.queueDownloadUrl } : {}),
    })
    inspect()
  })
}
