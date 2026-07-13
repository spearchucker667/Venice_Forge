export type NormalizedVideoRetrieveResult =
  | {
      kind: 'processing'
      progressRatio?: number
      averageExecutionTimeMs?: number
      executionDurationMs?: number
    }
  | {
      kind: 'completed'
      mediaUrl: string
      mimeType: 'video/mp4'
    }
  | {
      kind: 'download'
      downloadUrl: string
      mimeType: 'video/mp4'
    }
  | {
      kind: 'failed'
      error: string
    }

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : null
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function normalizeProgressRatio(value: unknown): number | undefined {
  const progress = finiteNumber(value)
  if (progress === undefined) return undefined
  const ratio = progress > 1 ? progress / 100 : progress
  return Math.min(1, Math.max(0, ratio))
}

export function normalizeVideoRetrieveResult(
  value: unknown,
  headers: Record<string, string> = {},
  queueDownloadUrl?: string,
): NormalizedVideoRetrieveResult {
  const data = asRecord(value)
  if (!data) return { kind: 'failed', error: 'Video status response was malformed.' }

  const legacyUrl = typeof data.video_url === 'string' ? data.video_url.trim() : ''
  const dataUrl = typeof data.dataUrl === 'string' ? data.dataUrl.trim() : ''
  const dataBase64 = typeof data.dataBase64 === 'string' ? data.dataBase64.trim() : ''
  const contentType = (headers['content-type'] || headers['Content-Type'] || '').split(';')[0].trim().toLowerCase()

  if (legacyUrl) return { kind: 'completed', mediaUrl: legacyUrl, mimeType: 'video/mp4' }
  if (dataUrl.startsWith('data:video/mp4;base64,')) {
    return { kind: 'completed', mediaUrl: dataUrl, mimeType: 'video/mp4' }
  }
  if (dataBase64 && contentType === 'video/mp4') {
    return { kind: 'completed', mediaUrl: `data:video/mp4;base64,${dataBase64}`, mimeType: 'video/mp4' }
  }

  const rawStatus = typeof data.status === 'string' ? data.status.trim().toUpperCase() : ''
  if (rawStatus === 'PROCESSING' || rawStatus === 'QUEUED') {
    const averageExecutionTimeMs = finiteNumber(data.average_execution_time)
    const executionDurationMs = finiteNumber(data.execution_duration)
    const timingRatio = averageExecutionTimeMs && executionDurationMs !== undefined
      ? normalizeProgressRatio(executionDurationMs / averageExecutionTimeMs)
      : undefined
    return {
      kind: 'processing',
      progressRatio: normalizeProgressRatio(data.progress) ?? timingRatio,
      averageExecutionTimeMs,
      executionDurationMs,
    }
  }
  if (rawStatus === 'FAILED') {
    return {
      kind: 'failed',
      error: typeof data.error === 'string' && data.error.trim()
        ? data.error.trim()
        : 'Video generation failed.',
    }
  }
  if (rawStatus === 'COMPLETED') {
    if (queueDownloadUrl?.trim()) {
      return { kind: 'download', downloadUrl: queueDownloadUrl.trim(), mimeType: 'video/mp4' }
    }
    return { kind: 'failed', error: 'Video completed without a playable video response.' }
  }
  return { kind: 'failed', error: 'Video status response was malformed.' }
}
