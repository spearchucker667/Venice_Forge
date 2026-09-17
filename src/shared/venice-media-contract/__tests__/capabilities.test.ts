import { describe, it, expect } from 'vitest';
import {
  isImageEditModel,
  isImageGenerateModel,
  isVideoModel,
  isAudioMusicModel,
  isAudioTtsModel,
  resolveModelSizingMode,
  supportsVideoBitrateMode,
} from '../capabilities';

describe('Model Capabilities', () => {
  describe('Image Edit vs Image Generate', () => {
    it('identifies inpaint models from explicit type', () => {
      expect(isImageEditModel({ id: 'custom-model', type: 'inpaint' })).toBe(true);
      expect(isImageEditModel({ id: 'custom-model', model_type: 'image-edit' })).toBe(true);
    });

    it('identifies inpaint models from provider traits', () => {
      expect(isImageEditModel({ id: 'custom-model', traits: ['inpaint'] })).toBe(true);
    });

    it('identifies known edit model IDs', () => {
      expect(isImageEditModel('firered-image-edit')).toBe(true);
      expect(isImageEditModel('seedream-v5-pro-edit')).toBe(true);
      expect(isImageEditModel('qwen-edit')).toBe(true);
      expect(isImageEditModel('nano-banana-2-edit')).toBe(true);
    });

    it('does not classify general text-to-image Flux or SDXL as edit models', () => {
      expect(isImageEditModel('flux-dev')).toBe(false);
      expect(isImageEditModel('lustify-sdxl')).toBe(false);
      expect(isImageEditModel('nano-banana-pro')).toBe(false);
      expect(isImageEditModel('seedream-v5-pro')).toBe(false);
      expect(isImageEditModel({ id: 'misleading-edit-id', type: 'image' })).toBe(false);
    });

    it('correctly discriminates text-to-image models', () => {
      expect(isImageGenerateModel('flux-dev')).toBe(true);
      expect(isImageGenerateModel('firered-image-edit')).toBe(false);
    });
  });

  describe('Video and Audio Model Detection', () => {
    it('identifies video models', () => {
      expect(isVideoModel('seedance-v1')).toBe(true);
      expect(isVideoModel('wan-2-1-t2v-480p')).toBe(true);
      expect(isVideoModel({ id: 'custom-vid', type: 'video' })).toBe(true);
      expect(isVideoModel('flux-dev')).toBe(false);
    });

    it('identifies audio music and tts models', () => {
      expect(isAudioMusicModel('stable-audio')).toBe(true);
      expect(isAudioMusicModel({ id: 'custom-music', traits: ['music'] })).toBe(true);
      expect(isAudioMusicModel('tts-kokoro')).toBe(false);

      expect(isAudioTtsModel('tts-kokoro')).toBe(true);
      expect(isAudioTtsModel({ id: 'custom-voice', type: 'tts' })).toBe(true);
      expect(isAudioTtsModel('stable-audio')).toBe(false);
    });
  });

  // Phase 5 (2026-09-17) — `bitrate_mode` is documented for the public
  // Seedance 2.0 (incl. Fast) and 2.5 families only; every other family
  // fails closed.
  describe('supportsVideoBitrateMode', () => {
    it('accepts the documented Seedance 2.0/2.5 public model families', () => {
      expect(supportsVideoBitrateMode('seedance-2-0-text-to-video-basic')).toBe(true);
      expect(supportsVideoBitrateMode('seedance-2-0-image-to-video-basic')).toBe(true);
      expect(supportsVideoBitrateMode('seedance-2-0-reference-to-video-basic')).toBe(true);
      expect(supportsVideoBitrateMode('seedance-2-0-fast-text-to-video-basic')).toBe(true);
      expect(supportsVideoBitrateMode('seedance-2-0-fast-reference-to-video-basic')).toBe(true);
      expect(supportsVideoBitrateMode('seedance-2-5-text-to-video-basic')).toBe(true);
      expect(supportsVideoBitrateMode('seedance-2-5-reference-to-video-basic')).toBe(true);
    });

    it('accepts model records and rejects other video families', () => {
      expect(
        supportsVideoBitrateMode({ id: 'seedance-2-5-image-to-video-basic' }),
      ).toBe(true);
      expect(supportsVideoBitrateMode('wan-2.6-text-to-video')).toBe(false);
      expect(supportsVideoBitrateMode('kling-o3-pro-reference-to-video')).toBe(false);
      expect(supportsVideoBitrateMode('grok-imagine-image-to-video-private')).toBe(false);
      expect(supportsVideoBitrateMode('topaz-video-upscale')).toBe(false);
    });

    it('fails closed for other Seedance generations and unknown input', () => {
      expect(supportsVideoBitrateMode('seedance-1-0-text-to-video-basic')).toBe(false);
      expect(supportsVideoBitrateMode('seedance-3-0-text-to-video-basic')).toBe(false);
      expect(supportsVideoBitrateMode('')).toBe(false);
      expect(supportsVideoBitrateMode(undefined)).toBe(false);
      expect(supportsVideoBitrateMode(null)).toBe(false);
      expect(supportsVideoBitrateMode({})).toBe(false);
    });
  });

  describe('Sizing Mode Resolution', () => {
    it('resolves aspectResolution when model constraints have both aspect ratios and resolutions', () => {
      const mode = resolveModelSizingMode('nano-banana-v1', {
        aspect_ratios: ['1:1', '16:9'],
        resolutions: ['720p', '1080p'],
      });
      expect(mode).toBe('aspectResolution');
    });

    it('resolves aspectRatio when only aspect ratios are present', () => {
      const mode = resolveModelSizingMode('seedream-v5-pro', {
        aspect_ratios: ['1:1', '16:9'],
      });
      expect(mode).toBe('aspectRatio');
    });

    it('defaults to widthHeight for pixel-based models without aspect ratios', () => {
      const mode = resolveModelSizingMode('flux-dev', {});
      expect(mode).toBe('widthHeight');
    });
  });
});
