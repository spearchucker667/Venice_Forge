import { describe, it, expect } from 'vitest';
import { validateRawThemeYaml } from './validate';

function validTokens(): Record<string, string> {
  return {
    background: '#0a0a0a',
    surface: '#141414',
    surface_elevated: '#1e1e1e',
    surface_muted: '#101010',
    border: '#2a2a2a',
    border_strong: '#4a4a4a',
    text_primary: '#f0f0f0',
    text_secondary: '#b0b0b0',
    text_muted: '#808080',
    accent: '#5c7cfa',
    accent_hover: '#748ffc',
    accent_foreground: '#0a0a0a',
    success: '#51cf66',
    success_foreground: '#0a0a0a',
    warning: '#ffd43b',
    warning_foreground: '#0a0a0a',
    danger: '#ff6b6b',
    danger_foreground: '#0a0a0a',
    info: '#74c0fc',
    input_background: '#1e1e1e',
    input_foreground: '#f0f0f0',
    placeholder: '#808080',
    disabled_foreground: '#808080',
    button_primary_background: '#5c7cfa',
    button_primary_foreground: '#0a0a0a',
    button_secondary_background: '#1e1e1e',
    button_secondary_foreground: '#f0f0f0',
    link: '#74c0fc',
    focus_ring: '#5c7cfa',
    selection_background: '#5c7cfa',
    selection_foreground: '#0a0a0a',
    overlay: 'rgba(0, 0, 0, 0.6)',
    glow: 'rgba(92, 124, 250, 0.25)',
    foreground: '#f0f0f0',
    foreground_muted: '#b0b0b0',
    foreground_subtle: '#808080',
  };
}

function validV2(_protectedIds?: Set<string>): Record<string, unknown> {
  return {
    schemaVersion: 2,
    id: 'test-theme',
    name: 'Test Theme',
    variants: {
      light: { tokens: { ...validTokens(), background: '#ffffff', foreground: '#1a1a1a' } },
      dark: { tokens: validTokens() },
    },
  };
}

describe('validateRawThemeYaml', () => {
  it('accepts a valid V2 document', () => {
    expect(validateRawThemeYaml(validV2())).toEqual([]);
  });

  it('rejects a non-object root', () => {
    expect(validateRawThemeYaml('not an object')).toContain('Theme document must be an object.');
    expect(validateRawThemeYaml(null)).toContain('Theme document must be an object.');
    expect(validateRawThemeYaml(['array'])).toContain('Theme document must be an object.');
  });

  it('rejects missing schemaVersion when V2 is required', () => {
    const doc = { ...validV2(), schemaVersion: undefined } as unknown as Record<string, unknown>;
    expect(validateRawThemeYaml(doc, { requireV2: true })).toContain('schemaVersion must be 2.');
  });

  it('rejects invalid schemaVersion', () => {
    const doc = { ...validV2(), schemaVersion: 3 } as unknown as Record<string, unknown>;
    expect(validateRawThemeYaml(doc)).toContain('schemaVersion must be 2, got 3.');
  });

  it('rejects empty or overlong id', () => {
    const doc = { ...validV2(), id: '' } as unknown as Record<string, unknown>;
    expect(validateRawThemeYaml(doc).some((m) => m.includes('id must be a non-empty string'))).toBe(true);
  });

  it('rejects ids with invalid characters', () => {
    const doc = { ...validV2(), id: 'bad id!' } as unknown as Record<string, unknown>;
    expect(validateRawThemeYaml(doc).some((m) => m.includes('id must contain only'))).toBe(true);
  });

  it('rejects protected built-in ids', () => {
    const doc = { ...validV2(), id: 'venice' } as unknown as Record<string, unknown>;
    const errors = validateRawThemeYaml(doc, { protectedIds: new Set(['venice']) });
    expect(errors.some((m) => m.includes('protected built-in theme id'))).toBe(true);
  });

  it('rejects the reserved id "themes" (case-insensitive)', () => {
    for (const id of ['themes', 'THEMES', 'Themes']) {
      const doc = { ...validV2(), id } as unknown as Record<string, unknown>;
      const errors = validateRawThemeYaml(doc);
      expect(errors.some((m) => m.includes(`id "${id}" is reserved.`)), id).toBe(true);
    }
  });

  it('rejects empty name', () => {
    const doc = { ...validV2(), name: '' } as unknown as Record<string, unknown>;
    expect(validateRawThemeYaml(doc).some((m) => m.includes('name must be a non-empty string'))).toBe(true);
  });

  it('rejects unknown top-level keys', () => {
    const doc = { ...validV2(), extraField: true } as unknown as Record<string, unknown>;
    expect(validateRawThemeYaml(doc)).toContain('Unknown top-level key "extraField".');
  });

  it('rejects missing variants', () => {
    const doc = { schemaVersion: 2, id: 'x', name: 'X' } as unknown as Record<string, unknown>;
    expect(validateRawThemeYaml(doc)).toContain('variants must be an object with light and dark entries.');
  });

  it('rejects unknown variant keys', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    (doc.variants as Record<string, unknown>).light = { tokens: validTokens(), extra: true };
    expect(validateRawThemeYaml(doc)).toContain('variants.light.extra: unknown variant key.');
  });

  it('rejects missing variant tokens', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    (doc.variants as Record<string, unknown>).dark = {};
    expect(validateRawThemeYaml(doc).some((m) => m.includes('variants.dark.tokens must be'))).toBe(true);
  });

  it('rejects unknown tokens', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    const tokens = ((doc.variants as Record<string, unknown>).dark as Record<string, unknown>).tokens as Record<string, string>;
    tokens.unknown_token = '#123456';
    expect(validateRawThemeYaml(doc).some((m) => m.includes('unknown token'))).toBe(true);
  });

  it('rejects invalid color values', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    const tokens = ((doc.variants as Record<string, unknown>).dark as Record<string, unknown>).tokens as Record<string, string>;
    tokens.accent = 'url(javascript:alert(1))';
    expect(validateRawThemeYaml(doc).some((m) => m.includes('invalid or unsafe color value'))).toBe(true);
  });

  it('rejects missing required tokens', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    const tokens = ((doc.variants as Record<string, unknown>).dark as Record<string, unknown>).tokens as Record<string, string>;
    delete tokens.background;
    expect(validateRawThemeYaml(doc).some((m) => m.includes('missing required token'))).toBe(true);
  });

  it('rejects dangerous prototype keys anywhere in the document', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    const tokens = ((doc.variants as Record<string, unknown>).dark as Record<string, unknown>).tokens as Record<string, string>;
    const serializedTokens = JSON.stringify(tokens);
    const dangerousTokens = JSON.parse(
      `${serializedTokens.slice(0, -1)},"__proto__":"#000000"}`,
    ) as Record<string, string>;
    ((doc.variants as Record<string, unknown>).dark as Record<string, unknown>).tokens = dangerousTokens;
    const errors = validateRawThemeYaml(doc);
    expect(errors.some((m) => m.includes('dangerous key'))).toBe(true);
  });

  it('rejects aliases with invalid values', () => {
    const doc = { ...validV2(), aliases: ['ok-alias', 'bad alias!', 123] } as unknown as Record<string, unknown>;
    const errors = validateRawThemeYaml(doc);
    expect(errors.some((m) => m.includes('aliases[1]'))).toBe(true);
    expect(errors.some((m) => m.includes('aliases[2]'))).toBe(true);
  });

  it('accepts optional base tokens', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    (doc as Record<string, unknown>).base = { tokens: { accent: '#ffffff' } };
    expect(validateRawThemeYaml(doc)).toEqual([]);
  });

  it('rejects unknown keys in base', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    (doc as Record<string, unknown>).base = { extra: true };
    expect(validateRawThemeYaml(doc)).toContain('base.extra: unknown base key.');
  });

  it('accepts optional code configuration in variants', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    const variants = doc.variants as Record<string, Record<string, unknown>>;
    variants.light.code = {
      preset: 'github-light',
      tokens: {
        background: '#ffffff',
        foreground: '#1f2328',
        keyword: '#cf222e',
      },
    };
    expect(validateRawThemeYaml(doc)).toEqual([]);
  });

  it('rejects unknown code tokens', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    const variants = doc.variants as Record<string, Record<string, unknown>>;
    variants.dark.code = { tokens: { unknown_token: '#123456' } };
    expect(validateRawThemeYaml(doc).some((m) => m.includes('unknown code token'))).toBe(true);
  });

  it('rejects invalid code color values', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    const variants = doc.variants as Record<string, Record<string, unknown>>;
    variants.dark.code = { tokens: { keyword: 'url(evil)' } };
    expect(validateRawThemeYaml(doc).some((m) => m.includes('invalid or unsafe color value'))).toBe(true);
  });

  it('rejects unknown code presets', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    const variants = doc.variants as Record<string, Record<string, unknown>>;
    variants.light.code = { preset: 'nonexistent-preset' };
    expect(validateRawThemeYaml(doc).some((m) => m.includes('unknown preset'))).toBe(true);
  });

  it('rejects dangerous keys inside code configuration', () => {
    const doc = JSON.parse(JSON.stringify(validV2())) as Record<string, unknown>;
    const variants = doc.variants as Record<string, Record<string, unknown>>;
    variants.dark.code = JSON.parse('{ "__proto__": "#000000" }');
    expect(validateRawThemeYaml(doc).some((m) => m.includes('dangerous key'))).toBe(true);
  });
});
