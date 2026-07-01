import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_SOLARIZED_LIGHT: Theme = {
  id: 'builtin-solarized-light',
  name: 'Forge Solarized Light',
  mode: 'light',
  tokens: completeThemeTokens('light', {
    background: '#fdf6e3',
    surface: '#eee8d5',
    surfaceElevated: '#ffffff',
    border: '#93a1a1',
    textPrimary: '#073642',
    textSecondary: '#586e75',
    textMuted: '#5f7378',
    accent: '#cb4b16',
    accentHover: '#dc322f',
    accentForeground: '#ffffff',
    success: '#556b00',
    warning: '#8f6a00',
    danger: '#c52c29',
    info: '#268bd2',
    focusRing: '#cb4b16',
    overlay: 'rgba(0, 0, 0, 0.25)',
    glow: 'rgba(203, 75, 22, 0.18)',
    surfaceMuted: '#e6dfc8',
    borderStrong: '#586e75',
  }),
};
