import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_GRUVBOX_DARK: Theme = {
  id: 'builtin-gruvbox-dark',
  name: 'GruvBox Dark',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#282828',
    surface: '#3c3836',
    surfaceElevated: '#504945',
    border: '#665c54',
    textPrimary: '#ebdbb2',
    textSecondary: '#d5c4a1',
    textMuted: '#928374',
    accent: '#fabd2f',
    accentHover: '#d79921',
    accentForeground: '#282828',
    success: '#b8bb26',
    warning: '#fabd2f',
    danger: '#ff6b57',
    info: '#83a598',
    focusRing: '#fabd2f',
    overlay: 'rgba(40, 40, 40, 0.6)',
    glow: 'rgba(250, 189, 47, 0.25)',
    surfaceMuted: '#32302f',
    borderStrong: '#928374',
  }),
};
