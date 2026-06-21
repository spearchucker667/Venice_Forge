import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_DARK: Theme = {
  id: 'builtin-dark',
  name: 'Forge Graphite',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#0d1117',
    surface: '#161b22',
    surfaceElevated: '#1c2330',
    border: '#2a3140',
    textPrimary: '#e6edf3',
    textSecondary: '#9aa7b8',
    textMuted: '#6b7686',
    accent: '#1a6fd6',
    accentHover: '#3581e6',
    accentForeground: '#ffffff',
    success: '#3fb950',
    warning: '#d29922',
    danger: '#f85149',
    info: '#58a6ff',
    focusRing: '#4c93f8',
    overlay: 'rgba(0,0,0,0.6)',
    glow: 'rgba(47,129,247,0.25)',
    surfaceMuted: '#11161d',
    borderStrong: '#6b7686',
  }),
};
