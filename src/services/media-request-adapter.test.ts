import { describe, expect, it } from 'vitest'
import {
  buildAudioRetrieveRequest,
  buildBackgroundRemoveRequest,
  buildImageEditRequest,
  buildImageUpscaleRequest,
  buildVideoRetrieveRequest,
  inspectImageInput,
  normalizeImageInput,
  validateImageBlob,
} from './media-request-adapter'

function png(width: number, height: number): string {
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
  ])
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`
}

const PNG = png(512, 512)
const PNG_BASE64 = PNG.split(',')[1]

describe('media request adapter', () => {
  it('builds canonical edit requests without legacy keys', () => {
    const request = buildImageEditRequest({ image: PNG, prompt: '  recolor  ', model: 'flux-2-max-edit' })
    expect(request).toEqual({ image: PNG_BASE64, prompt: 'recolor', model: 'flux-2-max-edit' })
    expect(request).not.toHaveProperty('return_binary')
    expect(request).not.toHaveProperty('modelId')
  })

  it('builds canonical upscale requests and clamps creativity', () => {
    const request = buildImageUpscaleRequest({ image: PNG, scale: 4, creativity: 1 })
    expect(request).toEqual({ image: PNG_BASE64, scale: 4, creativity: 0.02 })
    expect(request).not.toHaveProperty('return_binary')
    expect(request).not.toHaveProperty('enhance')
    expect(request).not.toHaveProperty('enhanceCreativity')
    expect(request).not.toHaveProperty('enhancePrompt')
    expect(request).not.toHaveProperty('replication')
  })

  it('routes background-removal URLs through image_url', () => {
    expect(buildBackgroundRemoveRequest('https://example.com/a.png')).toEqual({ image_url: 'https://example.com/a.png' })
    expect(buildBackgroundRemoveRequest(PNG)).toEqual({ image: PNG_BASE64 })
  })

  it('rejects object and filesystem URLs', () => {
    expect(() => normalizeImageInput('blob:https://example.com/id')).toThrow(/cannot be sent/i)
    expect(() => normalizeImageInput('file:///tmp/a.png')).toThrow(/cannot be sent/i)
  })

  it('decodes safe metadata diagnostics without retaining source content', () => {
    expect(inspectImageInput(PNG, ['scale', 'image'], 4)).toEqual({
      kind: 'data-url',
      mimeType: 'image/png',
      byteCount: 24,
      width: 512,
      height: 512,
      pixelCount: 262144,
      projectedWidth: 2048,
      projectedHeight: 2048,
      projectedPixelCount: 4194304,
      requestKeys: ['image', 'scale'],
    })
  })

  it('blocks undersized and oversized upscale requests before submission', () => {
    expect(() => buildImageUpscaleRequest({ image: png(128, 128), scale: 2 })).toThrow(/at least 65,536 pixels/i)
    expect(() => buildImageUpscaleRequest({ image: png(2048, 2048), scale: 4 })).toThrow(/exceeds the 16,777,216-pixel/i)
    expect(() => buildImageUpscaleRequest({ image: 'https://example.com/a.png', scale: 2 })).toThrow(/dimensions can be validated/i)
  })

  it('rejects MIME spoofing and invalid embedded image bytes', () => {
    expect(() => inspectImageInput(`data:image/jpeg;base64,${PNG_BASE64}`)).toThrow(/does not match/i)
    expect(() => inspectImageInput('data:image/png;base64,RkFLRQ==')).toThrow(/not a valid PNG/i)
  })

  it('builds model-bound audio and video retrieve payloads', () => {
    expect(buildAudioRetrieveRequest('stable-audio', 'q1')).toEqual({ model: 'stable-audio', queue_id: 'q1', delete_media_on_completion: false })
    expect(buildVideoRetrieveRequest('video-model', 'q2')).toEqual({ model: 'video-model', queue_id: 'q2', delete_media_on_completion: false })
  })

  it('rejects empty and wrongly typed image blobs', () => {
    expect(() => validateImageBlob(new Blob([], { type: 'image/png' }))).toThrow(/empty/i)
    expect(() => validateImageBlob(new Blob(['x'], { type: 'application/json' }))).toThrow(/unsupported/i)
  })
})
