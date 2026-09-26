import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_INPUT_IMAGES,
  getMaxInputImages,
  getModelResolutions,
  isImageEditModel,
  isImageGenerateModel,
  isVideoModel,
  isAudioMusicModel,
  isAudioTtsModel,
  resolveModelSizingMode,
  supportsSingleImageAspectRatio,
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

  // Phase 6 (2026-09-26) — per-model capabilities (maxInputImages,
  // singleImageAspectRatio, resolutions) are surfaced so the multi-edit
  // payload builder no longer has to silently truncate to 3.
  describe('Multi-Edit Capability Helpers', () => {
    it('exposes the documented upstream default of 3', () => {
      expect(DEFAULT_MAX_INPUT_IMAGES).toBe(3);
    });

    it('reads capabilities.maxInputImages when present', () => {
      expect(
        getMaxInputImages({
          id: 'flux-2-max-edit',
          capabilities: { maxInputImages: 14 },
        }),
      ).toBe(14);
    });

    it('falls back to the default when capabilities is missing or invalid', () => {
      expect(getMaxInputImages({ id: 'firered-image-edit' })).toBe(3);
      expect(getMaxInputImages(null)).toBe(3);
      expect(getMaxInputImages(undefined)).toBe(3);
      expect(
        getMaxInputImages({
          id: 'broken',
          capabilities: { maxInputImages: 0 },
        }),
      ).toBe(3);
      expect(
        getMaxInputImages({
          id: 'broken',
          capabilities: { maxInputImages: -1 },
        }),
      ).toBe(3);
      expect(
        getMaxInputImages({
          id: 'broken',
          capabilities: { maxInputImages: Number.NaN as unknown as number },
        }),
      ).toBe(3);
    });

    it('floors non-integer maxInputImages values', () => {
      expect(
        getMaxInputImages({
          id: 'fractional',
          capabilities: { maxInputImages: 7.9 },
        }),
      ).toBe(7);
    });

    it('defaults supportsSingleImageAspectRatio to true when the capability is absent or true', () => {
      expect(supportsSingleImageAspectRatio(null)).toBe(true);
      expect(supportsSingleImageAspectRatio({ id: 'x' })).toBe(true);
      expect(
        supportsSingleImageAspectRatio({
          id: 'x',
          capabilities: { singleImageAspectRatio: true },
        }),
      ).toBe(true);
    });

    it('returns false only when singleImageAspectRatio is explicitly false', () => {
      expect(
        supportsSingleImageAspectRatio({
          id: 'x',
          capabilities: { singleImageAspectRatio: false },
        }),
      ).toBe(false);
    });

    it('returns resolution arrays verbatim from capabilities', () => {
      expect(
        getModelResolutions({
          id: 'gpt-image-2-edit',
          capabilities: { resolutions: ['1K', '2K', '4K'] },
        }),
      ).toEqual(['1K', '2K', '4K']);
    });

    it('returns undefined when resolutions are absent or empty', () => {
      expect(getModelResolutions({ id: 'firered-image-edit' })).toBeUndefined();
      expect(
        getModelResolutions({
          id: 'firered-image-edit',
          capabilities: { resolutions: [] },
        }),
      ).toBeUndefined();
      expect(
        getModelResolutions({
          id: 'firered-image-edit',
          capabilities: { resolutions: ['', 5 as unknown as string] },
        }),
      ).toBeUndefined();
    });
  });
});
