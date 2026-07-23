import { app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { watch, FSWatcher } from "chokidar";
import { validateThemesFile, YamlTheme, ConfigWarning } from "../../src/config/configSchema";
import yaml from "yaml";

import { logInfo } from "./logger";

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

export async function readThemeFile(filePath: string): Promise<{ themes: Record<string, YamlTheme>; warnings: ConfigWarning[] }> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const raw = yaml.parse(content);
    if (!raw) return { themes: {}, warnings: [] };
    return validateThemesFile(raw);
  } catch (err) {
    return { themes: {}, warnings: [{ field: filePath, message: err instanceof Error ? err.message : String(err), severity: "error" }] };
  }
}

async function scanThemesDirectory(dir: string, allThemes: Record<string, YamlTheme>, allWarnings: ConfigWarning[]) {
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

export async function loadAllThemes(legacyThemesPath: string): Promise<{ themes: Record<string, YamlTheme>; warnings: ConfigWarning[] }> {
  const allThemes: Record<string, YamlTheme> = {};
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
  const sortedThemes: Record<string, YamlTheme> = {};
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

export async function saveTheme(theme: YamlTheme & { id: string }): Promise<void> {
  const customDir = await ensureCustomThemesDir();
  const filePath = path.join(customDir, `${theme.id}.yaml`);
  const out = {
    themes: {
      [theme.id]: {
        display_name: theme.display_name,
        mode: theme.mode,
        tokens: theme.tokens,
      }
    }
  };
  await fs.writeFile(filePath, yaml.stringify(out), { encoding: "utf-8", mode: 0o600 });
}

export async function deleteTheme(id: string): Promise<void> {
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
