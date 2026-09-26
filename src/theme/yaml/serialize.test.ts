import { describe, it, expect } from 'vitest';
import { serializeThemeFamilyYaml } from './serialize';
import { parseThemeYaml } from './parse';

function validV2Yaml(): string {
  return `
schemaVersion: 2
id: midnight-velvet
name: Midnight Velvet
variants:
  light:
    tokens:
      background: "#ffffff"
      surface: "#f6f8fa"
      surface_elevated: "#fcfcfc"
      surface_muted: "#eef1f4"
      border: "#d0d7de"
      border_strong: "#8c959f"
      text_primary: "#1f2328"
      text_secondary: "#57606a"
      text_muted: "#656d76"
      accent: "#0969da"
      accent_hover: "#0860ca"
      accent_foreground: "#ffffff"
      success: "#1a7f37"
      success_foreground: "#ffffff"
      warning: "#7a5200"
      warning_foreground: "#ffffff"
      danger: "#cf222e"
      danger_foreground: "#ffffff"
      info: "#0969da"
      input_background: "#fcfcfc"
      input_foreground: "#1f2328"
      placeholder: "#656d76"
      disabled_foreground: "#656d76"
      button_primary_background: "#0969da"
      button_primary_foreground: "#ffffff"
      button_secondary_background: "#fcfcfc"
      button_secondary_foreground: "#1f2328"
      link: "#0969da"
      focus_ring: "#0969da"
      selection_background: "#0969da"
      selection_foreground: "#ffffff"
      overlay: "rgba(0, 0, 0, 0.4)"
      glow: "rgba(9, 105, 218, 0.18)"
      foreground: "#1f2328"
      foreground_muted: "#57606a"
      foreground_subtle: "#656d76"
  dark:
    tokens:
      background: "#0a0e1a"
      surface: "#14182e"
      surface_elevated: "#1e2240"
      surface_muted: "#101428"
      border: "#2e3250"
      border_strong: "#4e5270"
      text_primary: "#f5e6e8"
      text_secondary: "#d0b8c0"
      text_muted: "#908090"
      accent: "#d8b4e2"
      accent_hover: "#e8c8f2"
      accent_foreground: "#0a0e1a"
      success: "#a5d6a7"
      success_foreground: "#0a0e1a"
      warning: "#ffcc80"
      warning_foreground: "#0a0e1a"
      danger: "#ef9a9a"
      danger_foreground: "#0a0e1a"
      info: "#90caf9"
      input_background: "#1e2240"
      input_foreground: "#f5e6e8"
      placeholder: "#908090"
      disabled_foreground: "#908090"
      button_primary_background: "#d8b4e2"
      button_primary_foreground: "#0a0e1a"
      button_secondary_background: "#1e2240"
      button_secondary_foreground: "#f5e6e8"
      link: "#90caf9"
      focus_ring: "#d8b4e2"
      selection_background: "#d8b4e2"
      selection_foreground: "#0a0e1a"
      overlay: "rgba(10, 14, 26, 0.7)"
      glow: "rgba(216, 180, 226, 0.25)"
      foreground: "#f5e6e8"
      foreground_muted: "#d0b8c0"
      foreground_subtle: "#908090"
`;
}

describe('serializeThemeFamilyYaml', () => {
  it('outputs a V2 schema document with snake_case tokens', () => {
    const family = parseThemeYaml(validV2Yaml());
    const yaml = serializeThemeFamilyYaml(family);

    expect(yaml).toContain('schemaVersion: 2');
    expect(yaml).toContain('id: midnight-velvet');
    expect(yaml).toContain('name: Midnight Velvet');
    expect(yaml).toContain('variants:');
    expect(yaml).toContain('light:');
    expect(yaml).toContain('dark:');
    expect(yaml).toContain('code:');
    expect(yaml).toContain('preset:');
    expect(yaml).toContain('surface_elevated:');
    expect(yaml).toContain('button_primary_background:');
  });

  it('does not emit the dead top-level mode field', () => {
    const family = parseThemeYaml(validV2Yaml());
    const yaml = serializeThemeFamilyYaml(family);
    // Nothing reads doc.mode after import (normalize drops it), so exporting
    // it would imply a contract that does not exist.
    expect(yaml).not.toMatch(/^mode:/m);
  });

  it('keeps the parser tolerant of legacy top-level mode fields', () => {
    const family = parseThemeYaml(validV2Yaml());
    const legacy = `mode: dark\n${serializeThemeFamilyYaml(family)}`;
    expect(() => parseThemeYaml(legacy)).not.toThrow();
  });

  it('stays deterministic across repeated serializations', () => {
    const family = parseThemeYaml(validV2Yaml());
    expect(serializeThemeFamilyYaml(family)).toBe(serializeThemeFamilyYaml(family));
  });

  it('is semantically stable through parse → serialize → parse', () => {
    const original = parseThemeYaml(validV2Yaml());
    const yaml = serializeThemeFamilyYaml(original);
    const reparsed = parseThemeYaml(yaml);

    expect(reparsed.id).toBe(original.id);
    expect(reparsed.name).toBe(original.name);
    expect(reparsed.variants.light.tokens).toEqual(original.variants.light.tokens);
    expect(reparsed.variants.dark.tokens).toEqual(original.variants.dark.tokens);
    expect(reparsed.variants.light.code.tokens).toEqual(original.variants.light.code.tokens);
    expect(reparsed.variants.dark.code.tokens).toEqual(original.variants.dark.code.tokens);
    expect(reparsed.variants.light.code.preset).toBe(original.variants.light.code.preset);
    expect(reparsed.variants.dark.code.preset).toBe(original.variants.dark.code.preset);
  });

  it('emits both light and dark variants', () => {
    const family = parseThemeYaml(validV2Yaml());
    const yaml = serializeThemeFamilyYaml(family);
    expect(yaml).toContain('background: "#ffffff"');
    expect(yaml).toContain('background: "#0a0e1a"');
  });
});


it('preserves metadata and aliases through canonical export and import', () => {
  const family = { ...parseThemeYaml(validV2Yaml()), author: 'Theme author', description: 'An authored pair', aliases: ['older-name'] };
  expect(parseThemeYaml(serializeThemeFamilyYaml(family))).toMatchObject({ author: family.author, description: family.description, aliases: family.aliases });
});
