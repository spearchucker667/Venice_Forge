import React, { useEffect, useMemo, useState } from "react";
import { BUILTIN_VENICE, BUILTIN_DARK, BUILTIN_LIGHT, BUILTIN_COPPER, BUILTIN_DRACULA, BUILTIN_GRUVBOX_DARK, BUILTIN_ROSEPINE, applyTheme, type Theme, type ThemeTokens } from "../theme";
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
  return cloneTheme(BUILTIN_VENICE);
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

  function themeToYaml(theme: Theme): string {
    const t = theme.tokens;
    return `---
# Venice Forge theme configuration
accent: "${t.accent}"
background: "${t.background}"
details: "${theme.name}"
foreground: "${t.textPrimary}"
terminal_colors:
  bright:
    black: "${t.textMuted}"
    blue: "${t.accentHover || t.accent}"
    cyan: "${t.info}"
    green: "${t.success}"
    magenta: "${t.accent}"
    red: "${t.danger}"
    white: "${t.textPrimary}"
    yellow: "${t.warning}"
  normal:
    black: "${t.background}"
    blue: "${t.accent}"
    cyan: "${t.info}"
    green: "${t.success}"
    magenta: "${t.accent}"
    red: "${t.danger}"
    white: "${t.textSecondary}"
    yellow: "${t.warning}"
`;
  }

  function yamlToTheme(yamlStr: string): Theme {
    const lines = yamlStr.split('\n');
    const parsed: {
      accent?: string;
      background?: string;
      details?: string;
      foreground?: string;
      terminal_colors: {
        bright: Record<string, string>;
        normal: Record<string, string>;
      };
    } = {
      terminal_colors: {
        bright: {},
        normal: {}
      }
    };
    
    let currentGroup: 'bright' | 'normal' | null = null;
    
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#') || line === '---') continue;
      
      if (line.startsWith('bright:')) {
        currentGroup = 'bright';
        continue;
      }
      if (line.startsWith('normal:')) {
        currentGroup = 'normal';
        continue;
      }
      if (line.startsWith('terminal_colors:')) {
        continue;
      }
      
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
      if (match) {
        const key = match[1];
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        if (currentGroup && ['black', 'blue', 'cyan', 'green', 'magenta', 'red', 'white', 'yellow'].includes(key)) {
          parsed.terminal_colors[currentGroup][key] = value;
        } else {
          if (key === 'accent' || key === 'background' || key === 'details' || key === 'foreground') {
            parsed[key] = value;
            currentGroup = null;
          }
        }
      }
    }

    if (!parsed.background || !parsed.foreground || !parsed.accent || !parsed.details) {
      throw new Error("Invalid theme yaml: background, foreground, accent, and details (theme name) are required.");
    }

    const name = parsed.details || "Imported Theme";
    const bg = parsed.background;
    const fg = parsed.foreground;
    const acc = parsed.accent;
    
    const surface = parsed.terminal_colors?.normal?.black || bg;
    const success = parsed.terminal_colors?.bright?.green || "#74d66a";
    const warning = parsed.terminal_colors?.bright?.yellow || "#d6a84f";
    const danger = parsed.terminal_colors?.bright?.red || "#ef4444";
    const info = parsed.terminal_colors?.bright?.cyan || "#7da7ff";
    
    const tokens: ThemeTokens = {
      background: bg,
      surface: surface,
      surfaceElevated: parsed.terminal_colors?.bright?.black || surface,
      border: parsed.terminal_colors?.normal?.white || "#2a3140",
      textPrimary: fg,
      textSecondary: parsed.terminal_colors?.normal?.white || fg,
      textMuted: parsed.terminal_colors?.bright?.black || fg,
      accent: acc,
      accentHover: parsed.terminal_colors?.bright?.blue || acc,
      accentForeground: bg,
      success: success,
      warning: warning,
      danger: danger,
      info: info,
      focusRing: acc,
      overlay: 'rgba(0, 0, 0, 0.6)',
      glow: acc + '25',
    };

    return {
      id: 'custom',
      name: name,
      mode: 'dark',
      tokens,
    };
  }

  async function handleExport() {
    try {
      const yaml = themeToYaml(draft);
      await desktopFiles.exportYaml(yaml, "theme.yaml");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export theme");
    }
  }

  async function handleImport() {
    try {
      const yaml = await desktopFiles.importYamlString();
      if (!yaml) return;
      const importedTheme = yamlToTheme(yaml);
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
