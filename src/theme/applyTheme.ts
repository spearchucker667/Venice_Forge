import type { Theme } from './themeTypes';
import { BUILTIN_THEMES, DEFAULT_THEME } from './themes';

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const t = theme.tokens;
  const map: Record<string, string> = {
    '--bg': t.background,
    '--surface': t.surface,
    '--surface-elevated': t.surfaceElevated,
    '--border': t.border,
    '--text-primary': t.textPrimary,
    '--text-secondary': t.textSecondary,
    '--text-muted': t.textMuted,
    '--accent': t.accent,
    '--accent-hover': t.accentHover,
    '--accent-fg': t.accentForeground,
    '--success': t.success,
    '--warning': t.warning,
    '--danger': t.danger,
    '--info': t.info,
    '--focus-ring': t.focusRing,
    '--overlay': t.overlay,
    '--glow': t.glow,
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
 *   2. Built-in theme by id (`findBuiltinTheme`)
 *   3. Fallback to `BUILTIN_VENICE` (or `BUILTIN_LIGHT` if user prefers light
 *      and the system is in light mode)
 *
 * Unknown / null / unrecognised ids always resolve to a real `Theme`, so
 * the caller can blindly `applyTheme()` the result.
 */
export function resolveInitialTheme(bootstrap?: Partial<{
  selectedThemeId: string;
  appearanceMode: 'dark' | 'light';
  customTheme: Theme | null;
}>): Theme {
  if (bootstrap?.selectedThemeId === 'custom' && bootstrap.customTheme) {
    return bootstrap.customTheme;
  }
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
