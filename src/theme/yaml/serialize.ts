import { stringify } from 'yaml';
import type { CodeThemeTokens, ThemeFamily, ThemeMode, ThemeTokens } from '../themeTypes';

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function serializeTokens(tokens: ThemeTokens): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = Object.keys(tokens).sort();
  const tokenMap = tokens as unknown as Record<string, string>;
  for (const key of keys) {
    const snake = camelToSnake(key);
    out[snake] = tokenMap[key];
  }
  return out;
}

function serializeCodeTokens(tokens: CodeThemeTokens): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = Object.keys(tokens).sort();
  const tokenMap = tokens as unknown as Record<string, string>;
  for (const key of keys) {
    const snake = camelToSnake(key);
    out[snake] = tokenMap[key];
  }
  return out;
}

/**
 * Serialize a ThemeFamily to the V2 YAML schema.
 *
 * Output is deterministic (alphabetical token order) so round-trips are
 * semantically stable. Colors are written as snake_case CSS variables.
 *
 * Pass `mode` when serializing a single-mode Theme: it emits a top-level
 * `mode: light|dark` field so `yamlToTheme` can preserve the original mode
 * even when both variants carry the same tokens (single-mode legacy themes
 * whose canonical mode otherwise would be inferred from `BUILTIN_CANONICAL_MODES`).
 */
export function serializeThemeFamilyYaml(
  family: ThemeFamily,
  options?: { mode?: ThemeMode },
): string {
  const mode = options?.mode;
  const doc = {
    schemaVersion: 2,
    id: family.id,
    name: family.name,
    ...(mode ? { mode } : {}),
    ...(family.author !== undefined ? { author: family.author } : {}),
    ...(family.description !== undefined ? { description: family.description } : {}),
    ...(family.aliases?.length ? { aliases: [...family.aliases] } : {}),
    variants: {
      light: {
        tokens: serializeTokens(family.variants.light.tokens),
        code: {
          preset: family.variants.light.code.preset,
          tokens: serializeCodeTokens(family.variants.light.code.tokens),
        },
      },
      dark: {
        tokens: serializeTokens(family.variants.dark.tokens),
        code: {
          preset: family.variants.dark.code.preset,
          tokens: serializeCodeTokens(family.variants.dark.code.tokens),
        },
      },
    },
  };
  return stringify(doc);
}

/** Convenience alias matching the pipeline naming convention. */
export const themeFamilyToYaml = serializeThemeFamilyYaml;
