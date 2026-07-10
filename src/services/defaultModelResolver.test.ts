// VERIFY-073 regression guard: chat default-model resolver rejects
// image/audio/embedding/offline models and falls back to a text-only candidate.

import { describe, expect, it } from 'vitest'
import type { VeniceModel } from '../types/venice'
import { CONFIGURED_DEFAULT_CHAT_MODEL, resolveDefaultChatModel } from './defaultModelResolver'

function model(
  id: string,
  traits: NonNullable<VeniceModel['model_spec']>['traits'] = [],
  options: { offline?: boolean; constraints?: Record<string, unknown> } = {},
): VeniceModel {
  return {
    id,
    object: 'model',
    created: 0,
    owned_by: 'venice',
    model_spec: { traits, offline: options.offline, constraints: options.constraints },
  }
}

describe('resolveDefaultChatModel', () => {
  it('prefers provider default metadata', () => {
    expect(resolveDefaultChatModel([model('other'), model('provider-default', ['default'])])).toEqual({
      modelId: 'provider-default',
      source: 'venice-default-metadata',
    })
  })

  it('uses the configured GLM 4.6 id when available', () => {
    expect(resolveDefaultChatModel([model(CONFIGURED_DEFAULT_CHAT_MODEL), model('other')])).toEqual({
      modelId: CONFIGURED_DEFAULT_CHAT_MODEL,
      source: 'configured-default',
    })
  })

  it('falls back only to an available text-model candidate', () => {
    expect(resolveDefaultChatModel([model('known-text')])).toEqual({
      modelId: 'known-text',
      source: 'known-fallback',
    })
  })

  it('rejects offline models', () => {
    expect(
      resolveDefaultChatModel([model('offline-text', [], { offline: true }), model('online-text')]),
    ).toEqual({ modelId: 'online-text', source: 'known-fallback' })
  })

  it('rejects image models by id pattern', () => {
    expect(
      resolveDefaultChatModel([
        model('flux-dev'),
        model('stable-diffusion-xl'),
        model('text-model'),
      ]),
    ).toEqual({ modelId: 'text-model', source: 'known-fallback' })
  })

  it('rejects models with image/video/audio constraints', () => {
    const imageModel = model('image-constraints', [], {
      constraints: { aspectRatios: ['1:1'], resolutions: ['1024x1024'] },
    })
    const videoModel = model('video-constraints', [], {
      constraints: { model_type: 'text-to-video', aspect_ratios: ['16:9'] },
    })
    const chatModel = model('chat-model')
    expect(resolveDefaultChatModel([imageModel, videoModel, chatModel])).toEqual({
      modelId: 'chat-model',
      source: 'known-fallback',
    })
  })

  it('rejects audio, music, embedding, and video models by id', () => {
    expect(
      resolveDefaultChatModel([
        model('tts-kokoro'),
        model('stable-audio'),
        model('text-embedding-bge-m3'),
        model('wan-2.6-text-to-video'),
        model('chat-model'),
      ]),
    ).toEqual({ modelId: 'chat-model', source: 'known-fallback' })
  })

  it('does not reject vision-capable chat models', () => {
    expect(
      resolveDefaultChatModel([
        model('llama-3.2-11b-vision'),
        model('qwen2.5-vl-72b'),
        model('gemini-2.0-flash'),
      ]),
    ).toEqual({ modelId: 'llama-3.2-11b-vision', source: 'known-fallback' })
  })
})
