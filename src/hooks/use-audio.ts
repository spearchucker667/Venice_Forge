import { useMutation } from '@tanstack/react-query'
import { veniceBlob, veniceFormData } from '../lib/venice-client'
import type { TTSRequest } from '../types/venice'

/**
 * TTS returns a Blob; the *caller* owns the lifecycle of any object URL it
 * creates from that blob. Use `useBlobUrl` in the consuming component.
 */
export function useTTS() {
  return useMutation({
    mutationFn: (req: TTSRequest) => veniceBlob('/audio/speech', req),
  })
}

export function useTranscription() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('model', 'whisper-large-v3')
      return veniceFormData<{ text: string }>('/audio/transcriptions', formData)
    },
  })
}
