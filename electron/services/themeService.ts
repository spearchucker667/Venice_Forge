import { app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { watch, FSWatcher } from "chokidar";
import { validateThemesFile, YamlTheme, ConfigWarning } from "../../src/config/configSchema";
import yaml from "yaml";

import { logInfo } from "./logger";
import { validateRawThemeYaml, validateThemeId } from "../../src/theme/yaml/validate";
import { normalizeThemeFamilyYaml } from "../../src/theme/yaml/normalize";
import { serializeThemeFamilyYaml } from "../../src/theme/yaml/serialize";
import { parseThemeYaml } from "../../src/theme/yaml/parse";
import { atomicReplaceFile } from "../utils/atomicFileReplace";
import { ThemeFamily } from "../../src/theme/themeTypes";

/** Minimal local ThemeFamily V2 shape used for IPC persistence. */
export interface ThemeFamilyV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  author?: string;
  description?: string;
  aliases?: string[];
  variants: {
    light: { tokens: Record<string, string>; code?: { preset: string; tokens: Record<string, string> } };
    dark: { tokens: Record<string, string>; code?: { preset: string; tokens: Record<string, string> } };
  };
}

function isCodeConfig(value: unknown): value is { preset: string; tokens: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.preset !== "string") return false;
  if (!c.tokens || typeof c.tokens !== "object" || Array.isArray(c.tokens)) return false;
  return true;
}

function isVariant(value: unknown): value is { tokens: Record<string, string>; code?: { preset: string; tokens: Record<string, string> } } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!v.tokens || typeof v.tokens !== "object" || Array.isArray(v.tokens)) return false;
  if (v.code !== undefined && !isCodeConfig(v.code)) return false;
  return true;
}

export function isThemeFamilyV2(value: unknown): value is ThemeFamilyV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  if (
    rec.schemaVersion !== 2 ||
    typeof rec.id !== "string" ||
    typeof rec.name !== "string" ||
    typeof rec.variants !== "object" ||
    rec.variants === null ||
    Array.isArray(rec.variants)
  ) {
    return false;
  }
  const variants = rec.variants as Record<string, unknown>;
  return isVariant(variants.light) && isVariant(variants.dark) &&
    validateRawThemeYaml(value, { requireV2: true }).length === 0;
}

/** Theme records returned by loaders: legacy V1 single-mode themes or V2 families. */
export type LoadedThemeRecord = YamlTheme | ThemeFamily | ThemeFamilyV2;

let watcher: FSWatcher | null = null;

export function getBuiltinThemesDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "config", "themes");
  }
  return path.join(app.getAppPath(), "config", "themes");
}

export function getCustomThemesDir(): string {
  return path.join(app.getPath("userData"), "themes");
}

export async function ensureCustomThemesDir(): Promise<string> {
  const customDir = getCustomThemesDir();
  await fs.mkdir(customDir, { recursive: true });
  return customDir;
}

export async function readThemeFile(filePath: string): Promise<{ themes: Record<string, LoadedThemeRecord>; warnings: ConfigWarning[] }> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const raw = yaml.parse(content, { maxAliasCount: 100 });
    if (!raw) return { themes: {}, warnings: [] };
    if (typeof raw !== "object" || Array.isArray(raw)) {
      return { themes: {}, warnings: [] };
    }
    // Theme Engine V2 family document.
    if (raw.schemaVersion === 2) {
      if (!isThemeFamilyV2(raw)) {
        return { themes: {}, warnings: [{ field: filePath, message: "Invalid theme family V2 document", severity: "error" }] };
      }
      const family = parseThemeYaml(content);
      return { themes: { [family.id]: family }, warnings: [] };
    }
    if ('schemaVersion' in raw) {
      return { themes: {}, warnings: [{ field: filePath, message: "Unsupported theme schemaVersion", severity: "error" }] };
    }
    // Legacy V1 `themes:` block.
    if ("themes" in raw) {
      return validateThemesFile(raw);
    }
    // Legacy terminal-color templates are already represented by the renderer's
    // built-in theme registry. Only schema-versioned/`themes` mappings belong in
    // the merged YAML registry.
    return { themes: {}, warnings: [] };
  } catch (err) {
    return { themes: {}, warnings: [{ field: filePath, message: err instanceof Error ? err.message : String(err), severity: "error" }] };
  }
}

async function scanThemesDirectory(dir: string, allThemes: Record<string, LoadedThemeRecord>, allWarnings: ConfigWarning[]) {
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
      const filePath = path.join(dir, file);
      // Skip the master themes.yaml if it happens to be in this directory
      if (path.basename(filePath) === "themes.yaml") continue;

      const { themes, warnings } = await readThemeFile(filePath);
      Object.assign(allThemes, themes);
      allWarnings.push(...warnings);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      allWarnings.push({ field: dir, message: err instanceof Error ? err.message : String(err), severity: "warn" });
    }
  }
}

export async function loadAllThemes(legacyThemesPath: string): Promise<{ themes: Record<string, LoadedThemeRecord>; warnings: ConfigWarning[] }> {
  const allThemes: Record<string, LoadedThemeRecord> = {};
  const allWarnings: ConfigWarning[] = [];

  // 1. Load built-in individual files
  const builtinDir = getBuiltinThemesDir();
  await scanThemesDirectory(builtinDir, allThemes, allWarnings);

  // 2. Load legacy merged themes.yaml (themesPath from configService)
  try {
    const content = await fs.readFile(legacyThemesPath, "utf-8");
    const raw = yaml.parse(content);
    if (raw) {
      const result = validateThemesFile(raw);
      Object.assign(allThemes, result.themes);
      allWarnings.push(...result.warnings);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
       allWarnings.push({ field: "(themes)", message: err instanceof Error ? err.message : String(err), severity: "error" });
    }
  }

  // 3. Load user individual files
  const customDir = await ensureCustomThemesDir();
  await scanThemesDirectory(customDir, allThemes, allWarnings);

  // Enforce deterministic alphabetical order by sorting the keys
  const sortedThemes: Record<string, LoadedThemeRecord> = {};
  for (const key of Object.keys(allThemes).sort()) {
    sortedThemes[key] = allThemes[key];
  }


  return { themes: sortedThemes, warnings: allWarnings };
}

export async function startThemeWatcher() {
  const customDir = await ensureCustomThemesDir();
  
  if (watcher) {
    await watcher.close();
  }
  
  watcher = watch(customDir, { ignoreInitial: true });
  
  const notify = async (filePath: string) => {
     if (!filePath.endsWith(".yaml") && !filePath.endsWith(".yml")) return;
     logInfo("Custom theme file changed", { filePath });
     // Broadcast an event to the renderer that themes have updated
     const { BrowserWindow } = await import("electron");
     BrowserWindow.getAllWindows().forEach((win) => {
       if (!win.isDestroyed()) {
         win.webContents.send("theme:updated");
       }
     });
  };

  watcher.on("add", notify);
  watcher.on("change", notify);
  watcher.on("unlink", notify);
}


export async function saveTheme(family: ThemeFamilyV2): Promise<void> {
  if (!isThemeFamilyV2(family)) {
    const errors = validateRawThemeYaml(family, { requireV2: true });
    const detail = errors.length > 0 ? ` ${errors.join(" ")}` : "";
    throw new Error(`Theme must be a valid ThemeFamilyV2 document.${detail}`);
  }
  const customDir = await ensureCustomThemesDir();
  const filePath = path.join(customDir, `${family.id}.yaml`);
  await atomicReplaceFile(filePath, serializeThemeFamilyYaml(normalizeThemeFamilyYaml(family)), 0o600);
}

export async function deleteTheme(id: string): Promise<void> {
  const errors = validateThemeId(id, 'id');
  if (errors.length) throw new Error(errors.join(' '));
  const customDir = await ensureCustomThemesDir();
  const filePath = path.join(customDir, `${id}.yaml`);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}
