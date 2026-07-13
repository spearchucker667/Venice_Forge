import { useMutation } from '@tanstack/react-query'
import { veniceBlob } from '../lib/venice-client'
import type { ImageEditRequest, ImageUpscaleRequest } from '../types/venice'
import {
  buildBackgroundRemoveRequest,
  buildImageEditRequest,
  buildImageUpscaleRequest,
  validateImageBlob,
} from '../services/media-request-adapter'

/**
 * All three return raw Blobs. Components use `useBlobUrl` to manage URL lifecycle
 * so previews are revoked on replace/unmount.
 */
export function useImageEdit() {
  return useMutation({
    mutationFn: async (req: ImageEditRequest) => validateImageBlob(await veniceBlob('/image/edit', buildImageEditRequest(req))),
  })
}

export function useImageUpscale() {
  return useMutation({
    mutationFn: async (req: ImageUpscaleRequest) => validateImageBlob(await veniceBlob('/image/upscale', buildImageUpscaleRequest(req))),
  })
}

export function useBackgroundRemove() {
  return useMutation({
    mutationFn: async (image: string) => validateImageBlob(
      await veniceBlob('/image/background-remove', buildBackgroundRemoveRequest(image)),
      'image/png',
    ),
  })
}
