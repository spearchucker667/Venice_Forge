import { useBackgroundTaskStore } from '../stores/background-task-store'
import { toast } from '../stores/toast-store'
import { isProviderPolledBackgroundTaskType, type BackgroundTask } from '../types/background-task'
import { useSettingsStore } from '../stores/settings-store'

/**
 * Bridges background tasks to the toast notification system.
 * Keeps a toast alive and updated as long as the task is running.
 */
let isInitialized = false

export function __resetBackgroundTaskToastBridgeForTests() {
  isInitialized = false
}

export function initBackgroundTaskToastBridge() {
  if (isInitialized) return
  isInitialized = true

  let previousTasks: Record<string, BackgroundTask> = {}

  useBackgroundTaskStore.subscribe((state) => {
    const currentTasks = state.tasks

    for (const [taskId, task] of Object.entries(currentTasks)) {
      const prevTask = previousTasks[taskId]
      const dedupeKey = `task:${taskId}`

      const typeLabel = task.type.charAt(0).toUpperCase() + task.type.slice(1)
      let title = `${typeLabel} generation`

      const providerStr = task.providerId ? ` via ${task.providerId}` : ''
      const modelStr = task.modelId ? ` (${task.modelId})` : ''
      title = `${title}${providerStr}${modelStr}`

      if (task.status === 'queued') {
        if (!prevTask || prevTask.status !== 'queued') {
          toast.upsertToast(dedupeKey, {
            variant: 'info',
            title,
            description: 'Queued...',
            persistent: true,
            actions: [
              {
                id: 'cancel',
                label: 'Cancel',
                kind: 'cancel-task',
                onClick: () => useBackgroundTaskStore.getState().cancelTask(taskId)
              }
            ]
          })
        }
      } else if (task.status === 'processing') {
        if (!prevTask || prevTask.status !== 'processing' || prevTask.progress !== task.progress || prevTask.stage !== task.stage) {
          const stageDescription = task.type === 'video' && task.stage === 'retrieving'
            ? 'Retrieving video...'
            : task.type === 'video' && task.stage === 'saving'
              ? 'Saving securely...'
              : 'Generating...'
          toast.upsertToast(dedupeKey, {
            variant: 'progress',
            title,
            description: stageDescription,
            progressRatio: task.progress,
            persistent: true,
            actions: [
              {
                id: 'cancel',
                label: 'Cancel',
                kind: 'cancel-task',
                onClick: () => useBackgroundTaskStore.getState().cancelTask(taskId)
              }
            ]
          })
        }
      } else if (task.status === 'completed') {
        // Only trigger completion toast if the task was observed transitioning to completed in this session
        if (prevTask && prevTask.status !== 'completed') {
          toast.upsertToast(dedupeKey, {
            variant: 'success',
            title,
            description: 'Completed successfully.',
            persistent: false, // auto dismiss now
            duration: 4500,
            actions: task.resultUrl ? [
              {
                id: 'open',
                label: 'Open',
                kind: 'open-task',
                onClick: () => {
                  if (task.type === 'video' || task.type === 'music') {
                    const projectId = task.metadata?.projectId as string
                    if (projectId) useSettingsStore.getState().setActiveProjectId(projectId)
                    useSettingsStore.getState().setActiveTab('media')
                  }
                  toast.dismissByKey(dedupeKey)
                }
              }
            ] : undefined
          })
        }
      } else if (task.status === 'failed' || task.status === 'timeout' || task.status === 'aborted') {
        // Only trigger failure toast if the task was observed in a different status in this session
        // (prevents pre-existing failed tasks from prior sessions popping up toasts on boot)
        if (prevTask && prevTask.status !== task.status) {
          toast.upsertToast(dedupeKey, {
            variant: 'error',
            title: `${title} failed`,
            description: task.error || 'An error occurred.',
            persistent: true,
            actions: [
              ...(isProviderPolledBackgroundTaskType(task.type) ? [{
                id: 'retry',
                label: 'Retry',
                kind: 'retry-task' as const,
                onClick: () => {
                  toast.dismissByKey(dedupeKey)
                  useBackgroundTaskStore.getState().retryTask(taskId)
                }
              }] : []),
              {
                id: 'dismiss',
                label: 'Dismiss',
                kind: 'dismiss',
                onClick: () => {
                  toast.dismissByKey(dedupeKey)
                  useBackgroundTaskStore.getState().clearTask(taskId)
                }
              }
            ]
          })
        }
      }
    }

    // Check for removed tasks to dismiss their toasts if they were still active
    for (const [taskId] of Object.entries(previousTasks)) {
      if (!currentTasks[taskId]) {
        const dedupeKey = `task:${taskId}`
        toast.dismissByKey(dedupeKey)
      }
    }

    previousTasks = currentTasks
  })
}
