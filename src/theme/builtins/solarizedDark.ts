import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_SOLARIZED_DARK: Theme = {
  id: 'builtin-solarized-dark',
  name: 'Forge Solarized Dark',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#002b36',
    surface: '#073642',
    surfaceElevated: '#0a3c49',
    border: '#657b83',
    textPrimary: '#eee8d5',
    textSecondary: '#93a1a1',
    textMuted: '#839496',
    accent: '#b58900',
    accentHover: '#cb4b16',
    accentForeground: '#002b36',
    success: '#859900',
    warning: '#b58900',
    danger: '#ff5252',
    info: '#268bd2',
    focusRing: '#b58900',
    overlay: 'rgba(0, 0, 0, 0.6)',
    glow: 'rgba(181, 137, 0, 0.25)',
    surfaceMuted: '#00313f',
    borderStrong: '#93a1a1',
  }),
};
