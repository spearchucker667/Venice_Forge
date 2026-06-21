import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_ROSEPINE: Theme = {
  id: 'builtin-rosepine',
  name: 'Rosepine',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#191724',
    surface: '#1f1d2e',
    surfaceElevated: '#26233a',
    border: '#403d52',
    textPrimary: '#e0def4',
    textSecondary: '#908caa',
    textMuted: '#6e6a86',
    accent: '#ebbcba',
    accentHover: '#31748f',
    accentForeground: '#191724',
    success: '#9ccfd8',
    warning: '#f6c177',
    danger: '#eb6f92',
    info: '#c4a7e7',
    focusRing: '#ebbcba',
    overlay: 'rgba(25, 23, 36, 0.7)',
    glow: 'rgba(235, 188, 186, 0.2)',
    surfaceMuted: '#211f30',
    borderStrong: '#6e6a86',
  }),
};
