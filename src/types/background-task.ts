import { redactSecrets } from '../shared/redaction'

export type BackgroundTaskStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed' | 'aborted' | 'timeout'

export type BackgroundTaskType = 'video' | 'music' | 'image' | 'research' | 'document'

export interface BackgroundTask {
  id: string
  type: BackgroundTaskType
  status: BackgroundTaskStatus
  /** Inclusive progress ratio in the range 0..1. */
  progress?: number
  error?: string
  resultUrl?: string
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
  queueId?: string
}

export interface PersistedBackgroundTask {
  version: 1
  task: BackgroundTask
}

export interface BackgroundTaskCreateInput {
  id?: string
  type: BackgroundTaskType
  queueId?: string
  metadata?: Record<string, unknown>
}

export interface BackgroundTaskUpdate {
  status?: BackgroundTaskStatus
  progress?: number
  error?: string
  resultUrl?: string
  metadata?: Record<string, unknown>
}

export interface BackgroundTaskSnapshot {
  tasks: BackgroundTask[]
}

export interface BackgroundTaskIpcEnvelope {
  kind: 'snapshot' | 'created' | 'updated' | 'removed'
  tasks?: BackgroundTask[]
  taskId?: string
}

const VALID_STATUSES: BackgroundTaskStatus[] = ['idle', 'queued', 'processing', 'completed', 'failed', 'aborted', 'timeout']
const VALID_TYPES: BackgroundTaskType[] = ['video', 'music', 'image', 'research', 'document']
const VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/

function isValidTaskType(value: unknown): value is BackgroundTaskType {
  return typeof value === 'string' && VALID_TYPES.includes(value as BackgroundTaskType)
}

function isValidTaskStatus(value: unknown): value is BackgroundTaskStatus {
  return typeof value === 'string' && VALID_STATUSES.includes(value as BackgroundTaskStatus)
}

function isValidProgress(value: unknown): value is number | undefined {
  if (value === undefined) return true
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

export function isValidBackgroundTask(value: unknown): value is BackgroundTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Record<string, unknown>
  return (
    typeof task.id === 'string' && VALID_ID_RE.test(task.id) &&
    isValidTaskType(task.type) &&
    isValidTaskStatus(task.status) &&
    typeof task.createdAt === 'number' && Number.isFinite(task.createdAt) &&
    typeof task.updatedAt === 'number' && Number.isFinite(task.updatedAt) &&
    isValidProgress(task.progress) &&
    (task.error === undefined || typeof task.error === 'string') &&
    (task.resultUrl === undefined || typeof task.resultUrl === 'string') &&
    (task.queueId === undefined || typeof task.queueId === 'string') &&
    (task.metadata === undefined || (typeof task.metadata === 'object' && task.metadata !== null))
  )
}

export function sanitizeBackgroundTask(task: BackgroundTask): BackgroundTask {
  return {
    ...redactSecrets(task),
    progress: task.progress === undefined ? undefined : Math.max(0, Math.min(1, task.progress)),
    createdAt: task.createdAt,
    updatedAt: Date.now(),
  }
}

export function serializeTasks(tasks: BackgroundTask[]): string {
  const envelope: { version: 1; tasks: BackgroundTask[] } = { version: 1, tasks: tasks.map(sanitizeBackgroundTask) }
  return JSON.stringify(envelope, null, 2)
}

export function parseTasks(raw: string): BackgroundTask[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const envelope = parsed as Record<string, unknown>
  if (envelope.version !== 1) return []
  const tasks = envelope.tasks
  if (!Array.isArray(tasks)) return []
  return tasks.filter(isValidBackgroundTask)
}

export function createBackgroundTask(input: BackgroundTaskCreateInput): BackgroundTask {
  const now = Date.now()
  const id = input.id && VALID_ID_RE.test(input.id) ? input.id : `task-${crypto.randomUUID()}`
  return {
    id,
    type: input.type,
    status: 'queued',
    queueId: input.queueId,
    metadata: input.metadata ? redactSecrets(input.metadata) : undefined,
    createdAt: now,
    updatedAt: now,
  }
}
