import { completeThemeTokens, type Theme } from '../themeTypes';

export const BUILTIN_TOKYO_NIGHT: Theme = {
  id: 'builtin-tokyo-night',
  name: 'Forge Tokyo',
  mode: 'dark',
  tokens: completeThemeTokens('dark', {
    background: '#1a1b26',
    surface: '#24283b',
    surfaceElevated: '#363b54',
    border: '#565f89',
    textPrimary: '#a9b1d6',
    textSecondary: '#9aa5ce',
    textMuted: '#8088ab',
    accent: '#7aa2f7',
    accentHover: '#bb9af7',
    accentForeground: '#1a1b26',
    success: '#9ece6a',
    warning: '#e0af68',
    danger: '#f7768e',
    info: '#7dcfff',
    focusRing: '#7aa2f7',
    overlay: 'rgba(0, 0, 0, 0.6)',
    glow: 'rgba(122, 162, 247, 0.25)',
    surfaceMuted: '#1f2335',
    borderStrong: '#a9b1d6',
  }),
};
