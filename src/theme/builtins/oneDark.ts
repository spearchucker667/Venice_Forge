import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_ONE_DARK: Theme = {
  id: 'builtin-one-dark',
  name: 'Forge One Dark',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#282c34',
    surface: '#353b45',
    surfaceElevated: '#3e4451',
    border: '#4b5263',
    textPrimary: '#abb2bf',
    textSecondary: '#9ca0aa',
    textMuted: '#91969e',
    accent: '#61afef',
    accentHover: '#528bcc',
    accentForeground: '#282c34',
    success: '#98c379',
    warning: '#e5c07b',
    danger: '#cf222e',
    dangerForeground: '#ffffff',
    info: '#56b6c2',
    focusRing: '#61afef',
    overlay: 'rgba(0, 0, 0, 0.6)',
    glow: 'rgba(97, 175, 239, 0.25)',
    surfaceMuted: '#2c313a',
    borderStrong: '#abb2bf',
  }),
};
