import { parse as parseYaml } from 'yaml';
import type { ThemeFamily } from '../themeTypes';
import { collectDangerousKeys, validateRawThemeYaml, validateThemeId } from './validate';
import { normalizeThemeFamilyYaml } from './normalize';
import { parseFlatTheme, parseV1ThemesBlock } from './legacy';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ParseThemeYamlOptions {
  /** IDs that cannot be used by a user-provided theme (e.g. built-ins). */
  protectedIds?: Set<string>;
}

/**
 * Parse a theme YAML string and return a canonical ThemeFamily.
 *
 * Supports:
 *   - Theme Engine V2 schema (`schemaVersion: 2`, variants, optional base)
 *   - Legacy V1 `themes:` block
 *   - Legacy flat terminal-color format
 *
 * Invalid YAML fails atomically with an actionable error message. Callers
 * should catch the error and leave the active theme unchanged.
 */
export function parseThemeYaml(
  yamlString: string,
  options: ParseThemeYamlOptions = {},
): ThemeFamily {
  if (typeof yamlString !== 'string' || yamlString.length > 1024 * 1024) {
    throw new Error('Theme file exceeds the 1 MiB text size limit.');
  }
  let raw: unknown;
  try {
    raw = parseYaml(yamlString, { maxAliasCount: 100 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid theme yaml: ${message}`);
  }

  if (!isRecord(raw)) {
    throw new Error('Invalid theme yaml: root must be a mapping.');
  }

  const unsafe = collectDangerousKeys(raw);
  if (unsafe.length) throw new Error(`Invalid theme yaml: unsafe, cyclic or excessively nested keys: ${unsafe.join(', ')}`);
  if ('schemaVersion' in raw && raw.schemaVersion !== 2) {
    throw new Error(`Unsupported theme schemaVersion: ${String(raw.schemaVersion)}. Expected 2.`);
  }

  if (raw.schemaVersion === 2) {
    const errors = validateRawThemeYaml(raw, { protectedIds: options.protectedIds });
    if (errors.length > 0) {
      throw new Error(`Invalid theme yaml:\n${errors.join('\n')}`);
    }
    return normalizeThemeFamilyYaml(raw);
  }

  const family = 'themes' in raw ? parseV1ThemesBlock(raw) : parseFlatTheme(raw);
  const idErrors = validateThemeId(family.id, 'id', options.protectedIds);
  if (idErrors.length) throw new Error(`Invalid theme yaml: ${idErrors.join(' ')}`);
  return family;
}
