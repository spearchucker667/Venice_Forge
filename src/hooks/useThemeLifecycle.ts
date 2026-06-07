import { useEffect } from "react";
import { applyTheme, BUILTIN_DARK, findBuiltinTheme, type Theme } from "../theme";
import type { AppSettings } from "../types/app";

function getActiveTheme(settings: AppSettings): Theme {
  if (settings.selectedThemeId === "custom" && settings.customTheme) {
    return settings.customTheme;
  }
  return findBuiltinTheme(settings.selectedThemeId) ?? BUILTIN_DARK;
}

/**
 * Applies the current theme to the DOM and keeps the localStorage
 * bootstrap cache in sync so the next load avoids FOUC.
 */
export function useThemeLifecycle(
  settings: AppSettings,
  settingsHydrated: boolean
): void {
  useEffect(() => {
    if (!settingsHydrated) return;
    const theme = getActiveTheme(settings);
    applyTheme(theme);
  }, [settingsHydrated, settings.selectedThemeId, settings.appearanceMode, settings.customTheme]);

  useEffect(() => {
    if (!settingsHydrated) return;
    try {
      localStorage.setItem("vf.theme.bootstrap", JSON.stringify({
        selectedThemeId: settings.selectedThemeId,
        appearanceMode: settings.appearanceMode,
        customTheme: settings.customTheme,
      }));
    } catch {
      // localStorage may be disabled or full — bootstrap cache is best-effort
    }
  }, [settingsHydrated, settings.selectedThemeId, settings.appearanceMode, settings.customTheme]);
}
