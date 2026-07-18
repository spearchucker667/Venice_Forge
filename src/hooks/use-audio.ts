import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import { veniceBlob, veniceFormData } from '../lib/venice-client'
import {
  buildTranscriptionFormData,
  TranscriptionInputError,
} from '../services/veniceClient/transcription'
import type { TTSRequest } from '../types/venice'

const TTS_TIMEOUT_MS = 60000

export const SAFE_AUDIO_ERRORS = {
  empty: 'Audio response was empty. Please try again.',
  timeout: 'Speech generation timed out. Please try again.',
} as const

/**
 * Ensures a non-empty TTS blob is returned and preserves the provider MIME
 * type when present. Only fixes the type when the provider omitted it and
 * the request format gives us a reasonable fallback.
 */
function ensureValidAudioBlob(blob: Blob, format?: string): Blob {
  if (blob.size === 0) {
    throw new Error(SAFE_AUDIO_ERRORS.empty)
  }
  if (!blob.type && format) {
    return new Blob([blob], { type: `audio/${format}` })
  }
  return blob
}

/**
 * TTS returns a Blob; the hook validates the response, rejects empty bodies,
 * preserves the provider MIME type, and enforces a client-side timeout.
 * The caller still owns the lifecycle of any object URL it creates from the
 * blob — use `useBlobUrl` in the consuming component.
 */
export function useTTS() {
  const abortRef = useRef<AbortController | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTtsTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const mutation = useMutation({
    mutationFn: async (req: TTSRequest) => {
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      timeoutRef.current = setTimeout(() => {
        abortRef.current?.abort()
      }, TTS_TIMEOUT_MS)
      try {
        const blob = await veniceBlob('/audio/speech', req, { signal: abortRef.current.signal })
        return ensureValidAudioBlob(blob, req.response_format)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error(SAFE_AUDIO_ERRORS.timeout)
        }
        throw err
      } finally {
        clearTtsTimeout()
      }
    },
  })

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    clearTtsTimeout()
  }, [clearTtsTimeout])

  return {
    ...mutation,
    cancel,
  }
}

export function useTranscription() {
  return useMutation({
    mutationFn: (file: File) => {
      try {
        const formData = buildTranscriptionFormData({ file })
        return veniceFormData<{ text: string }>('/audio/transcriptions', formData)
      } catch (err) {
        if (err instanceof TranscriptionInputError) {
          throw new Error(err.message)
        }
        throw err
      }
    },
  })
}
