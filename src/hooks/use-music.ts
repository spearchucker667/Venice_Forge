import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { veniceFetch } from '../services/veniceClient/fetch'
import { sanitizeErrorText } from '../shared/redaction'
import { useInspectorStore } from '../stores/inspector-store'
import type { MusicQueueRequest, MusicQueueResponse, MusicRetrieveResponse } from '../types/venice'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 120
const MAX_ERROR_LENGTH = 200
const QUEUE_TIMEOUT_MS = 30000
const POLL_TIMEOUT_MS = 15000
// Hard wall-clock deadline matching the previous implicit ~6 minute budget
// (MAX_ATTEMPTS * POLL_INTERVAL_MS) so a stuck Venice job cannot quietly
// consume credits forever.
const MAX_GENERATION_MS = 360000

export const SAFE_ERROR_MESSAGES = {
  queue: 'Unable to queue music generation. Please try again.',
  polling: 'Unable to check generation status. Please try again.',
  generation: 'Music generation failed. Please try again.',
  timeout: 'Generation took too long. Cancel and try again.',
  empty: 'Music generation returned an empty audio file. Please try again.',
} as const

/** @internal exported for testing */
export function toUserFacingMusicError(value: unknown, fallback: string): string {
  const normalized = value || fallback
  const text = typeof normalized === 'string' ? normalized : normalized instanceof Error ? normalized.message : String(normalized)
  const redacted = sanitizeErrorText(text)
  return redacted.length > MAX_ERROR_LENGTH ? `${redacted.slice(0, MAX_ERROR_LENGTH)}…` : redacted
}

function mimeTypeFromDataUrl(url: string): string | null {
  const match = url.match(/^data:([^;]+);/)
  return match?.[1] ?? null
}

function mimeTypeForAudioUrl(url: string): string {
  return mimeTypeFromDataUrl(url) ?? 'audio/mpeg'
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binaryStr = atob(base64)
  const len = binaryStr.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType })
  return URL.createObjectURL(blob)
}

/**
 * Normalises a provider audio_url into a value suitable for an <audio> element.
 * HTTP/HTTPS URLs and existing blob URLs are returned as-is. Data URLs preserve
 * their declared MIME type. Raw base64 strings are converted to a Blob URL so
 * the lifecycle can be revoked; the caller is responsible for revoking the
 * returned object URL via `revokeAudioUrl`.
 */
function normalizeAudioUrl(url: string): { url: string; isObjectUrl: boolean } {
  if (!url) return { url, isObjectUrl: false }
  if (url.startsWith('http') || url.startsWith('blob:')) {
    return { url, isObjectUrl: url.startsWith('blob:') }
  }
  if (url.startsWith('data:')) {
    return { url, isObjectUrl: false }
  }
  const mimeType = mimeTypeForAudioUrl(url)
  const blobUrl = base64ToBlobUrl(url, mimeType)
  return { url: blobUrl, isObjectUrl: true }
}

export function useMusic() {
  const [status, setStatus] = useState<'idle' | 'queued' | 'processing' | 'completed' | 'failed'>('idle')
  const [audioUrl, setAudioUrlState] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [queueId, setQueueId] = useState<string | null>(null)
  const [lastRequest, setLastRequest] = useState<MusicQueueRequest | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const requestIdRef = useRef<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const attemptsRef = useRef(0)
  const cancelledRef = useRef(false)
  const isPollingRef = useRef(false)
  const generationTokenRef = useRef(0)
  const abortControllerRef = useRef<AbortController>(new AbortController())
  const currentLogIdRef = useRef<string | null>(null)
  const audioObjectUrlRef = useRef<string | null>(null)

  const revokeAudioUrl = useCallback(() => {
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current)
      audioObjectUrlRef.current = null
    }
  }, [])

  const setAudioUrl = useCallback((url: string | null) => {
    revokeAudioUrl()
    if (!url) {
      setAudioUrlState(null)
      return
    }
    const normalized = normalizeAudioUrl(url)
    if (normalized.isObjectUrl) {
      audioObjectUrlRef.current = normalized.url
    }
    setAudioUrlState(normalized.url)
  }, [revokeAudioUrl])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = undefined }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = undefined }
    isPollingRef.current = false
  }, [])

  const markGenerationAborted = useCallback((reason: string) => {
    const logId = currentLogIdRef.current
    if (!logId) return
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
    try {
      useInspectorStore.getState().updateLog(logId, {
        callOutcome: 'aborted',
        errorClass: 'aborted',
        error: reason,
        durationMs,
      })
    } catch {
      /* inspector store is best effort */
    }
    currentLogIdRef.current = null
  }, [])

  const markGenerationTimedOut = useCallback((reason: string) => {
    const logId = currentLogIdRef.current
    if (!logId) return
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
    try {
      useInspectorStore.getState().updateLog(logId, {
        callOutcome: 'timeout',
        errorClass: 'timeout',
        error: reason,
        durationMs,
      })
    } catch {
      /* inspector store is best effort */
    }
    currentLogIdRef.current = null
  }, [])

  useEffect(() => () => {
    stopPolling()
    abortControllerRef.current.abort()
    markGenerationAborted('Component unmounted')
    revokeAudioUrl()
  }, [stopPolling, markGenerationAborted, revokeAudioUrl])

  const startPolling = useCallback(() => {
    stopPolling()
    generationTokenRef.current += 1
    const token = generationTokenRef.current
    attemptsRef.current = 0
    startedAtRef.current = Date.now()
    setElapsedMs(0)
    const signal = abortControllerRef.current.signal

    tickRef.current = setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current)
    }, 1000)

    isPollingRef.current = false
    const capTimeout = (reason: string) => {
      if (token !== generationTokenRef.current) return
      isPollingRef.current = false
      stopPolling()
      markGenerationTimedOut(reason)
      setError(reason)
      setStatus('failed')
    }
    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) return
      if (isPollingRef.current) return
      if (signal.aborted) return
      isPollingRef.current = true
      attemptsRef.current += 1
      if (startedAtRef.current && Date.now() - startedAtRef.current > MAX_GENERATION_MS) {
        capTimeout(SAFE_ERROR_MESSAGES.timeout)
        return
      }
      if (attemptsRef.current > MAX_ATTEMPTS) {
        capTimeout(SAFE_ERROR_MESSAGES.timeout)
        return
      }
      try {
        const result = await veniceFetch<MusicRetrieveResponse>('/audio/retrieve', {
          method: 'POST',
          body: { id: requestIdRef.current },
          signal,
          timeoutMs: POLL_TIMEOUT_MS,
          retry: false,
        })
        if (token !== generationTokenRef.current) return
        const s = result.data.status.toLowerCase() as 'queued' | 'processing' | 'completed' | 'failed'
        setStatus(s)
        if (s === 'completed') {
          if (!result.data.audio_url?.trim()) {
            const msg = SAFE_ERROR_MESSAGES.empty
            setError(msg)
            setStatus('failed')
            stopPolling()
            const logId = currentLogIdRef.current
            if (logId) {
              const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
              try {
                useInspectorStore.getState().updateLog(logId, {
                  callOutcome: 'error',
                  errorClass: 'server',
                  error: msg,
                  durationMs,
                })
              } catch {
                /* inspector store is best effort */
              }
              currentLogIdRef.current = null
            }
            return
          }
          setAudioUrl(result.data.audio_url)
          stopPolling()
          const logId = currentLogIdRef.current
          if (logId) {
            const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
            try {
              useInspectorStore.getState().updateLog(logId, {
                callOutcome: 'success',
                status: 200,
                durationMs,
              })
            } catch {
              /* inspector store is best effort */
            }
            currentLogIdRef.current = null
          }
        } else if (s === 'failed') {
          const msg = toUserFacingMusicError(result.data.error, SAFE_ERROR_MESSAGES.generation)
          setError(msg)
          stopPolling()
          const logId = currentLogIdRef.current
          if (logId) {
            const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
            try {
              useInspectorStore.getState().updateLog(logId, {
                callOutcome: 'error',
                errorClass: 'server',
                error: msg,
                durationMs,
              })
            } catch {
              /* inspector store is best effort */
            }
            currentLogIdRef.current = null
          }
        }
      } catch (err) {
        if (token !== generationTokenRef.current) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          capTimeout(SAFE_ERROR_MESSAGES.polling)
          return
        }
        if (startedAtRef.current && Date.now() - startedAtRef.current > MAX_GENERATION_MS) {
          capTimeout(SAFE_ERROR_MESSAGES.timeout)
          return
        }
      } finally {
        isPollingRef.current = false
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling, markGenerationAborted, markGenerationTimedOut, setAudioUrl])

  const queueMutation = useMutation({
    mutationFn: async (req: MusicQueueRequest) => {
      abortControllerRef.current.abort()
      abortControllerRef.current = new AbortController()
      currentLogIdRef.current = null
      const result = await veniceFetch<MusicQueueResponse>('/audio/queue', {
        method: 'POST',
        body: req,
        signal: abortControllerRef.current.signal,
        timeoutMs: QUEUE_TIMEOUT_MS,
        retry: false,
        registerLogId: (logId) => {
          currentLogIdRef.current = logId
        },
      })
      return result.data
    },
    onSuccess: (data, variables) => {
      generationTokenRef.current += 1
      cancelledRef.current = false
      const id = data.queue_id || data.id || ''
      requestIdRef.current = id
      setQueueId(id)
      setLastRequest(variables)
      setStatus('queued')
      setAudioUrl(null)
      setError(null)
      startPolling()
    },
    onError: (err) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const logId = currentLogIdRef.current
      const msg = toUserFacingMusicError(err, SAFE_ERROR_MESSAGES.queue)
      if (logId) {
        try {
          useInspectorStore.getState().updateLog(logId, {
            callOutcome: 'error',
            errorClass: 'client',
            error: msg,
          })
        } catch {
          /* inspector store is best effort */
        }
        currentLogIdRef.current = null
      }
      setError(msg)
      setStatus('failed')
    },
  })

  const cancel = useCallback(() => {
    cancelledRef.current = true
    generationTokenRef.current += 1
    abortControllerRef.current.abort()
    abortControllerRef.current = new AbortController()
    stopPolling()
    markGenerationAborted('Cancelled by user')
    setStatus('idle')
    setError(null)
    setQueueId(null)
    setLastRequest(null)
    requestIdRef.current = null
    startedAtRef.current = null
    setElapsedMs(0)
  }, [stopPolling, markGenerationAborted])

  const reset = useCallback(() => {
    cancel()
    setAudioUrl(null)
  }, [cancel, setAudioUrl])

  return {
    queue: queueMutation.mutate,
    isQueueing: queueMutation.isPending,
    status,
    audioUrl,
    error,
    elapsedMs,
    cancel,
    reset,
    queueId,
    lastRequest,
  }
}
