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
  BUILTIN_OBSIDIAN_BLOOM,
  BUILTIN_HARBOR_FOG,
  BUILTIN_CIRCUIT_MINT,
  BUILTIN_AMBER_ARCHIVE,
  BUILTIN_NEON_DUSK,
  BUILTIN_AURORA_BOREAL,
  BUILTIN_SAKURA_TERMINAL,
  BUILTIN_BASALT_NOIR,
  BUILTIN_SOLAR_ASH,
  BUILTIN_CYBER_ORCHID,
  BUILTIN_ARCTIC_GLASS,
  BUILTIN_DESERT_COPPERFIELD,
  BUILTIN_TOXIC_LIMEWIRE,
  BUILTIN_MIDNIGHT_VELVET,
  BUILTIN_PORCELAIN_DAYBREAK,
  BUILTIN_SYNTHWAVE_HARBOR,
  BUILTIN_MOSS_CIRCUIT,
  BUILTIN_EMBER_MONASTERY,
  BUILTIN_GLACIAL_INK,
  BUILTIN_ULTRAVIOLET_RAIN,
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
import { useConfigStore } from "../stores/config-store";
import { toast } from "../stores/toast-store";
import { redactErrorMessage } from "../shared/redaction";
import { desktopConfig } from "../services/desktopBridge";

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

const TOKEN_CATEGORIES: Array<{
  name: string;
  keys: Array<keyof ThemeTokens>;
}> = [
  {
    name: "Surfaces & Backgrounds",
    keys: ["background", "surface", "surfaceElevated", "surfaceMuted", "overlay", "glow"],
  },
  {
    name: "Typography & Text",
    keys: ["foreground", "foregroundMuted", "foregroundSubtle", "placeholder", "disabledForeground", "link"],
  },
  {
    name: "Borders & Focus",
    keys: ["border", "borderStrong", "focusRing", "selectionBackground", "selectionForeground"],
  },
  {
    name: "Controls & Buttons",
    keys: ["accent", "accentHover", "accentForeground", "buttonPrimaryBackground", "buttonPrimaryForeground", "buttonSecondaryBackground", "buttonSecondaryForeground", "inputBackground", "inputForeground"],
  },
  {
    name: "Status & Feedback",
    keys: ["success", "successForeground", "warning", "warningForeground", "danger", "dangerForeground", "info"],
  },
];

function cloneTheme(theme: Theme): Theme {
  return { ...theme, tokens: completeThemeTokens(theme.mode, theme.tokens) };
}

function defaultCustomTheme(): Theme {
  return {
    id: `custom-${Date.now()}`,
    name: "My Custom Theme",
    mode: "dark",
    tokens: completeThemeTokens("dark", BUILTIN_VENICE.tokens),
  };
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
    return { id: `custom-${Date.now()}`, name, mode, tokens: importedTokens(mode, first.tokens) };
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
  return { id: `custom-${Date.now()}`, name, mode, tokens: completeThemeTokens(mode, legacy) };
}

const EMPTY_CUSTOM_THEMES: Theme[] = [];

interface ImportPreviewModalState {
  theme: Theme;
  conflictId?: string;
  conflictName?: string;
}

export function ThemeMaker() {
  const selectedThemeId = useSettingsStore((s) => s.selectedThemeId) || "builtin-venice";
  const customTheme = useSettingsStore((s) => s.customTheme);
  const customThemes = useSettingsStore((s) => s.customThemes) ?? EMPTY_CUSTOM_THEMES;
  const setSelectedThemeId = useSettingsStore((s) => s.setSelectedThemeId);
  const setCustomTheme = useSettingsStore((s) => s.setCustomTheme);
  const setAppearanceMode = useSettingsStore((s) => s.setAppearanceMode);
  const yamlThemes = useConfigStore((s) => s.yamlThemes);

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
      "builtin-obsidian-bloom": BUILTIN_OBSIDIAN_BLOOM,
      "builtin-harbor-fog": BUILTIN_HARBOR_FOG,
      "builtin-circuit-mint": BUILTIN_CIRCUIT_MINT,
      "builtin-amber-archive": BUILTIN_AMBER_ARCHIVE,
      "builtin-neon-dusk": BUILTIN_NEON_DUSK,
      "builtin-aurora-boreal": BUILTIN_AURORA_BOREAL,
      "builtin-sakura-terminal": BUILTIN_SAKURA_TERMINAL,
      "builtin-basalt-noir": BUILTIN_BASALT_NOIR,
      "builtin-solar-ash": BUILTIN_SOLAR_ASH,
      "builtin-cyber-orchid": BUILTIN_CYBER_ORCHID,
      "builtin-arctic-glass": BUILTIN_ARCTIC_GLASS,
      "builtin-desert-copperfield": BUILTIN_DESERT_COPPERFIELD,
      "builtin-toxic-limewire": BUILTIN_TOXIC_LIMEWIRE,
      "builtin-midnight-velvet": BUILTIN_MIDNIGHT_VELVET,
      "builtin-porcelain-daybreak": BUILTIN_PORCELAIN_DAYBREAK,
      "builtin-synthwave-harbor": BUILTIN_SYNTHWAVE_HARBOR,
      "builtin-moss-circuit": BUILTIN_MOSS_CIRCUIT,
      "builtin-ember-monastery": BUILTIN_EMBER_MONASTERY,
      "builtin-glacial-ink": BUILTIN_GLACIAL_INK,
      "builtin-ultraviolet-rain": BUILTIN_ULTRAVIOLET_RAIN,
    }),
    []
  );

  const customThemesMap = useMemo(() => {
    const map: Record<string, Theme> = {};
    for (const [id, theme] of Object.entries(yamlThemes)) {
      if (!builtInMap[id]) {
        map[id] = theme;
      }
    }
    return map;
  }, [yamlThemes, builtInMap]);

  const allThemesMap = useMemo(() => ({ ...builtInMap, ...yamlThemes }), [builtInMap, yamlThemes]);

  const [selector, setSelector] = useState<string>(selectedThemeId || "builtin-venice");
  const [draft, setDraft] = useState<Theme>(() => {
    const active = allThemesMap[selectedThemeId] || customTheme || BUILTIN_VENICE;
    return cloneTheme(active);
  });
  const [importModal, setImportModal] = useState<ImportPreviewModalState | null>(null);

  useEffect(() => {
    setSelector(selectedThemeId || "builtin-venice");
    const active = allThemesMap[selectedThemeId] || customTheme || BUILTIN_VENICE;
    setDraft(cloneTheme(active));
  }, [selectedThemeId, customTheme, customThemes, allThemesMap]);

  const isCustomSelected = selector === "custom" || Boolean(customThemesMap[selector]);

  const isDraftDirty = useMemo(() => {
    const currentStored = allThemesMap[selector] || customTheme || BUILTIN_VENICE;
    if (draft.name !== currentStored.name || draft.mode !== currentStored.mode) return true;
    return JSON.stringify(draft.tokens) !== JSON.stringify(currentStored.tokens);
  }, [draft, selector, allThemesMap, customTheme]);

  const themeOptions = useMemo(() => {
    const builtInOptions = [
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
      { id: "builtin-obsidian-bloom", label: "Obsidian Bloom" },
      { id: "builtin-harbor-fog", label: "Harbor Fog" },
      { id: "builtin-circuit-mint", label: "Circuit Mint" },
      { id: "builtin-amber-archive", label: "Amber Archive" },
      { id: "builtin-neon-dusk", label: "Neon Dusk" },
      { id: "builtin-aurora-boreal", label: "Aurora Boreal" },
      { id: "builtin-sakura-terminal", label: "Sakura Terminal" },
      { id: "builtin-basalt-noir", label: "Basalt Noir" },
      { id: "builtin-solar-ash", label: "Solar Ash" },
      { id: "builtin-cyber-orchid", label: "Cyber Orchid" },
      { id: "builtin-arctic-glass", label: "Arctic Glass" },
      { id: "builtin-desert-copperfield", label: "Desert Copperfield" },
      { id: "builtin-toxic-limewire", label: "Toxic Limewire" },
      { id: "builtin-midnight-velvet", label: "Midnight Velvet" },
      { id: "builtin-porcelain-daybreak", label: "Porcelain Daybreak" },
      { id: "builtin-synthwave-harbor", label: "Synthwave Harbor" },
      { id: "builtin-moss-circuit", label: "Moss Circuit" },
      { id: "builtin-ember-monastery", label: "Ember Monastery" },
      { id: "builtin-glacial-ink", label: "Glacial Ink" },
      { id: "builtin-ultraviolet-rain", label: "Ultraviolet Rain" },
    ];
    
    const optionsMap = new Map<string, { id: string, label: string }>();
    
    // Add built-ins first
    builtInOptions.forEach(opt => optionsMap.set(opt.id, opt));
    
    // Add yaml themes (overriding built-ins with the same ID, though they should be identical)
    Object.entries(yamlThemes).forEach(([id, theme]) => optionsMap.set(id, { id, label: theme.name }));
    
    // Add custom user themes
    Object.values(customThemesMap).forEach(theme => optionsMap.set(theme.id, { id: theme.id, label: theme.name }));

    const options = Array.from(optionsMap.values());
    if (!optionsMap.has("custom")) {
      options.push({ id: "custom", label: "Custom Theme" });
    }
    return options;
  }, [yamlThemes, customThemesMap]);

  function handleSelect(id: string) {
    setSelector(id);
    if (id !== "custom") {
      const theme = allThemesMap[id] || BUILTIN_VENICE;
      setDraft(cloneTheme(theme));
      applyTheme(theme);
      setSelectedThemeId(id);
      setAppearanceMode(theme.mode);
      if (customThemesMap[id]) {
        setCustomTheme(customThemesMap[id]);
      }
    } else {
      const base = customTheme ? cloneTheme(customTheme) : defaultCustomTheme();
      setDraft(base);
      applyTheme(base);
    }
  }

  async function handleCreateNewFromActive() {
    const base = allThemesMap[selector] || draft || BUILTIN_VENICE;
    const newTheme: Theme = {
      id: `user-theme-${Date.now()}`,
      name: `${base.name} (Custom)`,
      mode: base.mode,
      tokens: completeThemeTokens(base.mode, base.tokens),
    };
    setDraft(newTheme);
    setSelector(newTheme.id);
    applyTheme(newTheme);
    
    try {
      await desktopConfig.saveTheme(newTheme);
      toast.success(`Created new custom theme "${newTheme.name}"`);
    } catch (err) {
      toast.error(`Failed to create theme: ${redactErrorMessage(err)}`);
    }
  }

  function updateToken(key: keyof ThemeTokens, value: string) {
    setDraft((prev: Theme) => {
      const next = cloneTheme(prev);
      next.tokens[key] = value;
      return next;
    });
  }

  function updateMode(mode: ThemeMode) {
    setDraft((prev: Theme) => {
      const next = cloneTheme(prev);
      next.mode = mode;
      return next;
    });
  }

  function updateName(name: string) {
    setDraft((prev: Theme) => ({ ...prev, name }));
  }

  useEffect(() => {
    if (isCustomSelected || isDraftDirty) {
      applyTheme(draft);
    }
  }, [draft, isCustomSelected, isDraftDirty]);

  async function handleSave() {
    try {
      await desktopConfig.saveTheme(draft);
      setCustomTheme(draft);
      setSelectedThemeId(draft.id);
      setAppearanceMode(draft.mode);
      setSelector(draft.id);
      toast.success(`Theme "${draft.name}" saved successfully`);
    } catch (err) {
      toast.error(`Failed to save theme: ${redactErrorMessage(err)}`);
    }
  }

  function handleReset() {
    const stored = allThemesMap[selector] || customTheme || BUILTIN_VENICE;
    const reverted = cloneTheme(stored);
    setDraft(reverted);
    applyTheme(reverted);
    toast.info("Unsaved draft changes reset");
  }

  function handleRestoreDefaults() {
    setSelector("builtin-venice");
    applyTheme(BUILTIN_VENICE);
    setSelectedThemeId("builtin-venice");
    setAppearanceMode("dark");
    setCustomTheme(null);
    setDraft(cloneTheme(BUILTIN_VENICE));
    toast.info("Restored default Venice theme");
  }

  async function handleDeleteCustom() {
    if (!customThemesMap[selector] && selector !== "custom") return;
    const targetId = selector;
    try {
      await desktopConfig.deleteTheme(targetId);
      toast.info("Custom theme deleted");
    } catch (err) {
      toast.error(`Failed to delete theme: ${redactErrorMessage(err)}`);
    }
  }

  async function handleExport() {
    try {
      const yaml = await themeToYaml(draft);
      const filename = `${draft.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}.theme.yaml`;
      await desktopFiles.exportYaml(yaml, filename);
      toast.success("Theme exported successfully");
    } catch (err) {
      toast.error("Failed to export theme", redactErrorMessage(err));
    }
  }

  async function handleImportClick() {
    try {
      const yaml = await desktopFiles.importYamlString();
      if (!yaml) return;
      const importedTheme = await yamlToTheme(yaml);

      const conflict = Object.values(customThemesMap).find((t) => t.id === importedTheme.id || t.name.toLowerCase() === importedTheme.name.toLowerCase());
      setImportModal({
        theme: importedTheme,
        conflictId: conflict?.id,
        conflictName: conflict?.name,
      });
    } catch (err) {
      toast.error("Failed to import theme", redactErrorMessage(err));
    }
  }

  async function confirmImport(mode: "apply" | "copy" | "replace") {
    if (!importModal) return;
    const targetId = (mode === "copy" || (mode === "apply" && importModal.conflictId))
      ? `user-theme-${Date.now()}`
      : (mode === "replace" && importModal.conflictId) ? importModal.conflictId : importModal.theme.id;
    const targetName = (mode === "copy" || (mode === "apply" && importModal.conflictId))
      ? `${importModal.theme.name} (Imported)`
      : importModal.theme.name;

    const finalTheme: Theme = {
      ...cloneTheme(importModal.theme),
      id: targetId,
      name: targetName,
    };
    try {
      await desktopConfig.saveTheme(finalTheme);
      setDraft(finalTheme);
      setSelectedThemeId(finalTheme.id);
      setSelector(finalTheme.id);
      setAppearanceMode(finalTheme.mode);
      applyTheme(finalTheme);
      setImportModal(null);
      toast.success(`Theme "${finalTheme.name}" imported and applied`);
    } catch (err) {
      toast.error(`Failed to import theme: ${redactErrorMessage(err)}`);
    }
  }

  const validColor = (v: string) => isValidColorValue(v);

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Theme System & Editor</h3>
          <p className="text-xs text-text-muted">
            Configure theme colors, border contrast, focus rings, and action button styles across Venice Forge.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={handleCreateNewFromActive}>
            + Create New Theme
          </button>
          <button className="btn" onClick={handleImportClick}>
            Import Theme…
          </button>
          <button className="btn" onClick={handleExport}>
            Export Theme
          </button>
        </div>
      </div>

      {/* Theme Selector Palette */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-text-secondary">Select Active Theme</label>
          {isDraftDirty && (
            <span className="inline-flex items-center rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning border border-warning/30">
              Unsaved Draft Changes
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1 border border-border rounded-lg bg-surface">
          {themeOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                selector === opt.id
                  ? "bg-accent text-accent-fg border-accent"
                  : "bg-surface-elevated text-text-secondary border-border hover:bg-surface hover:text-text-primary"
              }`}
              aria-pressed={selector === opt.id}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Draft Custom Editor */}
      <div className="space-y-4 rounded-xl border border-border p-4 bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => updateName(e.target.value)}
              className="rounded-md border border-border bg-surface-elevated px-3 py-1 text-sm font-semibold text-text-primary"
              aria-label="Theme name"
            />
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-elevated p-1">
              <button
                type="button"
                onClick={() => updateMode("dark")}
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  draft.mode === "dark" ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text-primary"
                }`}
              >
                Dark Mode
              </button>
              <button
                type="button"
                onClick={() => updateMode("light")}
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  draft.mode === "light" ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text-primary"
                }`}
              >
                Light Mode
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn primary" onClick={handleSave} disabled={!isDraftDirty && selector === draft.id}>
              Save Theme
            </button>
            <button className="btn" onClick={handleReset} disabled={!isDraftDirty}>
              Cancel / Reset
            </button>
            {customThemesMap[selector] && (
              <button className="btn danger" onClick={handleDeleteCustom}>
                Delete Theme
              </button>
            )}
            <button className="btn ghost" onClick={handleRestoreDefaults}>
              Restore Default Theme
            </button>
          </div>
        </div>

        {/* Semantic Token Categories */}
        <div className="space-y-6 pt-2">
          {TOKEN_CATEGORIES.map((cat) => (
            <div key={cat.name} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted border-b border-border/50 pb-1">
                {cat.name}
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cat.keys.map((key) => {
                  const value = draft.tokens[key] || "";
                  const valid = validColor(value);
                  return (
                    <div key={key} className="flex items-center gap-2 rounded-md border border-border/60 p-2 bg-surface-elevated">
                      <input
                        type="color"
                        aria-label={`${TOKEN_LABELS[key]} color picker`}
                        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : COLOR_INPUT_FALLBACK}
                        onChange={(e) => updateToken(key, e.target.value)}
                        className="h-7 w-8 shrink-0 rounded border border-border bg-transparent cursor-pointer"
                      />
                      <div className="flex flex-1 flex-col min-w-0">
                        <label htmlFor={`token-${key}`} className="text-xs text-text-secondary truncate">
                          {TOKEN_LABELS[key]}
                        </label>
                        <input
                          id={`token-${key}`}
                          type="text"
                          value={value}
                          onChange={(e) => updateToken(key, e.target.value)}
                          aria-invalid={!valid}
                          className={`w-full rounded border px-1.5 py-0.5 text-xs font-mono bg-surface text-text-primary ${
                            valid ? "border-border" : "border-danger"
                          }`}
                        />
                      </div>
                      {!valid && (
                        <span role="alert" className="text-[10px] text-danger shrink-0">
                          Invalid
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Preview Panel */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-text-secondary">Live Theme Preview</div>
          <span className="text-xs text-text-muted">Showing live preview of active draft</span>
        </div>
        <ThemePreview theme={draft} />
      </div>

      {/* Import Preview Modal */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">{/* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */}
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface-elevated p-6 space-y-4 shadow-2xl">
            <div className="border-b border-border/50 pb-3">
              <h3 className="text-lg font-semibold text-text-primary">Import Theme Preview</h3>
              <p className="text-xs text-text-muted">
                Review theme metadata and preview layout before applying to your workspace.
              </p>
            </div>

            <div className="space-y-2 text-sm text-text-secondary">
              <div>
                <strong>Theme Name:</strong> {importModal.theme.name}
              </div>
              <div>
                <strong>Mode:</strong> {importModal.theme.mode}
              </div>
              {importModal.conflictName && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                  A custom theme named &ldquo;{importModal.conflictName}&rdquo; already exists in your workspace.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border p-3 bg-surface">
              <div className="text-xs font-semibold text-text-muted mb-2">Imported Layout Preview</div>
              <ThemePreview theme={importModal.theme} />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/50">
              <button className="btn ghost" onClick={() => setImportModal(null)}>
                Cancel
              </button>
              {importModal.conflictName && (
                <button className="btn danger" onClick={() => confirmImport("replace")}>
                  Replace Existing
                </button>
              )}
              <button className="btn" onClick={() => confirmImport("copy")}>
                Import as Copy
              </button>
              <button className="btn primary" onClick={() => confirmImport("apply")}>
                Import & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
