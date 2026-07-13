export type NormalizedAudioRetrieveResult =
  | { kind: 'processing'; progressRatio?: number; averageExecutionTimeMs?: number; executionDurationMs?: number }
  | { kind: 'completed'; dataBase64: string; mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/flac' }
  | { kind: 'failed'; error: string }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function normalizeAudioRetrieveResponse(
  value: unknown,
  headers: Record<string, string> = {},
): NormalizedAudioRetrieveResult {
  const data = record(value)
  if (!data) return { kind: 'failed', error: 'Audio status response was malformed.' }
  const contentType = (headers['content-type'] || headers['Content-Type'] || '').split(';')[0].trim().toLowerCase()
  const mimeType = ['audio/mpeg', 'audio/wav', 'audio/flac'].includes(contentType)
    ? contentType as 'audio/mpeg' | 'audio/wav' | 'audio/flac'
    : null
  const dataBase64 = typeof data.dataBase64 === 'string' ? data.dataBase64.trim() : ''
  const dataUrl = typeof data.dataUrl === 'string' ? data.dataUrl.trim() : ''
  if (mimeType && dataBase64) return { kind: 'completed', dataBase64, mimeType }
  if (mimeType && dataUrl.startsWith(`data:${mimeType};base64,`)) {
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1)
    return encoded ? { kind: 'completed', dataBase64: encoded, mimeType } : { kind: 'failed', error: 'Audio response was empty.' }
  }
  const status = typeof data.status === 'string' ? data.status.trim().toUpperCase() : ''
  if (status === 'PROCESSING' || status === 'QUEUED') {
    const averageExecutionTimeMs = finite(data.average_execution_time)
    const executionDurationMs = finite(data.execution_duration)
    const progressRatio = averageExecutionTimeMs && executionDurationMs !== undefined
      ? Math.min(1, Math.max(0, executionDurationMs / averageExecutionTimeMs))
      : undefined
    return { kind: 'processing', progressRatio, averageExecutionTimeMs, executionDurationMs }
  }
  return { kind: 'failed', error: 'Audio generation returned no playable audio.' }
}
