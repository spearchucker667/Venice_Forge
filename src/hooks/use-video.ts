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
        setError('Generation took too long. Cancel and try again, or check your Venice dashboard.')
        setStatus('failed')
        return
      }
      try {
        const result = await venice<VideoRetrieveResponse>('/video/retrieve', {
          method: 'POST',
          body: JSON.stringify({ id: requestIdRef.current }),
        })
        if (token !== generationTokenRef.current) return
        setStatus(result.status)
        if (result.status === 'completed' && result.video_url) {
          setVideoUrl(result.video_url)
          stopPolling()
        } else if (result.status === 'failed') {
          setError(result.error ?? 'Video generation failed')
          stopPolling()
        }
      } catch (err) {
        if (token !== generationTokenRef.current) return
        // Transient failure — keep polling unless we've burned through too many attempts.
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          setError(err instanceof Error ? err.message : 'Polling failed')
          stopPolling()
        }
      } finally {
        isPollingRef.current = false
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling])

  const queueMutation = useMutation({
    mutationFn: (req: VideoQueueRequest) =>
      venice<VideoQueueResponse>('/video/queue', {
        method: 'POST',
        body: JSON.stringify(req),
      }),
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
      setError(err instanceof Error ? err.message : 'Queue failed')
      setStatus('failed')
    },
  })

  const cancel = useCallback(() => {
    cancelledRef.current = true
    generationTokenRef.current += 1
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
    queueId,
    lastRequest,
  }
}
