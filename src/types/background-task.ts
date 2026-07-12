export type BackgroundTaskStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed' | 'aborted' | 'timeout'

export type BackgroundTaskType = 'video' | 'music' | 'image' | 'research'

export interface BackgroundTask {
  id: string
  type: BackgroundTaskType
  status: BackgroundTaskStatus
  progress?: number
  error?: string
  resultUrl?: string
  createdAt: number
  updatedAt: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
  queueId?: string
}
