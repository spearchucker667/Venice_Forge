// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  FONT_OPTIONS,
  DEFAULT_FONT_ID,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  getFontOption,
  clampFontSize,
  applyFontSettings,
} from './fontService';

describe('fontService', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    if (document.body) {
      document.body.removeAttribute('style');
    }
  });

  it('provides available font options with expected default', () => {
    expect(FONT_OPTIONS.length).toBeGreaterThanOrEqual(4);
    const defaultOption = getFontOption(DEFAULT_FONT_ID);
    expect(defaultOption.id).toBe('meslo');
    expect(defaultOption.name).toBe('MesloLGM Nerd Font');
  });

  it('falls back to default font option for unknown font ids', () => {
    const unknownOption = getFontOption('non-existent-font');
    expect(unknownOption.id).toBe(DEFAULT_FONT_ID);
  });

  it('clamps font sizes correctly within boundaries', () => {
    expect(clampFontSize(10)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(30)).toBe(MAX_FONT_SIZE);
    expect(clampFontSize(16)).toBe(16);
    expect(clampFontSize(null)).toBe(DEFAULT_FONT_SIZE);
    expect(clampFontSize(NaN)).toBe(DEFAULT_FONT_SIZE);
  });

  it('applies font-family and font-size to documentElement and body', () => {
    applyFontSettings('inter', 18);

    expect(document.documentElement.style.fontSize).toBe('18px');
    expect(document.documentElement.style.getPropertyValue('--app-font-family')).toContain('Inter');
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toContain('Inter');
    expect(document.documentElement.style.getPropertyValue('--app-font-size')).toBe('18px');
    expect(document.body.style.fontFamily).toContain('Inter');
  });

  it('handles reset to default font and size', () => {
    applyFontSettings('lora', 20);
    applyFontSettings(DEFAULT_FONT_ID, DEFAULT_FONT_SIZE);

    expect(document.documentElement.style.fontSize).toBe('16px');
    expect(document.documentElement.style.getPropertyValue('--app-font-family')).toContain('MesloLGM');
    expect(document.body.style.fontFamily).toContain('MesloLGM');
  });
});
