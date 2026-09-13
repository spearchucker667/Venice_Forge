import { describe, it, expect } from 'vitest';
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
