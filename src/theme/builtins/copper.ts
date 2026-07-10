import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_COPPER: Theme = {
  id: 'builtin-copper',
  name: 'Forge Copper',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#0d1117',
    surface: '#161b22',
    surfaceElevated: '#1c2330',
    border: '#2a3140',
    textPrimary: '#d0d7de',
    textSecondary: '#9aa7b8',
    textMuted: '#808b9b',
    accent: '#a65c20',
    accentHover: '#bf6d2d',
    accentForeground: '#ffffff',
    success: '#3fb950',
    warning: '#d29922',
    danger: '#f85149',
    info: '#58a6ff',
    focusRing: '#d98e4d',
    overlay: 'rgba(0,0,0,0.6)',
    glow: 'rgba(199,123,59,0.25)',
    surfaceMuted: '#11161d',
    borderStrong: '#6b7686',
  }),
};
