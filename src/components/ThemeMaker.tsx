import React, { useEffect, useMemo, useState } from "react";
import { BUILTIN_VENICE, BUILTIN_DARK, BUILTIN_LIGHT, BUILTIN_COPPER, BUILTIN_DRACULA, applyTheme, type Theme, type ThemeTokens } from "../theme";
import { COLOR_INPUT_FALLBACK } from "../theme/fallbacks";
import { isValidColorValue } from "../theme/validateColor";
import { ThemePreview } from "./ThemePreview";
import { desktopFiles } from "../services/desktopBridge";
import type { ModuleProps } from "../types/app";

type ThemeMakerProps = ModuleProps;

const TOKEN_LABELS: Record<keyof ThemeTokens, string> = {
  background: "Background",
  surface: "Surface",
  surfaceElevated: "Surface Elevated",
  border: "Border",
  textPrimary: "Text Primary",
  textSecondary: "Text Secondary",
  textMuted: "Text Muted",
  accent: "Accent",
  accentHover: "Accent Hover",
  accentForeground: "Accent Foreground",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  info: "Info",
  focusRing: "Focus Ring",
  overlay: "Overlay",
  glow: "Glow",
};

function cloneTheme(theme: Theme): Theme {
  return { ...theme, tokens: { ...theme.tokens } };
}

function defaultCustomTheme(): Theme {
  return cloneTheme(BUILTIN_DARK);
}

export function ThemeMaker({ state, dispatch }: ThemeMakerProps) {
  const { selectedThemeId, customTheme } = state.settings;
  const [draft, setDraft] = useState<Theme>(() => cloneTheme(customTheme || defaultCustomTheme()));
  const [selector, setSelector] = useState<string>(selectedThemeId || "builtin-dark");

  useEffect(() => {
    if (selectedThemeId === "custom" && customTheme) {
      setDraft(cloneTheme(customTheme));
    }
    setSelector(selectedThemeId || "builtin-dark");
  }, [selectedThemeId, customTheme]);

  const builtInMap: Record<string, Theme> = useMemo(
    () => ({
      "builtin-venice": BUILTIN_VENICE,
      "builtin-dark": BUILTIN_DARK,
      "builtin-light": BUILTIN_LIGHT,
      "builtin-copper": BUILTIN_COPPER,
      "builtin-dracula": BUILTIN_DRACULA,
    }),
    []
  );

  function handleSelect(id: string) {
    setSelector(id);
    if (id !== "custom") {
      const theme = builtInMap[id] || BUILTIN_DARK;
      applyTheme(theme);
      dispatch({
        type: "SET_SETTINGS",
        settings: { selectedThemeId: id, appearanceMode: theme.mode, customTheme: null },
      });
    } else {
      const base = customTheme ? cloneTheme(customTheme) : defaultCustomTheme();
      setDraft(base);
      applyTheme(base);
    }
  }

  function updateToken(key: keyof ThemeTokens, value: string) {
    setDraft((prev) => {
      const next = cloneTheme(prev);
      next.tokens[key] = value;
      return next;
    });
  }

  useEffect(() => {
    if (selector === "custom") {
      applyTheme(draft);
    }
  }, [draft, selector]);

  function handleSave() {
    dispatch({
      type: "SET_SETTINGS",
      settings: { selectedThemeId: "custom", appearanceMode: draft.mode, customTheme: draft },
    });
    dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Theme saved successfully", type: "success" } });
  }

  function handleReset() {
    const base = customTheme ? cloneTheme(customTheme) : defaultCustomTheme();
    setDraft(base);
    applyTheme(base);
  }

  function handleRestoreDefaults() {
    setSelector("builtin-dark");
    applyTheme(BUILTIN_DARK);
    dispatch({
      type: "SET_SETTINGS",
      settings: { selectedThemeId: "builtin-dark", appearanceMode: "dark", customTheme: null },
    });
  }

  async function handleExport() {
    try {
      await desktopFiles.exportJson(draft, "venice-forge-theme.json");
    } catch (err) {
      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: err instanceof Error ? err.message : "Failed to export theme", type: "error" } });
    }
  }

  async function handleImport() {
    try {
      const json = await desktopFiles.importJsonString();
      if (!json) return;
      const importedTheme = JSON.parse(json) as Theme;
      if (importedTheme && importedTheme.mode && importedTheme.tokens && importedTheme.tokens.background) {
        setDraft(importedTheme);
        applyTheme(importedTheme);
        dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Theme imported, make sure to save it.", type: "info" } });
      } else {
        throw new Error("Invalid theme file");
      }
    } catch (err) {
      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: err instanceof Error ? err.message : "Failed to import theme", type: "error" } });
    }
  }

  const validColor = (v: string) => isValidColorValue(v);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary">Theme</label>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "builtin-venice", label: "Venice Parity Dark" },
            { id: "builtin-dark", label: "Forge Graphite" },
            { id: "builtin-light", label: "Forge Daylight" },
            { id: "builtin-copper", label: "Forge Copper" },
            { id: "builtin-dracula", label: "Forge Dracula" },
            { id: "custom", label: "Custom" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium border transition-colors ${
                selector === opt.id
                  ? "bg-accent text-accent-fg border-accent"
                  : "bg-surface text-text-secondary border-border hover:bg-surface-elevated hover:text-text-primary"
              }`}
              aria-pressed={selector === opt.id}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {selector === "custom" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(TOKEN_LABELS) as Array<keyof ThemeTokens>).map((key) => {
              const value = draft.tokens[key];
              const valid = validColor(value);
              return (
                <div key={key} className="flex items-center gap-3">
                  <label htmlFor={`token-${key}`} className="w-40 text-sm text-text-secondary truncate">
                    {TOKEN_LABELS[key]}
                  </label>
                  <input
                    type="color"
                    aria-label={`${TOKEN_LABELS[key]} color picker`}
                    value={valid ? value : COLOR_INPUT_FALLBACK}
                    onChange={(e) => updateToken(key, e.target.value)}
                    className="h-8 w-10 rounded border border-border bg-transparent"
                  />
                  <input
                    id={`token-${key}`}
                    type="text"
                    value={value}
                    onChange={(e) => updateToken(key, e.target.value)}
                    aria-invalid={!valid}
                    className={`w-28 rounded-md border px-2 py-1 text-sm font-mono bg-surface text-text-primary ${
                      valid ? "border-border" : "border-danger"
                    }`}
                  />
                  {!valid && (
                    <span role="alert" className="text-xs text-danger">
                      Invalid color
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn primary" onClick={handleSave}>
              Save custom theme
            </button>
            <button className="btn" onClick={handleReset}>
              Reset custom theme
            </button>
            <button className="btn" onClick={handleImport}>
              Import theme
            </button>
            <button className="btn" onClick={handleExport}>
              Export theme
            </button>
            <button className="btn ghost" onClick={handleRestoreDefaults}>
              Restore defaults
            </button>
          </div>
        </>
      )}

      <div className="space-y-2">
        <div className="text-sm font-medium text-text-secondary">Preview</div>
        <ThemePreview theme={selector === "custom" ? draft : builtInMap[selector] || BUILTIN_DARK} />
      </div>
    </div>
  );
}
