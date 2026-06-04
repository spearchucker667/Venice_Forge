import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { venice } from '../lib/venice-client'
import type { VideoQueueRequest, VideoQueueResponse, VideoRetrieveResponse } from '../types/venice'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 200 // ~10 minutes

export function useVideo() {
  const [status, setStatus] = useState<'idle' | 'queued' | 'processing' | 'completed' | 'failed'>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
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
        setError('Generation took too long. Cancel and try again, or check your Venice dashboard.')
        setStatus('failed')
        return
      }
      try {
        const result = await venice<VideoRetrieveResponse>('/video/retrieve', {
          method: 'POST',
          body: JSON.stringify({ id: requestIdRef.current }),
        })
        setStatus(result.status)
        if (result.status === 'completed' && result.video_url) {
          setVideoUrl(result.video_url)
          stopPolling()
        } else if (result.status === 'failed') {
          setError(result.error ?? 'Video generation failed')
          stopPolling()
        }
      } catch (err) {
        // Transient failure — keep polling unless we've burned through too many attempts.
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          setError(err instanceof Error ? err.message : 'Polling failed')
          stopPolling()
        }
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling])

  const queueMutation = useMutation({
    mutationFn: (req: VideoQueueRequest) =>
      venice<VideoQueueResponse>('/video/queue', {
        method: 'POST',
        body: JSON.stringify(req),
      }),
    onSuccess: (data) => {
      cancelledRef.current = false
      requestIdRef.current = data.queue_id || data.id || ''
      setStatus('queued')
      setVideoUrl(null)
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
    setVideoUrl(null)
  }, [cancel])

  return {
    queue: queueMutation.mutate,
    isQueueing: queueMutation.isPending,
    status,
    videoUrl,
    error,
    elapsedMs,
    cancel,
    reset,
  }
}
