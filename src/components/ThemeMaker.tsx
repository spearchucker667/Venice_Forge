import React, { useEffect, useMemo, useState } from "react";
import {
  BUILTIN_VENICE,
  BUILTIN_DARK,
  BUILTIN_LIGHT,
  BUILTIN_COPPER,
  BUILTIN_DRACULA,
  BUILTIN_GRUVBOX_DARK,
  BUILTIN_ROSEPINE,
  BUILTIN_NORD,
  BUILTIN_TOKYO_NIGHT,
  BUILTIN_CATPPUCCIN,
  BUILTIN_SOLARIZED_DARK,
  BUILTIN_SOLARIZED_LIGHT,
  BUILTIN_ONE_DARK,
  BUILTIN_MONOKAI,
  BUILTIN_GITHUB_LIGHT,
  applyTheme,
  completeThemeTokens,
  luminance,
  type Theme,
  type ThemeMode,
  type ThemeTokenInput,
  type ThemeTokens,
} from "../theme";
import { COLOR_INPUT_FALLBACK } from "../theme/fallbacks";
import { isValidColorValue } from "../theme/validateColor";
import { ThemePreview } from "./ThemePreview";
import { desktopFiles } from "../services/desktopBridge";
import { useSettingsStore } from "../stores/settings-store";
import { toast } from "../stores/toast-store";

const TOKEN_LABELS: Record<keyof ThemeTokens, string> = {
  background: "Background",
  surface: "Surface",
  surfaceElevated: "Surface Elevated",
  surfaceMuted: "Surface Muted",
  border: "Border",
  borderStrong: "Border Strong",
  textPrimary: "Text Primary",
  textSecondary: "Text Secondary",
  textMuted: "Text Muted",
  foreground: "Foreground",
  foregroundMuted: "Foreground Muted",
  foregroundSubtle: "Foreground Subtle",
  accent: "Accent",
  accentHover: "Accent Hover",
  accentForeground: "Accent Foreground",
  success: "Success",
  successForeground: "Success Foreground",
  warning: "Warning",
  warningForeground: "Warning Foreground",
  danger: "Danger",
  dangerForeground: "Danger Foreground",
  info: "Info",
  inputBackground: "Input Background",
  inputForeground: "Input Foreground",
  placeholder: "Placeholder",
  disabledForeground: "Disabled Foreground",
  buttonPrimaryBackground: "Primary Button Background",
  buttonPrimaryForeground: "Primary Button Foreground",
  buttonSecondaryBackground: "Secondary Button Background",
  buttonSecondaryForeground: "Secondary Button Foreground",
  link: "Link",
  focusRing: "Focus Ring",
  selectionBackground: "Selection Background",
  selectionForeground: "Selection Foreground",
  overlay: "Overlay",
  glow: "Glow",
};

function cloneTheme(theme: Theme): Theme {
  return { ...theme, tokens: completeThemeTokens(theme.mode, theme.tokens) };
}

function defaultCustomTheme(): Theme {
  return cloneTheme(BUILTIN_VENICE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function importedTokens(mode: ThemeMode, raw: unknown): ThemeTokens {
  if (!isRecord(raw)) throw new Error("Invalid theme yaml: tokens must be a mapping.");
  const fallback = cloneTheme(mode === "light" ? BUILTIN_LIGHT : BUILTIN_VENICE).tokens;
  const merged: Record<string, string> = { ...fallback };
  for (const [rawKey, value] of Object.entries(raw)) {
    const key = snakeToCamel(rawKey);
    if (!(key in TOKEN_LABELS)) continue;
    if (typeof value !== "string" || !isValidColorValue(value)) {
      throw new Error(`Invalid color value for theme token ${rawKey}.`);
    }
    merged[key] = value;
  }
  return completeThemeTokens(mode, merged as unknown as ThemeTokenInput);
}

export async function themeToYaml(theme: Theme): Promise<string> {
  const { stringify } = await import("yaml");
  const tokens = Object.fromEntries(
    Object.entries(completeThemeTokens(theme.mode, theme.tokens)).map(([key, value]) => [camelToSnake(key), value]),
  );
  return stringify({
    version: 1,
    themes: {
      custom: {
        display_name: theme.name,
        mode: theme.mode,
        tokens,
      },
    },
  });
}

export async function yamlToTheme(yamlStr: string): Promise<Theme> {
  const { parse } = await import("yaml");
  const raw: unknown = parse(yamlStr);
  if (!isRecord(raw)) throw new Error("Invalid theme yaml: root must be a mapping.");

  if (isRecord(raw.themes)) {
    const first = Object.values(raw.themes)[0];
    if (!isRecord(first)) throw new Error("Invalid theme yaml: themes must contain an entry.");
    if (first.mode !== "dark" && first.mode !== "light") {
      throw new Error("Invalid theme yaml: mode must be dark or light.");
    }
    const mode: ThemeMode = first.mode === "light" ? "light" : "dark";
    const name = typeof first.display_name === "string" && first.display_name.trim()
      ? first.display_name.trim()
      : "Imported Theme";
    return { id: "custom", name, mode, tokens: importedTokens(mode, first.tokens) };
  }

  const background = typeof raw.background === "string" ? raw.background : null;
  const foreground = typeof raw.foreground === "string" ? raw.foreground : null;
  const accent = typeof raw.accent === "string" ? raw.accent : null;
  const details = typeof raw.details === "string" ? raw.details : null;
  if (!background || !foreground || !accent) {
    throw new Error("Invalid theme yaml: expected a themes block or legacy background/foreground/accent fields.");
  }
  if (![background, foreground, accent].every(isValidColorValue)) {
    throw new Error("Invalid theme yaml: legacy color fields contain an unsafe value.");
  }

  const detailsIsColor = typeof details === "string" && isValidColorValue(details);
  const rawName = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
  const name = rawName || (detailsIsColor || !details ? "Imported Theme" : details);

  const inferredMode: ThemeMode = luminance(background) > 0.5 ? "light" : "dark";
  const mode: ThemeMode = raw.mode === "light" || raw.mode === "dark" ? raw.mode : inferredMode;

  const terminal = isRecord(raw.terminal_colors) ? raw.terminal_colors : {};
  const bright = isRecord(terminal.bright) ? terminal.bright : {};
  const normal = isRecord(terminal.normal) ? terminal.normal : {};
  const color = (record: Record<string, unknown>, key: string, fallback: string): string =>
    typeof record[key] === "string" && isValidColorValue(record[key]) ? record[key] : fallback;

  const surfaceFallback = detailsIsColor && details ? details : color(normal, "black", background);
  const surfaceElevatedFallback = detailsIsColor && details ? details : color(bright, "black", background);
  const borderFallback = detailsIsColor && details ? details : color(normal, "white", foreground);
  const accentForeground = luminance(accent) > 0.5 ? foreground : background;

  const legacy: ThemeTokenInput = {
    background,
    surface: surfaceFallback,
    surfaceElevated: surfaceElevatedFallback,
    border: borderFallback,
    textPrimary: foreground,
    textSecondary: color(normal, "white", foreground),
    textMuted: color(bright, "black", foreground),
    accent,
    accentHover: color(bright, "blue", accent),
    accentForeground,
    success: color(bright, "green", "#74d66a"),
    warning: color(bright, "yellow", "#d6a84f"),
    danger: color(bright, "red", "#ef4444"),
    info: color(bright, "cyan", "#7da7ff"),
    focusRing: accent,
    overlay: mode === "light" ? "rgba(0, 0, 0, 0.25)" : "rgba(0, 0, 0, 0.6)",
    glow: `${accent}25`,
  };
  return { id: "custom", name, mode, tokens: completeThemeTokens(mode, legacy) };
}

export function ThemeMaker() {
  const selectedThemeId = useSettingsStore((s) => s.selectedThemeId) || "builtin-venice";
  const customTheme = useSettingsStore((s) => s.customTheme);
  const setSelectedThemeId = useSettingsStore((s) => s.setSelectedThemeId);
  const setCustomTheme = useSettingsStore((s) => s.setCustomTheme);
  const setAppearanceMode = useSettingsStore((s) => s.setAppearanceMode);

  const [draft, setDraft] = useState<Theme>(() => cloneTheme(customTheme || defaultCustomTheme()));
  const [selector, setSelector] = useState<string>(selectedThemeId || "builtin-venice");

  useEffect(() => {
    if (selectedThemeId === "custom" && customTheme) {
      setDraft(cloneTheme(customTheme));
    }
    setSelector(selectedThemeId || "builtin-venice");
  }, [selectedThemeId, customTheme]);

  const builtInMap: Record<string, Theme> = useMemo(
    () => ({
      "builtin-venice": BUILTIN_VENICE,
      "builtin-dark": BUILTIN_DARK,
      "builtin-light": BUILTIN_LIGHT,
      "builtin-copper": BUILTIN_COPPER,
      "builtin-dracula": BUILTIN_DRACULA,
      "builtin-gruvbox-dark": BUILTIN_GRUVBOX_DARK,
      "builtin-rosepine": BUILTIN_ROSEPINE,
      "builtin-nord": BUILTIN_NORD,
      "builtin-tokyo-night": BUILTIN_TOKYO_NIGHT,
      "builtin-catppuccin": BUILTIN_CATPPUCCIN,
      "builtin-solarized-dark": BUILTIN_SOLARIZED_DARK,
      "builtin-solarized-light": BUILTIN_SOLARIZED_LIGHT,
      "builtin-one-dark": BUILTIN_ONE_DARK,
      "builtin-monokai": BUILTIN_MONOKAI,
      "builtin-github-light": BUILTIN_GITHUB_LIGHT,
    }),
    []
  );

  function handleSelect(id: string) {
    setSelector(id);
    if (id !== "custom") {
      const theme = builtInMap[id] || BUILTIN_VENICE;
      applyTheme(theme);
      setSelectedThemeId(id);
      setAppearanceMode(theme.mode);
      setCustomTheme(null);
    } else {
      const base = customTheme ? cloneTheme(customTheme) : defaultCustomTheme();
      setDraft(base);
      applyTheme(base);
    }
  }

  function updateToken(key: keyof ThemeTokens, value: string) {
    setDraft((prev: Theme) => {
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
    setSelectedThemeId("custom");
    setAppearanceMode(draft.mode);
    setCustomTheme(draft);
    toast.success("Theme saved successfully");
  }

  function handleReset() {
    const base = customTheme ? cloneTheme(customTheme) : defaultCustomTheme();
    setDraft(base);
    applyTheme(base);
  }

  function handleRestoreDefaults() {
    setSelector("builtin-venice");
    applyTheme(BUILTIN_VENICE);
    setSelectedThemeId("builtin-venice");
    setAppearanceMode("dark");
    setCustomTheme(null);
  }

  async function handleExport() {
    try {
      const yaml = await themeToYaml(draft);
      await desktopFiles.exportYaml(yaml, "theme.yaml");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export theme");
    }
  }

  async function handleImport() {
    try {
      const yaml = await desktopFiles.importYamlString();
      if (!yaml) return;
      const importedTheme = await yamlToTheme(yaml);
      setDraft(importedTheme);
      applyTheme(importedTheme);
      toast.info("Theme imported, make sure to save it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import theme");
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
            { id: "builtin-gruvbox-dark", label: "GruvBox Dark" },
            { id: "builtin-rosepine", label: "Rosepine" },
            { id: "builtin-nord", label: "Forge Nord" },
            { id: "builtin-tokyo-night", label: "Forge Tokyo" },
            { id: "builtin-catppuccin", label: "Forge Catppuccin" },
            { id: "builtin-solarized-dark", label: "Forge Solarized Dark" },
            { id: "builtin-solarized-light", label: "Forge Solarized Light" },
            { id: "builtin-one-dark", label: "Forge One Dark" },
            { id: "builtin-monokai", label: "Forge Monokai" },
            { id: "builtin-github-light", label: "Forge GitHub Light" },
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
                    value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : COLOR_INPUT_FALLBACK}
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
