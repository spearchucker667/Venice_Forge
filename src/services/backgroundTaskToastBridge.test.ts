import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBackgroundTaskStore } from '../stores/background-task-store'
import { toast, useToastStore } from '../stores/toast-store'
import {
  initBackgroundTaskToastBridge,
  __resetBackgroundTaskToastBridgeForTests,
} from './backgroundTaskToastBridge'
import type { BackgroundTask } from '../types/background-task'

describe('backgroundTaskToastBridge', () => {
  beforeEach(() => {
    useBackgroundTaskStore.setState({ tasks: {}, activePolls: {} })
    useToastStore.setState({ toasts: [] })
    __resetBackgroundTaskToastBridgeForTests()
  })

  afterEach(() => {
    useBackgroundTaskStore.setState({ tasks: {}, activePolls: {} })
    useToastStore.setState({ toasts: [] })
    __resetBackgroundTaskToastBridgeForTests()
  })

  it('does NOT trigger toast notifications for pre-existing failed or completed tasks on app boot', () => {
    const existingFailedTask: BackgroundTask = {
      id: 'task-failed-old',
      type: 'image',
      status: 'failed',
      error: 'VeniceAPIError: steps: Number must be less than or equal to 30',
      createdAt: 1000,
      updatedAt: 1000,
      profileId: 'default',
    }
    const existingCompletedTask: BackgroundTask = {
      id: 'task-completed-old',
      type: 'video',
      status: 'completed',
      createdAt: 1000,
      updatedAt: 1000,
      profileId: 'default',
    }

    useBackgroundTaskStore.setState({
      tasks: {
        'task-failed-old': existingFailedTask,
        'task-completed-old': existingCompletedTask,
      },
    })

    initBackgroundTaskToastBridge()

    expect(toast.getToasts()).toHaveLength(0)
  })

  it('triggers error toast when a running task fails, and clears task on Dismiss', () => {
    initBackgroundTaskToastBridge()

    const runningTask: BackgroundTask = {
      id: 'task-running',
      type: 'image',
      status: 'queued',
      createdAt: 2000,
      updatedAt: 2000,
      profileId: 'default',
    }
    useBackgroundTaskStore.setState({ tasks: { 'task-running': runningTask } })

    expect(toast.getToasts()).toHaveLength(1)
    expect(toast.getToasts()[0]?.description).toBe('Queued...')

    useBackgroundTaskStore.setState({
      tasks: {
        'task-running': { ...runningTask, status: 'processing', stage: 'generating' },
      },
    })
    expect(toast.getToasts()[0]?.description).toBe('Generating...')

    useBackgroundTaskStore.setState({
      tasks: {
        'task-running': {
          ...runningTask,
          status: 'failed',
          error: 'VeniceAPIError: steps: Number must be less than or equal to 30',
        },
      },
    })

    const errorToasts = toast.getToasts()
    expect(errorToasts).toHaveLength(1)
    expect(errorToasts[0]?.variant).toBe('error')
    expect(errorToasts[0]?.description).toBe('VeniceAPIError: steps: Number must be less than or equal to 30')

    const dismissAction = errorToasts[0]?.actions?.find((a) => a.id === 'dismiss')
    expect(dismissAction).toBeDefined()

    dismissAction?.onClick?.()

    expect(useBackgroundTaskStore.getState().tasks['task-running']).toBeUndefined()
    expect(toast.getToasts()).toHaveLength(0)
  })

  it('retries task when Retry action is clicked', () => {
    initBackgroundTaskToastBridge()

    const videoTask: BackgroundTask = {
      id: 'video-retry',
      type: 'video',
      status: 'processing',
      queueId: 'q-123',
      createdAt: 2000,
      updatedAt: 2000,
      profileId: 'default',
    }
    useBackgroundTaskStore.setState({ tasks: { 'video-retry': videoTask } })

    useBackgroundTaskStore.setState({
      tasks: {
        'video-retry': { ...videoTask, status: 'failed', error: 'Invalid request parameters' },
      },
    })

    const errorToasts = toast.getToasts()
    expect(errorToasts).toHaveLength(1)

    const retryAction = errorToasts[0]?.actions?.find((a) => a.id === 'retry')
    expect(retryAction).toBeDefined()

    retryAction?.onClick?.()

    expect(useBackgroundTaskStore.getState().tasks['video-retry']?.status).toBe('queued')
  })
})
