/** @fileoverview Pure unit tests for the mediaCapabilities helper. */

import { describe, expect, it } from 'vitest'
import { mediaCapabilities } from './mediaItem'

describe('mediaCapabilities', () => {
  it('returns all false for an unknown model id', () => {
    const caps = mediaCapabilities({ model: 'some-mystery-llm' })
    expect(caps).toEqual({ upscale: false, edit: false, video: false, vision: false })
  })

  it('detects upscale-capable models', () => {
    expect(mediaCapabilities({ model: 'topaz-image-upscale' }).upscale).toBe(true)
    expect(mediaCapabilities({ model: 'real-esrgan-anime' }).upscale).toBe(true)
    expect(mediaCapabilities({ model: 'creative-upscale-v1' }).upscale).toBe(true)
  })

  it('detects edit-capable models', () => {
    expect(mediaCapabilities({ model: 'sdxl-turbo' }).edit).toBe(true)
    expect(mediaCapabilities({ model: 'flux.1-dev' }).edit).toBe(true)
    expect(mediaCapabilities({ model: 'banana-pro' }).edit).toBe(true)
  })

  it('detects video-capable models', () => {
    expect(mediaCapabilities({ model: 'wan-2.1' }).video).toBe(true)
    expect(mediaCapabilities({ model: 'kling-v1' }).video).toBe(true)
    expect(mediaCapabilities({ model: 'topaz-video-upscale' }).video).toBe(true)
  })

  it('detects vision-capable models', () => {
    expect(mediaCapabilities({ model: 'llama-3.2-11b-vision' }).vision).toBe(true)
    expect(mediaCapabilities({ model: 'qwen2.5-vl-72b' }).vision).toBe(true)
    expect(mediaCapabilities({ model: 'gemini-2.0-flash' }).vision).toBe(true)
  })

  it('combines multiple capabilities for a single model', () => {
    // flux-1.1-pro is a known image model that supports both edit and upscale.
    const caps = mediaCapabilities({ model: 'flux-1.1-pro' })
    expect(caps.edit).toBe(true) // \bflux\b matches
    expect(caps.upscale).toBe(false) // not in the upscale allowlist
    expect(caps.video).toBe(false)
    expect(caps.vision).toBe(false)
  })

  it('handles empty / non-string model gracefully', () => {
    expect(mediaCapabilities({ model: '' })).toEqual({ upscale: false, edit: false, video: false, vision: false })
    // @ts-expect-error runtime test: missing model field
    expect(mediaCapabilities({})).toEqual({ upscale: false, edit: false, video: false, vision: false })
  })

  it('honours live `supportsVision: true` for an unknown model id', () => {
    // A future model id we have never heard of becomes vision-capable
    // when the live `/models` response says so. The static allowlist
    // and the pattern fallback do not get a chance to override the
    // live contract.
    const caps = mediaCapabilities({
      model: 'some-future-multimodal-llm',
      liveCapabilities: { supportsVision: true },
    })
    expect(caps.vision).toBe(true)
  })

  it('honours live `supportsVision: false` over a heuristic pattern match', () => {
    // "vision" in the id is a static-pattern match — but the live API
    // contract is the source of truth. A live `supportsVision: false`
    // must override the static fallback. This is the regression guard
    // for the 2026-06-08 P3 vision-list cleanup.
    const caps = mediaCapabilities({
      model: 'mock-vision-model',
      liveCapabilities: { supportsVision: false },
    })
    expect(caps.vision).toBe(false)
  })

  it('unknown model with no live metadata defaults to non-vision', () => {
    const caps = mediaCapabilities({ model: 'some-mystery-llm' })
    expect(caps.vision).toBe(false)
  })

  it('live capability object that is explicitly `null` falls back to the static list', () => {
    // Passing `null` (e.g. when the call site looked up the model and
    // could not resolve it) must not crash and must not silently drop
    // the static fallback to non-vision.
    const caps = mediaCapabilities({ model: 'llama-3.2-11b-vision', liveCapabilities: null })
    expect(caps.vision).toBe(true)
  })
})
