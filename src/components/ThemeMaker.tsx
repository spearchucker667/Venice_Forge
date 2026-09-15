import { translateRuntime } from "../i18n/runtimeTranslator";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  applyTheme,
  resolveInitialTheme,
  legacyThemeToFamily,
  luminance,
  resolveTheme,
  serializeThemeFamilyYaml,
  parseThemeYaml,
  type Theme,
  type ThemeFamily,
  type ThemeMode,
  type ThemeTokens,
  type CodeThemeConfig,
  type CodeSyntaxPresetId,
  type CodeThemeTokens,
  CODE_SYNTAX_PRESETS,
  CODE_SURFACE_TOKEN_KEYS,
  CODE_SYNTAX_TOKEN_KEYS,
  resolveCodeThemeTokens,
  deriveCodeThemeTokens,
} from "../theme";
import { BUILTIN_CANONICAL_MODES, BUILTIN_THEME_FAMILIES } from "../theme/builtins";
import { COLOR_INPUT_FALLBACK } from "../theme/fallbacks";
import { isValidColorValue } from "../theme/validateColor";
import { ConfirmModal } from "./ConfirmModal";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { ThemePreview } from "./ThemePreview";
import { desktopFiles } from "../services/desktopBridge";
import { useSettingsStore } from "../stores/settings-store";
import { useConfigStore } from "../stores/config-store";
import { toast } from "../stores/toast-store";
import { redactErrorMessage } from "../shared/redaction";
import { desktopConfig } from "../services/desktopBridge";
import { Trans, useTranslation } from "react-i18next";
import { sortThemeOptions } from "../utils/themeOptions";
import { RotateCcw } from "lucide-react";

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
  get placeholder() {
    return translateRuntime(
      "runtimeGenerated.components.thememaker.metadata.placeholder",
      "Placeholder",
    );
  },
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
    keys: [
      "background",
      "surface",
      "surfaceElevated",
      "surfaceMuted",
      "overlay",
      "glow",
    ],
  },
  {
    name: "Typography & Text",
    keys: [
      "foreground",
      "foregroundMuted",
      "foregroundSubtle",
      "placeholder",
      "disabledForeground",
      "link",
    ],
  },
  {
    name: "Borders & Focus",
    keys: [
      "border",
      "borderStrong",
      "focusRing",
      "selectionBackground",
      "selectionForeground",
    ],
  },
  {
    name: "Controls & Buttons",
    keys: [
      "accent",
      "accentHover",
      "accentForeground",
      "buttonPrimaryBackground",
      "buttonPrimaryForeground",
      "buttonSecondaryBackground",
      "buttonSecondaryForeground",
      "inputBackground",
      "inputForeground",
    ],
  },
  {
    name: "Status & Feedback",
    keys: [
      "success",
      "successForeground",
      "warning",
      "warningForeground",
      "danger",
      "dangerForeground",
      "info",
    ],
  },
];

function getCodeTokenLabel(
  t: (key: string, fallback: string) => string,
  key: keyof CodeThemeTokens,
): string {
  return t(
    `runtimeGenerated.componentsThememaker.codeToken.${key}`,
    CODE_TOKEN_LABELS[key] ?? key,
  );
}

const CODE_TOKEN_LABELS: Record<
  | (typeof CODE_SURFACE_TOKEN_KEYS)[number]
  | (typeof CODE_SYNTAX_TOKEN_KEYS)[number],
  string
> = {
  background: "Code background",
  foreground: "Code foreground",
  border: "Code border",
  headerBackground: "Header background",
  headerForeground: "Header foreground",
  inlineBackground: "Inline background",
  inlineForeground: "Inline foreground",
  selectionBackground: "Selection background",
  comment: "Comment",
  punctuation: "Punctuation",
  property: "Property",
  tag: "Tag",
  boolean: "Boolean",
  number: "Number",
  constant: "Constant",
  symbol: "Symbol",
  deleted: "Deleted",
  selector: "Selector",
  attribute: "Attribute",
  string: "String",
  character: "Character",
  builtin: "Builtin",
  inserted: "Inserted",
  operator: "Operator",
  entity: "Entity",
  url: "URL",
  atRule: "At-rule",
  keyword: "Keyword",
  function: "Function",
  className: "Class / Type",
  regex: "Regex",
  important: "Important",
  variable: "Variable",
};

const CODE_TOKEN_CATEGORIES: Array<{
  name: string;
  keys: Array<keyof CodeThemeTokens>;
}> = [
  {
    name: "Code Surfaces",
    keys: [...CODE_SURFACE_TOKEN_KEYS],
  },
  {
    name: "Syntax Tokens",
    keys: [...CODE_SYNTAX_TOKEN_KEYS],
  },
];

function cloneCodeConfig(code: CodeThemeConfig): CodeThemeConfig {
  return { preset: code.preset, tokens: { ...code.tokens } };
}

function cloneFamily(family: ThemeFamily): ThemeFamily {
  return {
    ...family,
    variants: {
      light: {
        tokens: { ...family.variants.light.tokens },
        code: cloneCodeConfig(family.variants.light.code),
      },
      dark: {
        tokens: { ...family.variants.dark.tokens },
        code: cloneCodeConfig(family.variants.dark.code),
      },
    },
  };
}

function singleModeThemeFromFamily(
  family: ThemeFamily,
  mode: ThemeMode,
): Theme {
  return {
    id: family.id,
    name: family.name,
    mode,
    tokens: family.variants[mode].tokens,
    code: cloneCodeConfig(family.variants[mode].code),
  };
}

function familyFromTheme(theme: Theme): ThemeFamily {
  return legacyThemeToFamily(theme);
}

function defaultCustomFamily(): ThemeFamily {
  const base =
    BUILTIN_THEME_FAMILIES.find((f) => f.id === "venice") ??
    BUILTIN_THEME_FAMILIES[0];
  return cloneFamily(base);
}

function getCanonicalMode(family: ThemeFamily): ThemeMode {
  const normId = family.id.replace(/^builtin-/, "");
  if (normId in BUILTIN_CANONICAL_MODES) {
    return BUILTIN_CANONICAL_MODES[normId];
  }
  return luminance(family.variants.light.tokens.background) > 0.55
    ? "light"
    : "dark";
}

const EMPTY_CUSTOM_THEMES: Theme[] = [];

/** Backwards-compatible single-mode Theme exporter.
 *  Serializes the theme as a V2 family with the same tokens in both variants.
 *  The original `mode` is preserved via a top-level `mode` field so the
 *  single-mode intent survives a yamlToTheme round-trip. */
export async function themeToYaml(theme: Theme): Promise<string> {
  return serializeThemeFamilyYaml(familyFromTheme(theme), { mode: theme.mode });
}

/** Backwards-compatible single-mode Theme importer.
 *  Parses V2, V1, or legacy flat YAML and returns the family's canonical variant.
 *  Legacy documents that declare an explicit `mode` field preserve that mode. */
export async function yamlToTheme(yamlStr: string): Promise<Theme> {
  const family = parseThemeYaml(yamlStr);
  const explicitMode = yamlStr.match(/^mode:\s*(dark|light)$/m)?.[1] as
    ThemeMode | undefined;
  const mode = explicitMode || getCanonicalMode(family);
  return singleModeThemeFromFamily(family, mode);
}

interface ImportPreviewModalState {
  family: ThemeFamily;
  conflictId?: string;
  conflictName?: string;
  builtInConflict?: boolean;
}

export function ThemeMaker() {
  const { t: tRuntime } = useTranslation("common");
  const selectedThemeId =
    useSettingsStore((s) => s.selectedThemeId) || "builtin-venice";
  const customTheme = useSettingsStore((s) => s.customTheme);
  const customThemes =
    useSettingsStore((s) => s.customThemes) ?? EMPTY_CUSTOM_THEMES;
  const setSelectedThemeId = useSettingsStore((s) => s.setSelectedThemeId);
  const setCustomTheme = useSettingsStore((s) => s.setCustomTheme);
  const saveCustomTheme = useSettingsStore((s) => s.saveCustomTheme);
  const deleteCustomTheme = useSettingsStore((s) => s.deleteCustomTheme);
  const setAppearanceMode = useSettingsStore((s) => s.setAppearanceMode);
  const yamlThemes = useConfigStore((s) => s.yamlThemes);
  const setYamlThemes = useConfigStore((s) => s.setYamlThemes);

  // Registry maps.
  const builtInMap = useMemo(() => {
    const map: Record<string, ThemeFamily> = {};
    for (const family of BUILTIN_THEME_FAMILIES) {
      map[`builtin-${family.id}`] = family;
      map[family.id] = family;
    }
    return map;
  }, []);

  const customFamilyMap = useMemo(() => {
    const map: Record<string, ThemeFamily> = {};
    for (const theme of customThemes) {
      map[theme.id] = familyFromTheme(theme);
    }
    return map;
  }, [customThemes]);

  const allFamiliesMap = useMemo(() => {
    const map: Record<string, ThemeFamily> = {
      ...builtInMap,
      ...customFamilyMap,
      ...yamlThemes,
    };
    for (const [id, family] of Object.entries(yamlThemes)) {
      if (!id.startsWith("builtin-")) {
        map[`builtin-${id}`] = family;
      }
    }
    return map;
  }, [builtInMap, customFamilyMap, yamlThemes]);

  const [selector, setSelector] = useState<string>(
    selectedThemeId || "builtin-venice",
  );
  const [draft, setDraft] = useState<ThemeFamily>(() => {
    const active =
      allFamiliesMap[selectedThemeId] ||
      (customTheme ? familyFromTheme(customTheme) : null) ||
      defaultCustomFamily();
    return cloneFamily(active);
  });
  const [previewMode, setPreviewMode] = useState<ThemeMode>(() => {
    const family = allFamiliesMap[selectedThemeId] || defaultCustomFamily();
    return getCanonicalMode(family);
  });
  const [importModal, setImportModal] =
    useState<ImportPreviewModalState | null>(null);

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [confirmation, setConfirmation] = useState<{
    message: string;
    action: () => void;
  } | null>(null);
  const importRef = useRef<HTMLDivElement>(null);
  useFocusTrap(importRef, Boolean(importModal), () => {
    if (!busyRef.current) setImportModal(null);
  });
  const previousSelection = useRef(selectedThemeId);
  // Registry refreshes must never overwrite an in-progress editor draft.
  useEffect(() => {
    if (previousSelection.current === selectedThemeId) return;
    previousSelection.current = selectedThemeId;
    const active = allFamiliesMap[selectedThemeId] || defaultCustomFamily();
    setSelector(selectedThemeId);
    setDraft(cloneFamily(active));
    setPreviewMode(getCanonicalMode(active));
  }, [selectedThemeId, allFamiliesMap]);

  const isCustomSelected =
    selector === "custom" ||
    Boolean(customFamilyMap[selector]) ||
    Boolean(yamlThemes[selector]);

  const storedFamily = useMemo(() => {
    return (
      allFamiliesMap[selector] ||
      (customTheme ? familyFromTheme(customTheme) : null) ||
      defaultCustomFamily()
    );
  }, [allFamiliesMap, selector, customTheme]);

  const isDraftDirty = useMemo(() => {
    if (draft.id !== storedFamily.id || draft.name !== storedFamily.name) {
      return true;
    }
    for (const mode of ["light", "dark"] as ThemeMode[]) {
      if (
        JSON.stringify(draft.variants[mode].tokens) !==
        JSON.stringify(storedFamily.variants[mode].tokens)
      ) {
        return true;
      }
      if (
        JSON.stringify(draft.variants[mode].code) !==
        JSON.stringify(storedFamily.variants[mode].code)
      ) {
        return true;
      }
    }
    return false;
  }, [draft, storedFamily]);

  const themeOptions = useMemo(() => {
    const optionsMap = new Map<string, { id: string; label: string }>();

    // Built-ins use legacy "builtin-<id>" selectors for backwards compatibility.
    const builtinLookup = new Map<string, { id: string; name: string }>();
    for (const family of BUILTIN_THEME_FAMILIES) {
      const builtinId = `builtin-${family.id}`;
      const entry = { id: builtinId, name: family.name };
      builtinLookup.set(family.name.toLowerCase().trim(), entry);
      builtinLookup.set(family.id.toLowerCase().trim(), entry);
      builtinLookup.set(builtinId.toLowerCase().trim(), entry);
      optionsMap.set(builtinId, { id: builtinId, label: family.name });
    }

    // YAML themes: if matching a built-in, override the built-in option in place; otherwise add new
    for (const [id, family] of Object.entries(yamlThemes)) {
      const normName = (family.name || "").toLowerCase().trim();
      const normId = id.toLowerCase().trim();
      const matchingBuiltin =
        builtinLookup.get(normName) || builtinLookup.get(normId);

      if (matchingBuiltin) {
        optionsMap.set(matchingBuiltin.id, {
          id: matchingBuiltin.id,
          label: family.name || matchingBuiltin.name,
        });
      } else {
        optionsMap.set(id, { id, label: family.name });
      }
    }

    // Custom user themes.
    for (const theme of customThemes) {
      const normName = (theme.name || "").toLowerCase().trim();
      const normId = theme.id.toLowerCase().trim();
      const matchingBuiltin =
        builtinLookup.get(normName) || builtinLookup.get(normId);

      if (matchingBuiltin) {
        optionsMap.set(matchingBuiltin.id, {
          id: matchingBuiltin.id,
          label: theme.name || matchingBuiltin.name,
        });
      } else {
        optionsMap.set(theme.id, { id: theme.id, label: theme.name });
      }
    }

    // Deduplicate any options that have the exact same display label (case-insensitive)
    const dedupedByLabel = new Map<string, { id: string; label: string }>();
    for (const opt of optionsMap.values()) {
      const key = opt.label.toLowerCase().trim();
      const existing = dedupedByLabel.get(key);
      if (!existing) {
        dedupedByLabel.set(key, opt);
      } else if (
        !existing.id.startsWith("builtin-") &&
        opt.id.startsWith("builtin-")
      ) {
        dedupedByLabel.set(key, opt);
      }
    }

    const options = sortThemeOptions(Array.from(dedupedByLabel.values()));
    if (!options.some((opt) => opt.id === "custom")) {
      options.push({
        id: "custom",
        label: tRuntime(
          "runtimeGenerated.components.thememaker.metadata.customTheme",
        ),
      });
    }
    return options;
  }, [yamlThemes, customThemes, tRuntime]);

  const draftValid =
    draft.name.trim().length > 0 &&
    draft.name.trim().length <= 80 &&
    (["light", "dark"] as const).every((mode) =>
      [
        ...Object.values(draft.variants[mode].tokens),
        ...Object.values(draft.variants[mode].code.tokens),
      ].every((value) => isValidColorValue(value)),
    );

  useEffect(() => {
    if (!isDraftDirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [isDraftDirty]);

  function guard(action: () => void, always = false) {
    if (busyRef.current) return;
    if (isDraftDirty || always) {
      setConfirmation({
        message: tRuntime("themeEditor.discardChanges"),
        action,
      });
    } else action();
  }

  function uniqueName(name: string, excludingId?: string) {
    const names = new Set(
      Object.values(allFamiliesMap)
        .filter((f) => f.id !== excludingId)
        .map((f) => f.name.trim().toLowerCase()),
    );
    let candidate = name.trim();
    let suffix = 2;
    while (names.has(candidate.toLowerCase()))
      candidate = `${name.trim()} (${suffix++})`;
    return candidate;
  }

  function customCopy(base: ThemeFamily, name: string): ThemeFamily {
    return {
      ...cloneFamily(base),
      id: `user-theme-${crypto.randomUUID()}`,
      name: uniqueName(name),
      aliases: [],
      builtIn: false,
    };
  }

  function activate(family: ThemeFamily, mode: ThemeMode) {
    previousSelection.current = family.id;
    setDraft(cloneFamily(family));
    setSelector(family.id);
    setPreviewMode(mode);
    setSelectedThemeId(family.id);
    setAppearanceMode(mode);
    applyTheme(resolveTheme(family, mode));
  }

  function handleSelect(id: string) {
    setSelector(id);
    if (id !== "custom") {
      const family = allFamiliesMap[id] || defaultCustomFamily();
      const mode = getCanonicalMode(family);
      setDraft(cloneFamily(family));
      setPreviewMode(mode);
      applyTheme(resolveTheme(family, mode));
      setSelectedThemeId(id);
      setAppearanceMode(mode);
      if (customThemes.find((t) => t.id === id)) {
        setCustomTheme(customThemes.find((t) => t.id === id) ?? null);
      }
    } else {
      const base = customTheme
        ? familyFromTheme(customTheme)
        : defaultCustomFamily();
      const mode = getCanonicalMode(base);
      setDraft(cloneFamily(base));
      setPreviewMode(mode);
      applyTheme(resolveTheme(base, mode));
    }
  }

  async function persistFamily(family: ThemeFamily, mode: ThemeMode) {
    if (builtInMap[family.id] || family.builtIn)
      throw new Error(tRuntime("themeEditor.builtInProtected"));
    // Validate both authored variants before crossing the persistence boundary.
    parseThemeYaml(serializeThemeFamilyYaml(family));
    const single = singleModeThemeFromFamily(family, mode);
    const result = await desktopConfig.saveTheme(family);
    if (!result.ok)
      throw new Error(result.error || "Theme persistence failed.");
    saveCustomTheme(single);
    setYamlThemes({
      ...useConfigStore.getState().yamlThemes,
      [family.id]: family,
    });
  }

  async function createCopy(label: string) {
    if (busyRef.current || !draftValid) return;
    busyRef.current = true;
    setBusy(true);
    const newFamily = customCopy(draft, tRuntime(label, { name: draft.name }));
    try {
      await persistFamily(newFamily, previewMode);
      activate(newFamily, previewMode);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.thememaker.notification.createdNewCustomThemeValue1",
          { value1: newFamily.name },
        ),
      );
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.thememaker.notification.failedToCreateThemeValue1",
          { value1: redactErrorMessage(err) },
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function handleCreateNewFromActive() {
    void createCopy("themeEditor.customName");
  }
  function handleDuplicateTheme() {
    void createCopy("themeEditor.copyName");
  }

  function resetToken(key: keyof ThemeTokens) {
    const base = storedFamily;
    const defaultValue = base.variants[previewMode]?.tokens[key];
    if (defaultValue) {
      updateToken(key, defaultValue);
    }
  }

  function resetCategory(keys: Array<keyof ThemeTokens>) {
    const base = storedFamily;
    setDraft((prev: ThemeFamily) => {
      const next = cloneFamily(prev);
      for (const k of keys) {
        const val = base.variants[previewMode]?.tokens[k];
        if (val) {
          next.variants[previewMode].tokens[k] = val;
        }
      }
      return next;
    });
  }

  function resetCodeToken(key: keyof CodeThemeTokens) {
    const base = storedFamily;
    const defaultValue = base.variants[previewMode]?.code?.tokens[key];
    if (defaultValue) {
      updateCodeToken(key, defaultValue);
    }
  }

  function resetCodeCategory(keys: Array<keyof CodeThemeTokens>) {
    const base = storedFamily;
    setDraft((prev: ThemeFamily) => {
      const next = cloneFamily(prev);
      for (const k of keys) {
        const val = base.variants[previewMode]?.code?.tokens[k];
        if (val) {
          next.variants[previewMode].code.tokens[k] = val;
        }
      }
      next.variants[previewMode].code.preset =
        base.variants[previewMode].code.preset;
      return next;
    });
  }

  function updateToken(key: keyof ThemeTokens, value: string) {
    setDraft((prev: ThemeFamily) => {
      const next = cloneFamily(prev);
      next.variants[previewMode].tokens[key] = value;
      return next;
    });
  }

  function updateCodePreset(preset: CodeSyntaxPresetId) {
    setDraft((prev: ThemeFamily) => {
      const next = cloneFamily(prev);
      const uiTokens = next.variants[previewMode].tokens;
      next.variants[previewMode].code = {
        preset,
        tokens:
          preset === "automatic"
            ? deriveCodeThemeTokens({ mode: previewMode, tokens: uiTokens })
            : resolveCodeThemeTokens(preset, previewMode),
      };
      return next;
    });
  }

  function updateCodeToken(key: keyof CodeThemeTokens, value: string) {
    setDraft((prev: ThemeFamily) => {
      const next = cloneFamily(prev);
      next.variants[previewMode].code.tokens[key] = value;
      // Once the user touches an individual token, the preset becomes a custom
      // override so it is clear the palette is no longer the pure preset.
      next.variants[previewMode].code.preset = "automatic";
      return next;
    });
  }

  function updatePreviewMode(mode: ThemeMode) {
    if (previewMode === mode) return;
    setPreviewMode(mode);
    document.documentElement.dataset.themeMode = mode;
    applyTheme(resolveTheme(draft, mode));
  }

  useEffect(() => {
    document.documentElement.dataset.themeMode = previewMode;
  }, [previewMode]);

  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.themeMode;
      const settings = useSettingsStore.getState();
      const yaml = useConfigStore.getState().yamlThemes;
      applyTheme(resolveInitialTheme(settings, yaml));
    };
  }, []);

  function updateName(name: string) {
    setDraft((prev: ThemeFamily) => ({ ...prev, name }));
  }

  async function handleSave() {
    if (busyRef.current || !draftValid) return;
    busyRef.current = true;
    setBusy(true);
    const family =
      builtInMap[draft.id] || draft.builtIn
        ? customCopy(draft, draft.name)
        : {
            ...cloneFamily(draft),
            name: uniqueName(draft.name, draft.id),
            builtIn: false,
          };
    try {
      await persistFamily(family, previewMode);
      activate(family, previewMode);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.thememaker.notification.themeValue1SavedSuccessfully",
          { value1: family.name },
        ),
      );
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.thememaker.notification.failedToSaveThemeValue1",
          { value1: redactErrorMessage(err) },
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function handleReset() {
    const reverted = cloneFamily(storedFamily);
    setDraft(reverted);
    setPreviewMode(getCanonicalMode(reverted));
    toast.info(tRuntime("themeEditor.draftReset"));
  }

  function handleRestoreDefaults() {
    const venice =
      BUILTIN_THEME_FAMILIES.find((f) => f.id === "venice") ??
      BUILTIN_THEME_FAMILIES[0];
    const mode = getCanonicalMode(venice);
    setSelector("builtin-venice");
    setDraft(cloneFamily(venice));
    setPreviewMode(mode);
    applyTheme(resolveTheme(venice, mode));
    setSelectedThemeId("builtin-venice");
    setAppearanceMode(mode);
    setCustomTheme(null);
    toast.info(tRuntime("themeEditor.defaultRestored"));
  }

  async function handleDeleteCustom() {
    if (!isCustomSelected || busyRef.current || builtInMap[draft.id]) return;
    busyRef.current = true;
    setBusy(true);
    const targetId = draft.id;
    try {
      const result = await desktopConfig.deleteTheme(targetId);
      if (!result.ok) throw new Error(result.error || "Theme deletion failed.");
      deleteCustomTheme(targetId);
      const nextYamlThemes = { ...useConfigStore.getState().yamlThemes };
      delete nextYamlThemes[targetId];
      setYamlThemes(nextYamlThemes);
      const settings = useSettingsStore.getState();
      const fallback =
        allFamiliesMap[settings.selectedThemeId] || defaultCustomFamily();
      setSelector(settings.selectedThemeId);
      setDraft(cloneFamily(fallback));
      setPreviewMode(getCanonicalMode(fallback));
      applyTheme(resolveTheme(fallback, getCanonicalMode(fallback)));
      toast.info(tRuntime("themeEditor.deleted"));
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.thememaker.notification.failedToDeleteThemeValue1",
          { value1: redactErrorMessage(err) },
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleExport() {
    if (!draftValid) return;
    try {
      const yaml = serializeThemeFamilyYaml(draft);
      const filename = `${draft.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}.theme.yaml`;
      await desktopFiles.exportYaml(yaml, filename);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.thememaker.notification.themeExportedSuccessfully",
        ),
      );
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.thememaker.notification.failedToExportTheme",
        ),
        redactErrorMessage(err),
      );
    }
  }

  async function handleImportClick() {
    try {
      const yaml = await desktopFiles.importYamlString();
      if (!yaml) return;
      const importedFamily = parseThemeYaml(yaml);

      const conflict = Object.values(allFamiliesMap).find(
        (f) =>
          f.id === importedFamily.id ||
          f.name.trim().toLowerCase() ===
            importedFamily.name.trim().toLowerCase(),
      );
      setImportModal({
        family: importedFamily,
        conflictId: conflict?.id,
        conflictName: conflict?.name,
        builtInConflict: Boolean(conflict && builtInMap[conflict.id]),
      });
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.thememaker.notification.failedToImportTheme",
        ),
        redactErrorMessage(err),
      );
    }
  }

  async function confirmImport(mode: "apply" | "copy" | "replace") {
    if (
      !importModal ||
      busyRef.current ||
      (mode === "replace" && importModal.builtInConflict)
    )
      return;
    busyRef.current = true;
    setBusy(true);
    const copied =
      mode === "copy" || (mode === "apply" && Boolean(importModal.conflictId));
    const finalFamily: ThemeFamily = copied
      ? customCopy(
          importModal.family,
          tRuntime("themeEditor.importedName", {
            name: importModal.family.name,
          }),
        )
      : {
          ...cloneFamily(importModal.family),
          builtIn: false,
          id:
            mode === "replace" && importModal.conflictId
              ? importModal.conflictId
              : importModal.family.id,
          name: uniqueName(
            importModal.family.name,
            mode === "replace" ? importModal.conflictId : importModal.family.id,
          ),
        };
    const targetMode = getCanonicalMode(finalFamily);
    try {
      await persistFamily(finalFamily, targetMode);
      activate(finalFamily, targetMode);
      setImportModal(null);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.thememaker.notification.themeValue1ImportedAndApplied",
          { value1: finalFamily.name },
        ),
      );
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.thememaker.notification.failedToImportThemeValue1",
          { value1: redactErrorMessage(err) },
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const validColor = (v: string) => isValidColorValue(v);

  const previewTheme = singleModeThemeFromFamily(
    draftValid ? draft : storedFamily,
    previewMode,
  );

  return (
    <div className="space-y-6">
      <ConfirmModal
        open={Boolean(confirmation)}
        message={confirmation?.message ?? ""}
        detail={tRuntime("themeEditor.discardDetail")}
        confirmLabel={tRuntime("themeEditor.continue")}
        cancelLabel={tRuntime("themeEditor.keepEditing")}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const action = confirmation?.action;
          setConfirmation(null);
          action?.();
        }}
      />
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        {/* Header Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-vf-panel-border pb-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsThememaker.heading.themeSystemEditor" />
            </h3>
            <p className="text-xs text-text-muted">
              <Trans i18nKey="common:surface.componentsThememaker.description.configureThemeColorsBorderContrastFocusRings" />
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn"
              disabled={!draftValid}
              onClick={handleCreateNewFromActive}
            >
              <Trans i18nKey="common:surface.componentsThememaker.action.createNewTheme" />
            </button>
            <button
              className="btn"
              disabled={!draftValid}
              onClick={handleDuplicateTheme}
            >
              <Trans
                i18nKey="common:surface.componentsThememaker.action.duplicateTheme"
                defaultValue="Duplicate Theme"
              />
            </button>
            <button
              className="btn"
              onClick={() =>
                guard(() => {
                  void handleImportClick();
                })
              }
            >
              <Trans i18nKey="common:surface.componentsThememaker.action.importTheme" />
            </button>
            <button
              className="btn"
              disabled={!draftValid}
              onClick={handleExport}
            >
              <Trans i18nKey="common:surface.componentsThememaker.action.exportTheme" />
            </button>
          </div>
        </div>

        {/* Theme Selector Palette */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="theme-maker-1"
              className="text-sm font-medium text-text-secondary"
            >
              <Trans i18nKey="common:surface.componentsThememaker.label.selectActiveTheme" />
            </label>
            {isDraftDirty && (
              <span className="inline-flex items-center rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning border border-warning/30">
                <Trans i18nKey="common:surface.componentsThememaker.text.unsavedDraftChanges" />
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 min-h-[16rem] max-h-[36rem] overflow-y-auto p-2 border border-vf-panel-border rounded-lg bg-vf-panel-bg-raised">
            {themeOptions.map((opt) => {
              const family = allFamiliesMap[opt.id];
              const isSelected = selector === opt.id;
              const familyMode = family ? getCanonicalMode(family) : "dark";
              const theme = family
                ? singleModeThemeFromFamily(family, familyMode)
                : null;
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    if (opt.id !== selector) guard(() => handleSelect(opt.id));
                  }}
                  ref={(el) => {
                    if (el && theme) {
                      el.style.setProperty(
                        "--theme-bg",
                        theme.tokens.background,
                      );
                      el.style.setProperty(
                        "--theme-surface",
                        theme.tokens.surface,
                      );
                      el.style.setProperty(
                        "--theme-accent",
                        theme.tokens.accent,
                      );
                      el.style.setProperty(
                        "--theme-text",
                        theme.tokens.foreground || theme.tokens.textPrimary || "inherit",
                      );
                    }
                  }}
                  className={`relative group flex flex-col overflow-hidden rounded-xl border text-left transition-all hover:shadow-sm ${
                    isSelected
                      ? "border-accent ring-1 ring-accent bg-vf-panel-bg"
                      : "border-vf-panel-border hover:border-accent/50 bg-vf-panel-bg"
                  }`}
                  aria-pressed={isSelected}
                >
                  {theme ? (
                    <div
                      className="h-12 w-full flex border-b border-vf-panel-border bg-[var(--theme-bg)]"
                      aria-hidden="true"
                    >
                      <div className="w-1/2 h-full flex items-end justify-start p-1 bg-[var(--theme-surface)]">
                        <div className="h-4 w-4 rounded-full shadow-sm bg-[var(--theme-accent)]" />
                      </div>
                    </div>
                  ) : (
                    <div
                      className="h-12 w-full bg-vf-panel-bg-raised flex items-center justify-center text-xs text-text-muted border-b border-vf-panel-border"
                      aria-hidden="true"
                    >
                      {/* Fallback placeholder */}
                    </div>
                  )}
                  <div className="px-2.5 py-2">
                    <div className="text-xs font-medium truncate text-text-primary">
                      {opt.label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Draft Family Editor */}
        <div className="space-y-4 rounded-xl border border-vf-panel-border p-4 bg-vf-panel-bg">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-vf-panel-border pb-3">
            <div className="flex items-center gap-3">
              <input
                type="text"
                id="theme-maker-1"
                value={draft.name}
                onChange={(e) => updateName(e.target.value)}
                className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised px-3 py-1 text-sm font-semibold text-text-primary"
                aria-label={tRuntime(
                  "runtimeGenerated.components.thememaker.attribute.themeName",
                )}
              />
              <div className="flex items-center gap-1 rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-1">
                <button
                  type="button"
                  onClick={() => updatePreviewMode("dark")}
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    previewMode === "dark"
                      ? "bg-accent text-accent-fg"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Trans i18nKey="common:surface.componentsThememaker.action.darkMode" />
                </button>
                <button
                  type="button"
                  onClick={() => updatePreviewMode("light")}
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    previewMode === "light"
                      ? "bg-accent text-accent-fg"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Trans i18nKey="common:surface.componentsThememaker.action.lightMode" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn primary"
                onClick={handleSave}
                disabled={
                  !draftValid || (!isDraftDirty && selector === draft.id)
                }
              >
                <Trans i18nKey="common:surface.componentsThememaker.action.saveTheme" />
              </button>
              <button
                className="btn"
                onClick={() => guard(handleReset)}
                disabled={!isDraftDirty}
              >
                {tRuntime("themeEditor.resetAll")}
              </button>
              {isCustomSelected && (
                <button
                  className="btn danger"
                  onClick={() =>
                    setConfirmation({
                      message: tRuntime("themeEditor.deleteConfirm", {
                        name: draft.name,
                      }),
                      action: () => {
                        void handleDeleteCustom();
                      },
                    })
                  }
                >
                  <Trans i18nKey="common:surface.componentsThememaker.action.deleteTheme" />
                </button>
              )}
              <button
                className="btn ghost"
                onClick={() => guard(handleRestoreDefaults)}
              >
                <Trans i18nKey="common:surface.componentsThememaker.action.restoreDefaultTheme" />
              </button>
            </div>
          </div>

          {/* Semantic Token Categories */}
          <div className="space-y-6 pt-2">
            {TOKEN_CATEGORIES.map((cat) => (
              <div
                key={tRuntime(`themeEditor.categories.${cat.name}`)}
                className="space-y-2"
              >
                <div className="flex items-center justify-between border-b border-vf-panel-border pb-1">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    {tRuntime(`themeEditor.categories.${cat.name}`)}
                  </h4>
                  <button
                    type="button"
                    onClick={() => resetCategory(cat.keys)}
                    className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    title={tRuntime("themeEditor.resetSection", {
                      section: tRuntime(`themeEditor.categories.${cat.name}`),
                      mode: previewMode,
                    })}
                    aria-label={tRuntime("themeEditor.resetSection", {
                      section: tRuntime(`themeEditor.categories.${cat.name}`),
                      mode: previewMode,
                    })}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <Trans
                      i18nKey="common:surface.componentsThememaker.action.resetSection"
                      defaultValue="Reset Section"
                    />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {cat.keys.map((key) => {
                    const value = draft.variants[previewMode].tokens[key] || "";
                    const valid = validColor(value);
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-md border border-vf-panel-border p-2 bg-vf-panel-bg-raised"
                      >
                        <input
                          type="color"
                          aria-label={tRuntime(
                            "runtimeGenerated.components.thememaker.attribute.value1ColorPicker",
                            {
                              value1: tRuntime(
                                `themeEditor.tokens.${key}`,
                                TOKEN_LABELS[key],
                              ),
                            },
                          )}
                          value={
                            /^#[0-9a-fA-F]{6}$/.test(value)
                              ? value
                              : COLOR_INPUT_FALLBACK
                          }
                          onChange={(e) => updateToken(key, e.target.value)}
                          className="h-7 w-8 shrink-0 rounded border border-vf-panel-border bg-transparent cursor-pointer"
                        />
                        <div className="flex flex-1 flex-col min-w-0">
                          <div className="flex items-center justify-between">
                            <label
                              htmlFor={`token-${key}`}
                              className="text-xs text-text-secondary truncate"
                            >
                              {tRuntime(
                                `themeEditor.tokens.${key}`,
                                TOKEN_LABELS[key],
                              )}
                            </label>
                            <button
                              type="button"
                              onClick={() => resetToken(key)}
                              className="text-[11px] text-text-muted hover:text-accent transition-colors shrink-0 ml-1 cursor-pointer p-0.5"
                              title={tRuntime("themeEditor.resetToken", {
                                token: tRuntime(
                                  `themeEditor.tokens.${key}`,
                                  TOKEN_LABELS[key as keyof ThemeTokens] ?? key,
                                ),
                                mode: previewMode,
                              })}
                              aria-label={tRuntime("themeEditor.resetToken", {
                                token: tRuntime(
                                  `themeEditor.tokens.${key}`,
                                  TOKEN_LABELS[key as keyof ThemeTokens] ?? key,
                                ),
                                mode: previewMode,
                              })}
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          <input
                            id={`token-${key}`}
                            type="text"
                            value={value}
                            onChange={(e) => updateToken(key, e.target.value)}
                            aria-invalid={!valid}
                            className={`w-full rounded border px-1.5 py-0.5 text-xs font-mono bg-vf-panel-bg text-text-primary ${
                              valid ? "border-vf-panel-border" : "border-danger"
                            }`}
                          />
                        </div>
                        {!valid && (
                          <span
                            role="alert"
                            className="text-[10px] text-danger shrink-0"
                          >
                            <Trans i18nKey="common:surface.componentsThememaker.text.invalid" />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Code & Syntax Editor */}
          <div className="space-y-4 pt-4 border-t border-vf-panel-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-text-secondary">
                <Trans i18nKey="common:surface.componentsThememaker.heading.codeAndSyntax" />
              </h4>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="code-syntax-preset"
                  className="text-xs text-text-muted"
                >
                  <Trans i18nKey="common:surface.componentsThememaker.label.syntaxPreset" />
                </label>
                <select
                  id="code-syntax-preset"
                  value={draft.variants[previewMode].code.preset}
                  onChange={(e) =>
                    updateCodePreset(e.target.value as CodeSyntaxPresetId)
                  }
                  className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised px-2 py-1 text-xs text-text-primary"
                >
                  {Object.keys(CODE_SYNTAX_PRESETS).map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {CODE_TOKEN_CATEGORIES.map((cat) => (
              <div
                key={tRuntime(`themeEditor.categories.${cat.name}`)}
                className="space-y-2"
              >
                <div className="flex items-center justify-between border-b border-vf-panel-border pb-1">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    {tRuntime(`themeEditor.categories.${cat.name}`)}
                  </h5>
                  <button
                    type="button"
                    onClick={() => resetCodeCategory(cat.keys)}
                    className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    title={tRuntime("themeEditor.resetSection", {
                      section: tRuntime(`themeEditor.categories.${cat.name}`),
                      mode: previewMode,
                    })}
                    aria-label={tRuntime("themeEditor.resetSection", {
                      section: tRuntime(`themeEditor.categories.${cat.name}`),
                      mode: previewMode,
                    })}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <Trans
                      i18nKey="common:surface.componentsThememaker.action.resetSection"
                      defaultValue="Reset Section"
                    />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {cat.keys.map((key) => {
                    const value =
                      draft.variants[previewMode].code.tokens[key] || "";
                    const valid = validColor(value);
                    const label = getCodeTokenLabel(tRuntime, key);
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-md border border-vf-panel-border p-2 bg-vf-panel-bg-raised"
                      >
                        <input
                          type="color"
                          aria-label={tRuntime(
                            "runtimeGenerated.components.thememaker.attribute.value1ColorPicker",
                            { value1: label },
                          )}
                          value={
                            /^#[0-9a-fA-F]{6}$/.test(value)
                              ? value
                              : COLOR_INPUT_FALLBACK
                          }
                          onChange={(e) => updateCodeToken(key, e.target.value)}
                          className="h-7 w-8 shrink-0 rounded border border-vf-panel-border bg-transparent cursor-pointer"
                        />
                        <div className="flex flex-1 flex-col min-w-0">
                          <div className="flex items-center justify-between">
                            <label
                              htmlFor={`code-token-${key}`}
                              className="text-xs text-text-secondary truncate"
                            >
                              {label}
                            </label>
                            <button
                              type="button"
                              onClick={() => resetCodeToken(key)}
                              className="text-[11px] text-text-muted hover:text-accent transition-colors shrink-0 ml-1 cursor-pointer p-0.5"
                              title={tRuntime("themeEditor.resetToken", {
                                token: label,
                                mode: previewMode,
                              })}
                              aria-label={tRuntime("themeEditor.resetToken", {
                                token: label,
                                mode: previewMode,
                              })}
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          <input
                            id={`code-token-${key}`}
                            type="text"
                            value={value}
                            onChange={(e) =>
                              updateCodeToken(key, e.target.value)
                            }
                            aria-invalid={!valid}
                            className={`w-full rounded border px-1.5 py-0.5 text-xs font-mono bg-vf-panel-bg text-text-primary ${
                              valid ? "border-vf-panel-border" : "border-danger"
                            }`}
                          />
                        </div>
                        {!valid && (
                          <span
                            role="alert"
                            className="text-[10px] text-danger shrink-0"
                          >
                            <Trans i18nKey="common:surface.componentsThememaker.text.invalid" />
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
            <div className="text-sm font-medium text-text-secondary">
              <Trans i18nKey="common:surface.componentsThememaker.text.liveThemePreview" />
            </div>
            <span className="text-xs text-text-muted">
              <Trans i18nKey="common:surface.componentsThememaker.text.showingLivePreviewOfActiveDraft" />
            </span>
          </div>
          {!draftValid && (
            <p role="alert" className="text-sm text-danger">
              {tRuntime("themeEditor.invalidDraft")}
            </p>
          )}
          <ThemePreview theme={previewTheme} />
        </div>

        {/* Import Preview Modal */}
        {importModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 backdrop-blur-sm p-4 animate-fade-in">
            <div
              ref={importRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="theme-import-title"
              tabIndex={-1}
              className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-6 space-y-4 shadow-2xl"
            >
              <div className="border-b border-vf-panel-border pb-3">
                <h3
                  id="theme-import-title"
                  className="text-lg font-semibold text-text-primary"
                >
                  <Trans i18nKey="common:surface.componentsThememaker.heading.importThemePreview" />
                </h3>
                <p className="text-xs text-text-muted">
                  <Trans i18nKey="common:surface.componentsThememaker.description.reviewThemeMetadataAndPreviewLayoutBefore" />
                </p>
              </div>

              <div className="space-y-2 text-sm text-text-secondary">
                <div>
                  <strong>
                    <Trans i18nKey="common:surface.componentsThememaker.text.themeName" />
                  </strong>{" "}
                  {importModal.family.name}
                </div>
                <div>
                  <strong>
                    <Trans i18nKey="common:surface.componentsThememaker.text.id" />
                  </strong>{" "}
                  {importModal.family.id}
                </div>
                {importModal.conflictName && (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                    <Trans i18nKey="common:surface.componentsThememaker.text.aCustomThemeNamedLdquo" />
                    {importModal.conflictName}
                    <Trans i18nKey="common:surface.componentsThememaker.text.rdquoAlreadyExistsInYourWorkspace" />
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-vf-panel-border p-3 bg-vf-panel-bg">
                <div className="text-xs font-semibold text-text-muted mb-2">
                  <Trans i18nKey="common:surface.componentsThememaker.text.importedLayoutPreview" />
                </div>
                <ThemePreview
                  theme={singleModeThemeFromFamily(
                    importModal.family,
                    getCanonicalMode(importModal.family),
                  )}
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-vf-panel-border">
                <button
                  className="btn ghost"
                  onClick={() => setImportModal(null)}
                >
                  <Trans i18nKey="common:surface.componentsThememaker.action.cancel" />
                </button>
                {importModal.conflictName && !importModal.builtInConflict && (
                  <button
                    className="btn danger"
                    onClick={() => confirmImport("replace")}
                  >
                    <Trans i18nKey="common:surface.componentsThememaker.action.replaceExisting" />
                  </button>
                )}
                <button className="btn" onClick={() => confirmImport("copy")}>
                  <Trans i18nKey="common:surface.componentsThememaker.action.importAsCopy" />
                </button>
                <button
                  className="btn primary"
                  onClick={() => confirmImport("apply")}
                >
                  <Trans i18nKey="common:surface.componentsThememaker.action.importApply" />
                </button>
              </div>
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
