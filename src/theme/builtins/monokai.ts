import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_MONOKAI: Theme = {
  id: 'builtin-monokai',
  name: 'Forge Monokai',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#272822',
    surface: '#383830',
    surfaceElevated: '#49483e',
    border: '#6b6b6b',
    textPrimary: '#f8f8f2',
    textSecondary: '#a6a48a',
    textMuted: '#989681',
    accent: '#a6e22e',
    accentHover: '#f92672',
    accentForeground: '#272822',
    success: '#a6e22e',
    warning: '#e6db74',
    danger: '#e6004c',
    dangerForeground: '#ffffff',
    info: '#66d9ef',
    focusRing: '#a6e22e',
    overlay: 'rgba(0, 0, 0, 0.6)',
    glow: 'rgba(166, 226, 46, 0.25)',
    surfaceMuted: '#2c2d26',
    borderStrong: '#f8f8f2',
  }),
};
