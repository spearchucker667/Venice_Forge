import type { ChatCompletionChunk } from '../types/venice'

export interface ParseOptions {
  signal?: AbortSignal
}

/**
 * SSE parser for Venice chat completion streams.
 * Honors AbortSignal, handles CRLF, multi-line `data:` continuation, and
 * tolerates malformed JSON chunks.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  opts: ParseOptions = {},
): AsyncGenerator<ChatCompletionChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let buffer = ''

  const onAbort = () => {
    try { void reader.cancel() } catch { /* noop */ }
  }
  if (opts.signal) {
    if (opts.signal.aborted) {
      onAbort()
      reader.releaseLock()
      return
    }
    opts.signal.addEventListener('abort', onAbort)
  }

  try {
    while (true) {
      if (opts.signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE event boundary is a blank line. Normalize CRLF first.
      const normalized = buffer.replace(/\r\n/g, '\n')
      const events = normalized.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events) {
        // An event is composed of one or more `field: value` lines.
        // We care about `data:` lines; concatenate multiple `data:` lines per spec.
        const dataLines: string[] = []
        for (const rawLine of event.split('\n')) {
          if (!rawLine || rawLine.startsWith(':')) continue
          if (rawLine.startsWith('data:')) {
            // Per spec: strip a single leading space after the colon.
            const v = rawLine.slice(5)
            dataLines.push(v.startsWith(' ') ? v.slice(1) : v)
          }
        }
        if (dataLines.length === 0) continue
        const payload = dataLines.join('\n')
        if (payload === '[DONE]') return
        try {
          yield JSON.parse(payload) as ChatCompletionChunk
        } catch {
          // Tolerate malformed chunks rather than killing the stream.
        }
      }
    }
  } finally {
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
    try { reader.releaseLock() } catch { /* noop */ }
  }
}
