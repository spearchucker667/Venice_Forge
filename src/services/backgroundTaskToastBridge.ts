import { useBackgroundTaskStore } from '../stores/background-task-store'
import { toast } from '../stores/toast-store'
import { BackgroundTask } from '../types/background-task'
import { useSettingsStore } from '../stores/settings-store'

/**
 * Bridges background tasks to the toast notification system.
 * Keeps a toast alive and updated as long as the task is running.
 */
let isInitialized = false

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
      const title = `${typeLabel} generation`

      if (task.status === 'queued') {
        if (!prevTask || prevTask.status !== 'queued') {
          toast.upsertToast(dedupeKey, { variant: 'info', title, description: 'Queued...', persistent: true })
        }
      } else if (task.status === 'processing') {
        if (!prevTask || prevTask.status !== 'processing' || prevTask.progress !== task.progress) {
          toast.upsertToast(dedupeKey, {
            variant: 'progress', // Wait, do we have progress variant? Yes, I added 'progress' to toaster.tsx
            title,
            description: 'Generating...',
            progressRatio: task.progress,
            persistent: true,
          })
        }
      } else if (task.status === 'completed') {
        if (!prevTask || prevTask.status !== 'completed') {
          toast.upsertToast(dedupeKey, {
            variant: 'success',
            title,
            description: 'Completed successfully.',
            persistent: false, // auto dismiss now
            duration: 4500,
            action: task.resultUrl ? {
              label: 'View',
              onClick: () => {
                // Determine what to do based on type
                if (task.type === 'video' || task.type === 'music') {
                  const projectId = task.metadata?.projectId as string
                  if (projectId) useSettingsStore.getState().setActiveProjectId(projectId)
                  useSettingsStore.getState().setActiveTab('media')
                }
              }
            } : undefined
          })
        }
      } else if (task.status === 'failed' || task.status === 'timeout' || task.status === 'aborted') {
        if (!prevTask || prevTask.status !== task.status) {
          toast.upsertToast(dedupeKey, {
            variant: 'error',
            title: `${title} failed`,
            description: task.error || 'An error occurred.',
            persistent: false,
            duration: 6500,
            actions: [
              {
                id: 'dismiss',
                label: 'Dismiss',
                kind: 'dismiss',
                onClick: () => toast.dismiss(toast.getToasts().find(t => t.dedupeKey === dedupeKey)?.id ?? '')
              }
            ]
          })
        }
      }
    }

    // Check for removed tasks to dismiss their toasts if they were still persistent
    for (const [taskId, prevTask] of Object.entries(previousTasks)) {
      if (!currentTasks[taskId]) {
        // If it was removed while still running, clear the toast
        if (['queued', 'processing'].includes(prevTask.status)) {
           const dedupeKey = `task:${taskId}`
           const toastId = toast.getToasts().find(t => t.dedupeKey === dedupeKey)?.id
           if (toastId) toast.dismiss(toastId)
        }
      }
    }

    previousTasks = currentTasks
  })
}
