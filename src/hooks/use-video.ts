import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { veniceFetch } from '../services/veniceClient/fetch'
import { sanitizeErrorText } from '../shared/redaction'
import type { VideoQueueRequest, VideoQueueResponse, VideoRetrieveResponse } from '../types/venice'
import { useInspectorStore } from '../stores/inspector-store'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 200 // upper bound on poll iterations
const MAX_ERROR_LENGTH = 200
const QUEUE_TIMEOUT_MS = 120000
const POLL_TIMEOUT_MS = 15000
// Overall deadline from queue success to completion (2 minutes including queue + poll).
// Replaces the previous implicit ~10-minute budget driven by MAX_ATTEMPTS so calls
// cannot quietly consume ten minutes of credits on a stuck Venice job.
const MAX_GENERATION_MS = 120000

/**
 * Sanitizes a raw provider or polling error into a safe UI string.
 * Secrets (API keys, bearer tokens) are redacted and the result is capped
 * so the UI never surfaces raw exception text, paths, or oversized payloads.
 */
/** @internal exported for testing */
export function toUserFacingVideoError(value: unknown, fallback: string): string {
  const normalized = value || fallback
  const text = typeof normalized === 'string' ? normalized : normalized instanceof Error ? normalized.message : String(normalized)
  const redacted = sanitizeErrorText(text)
  return redacted.length > MAX_ERROR_LENGTH ? `${redacted.slice(0, MAX_ERROR_LENGTH)}…` : redacted
}

export function useVideo() {
  const [status, setStatus] = useState<'idle' | 'queued' | 'processing' | 'completed' | 'failed'>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [progress, setProgress] = useState<number | null>(null)
  const [queueId, setQueueId] = useState<string | null>(null)
  const [lastRequest, setLastRequest] = useState<VideoQueueRequest | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const requestIdRef = useRef<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const attemptsRef = useRef(0)
  const cancelledRef = useRef(false)
  const isPollingRef = useRef(false)
  const generationTokenRef = useRef(0)
  const abortControllerRef = useRef<AbortController>(new AbortController())
  // Tracks the most recent /video/queue inspector log so cancel() and the
  // MAX_GENERATION_MS deadline can mark it `aborted` even when no log
  // update has been written yet (cancel between polls, or overage before
  // the first poll result returns).
  const currentLogIdRef = useRef<string | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = undefined }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = undefined }
    isPollingRef.current = false
  }, [])

  useEffect(() => () => {
    stopPolling()
    abortControllerRef.current.abort()
    const logId = currentLogIdRef.current
    if (logId) {
      try {
        useInspectorStore.getState().updateLog(logId, {
          callOutcome: 'aborted',
          errorClass: 'aborted',
          error: 'Component unmounted',
        })
      } catch {
        /* inspector store is best effort */
      }
      currentLogIdRef.current = null
    }
  }, [stopPolling])

  /**
   * Marks the in-flight /video/queue log as aborted by the user or on unmount.
   * Distinct from timeout: emit `errorClass: 'aborted'` so the inspector UI
   * and audit counters can separate user-driven cancellations from provider
   * timeouts. No-op if no current log is tracked.
   */
  const markGenerationAborted = useCallback((reason: string) => {
    const logId = currentLogIdRef.current
    if (!logId) return
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
    useInspectorStore.getState().updateLog(logId, {
      callOutcome: 'aborted',
      errorClass: 'aborted',
      error: reason,
      durationMs,
    })
    currentLogIdRef.current = null
  }, [])

  /**
   * Marks the in-flight /video/queue log as timed out (overall wall-clock
   * deadline, MAX_ATTEMPTS overage, or grouped provider stall). Classified
   * as `callOutcome: 'timeout'` + `errorClass: 'timeout'` so cancel-vs-timeout
   * is distinguishable in the inspector and the `timeout` filter chip works
   * correctly.
   */
  const markGenerationTimedOut = useCallback((reason: string) => {
    const logId = currentLogIdRef.current
    if (!logId) return
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
    useInspectorStore.getState().updateLog(logId, {
      callOutcome: 'timeout',
      errorClass: 'timeout',
      error: reason,
      durationMs,
    })
    currentLogIdRef.current = null
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    generationTokenRef.current += 1
    const token = generationTokenRef.current
    attemptsRef.current = 0
    startedAtRef.current = Date.now()
    setProgress(null)
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
      // Overall deadline from queue success — replaces the ~10-minute budget.
      if (startedAtRef.current && Date.now() - startedAtRef.current > MAX_GENERATION_MS) {
        capTimeout('Video generation exceeded the 2-minute budget. Cancel and try again.')
        return
      }
      if (attemptsRef.current > MAX_ATTEMPTS) {
        capTimeout('Generation took too long. Cancel and try again, or check your Venice dashboard.')
        return
      }
      try {
        const result = await veniceFetch<VideoRetrieveResponse>('/video/retrieve', {
          method: 'POST',
          body: { id: requestIdRef.current },
          signal,
          timeoutMs: POLL_TIMEOUT_MS,
          retry: false,
        })
        if (token !== generationTokenRef.current) return
        setStatus(result.data.status)
        if (result.data.progress !== undefined) setProgress(result.data.progress)
        if (result.data.status === 'completed' && result.data.video_url) {
          setVideoUrl(result.data.video_url)
          stopPolling()
          // Mark the queue log successful so the Traffic Inspector entry stops
          // appearing as "in-progress" once the result lands.
          const logId = currentLogIdRef.current
          if (logId) {
            const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
            useInspectorStore.getState().updateLog(logId, {
              callOutcome: 'success',
              status: 200,
              durationMs,
            })
            currentLogIdRef.current = null
          }
        } else if (result.data.status === 'failed') {
          setError(toUserFacingVideoError(result.data.error, 'Video generation failed'))
          stopPolling()
          const logId = currentLogIdRef.current
          if (logId) {
            const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined
            useInspectorStore.getState().updateLog(logId, {
              callOutcome: 'error',
              errorClass: 'server',
              error: toUserFacingVideoError(result.data.error, 'Video generation failed'),
              durationMs,
            })
            currentLogIdRef.current = null
          }
        }
      } catch (err) {
        if (token !== generationTokenRef.current) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          capTimeout('Generation took too long. Cancel and try again, or check your Venice dashboard.')
          return
        }
        if (startedAtRef.current && Date.now() - startedAtRef.current > MAX_GENERATION_MS) {
          capTimeout('Video generation exceeded the 2-minute budget. Cancel and try again.')
          return
        }
      } finally {
        isPollingRef.current = false
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling, markGenerationAborted, markGenerationTimedOut])

  const queueMutation = useMutation({
    mutationFn: async (req: VideoQueueRequest) => {
      abortControllerRef.current.abort()
      abortControllerRef.current = new AbortController()
      // veniceFetch already emits a /video/queue inspector log; capture its
      // id via `registerLogId` so cancel / timeout / completion handlers can
      // mark the SAME entry instead of creating a duplicate.
      currentLogIdRef.current = null
      const result = await veniceFetch<VideoQueueResponse>('/video/queue', {
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
      setVideoUrl(null)
      setError(null)
      startPolling()
    },
    onError: (err) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const logId = currentLogIdRef.current
      if (logId) {
        useInspectorStore.getState().updateLog(logId, {
          callOutcome: 'error',
          errorClass: 'client',
          error: toUserFacingVideoError(err, 'Queue failed'),
        })
        currentLogIdRef.current = null
      }
      setError(toUserFacingVideoError(err, 'Queue failed'))
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
    setVideoUrl(null)
  }, [cancel])

  return {
    progress,
    queue: queueMutation.mutate,
    isQueueing: queueMutation.isPending,
    status,
    videoUrl,
    error,
    elapsedMs,
    cancel,
    reset,
    queueId,
    lastRequest,
  }
}
