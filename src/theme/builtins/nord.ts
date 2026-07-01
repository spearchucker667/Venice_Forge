import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_NORD: Theme = {
  id: 'builtin-nord',
  name: 'Forge Nord',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#2E3440',
    surface: '#3B4252',
    surfaceElevated: '#434C5E',
    border: '#4C566A',
    textPrimary: '#D8DEE9',
    textSecondary: '#B0B9C6',
    textMuted: '#81A1C1',
    accent: '#88C0D0',
    accentHover: '#8FBCBB',
    accentForeground: '#2E3440',
    success: '#A3BE8C',
    warning: '#EBCB8B',
    danger: '#ff6b6b',
    info: '#81A1C1',
    focusRing: '#88C0D0',
    overlay: 'rgba(0, 0, 0, 0.6)',
    glow: 'rgba(136, 192, 208, 0.25)',
    surfaceMuted: '#2A2F3A',
    borderStrong: '#D8DEE9',
  }),
};
