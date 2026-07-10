import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_VENICE: Theme = {
  id: 'builtin-venice',
  name: 'Venice Parity Dark',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#050a0f',
    surface: '#080f15',
    surfaceElevated: '#111922',
    border: '#1b2632',
    textPrimary: '#d9dee5',
    textSecondary: '#a3adba',
    textMuted: '#7a8694',
    accent: '#63b3ed',
    accentHover: '#2b6cb0',
    accentForeground: '#050a0f',
    success: '#74d66a',
    warning: '#d6a84f',
    danger: '#ef4444',
    info: '#7da7ff',
    focusRing: '#63b3ed',
    overlay: 'rgba(5, 10, 15, 0.7)',
    glow: 'rgba(99, 179, 237, 0.1)',
    surfaceMuted: '#0b131b',
    borderStrong: '#687483',
  }),
};
