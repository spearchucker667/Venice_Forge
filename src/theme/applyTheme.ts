import { completeThemeTokens, type Theme } from './themeTypes';
import { BUILTIN_THEMES, DEFAULT_THEME } from './themes';
import { isValidColorValue } from './validateColor';

function isValidPersistedTheme(value: unknown): value is Theme {
  if (!value || typeof value !== 'object') return false;
  const theme = value as Partial<Theme>;
  if (theme.id !== 'custom' || typeof theme.name !== 'string' || theme.name.length > 200) return false;
  if (theme.mode !== 'dark' && theme.mode !== 'light') return false;
  if (!theme.tokens || typeof theme.tokens !== 'object') return false;
  try {
    const tokens = completeThemeTokens(theme.mode, theme.tokens as Theme['tokens']);
    return Object.values(tokens).every((token) => isValidColorValue(token));
  } catch {
    return false;
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const t = completeThemeTokens(theme.mode, theme.tokens);
  const map: Record<string, string> = {
    '--bg': t.background,
    '--surface': t.surface,
    '--surface-elevated': t.surfaceElevated,
    '--surface-muted': t.surfaceMuted,
    '--border': t.border,
    '--border-strong': t.borderStrong,
    '--foreground': t.foreground,
    '--foreground-muted': t.foregroundMuted,
    '--foreground-subtle': t.foregroundSubtle,
    '--text-primary': t.foreground,
    '--text-secondary': t.foregroundMuted,
    '--text-muted': t.foregroundSubtle,
    '--accent': t.accent,
    '--accent-hover': t.accentHover,
    '--accent-fg': t.accentForeground,
    '--success': t.success,
    '--success-fg': t.successForeground,
    '--warning': t.warning,
    '--warning-fg': t.warningForeground,
    '--danger': t.danger,
    '--danger-fg': t.dangerForeground,
    '--info': t.info,
    '--input-bg': t.inputBackground,
    '--input-fg': t.inputForeground,
    '--placeholder': t.placeholder,
    '--disabled-fg': t.disabledForeground,
    '--button-primary-bg': t.buttonPrimaryBackground,
    '--button-primary-fg': t.buttonPrimaryForeground,
    '--button-secondary-bg': t.buttonSecondaryBackground,
    '--button-secondary-fg': t.buttonSecondaryForeground,
    '--link': t.link,
    '--focus-ring': t.focusRing,
    '--selection-bg': t.selectionBackground,
    '--selection-fg': t.selectionForeground,
    '--overlay': t.overlay,
    '--glow': t.glow,
    '--app-mesh-opacity': theme.mode === 'light' ? '0.08' : '0.12',
  };
  Object.entries(map).forEach(([k, v]) => root.style.setProperty(k, v));
  root.dataset.themeMode = theme.mode;
}

/**
 * Registry of built-in themes indexed by id. Adding a new built-in theme
 * is as simple as exporting it from `themes.ts` and including it in
 * `BUILTIN_THEMES` — no need to touch the resolver.
 */
const THEME_REGISTRY: ReadonlyMap<string, Theme> = new Map(
  BUILTIN_THEMES.map((theme) => [theme.id, theme])
);

/**
 * Find a built-in theme by id. Returns `null` if the id is not a
 * known built-in (e.g. an old custom theme id or a typo).
 */
export function findBuiltinTheme(id: string | null | undefined): Theme | null {
  if (!id) return null;
  return THEME_REGISTRY.get(id) ?? null;
}

/**
 * Resolve the initial theme from persisted bootstrap state. The order is:
 *   1. Custom theme (if `selectedThemeId === 'custom'` and a `customTheme`
 *      object is present)
 *   2. YAML theme by id (`findMergedTheme`)
 *   3. Built-in theme by id (`findBuiltinTheme`)
 *   4. Fallback to `BUILTIN_VENICE` (or `BUILTIN_LIGHT` if user prefers light
 *      and the system is in light mode)
 *
 * Unknown / null / unrecognised ids always resolve to a real `Theme`, so
 * the caller can blindly `applyTheme()` the result.
 */
export function resolveInitialTheme(
  bootstrap?: Partial<{
    selectedThemeId: string;
    appearanceMode: 'dark' | 'light';
    customTheme: Theme | null;
  }>,
  yamlThemes?: Record<string, Theme>
): Theme {
  if (bootstrap?.selectedThemeId === 'custom' && isValidPersistedTheme(bootstrap.customTheme)) {
    return bootstrap.customTheme;
  }
  const yamlTheme = yamlThemes?.[bootstrap?.selectedThemeId || ''];
  if (yamlTheme) return yamlTheme;
  const builtin = findBuiltinTheme(bootstrap?.selectedThemeId);
  if (builtin) return builtin;
  if (typeof window !== 'undefined') {
    // Match the historical contract: `prefers-color-scheme: dark` is the
    // probe. When the system prefers dark (or the probe is unset / mocked
    // to `true`), use the Venice dark default. When the system is in
    // light mode (`matches: false`), fall through to the light built-in.
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      return DEFAULT_THEME;
    }
    const light = THEME_REGISTRY.get('builtin-light');
    if (light) return light;
  }
  return DEFAULT_THEME;
}
