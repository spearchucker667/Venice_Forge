import type { Theme } from './themeTypes';
import { BUILTIN_VENICE, BUILTIN_DARK, BUILTIN_LIGHT, BUILTIN_COPPER, BUILTIN_DRACULA } from './themes';

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

export function resolveInitialTheme(bootstrap?: Partial<{
  selectedThemeId: string;
  appearanceMode: 'dark' | 'light';
  customTheme: Theme | null;
}>): Theme {
  if (bootstrap?.selectedThemeId === 'custom' && bootstrap.customTheme) {
    return bootstrap.customTheme;
  }
  if (bootstrap?.selectedThemeId === 'builtin-light') {
    return BUILTIN_LIGHT;
  }
  if (bootstrap?.selectedThemeId === 'builtin-copper') {
    return BUILTIN_COPPER;
  }
  if (bootstrap?.selectedThemeId === 'builtin-dracula') {
    return BUILTIN_DRACULA;
  }
  if (bootstrap?.selectedThemeId === 'builtin-dark') {
    return BUILTIN_DARK;
  }
  if (bootstrap?.selectedThemeId === 'builtin-venice') {
    return BUILTIN_VENICE;
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? BUILTIN_VENICE : BUILTIN_LIGHT;
}
