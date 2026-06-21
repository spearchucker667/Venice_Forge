import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_CATPPUCCIN: Theme = {
  id: 'builtin-catppuccin',
  name: 'Forge Catppuccin',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#1e1e2e',
    surface: '#313244',
    surfaceElevated: '#45475a',
    border: '#6c7086',
    textPrimary: '#cdd6f4',
    textSecondary: '#a6adc8',
    textMuted: '#8c91aa',
    accent: '#f38ba8',
    accentHover: '#fab387',
    accentForeground: '#1e1e2e',
    success: '#a6e3a1',
    warning: '#f9e2af',
    danger: '#f38ba8',
    info: '#89dceb',
    focusRing: '#f38ba8',
    overlay: 'rgba(0, 0, 0, 0.6)',
    glow: 'rgba(243, 139, 168, 0.25)',
    surfaceMuted: '#181825',
    borderStrong: '#cdd6f4',
  }),
};
