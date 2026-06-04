import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { venice } from '../lib/venice-client'
import type { MusicQueueRequest, MusicQueueResponse, MusicRetrieveResponse } from '../types/venice'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 120 // ~6 minutes

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

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = undefined }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = undefined }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const startPolling = useCallback(() => {
    attemptsRef.current = 0
    startedAtRef.current = Date.now()
    setElapsedMs(0)

    tickRef.current = setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current)
    }, 1000)

    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) return
      attemptsRef.current += 1
      if (attemptsRef.current > MAX_ATTEMPTS) {
        stopPolling()
        setError('Generation took too long. Cancel and try again.')
        setStatus('failed')
        return
      }
      try {
        const result = await venice<MusicRetrieveResponse>('/audio/retrieve', {
          method: 'POST',
          body: JSON.stringify({ id: requestIdRef.current }),
        })
        const s = result.status.toLowerCase() as 'queued' | 'processing' | 'completed' | 'failed'
        setStatus(s)
        if (s === 'completed' && result.audio_url) {
          setAudioUrl(result.audio_url)
          stopPolling()
        } else if (s === 'failed') {
          setError(result.error ?? 'Music generation failed')
          stopPolling()
        }
      } catch (err) {
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          setError(err instanceof Error ? err.message : 'Polling failed')
          stopPolling()
        }
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
      cancelledRef.current = false
      requestIdRef.current = data.queue_id
      setStatus('queued')
      setAudioUrl(null)
      setError(null)
      startPolling()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Queue failed')
      setStatus('failed')
    },
  })

  const cancel = useCallback(() => {
    cancelledRef.current = true
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
