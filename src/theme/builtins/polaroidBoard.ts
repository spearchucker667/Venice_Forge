import type { Theme } from '../themeTypes';

export const BUILTIN_POLAROID_BOARD: Theme = {
  id: "polaroid-board",
  name: "Polaroid Board",
  mode: "light",
  tokens: {
    // Accent corrected from #3D6478 to palette-canonical powder aqua #9EBFD0.
    // accentForeground updated to near-black #1A1012 (contrast 9.60 vs #9EBFD0).
    // border darkened from #C98F80 to #BA7D6E (contrast 1.70 vs bg #D8B09E; was 1.38).
    // focusRing changed from #291A1E to muted violet #675B6E (contrast 3.22 vs bg).
    accent: "#9EBFD0",
    background: "#D8B09E",
    surface: "#F3EDEB",
    surfaceElevated: "#FFF9F5",
    surfaceMuted: "#EADAD5",
    border: "#BA7D6E",
    borderStrong: "#9E797A",
    textPrimary: "#291A1E",
    textSecondary: "#442E35",
    textMuted: "#543941",
    foreground: "#291A1E",
    foregroundMuted: "#442E35",
    foregroundSubtle: "#543941",
    accentHover: "#86ADBE",
    accentForeground: "#1A1012",
    success: "#287557",
    successForeground: "#FFFFFF",
    warning: "#A35324",
    warningForeground: "#FFFFFF",
    danger: "#AA5B6E",
    dangerForeground: "#FFFFFF",
    info: "#4A5F73",
    inputBackground: "#FFF9F5",
    inputForeground: "#291A1E",
    placeholder: "#543941",
    disabledForeground: "#543941",
    buttonPrimaryBackground: "#9EBFD0",
    buttonPrimaryForeground: "#1A1012",
    buttonSecondaryBackground: "#EADAD5",
    buttonSecondaryForeground: "#291A1E",
    link: "#3B5E70",
    focusRing: "#675B6E",
    selectionBackground: "#CDD7DD",
    selectionForeground: "#291A1E",
    overlay: "rgba(41, 26, 30, 0.45)",
    glow: "rgba(158, 191, 208, 0.25)",
  },
};
