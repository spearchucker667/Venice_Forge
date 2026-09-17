import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCanonicalImageGeneratePayload,
  buildCanonicalImageEditPayload,
  buildCanonicalImageMultiEditPayload,
  buildCanonicalImageUpscalePayload,
  buildCanonicalBackgroundRemovePayload,
  buildCanonicalVideoQuotePayload,
  buildCanonicalVideoQueuePayload,
  buildCanonicalVideoRetrievePayload,
  buildCanonicalAudioQuotePayload,
  buildCanonicalAudioQueuePayload,
  buildCanonicalAudioRetrievePayload,
  buildCanonicalAudioSpeechPayload,
} from '../payload-builders';

describe('Canonical Payload Builders', () => {
  describe('Image Generate', () => {
    it('builds width/height payload when aspectRatio is omitted', () => {
      const payload = buildCanonicalImageGeneratePayload({
        model: 'flux-dev',
        prompt: 'a majestic mountain landscape',
        width: 1024,
        height: 768,
        negativePrompt: 'blurry, dark',
        safeMode: false,
      });

      expect(payload.model).toBe('flux-dev');
      expect(payload.prompt).toBe('a majestic mountain landscape');
      expect(payload.negative_prompt).toBe('blurry, dark');
      expect(payload.width).toBe(1024);
      expect(payload.height).toBe(768);
      expect(payload.aspect_ratio).toBeUndefined();
      expect(payload.format).toBe('png');
      expect(payload.safe_mode).toBe(false);
    });

    it('builds aspectRatio payload and omits width/height when aspectRatio is supplied', () => {
      const payload = buildCanonicalImageGeneratePayload({
        model: 'nano-banana-pro',
        prompt: 'futuristic city skyline',
        aspectRatio: '16:9',
        resolution: '1080p',
        width: 1024, // should be dropped in favor of aspect_ratio
        height: 1024,
      });

      expect(payload.aspect_ratio).toBe('16:9');
      expect(payload.resolution).toBe('1080p');
      expect(payload.width).toBeUndefined();
      expect(payload.height).toBeUndefined();
    });

    it('clamps image dimensions to 64..1280 step 64', () => {
      const payload = buildCanonicalImageGeneratePayload({
        model: 'flux-dev',
        prompt: 'test',
        width: 50,
        height: 2000,
      });

      expect(payload.width).toBe(64);
      expect(payload.height).toBe(1280);
    });
  });

  describe('Image Edit', () => {
    it('builds canonical edit payload with model, image, prompt', () => {
      const payload = buildCanonicalImageEditPayload({
        model: 'firered-image-edit',
        image: 'data:image/png;base64,iVBORw0KGgo...',
        prompt: 'add a red hat',
        safeMode: true,
      });

      expect(payload.model).toBe('firered-image-edit');
      expect(payload.image).toBe('data:image/png;base64,iVBORw0KGgo...');
      expect(payload.prompt).toBe('add a red hat');
      expect(payload.output_format).toBe('png');
      expect(payload.safe_mode).toBe(true);
      expect((payload as unknown as Record<string, unknown>).modelId).toBeUndefined();
    });

    it('defaults model to firered-image-edit if omitted or empty', () => {
      const payload = buildCanonicalImageEditPayload({
        model: '',
        image: 'data:image/png;base64,ABC',
        prompt: 'modify background',
      });

      expect(payload.model).toBe('firered-image-edit');
    });
  });

  describe('Image Multi-Edit', () => {
    it('builds multi-edit payload with modelId and images array', () => {
      const payload = buildCanonicalImageMultiEditPayload({
        modelId: 'firered-image-edit',
        prompt: 'blend scenes',
        images: ['data:image/png;base64,IMG1', 'data:image/png;base64,IMG2'],
      });

      expect(payload.modelId).toBe('firered-image-edit');
      expect(payload.images).toEqual(['data:image/png;base64,IMG1', 'data:image/png;base64,IMG2']);
      expect(payload.prompt).toBe('blend scenes');
    });
  });

  describe('Image Upscale', () => {
    it('builds upscale payload without model parameter', () => {
      const payload = buildCanonicalImageUpscalePayload({
        image: 'data:image/png;base64,IMAGE',
        scale: 4,
        creativity: 0.015,
      });

      expect(payload.image).toBe('data:image/png;base64,IMAGE');
      expect(payload.scale).toBe(4);
      expect(payload.creativity).toBe(0.015);
      expect((payload as unknown as Record<string, unknown>).model).toBeUndefined();
    });
  });

  describe('Background Remove', () => {
    it('builds background removal payload with image or image_url', () => {
      const payloadFile = buildCanonicalBackgroundRemovePayload({
        image: 'data:image/png;base64,BASE',
      });
      expect(payloadFile).toEqual({ image: 'data:image/png;base64,BASE' });

      const payloadUrl = buildCanonicalBackgroundRemovePayload({
        imageUrl: 'https://example.com/source.png',
      });
      expect(payloadUrl).toEqual({ image_url: 'https://example.com/source.png' });
    });
  });

  describe('Video Payloads', () => {
    it('builds video quote payload with only declared QuoteVideoRequest fields', () => {
      const quote = buildCanonicalVideoQuotePayload({
        model: 'seedance-v1',
        duration: '5s',
        resolution: '720p',
        upscaleFactor: 2,
        audio: true,
        videoUrl: 'https://example.com/source.mp4',
        referenceVideoTotalDuration: 12.5,
      });

      expect(quote).toEqual({
        model: 'seedance-v1',
        duration: '5s',
        resolution: '720p',
        upscale_factor: 2,
        audio: true,
        video_url: 'https://example.com/source.mp4',
        reference_video_total_duration: 12.5,
      });
      // QuoteVideoRequest does not declare prompt or audio_prompt.
      expect((quote as unknown as Record<string, unknown>).prompt).toBeUndefined();
      expect((quote as unknown as Record<string, unknown>).audio_prompt).toBeUndefined();
    });

    it('throws when video quote duration is missing or empty', () => {
      expect(() => buildCanonicalVideoQuotePayload({ model: 'seedance-v1' } as never)).toThrow(/duration/);
      expect(() => buildCanonicalVideoQuotePayload({ model: 'seedance-v1', duration: '' })).toThrow(/duration/);
    });

    it('builds video queue payload with only declared QueueVideoRequest fields', () => {
      const queue = buildCanonicalVideoQueuePayload({
        model: 'seedance-v1',
        prompt: 'a cinematic portrait video',
        duration: '5s',
        resolution: '720p',
        upscaleFactor: 4,
        audio: false,
        imageUrl: 'https://example.com/face.png',
        referenceAudioUrls: ['https://example.com/bgm.wav'],
        consents: {
          seedance: {
            confirmed_terms_and_privacy: true,
            confirmed_legal_right: true,
            confirmed_screening_acknowledged: true,
          },
        },
      });

      expect(queue).toEqual({
        model: 'seedance-v1',
        prompt: 'a cinematic portrait video',
        duration: '5s',
        resolution: '720p',
        upscale_factor: 4,
        audio: false,
        image_url: 'https://example.com/face.png',
        reference_audio_urls: ['https://example.com/bgm.wav'],
        consents: {
          seedance: {
            confirmed_terms_and_privacy: true,
            confirmed_legal_right: true,
            confirmed_screening_acknowledged: true,
          },
        },
      });
      // QueueVideoRequest does not declare audio_prompt, seed, cfg_scale,
      // motion_score, or fps — they must never reach the wire.
      const wire = queue as unknown as Record<string, unknown>;
      for (const foreign of ['audio_prompt', 'seed', 'cfg_scale', 'motion_score', 'fps']) {
        expect(wire[foreign]).toBeUndefined();
      }
    });

    it('requires video queue duration (missing or empty validates locally)', () => {
      expect(() => buildCanonicalVideoQueuePayload({ model: 'seedance-v1', prompt: 'p' } as never)).toThrow(/duration/);
      expect(() => buildCanonicalVideoQueuePayload({ model: 'seedance-v1', prompt: 'p', duration: '  ' })).toThrow(/duration/);
    });

    it('builds video retrieve payload', () => {
      const retrieve = buildCanonicalVideoRetrievePayload({
        model: 'seedance-v1',
        queueId: 'vid-q-123',
      });

      expect(retrieve).toEqual({
        model: 'seedance-v1',
        queue_id: 'vid-q-123',
        delete_media_on_completion: false,
      });
    });

    // Phase 5 (2026-09-17) — Seedance `bitrate_mode` parity.
    // Evidence: upstream guides/media/seedance-2-0.mdx ("Output bitrate"
    // section) + guides/media/video-generation.mdx queue parameter table.
    // Values "standard" (default, same as omitting) | "high"; Seedance 2.0
    // (incl. Fast) / 2.5 only; queue-only — `/video/quote` rejects the field.
    it('emits queue bitrate_mode "high" and omits the default "standard"', () => {
      const high = buildCanonicalVideoQueuePayload({
        model: 'seedance-2-0-text-to-video-basic',
        prompt: 'a cinematic portrait video',
        duration: '5s',
        bitrateMode: 'high',
      });
      expect(high.bitrate_mode).toBe('high');

      const standard = buildCanonicalVideoQueuePayload({
        model: 'seedance-2-0-text-to-video-basic',
        prompt: 'a cinematic portrait video',
        duration: '5s',
        bitrateMode: 'standard',
      });
      expect((standard as unknown as Record<string, unknown>).bitrate_mode).toBeUndefined();
    });

    it('drops bitrate_mode values outside the documented enum', () => {
      const queue = buildCanonicalVideoQueuePayload({
        model: 'seedance-2-0-text-to-video-basic',
        prompt: 'a cinematic portrait video',
        duration: '5s',
        bitrateMode: 'lossless' as never,
      });
      expect((queue as unknown as Record<string, unknown>).bitrate_mode).toBeUndefined();
    });

    it('never places bitrate_mode on the quote payload', () => {
      const quote = buildCanonicalVideoQuotePayload({
        model: 'seedance-2-0-text-to-video-basic',
        duration: '5s',
      });
      expect((quote as unknown as Record<string, unknown>).bitrate_mode).toBeUndefined();
    });

    // Source-matched Seedance values: swagger QueueVideoRequest documents
    // `duration: "-1"/"auto"` and `aspect_ratio: "adaptive"/"auto"` as
    // requiring reference_video_urls on the queue.
    it('rejects source-matched queue duration/aspect without reference videos', () => {
      expect(() =>
        buildCanonicalVideoQueuePayload({
          model: 'seedance-2-5-reference-to-video-basic',
          prompt: 'Strictly edit <Video 1>',
          duration: 'auto',
          referenceVideoUrls: ['https://example.com/clip.mp4'],
        }),
      ).not.toThrow();
      expect(() =>
        buildCanonicalVideoQueuePayload({
          model: 'seedance-2-5-reference-to-video-basic',
          prompt: 'Strictly edit <Video 1>',
          duration: 'auto',
        }),
      ).toThrow(/referenceVideoUrls/);
      expect(() =>
        buildCanonicalVideoQueuePayload({
          model: 'seedance-2-0-reference-to-video-basic',
          prompt: 'Strictly edit <Video 1>',
          duration: '5s',
          aspectRatio: 'adaptive',
        }),
      ).toThrow(/referenceVideoUrls/);
      // Fixed values remain unaffected by the pairing requirement.
      expect(() =>
        buildCanonicalVideoQueuePayload({
          model: 'wan-2.6-text-to-video',
          prompt: 'a running horse',
          duration: '5s',
          aspectRatio: '16:9',
        }),
      ).not.toThrow();
    });

    // QuoteVideoRequest documents reference_video_total_duration as REQUIRED
    // when quoting source-matched duration or aspect ratio.
    it('rejects source-matched quote values without referenceVideoTotalDuration', () => {
      expect(() =>
        buildCanonicalVideoQuotePayload({
          model: 'seedance-2-5-reference-to-video-basic',
          duration: 'auto',
          aspectRatio: 'adaptive',
          referenceVideoTotalDuration: 5.2,
        }),
      ).not.toThrow();
      expect(() =>
        buildCanonicalVideoQuotePayload({
          model: 'seedance-2-5-reference-to-video-basic',
          duration: 'auto',
          aspectRatio: 'adaptive',
        }),
      ).toThrow(/referenceVideoTotalDuration/);
      expect(() =>
        buildCanonicalVideoQuotePayload({
          model: 'seedance-2-5-reference-to-video-basic',
          duration: '-1',
        }),
      ).toThrow(/referenceVideoTotalDuration/);
    });
  });

  // Cross-assert the source-matched wire values against the committed,
  // vendored OpenAPI spec (docs/reference/Venice_swagger_api.yaml). The
  // upstream mirror carrying the Seedance guides is a local, gitignored
  // sync, so CI-stable evidence lives in the vendored spec.
  describe('Video wire enums vs vendored swagger', () => {
    it('vendored swagger declares the source-matched queue/quote values', () => {
      const swagger = readFileSync(
        join(process.cwd(), 'docs', 'reference', 'Venice_swagger_api.yaml'),
        'utf8',
      );

      const queueSection = swagger
        .split('QueueVideoRequest:')[1]
        .split('QuoteVideoRequest:')[0];
      // QueueVideoRequest duration enum includes the source-matched tokens.
      expect(queueSection).toContain('- "-1"');
      expect(queueSection).toContain('- auto');
      // QueueVideoRequest aspect_ratio enum includes the source-matched tokens.
      expect(queueSection).toContain('- adaptive');

      const quoteSection = swagger
        .split('QuoteVideoRequest:')[1]
        .split('CompleteVideoRequest:')[0];
      // Quote schema carries reference_video_total_duration (required for
      // source-matched quotes) and declares the source-matched enums.
      expect(quoteSection).toContain('reference_video_total_duration:');
      // bitrate_mode is guide-level evidence only: neither schema declares it,
      // and the quote path must never carry it.
      expect(queueSection).not.toContain('bitrate_mode');
      expect(quoteSection).not.toContain('bitrate_mode');
    });
  });

  describe('Audio Payloads', () => {
    it('builds audio quote and queue payloads', () => {
      const quote = buildCanonicalAudioQuotePayload({
        model: 'stable-audio',
        durationSeconds: 45,
      });
      expect(quote).toEqual({ model: 'stable-audio', duration_seconds: 45 });

      const queue = buildCanonicalAudioQueuePayload({
        model: 'stable-audio',
        prompt: 'relaxing lo-fi hip hop beat',
        durationSeconds: 60,
        forceInstrumental: true,
      });
      expect(queue).toEqual({
        model: 'stable-audio',
        prompt: 'relaxing lo-fi hip hop beat',
        duration_seconds: 60,
        force_instrumental: true,
      });

      const retrieve = buildCanonicalAudioRetrievePayload({
        model: 'stable-audio',
        queueId: 'aud-q-999',
      });
      expect(retrieve).toEqual({
        model: 'stable-audio',
        queue_id: 'aud-q-999',
        delete_media_on_completion: false,
      });
    });

    it('maps logical language to the documented language_code wire field', () => {
      const queue = buildCanonicalAudioQueuePayload({
        model: 'stable-audio',
        prompt: 'une chanson française',
        language: 'fr',
      });
      expect(queue.language_code).toBe('fr');
      expect((queue as unknown as Record<string, unknown>).language).toBeUndefined();
    });

    it('builds audio speech (TTS) payload', () => {
      const tts = buildCanonicalAudioSpeechPayload({
        model: 'tts-kokoro',
        input: 'Hello Venice Forge!',
        voice: 'af_heart',
        speed: 1.1,
      });
      expect(tts).toEqual({
        model: 'tts-kokoro',
        input: 'Hello Venice Forge!',
        voice: 'af_heart',
        speed: 1.1,
        response_format: 'mp3',
      });
    });

    it('forwards an explicit resolved responseFormat to the wire payload (Phase 4C)', () => {
      // The Audio Studio selector persists a user choice, repairs it through
      // `resolveAudioResponseFormat`, and passes the resolved value here — the
      // wire payload must carry it verbatim.
      const tts = buildCanonicalAudioSpeechPayload({
        model: 'tts-kokoro',
        input: 'Format on the wire',
        responseFormat: 'wav',
      });
      expect(tts.response_format).toBe('wav');
    });

    it('defaults voice to af_sky for Kokoro models when voice is omitted', () => {
      const tts = buildCanonicalAudioSpeechPayload({
        model: 'kokoro-v1',
        input: 'Speaking via Kokoro',
      });
      expect(tts.voice).toBe('af_sky');
    });

    it('omits voice for non-Kokoro models when voice is not specified', () => {
      const tts = buildCanonicalAudioSpeechPayload({
        model: 'elevenlabs-turbo-v2',
        input: 'Speaking via ElevenLabs',
      });
      expect(tts.voice).toBeUndefined();
    });
  });
});
