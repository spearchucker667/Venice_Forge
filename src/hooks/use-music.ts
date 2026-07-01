import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { veniceFetch } from '../services/veniceClient/fetch'
import { sanitizeErrorText } from '../shared/redaction'
import type { MusicQueueRequest, MusicQueueResponse, MusicRetrieveResponse } from '../types/venice'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 120 // ~6 minutes
const MAX_ERROR_LENGTH = 200
const QUEUE_TIMEOUT_MS = 30000
const POLL_TIMEOUT_MS = 15000

export const SAFE_ERROR_MESSAGES = {
  queue: 'Unable to queue music generation. Please try again.',
  polling: 'Unable to check generation status. Please try again.',
  generation: 'Music generation failed. Please try again.',
  timeout: 'Generation took too long. Cancel and try again.',
} as const

function toUserFacingMusicError(value: unknown, fallback: string): string {
  const normalized = value || fallback
  const text = typeof normalized === 'string' ? normalized : normalized instanceof Error ? normalized.message : String(normalized)
  const redacted = sanitizeErrorText(text)
  return redacted.length > MAX_ERROR_LENGTH ? `${redacted.slice(0, MAX_ERROR_LENGTH)}…` : redacted
}

export function useMusic() {
  const [status, setStatus] = useState<'idle' | 'queued' | 'processing' | 'completed' | 'failed'>('idle')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
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

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = undefined }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = undefined }
    isPollingRef.current = false
  }, [])

  useEffect(() => () => {
    stopPolling()
    abortControllerRef.current.abort()
  }, [stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    generationTokenRef.current += 1
    const token = generationTokenRef.current
    attemptsRef.current = 0
    startedAtRef.current = Date.now()
    setElapsedMs(0)

    tickRef.current = setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current)
    }, 1000)

    isPollingRef.current = false
    const signal = abortControllerRef.current.signal
    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) return
      if (isPollingRef.current) return
      if (signal.aborted) return
      isPollingRef.current = true
      attemptsRef.current += 1
      if (attemptsRef.current > MAX_ATTEMPTS) {
        isPollingRef.current = false
        stopPolling()
        setError(SAFE_ERROR_MESSAGES.timeout)
        setStatus('failed')
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
        if (s === 'completed' && result.data.audio_url) {
          setAudioUrl(result.data.audio_url)
          stopPolling()
        } else if (s === 'failed') {
          setError(toUserFacingMusicError(result.data.error, SAFE_ERROR_MESSAGES.generation))
          stopPolling()
        }
      } catch (err) {
        if (token !== generationTokenRef.current) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          setError(toUserFacingMusicError(err, SAFE_ERROR_MESSAGES.polling))
          setStatus('failed')
          stopPolling()
        }
      } finally {
        isPollingRef.current = false
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling])

  const queueMutation = useMutation({
    mutationFn: async (req: MusicQueueRequest) => {
      abortControllerRef.current.abort()
      abortControllerRef.current = new AbortController()
      const result = await veniceFetch<MusicQueueResponse>('/audio/queue', {
        method: 'POST',
        body: req,
        signal: abortControllerRef.current.signal,
        timeoutMs: QUEUE_TIMEOUT_MS,
        retry: false,
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
      setError(toUserFacingMusicError(err, SAFE_ERROR_MESSAGES.queue))
      setStatus('failed')
    },
  })

  const cancel = useCallback(() => {
    cancelledRef.current = true
    generationTokenRef.current += 1
    abortControllerRef.current.abort()
    abortControllerRef.current = new AbortController()
    stopPolling()
    setStatus('idle')
    setError(null)
    setQueueId(null)
    setLastRequest(null)
    requestIdRef.current = null
    startedAtRef.current = null
    setElapsedMs(0)
  }, [stopPolling])

  const reset = useCallback(() => {
    cancel()
    setAudioUrl(null)
  }, [cancel])

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
