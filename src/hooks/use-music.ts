import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { venice } from '../lib/venice-client'
import type { MusicQueueRequest, MusicQueueResponse, MusicRetrieveResponse } from '../types/venice'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 120 // ~6 minutes

export const SAFE_ERROR_MESSAGES = {
  queue: 'Unable to queue music generation. Please try again.',
  polling: 'Unable to check generation status. Please try again.',
  generation: 'Music generation failed. Please try again.',
  timeout: 'Generation took too long. Cancel and try again.',
} as const

export function useMusic() {
  const [status, setStatus] = useState<'idle' | 'queued' | 'processing' | 'completed' | 'failed'>('idle')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const requestIdRef = useRef<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const attemptsRef = useRef(0)
  const cancelledRef = useRef(false)
  const isPollingRef = useRef(false)
  const generationTokenRef = useRef(0)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = undefined }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = undefined }
    isPollingRef.current = false
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

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
    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) return
      if (isPollingRef.current) return
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
        const result = await venice<MusicRetrieveResponse>('/audio/retrieve', {
          method: 'POST',
          body: JSON.stringify({ id: requestIdRef.current }),
        })
        if (token !== generationTokenRef.current) return
        const s = result.status.toLowerCase() as 'queued' | 'processing' | 'completed' | 'failed'
        setStatus(s)
        if (s === 'completed' && result.audio_url) {
          setAudioUrl(result.audio_url)
          stopPolling()
        } else if (s === 'failed') {
          setError(SAFE_ERROR_MESSAGES.generation)
          stopPolling()
        }
      } catch {
        if (token !== generationTokenRef.current) return
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          setError(SAFE_ERROR_MESSAGES.polling)
          setStatus('failed')
          stopPolling()
        }
      } finally {
        isPollingRef.current = false
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling])

  const queueMutation = useMutation({
    mutationFn: (req: MusicQueueRequest) =>
      venice<MusicQueueResponse>('/audio/queue', {
        method: 'POST',
        body: JSON.stringify(req),
      }),
    onSuccess: (data) => {
      generationTokenRef.current += 1
      cancelledRef.current = false
      requestIdRef.current = data.queue_id
      setStatus('queued')
      setAudioUrl(null)
      setError(null)
      startPolling()
    },
    onError: () => {
      setError(SAFE_ERROR_MESSAGES.queue)
      setStatus('failed')
    },
  })

  const cancel = useCallback(() => {
    cancelledRef.current = true
    generationTokenRef.current += 1
    stopPolling()
    setStatus('idle')
    setError(null)
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
  }
}
