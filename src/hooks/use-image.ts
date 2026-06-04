import { useMutation } from '@tanstack/react-query'
import { venice } from '../lib/venice-client'
import type { ImageGenerateRequest, ImageGenerateResponse } from '../types/venice'

export function useImageGenerate() {
  return useMutation({
    // Do NOT JSON.stringify here: venice() in src/lib/venice-client.ts:17
    // does `JSON.parse(body)` if the body is a string, and IPC will
    // re-stringify it. Passing the object directly avoids the round-trip
    // and prevents key-order drift from breaking signature verification.
    mutationFn: (req: ImageGenerateRequest) =>
      venice<ImageGenerateResponse>('/image/generate', {
        method: 'POST',
        body: req,
      }),
  })
}
