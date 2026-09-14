import { describe, it, expect } from 'vitest';
import { parseThemeYaml } from './parse';

describe('parseThemeYaml', () => {
  it('parses a V2 document', () => {
    const yaml = `
schemaVersion: 2
id: test-v2
name: Test V2
variants:
  light:
    tokens:
      background: "#ffffff"
      surface: "#f0f0f0"
      surface_elevated: "#e0e0e0"
      surface_muted: "#f5f5f5"
      border: "#cccccc"
      border_strong: "#999999"
      text_primary: "#000000"
      text_secondary: "#333333"
      text_muted: "#666666"
      accent: "#0066cc"
      accent_hover: "#0055aa"
      accent_foreground: "#ffffff"
      success: "#228822"
      success_foreground: "#ffffff"
      warning: "#cc8800"
      warning_foreground: "#ffffff"
      danger: "#cc2222"
      danger_foreground: "#ffffff"
      info: "#0066cc"
      input_background: "#e0e0e0"
      input_foreground: "#000000"
      placeholder: "#666666"
      disabled_foreground: "#666666"
      button_primary_background: "#0066cc"
      button_primary_foreground: "#ffffff"
      button_secondary_background: "#e0e0e0"
      button_secondary_foreground: "#000000"
      link: "#0066cc"
      focus_ring: "#0066cc"
      selection_background: "#0066cc"
      selection_foreground: "#ffffff"
      overlay: "rgba(0, 0, 0, 0.25)"
      glow: "rgba(0, 102, 204, 0.15)"
      foreground: "#000000"
      foreground_muted: "#333333"
      foreground_subtle: "#666666"
  dark:
    tokens:
      background: "#0a0a0a"
      surface: "#141414"
      surface_elevated: "#1e1e1e"
      surface_muted: "#101010"
      border: "#2a2a2a"
      border_strong: "#4a4a4a"
      text_primary: "#f0f0f0"
      text_secondary: "#b0b0b0"
      text_muted: "#808080"
      accent: "#5c7cfa"
      accent_hover: "#748ffc"
      accent_foreground: "#0a0a0a"
      success: "#51cf66"
      success_foreground: "#0a0a0a"
      warning: "#ffd43b"
      warning_foreground: "#0a0a0a"
      danger: "#ff6b6b"
      danger_foreground: "#0a0a0a"
      info: "#74c0fc"
      input_background: "#1e1e1e"
      input_foreground: "#f0f0f0"
      placeholder: "#808080"
      disabled_foreground: "#808080"
      button_primary_background: "#5c7cfa"
      button_primary_foreground: "#0a0a0a"
      button_secondary_background: "#1e1e1e"
      button_secondary_foreground: "#f0f0f0"
      link: "#74c0fc"
      focus_ring: "#5c7cfa"
      selection_background: "#5c7cfa"
      selection_foreground: "#0a0a0a"
      overlay: "rgba(0, 0, 0, 0.6)"
      glow: "rgba(92, 124, 250, 0.25)"
      foreground: "#f0f0f0"
      foreground_muted: "#b0b0b0"
      foreground_subtle: "#808080"
`;
    const family = parseThemeYaml(yaml);
    expect(family.schemaVersion).toBe(2);
    expect(family.id).toBe('test-v2');
    expect(family.variants.light.tokens.background).toBe('#ffffff');
    expect(family.variants.dark.tokens.background).toBe('#0a0a0a');
  });

  it('parses a legacy V1 themes block', () => {
    const yaml = `
version: 1
themes:
  custom:
    display_name: Legacy Custom
    mode: dark
    tokens:
      background: "#111111"
      surface: "#222222"
      surface_elevated: "#333333"
      border: "#444444"
      text_primary: "#ffffff"
      text_secondary: "#cccccc"
      text_muted: "#888888"
      accent: "#ff0000"
      accent_hover: "#ff3333"
      accent_foreground: "#ffffff"
      success: "#00ff00"
      success_foreground: "#111111"
      warning: "#ffff00"
      warning_foreground: "#111111"
      danger: "#ff0000"
      danger_foreground: "#ffffff"
      info: "#0000ff"
      focus_ring: "#ff0000"
      overlay: "rgba(0,0,0,0.5)"
      glow: "rgba(255,0,0,0.2)"
      foreground: "#ffffff"
      foreground_muted: "#cccccc"
      foreground_subtle: "#888888"
      input_background: "#333333"
      input_foreground: "#ffffff"
      placeholder: "#888888"
      disabled_foreground: "#888888"
      button_primary_background: "#ff0000"
      button_primary_foreground: "#ffffff"
      button_secondary_background: "#333333"
      button_secondary_foreground: "#ffffff"
      link: "#0000ff"
      selection_background: "#ff0000"
      selection_foreground: "#ffffff"
`;
    const family = parseThemeYaml(yaml);
    expect(family.id).toBe('custom');
    expect(family.name).toBe('Legacy Custom');
    expect(family.variants.dark.tokens.background).toBe('#111111');
    expect(family.variants.light.tokens).toEqual(family.variants.dark.tokens);
  });

  it('parses a legacy flat terminal-color document', () => {
    const yaml = `
name: Legacy Flat
accent: "#bd93f9"
background: "#282a36"
details: "Legacy Dracula"
foreground: "#f8f8f2"
terminal_colors:
  normal:
    black: "#21222c"
`;
    const family = parseThemeYaml(yaml);
    expect(family.name).toBe('Legacy Flat');
    expect(family.variants.dark.tokens.background).toBe('#282a36');
    expect(family.variants.dark.tokens.foreground).toBe('#f8f8f2');
  });

  it('throws an atomic actionable error for invalid YAML syntax', () => {
    expect(() => parseThemeYaml(':::not yaml:::\n\tbad')).toThrow('Invalid theme yaml:');
  });

  it('throws for V2 documents with missing required fields', () => {
    const yaml = `
schemaVersion: 2
id: incomplete
variants:
  dark:
    tokens:
      background: "#000000"
`;
    expect(() => parseThemeYaml(yaml)).toThrow('Invalid theme yaml:');
  });

  it('throws for protected built-in ids in V2 documents', () => {
    const yaml = `
schemaVersion: 2
id: venice
name: Venice
variants:
  dark:
    tokens:
      background: "#000000"
      surface: "#111111"
      surface_elevated: "#222222"
      surface_muted: "#101010"
      border: "#333333"
      border_strong: "#444444"
      text_primary: "#ffffff"
      text_secondary: "#cccccc"
      text_muted: "#888888"
      accent: "#5c7cfa"
      accent_hover: "#748ffc"
      accent_foreground: "#000000"
      success: "#51cf66"
      success_foreground: "#000000"
      warning: "#ffd43b"
      warning_foreground: "#000000"
      danger: "#ff6b6b"
      danger_foreground: "#000000"
      info: "#74c0fc"
      input_background: "#222222"
      input_foreground: "#ffffff"
      placeholder: "#888888"
      disabled_foreground: "#888888"
      button_primary_background: "#5c7cfa"
      button_primary_foreground: "#000000"
      button_secondary_background: "#222222"
      button_secondary_foreground: "#ffffff"
      link: "#74c0fc"
      focus_ring: "#5c7cfa"
      selection_background: "#5c7cfa"
      selection_foreground: "#000000"
      overlay: "rgba(0, 0, 0, 0.6)"
      glow: "rgba(92, 124, 250, 0.25)"
      foreground: "#ffffff"
      foreground_muted: "#cccccc"
      foreground_subtle: "#888888"
  light:
    tokens:
      background: "#ffffff"
      surface: "#f0f0f0"
      surface_elevated: "#e0e0e0"
      surface_muted: "#f5f5f5"
      border: "#cccccc"
      border_strong: "#999999"
      text_primary: "#000000"
      text_secondary: "#333333"
      text_muted: "#666666"
      accent: "#0066cc"
      accent_hover: "#0055aa"
      accent_foreground: "#ffffff"
      success: "#228822"
      success_foreground: "#ffffff"
      warning: "#cc8800"
      warning_foreground: "#ffffff"
      danger: "#cc2222"
      danger_foreground: "#ffffff"
      info: "#0066cc"
      input_background: "#e0e0e0"
      input_foreground: "#000000"
      placeholder: "#666666"
      disabled_foreground: "#666666"
      button_primary_background: "#0066cc"
      button_primary_foreground: "#ffffff"
      button_secondary_background: "#e0e0e0"
      button_secondary_foreground: "#000000"
      link: "#0066cc"
      focus_ring: "#0066cc"
      selection_background: "#0066cc"
      selection_foreground: "#ffffff"
      overlay: "rgba(0, 0, 0, 0.25)"
      glow: "rgba(0, 102, 204, 0.15)"
      foreground: "#000000"
      foreground_muted: "#333333"
      foreground_subtle: "#666666"
`;
    expect(() => parseThemeYaml(yaml, { protectedIds: new Set(['venice']) })).toThrow('protected built-in theme id');
  });
});


describe('theme import boundary regressions', () => {
  it.each([0, 1, 3, 99, '2'])('rejects explicit unsupported schema version %s before legacy dispatch', (version) => {
    const text = JSON.stringify({ schemaVersion: version, background: '#000', foreground: '#fff', accent: '#abc' });
    expect(() => parseThemeYaml(text)).toThrow(/schemaVersion/);
  });

  it('rejects cyclic YAML without overflowing the stack', () => {
    expect(() => parseThemeYaml('schemaVersion: 2\nid: loop\nname: Loop\nvariants: &loop\n  dark: *loop')).toThrow(/cyclic|nested|alias/i);
  });

  it('rejects oversized input before parsing', () => {
    expect(() => parseThemeYaml(' '.repeat(1024 * 1024 + 1))).toThrow(/size|large|limit/i);
  });

  it('protects legacy IDs as well as V2 IDs', () => {
    expect(() => parseThemeYaml('themes:\n  venice:\n    tokens: {background: "#000"}', { protectedIds: new Set(['venice']) })).toThrow(/protected/);
  });
});
