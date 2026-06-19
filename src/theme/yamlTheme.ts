import { completeThemeTokens, type Theme } from './themeTypes';
import { isValidColorValue } from './validateColor';

/**
 * Converts a validated YAML theme entry into a runtime Theme object.
 *
 * The YAML schema already validates that all required tokens are present
 * and that colors are safe, but we remain defensive here because the
 * renderer should never trust the main process blindly.
 *
 * @param id      The theme identifier (kebab-case from YAML key).
 * @param display_name The human-readable name from YAML.
 * @param mode    'dark' or 'light'.
 * @param tokens  Record of token values (snake_case or camelCase keys).
 */
export function yamlThemeToTheme(
  id: string,
  display_name: string,
  mode: 'dark' | 'light',
  tokens: Record<string, string>
): Theme {
  const normalized: Record<string, string> = {};

  for (const [rawKey, value] of Object.entries(tokens)) {
    if (typeof value !== 'string' || !isValidColorValue(value)) {
      continue; // Skip malformed tokens defensively
    }
    // Normalize snake_case to camelCase
    const key = rawKey.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    normalized[key] = value;
  }

  return {
    id,
    name: display_name,
    mode,
    tokens: completeThemeTokens(mode, normalized as unknown as Theme['tokens']),
  };
}

/**
 * Resolves a theme id against a merged registry of built-in + YAML themes.
 * Returns null when the id is not found in either registry.
 */
export function findMergedTheme(
  id: string | null | undefined,
  yamlThemes: Record<string, Theme>
): Theme | null {
  if (!id) return null;
  return yamlThemes[id] ?? null;
}
