// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview CLI: validate the local dev config without launching Electron.
 *  Prints warnings and exits non-zero on parse/validation errors. */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "yaml";
import { validateConfig, validateThemesFile } from "../src/config/configSchema";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = process.env.VENICE_FORGE_CONFIG_FILE?.trim() || path.join(REPO_DIR, ".config", "config.local.yaml");
const THEMES_PATH = process.env.VENICE_FORGE_THEMES_FILE?.trim() || path.join(REPO_DIR, ".config", "themes.local.yaml");

async function readIfExists(p: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return yaml.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function main(): Promise<void> {
  let errors = 0;
  let warnings = 0;

  // eslint-disable-next-line no-console
  console.log(`[config:validate] Config: ${CONFIG_PATH}`);
  // eslint-disable-next-line no-console
  console.log(`[config:validate] Themes: ${THEMES_PATH}`);

  const cfg = await readIfExists(CONFIG_PATH);
  if (cfg === null) {
    // eslint-disable-next-line no-console
    console.log(`[config:validate] No config.local.yaml present; nothing to validate. Run \`npm run config:init\` first.`);
    process.exit(0);
  }

  const cfgResult = validateConfig(cfg);
  for (const w of cfgResult.warnings) {
    if (w.severity === "error") errors++; else warnings++;
    // eslint-disable-next-line no-console
    console.log(`  [${w.severity}] ${w.field}: ${w.message}`);
  }
  if (cfgResult.warnings.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`[config:validate] config.yaml: OK`);
  }

  const themes = await readIfExists(THEMES_PATH);
  if (themes !== null) {
    const themesResult = validateThemesFile(themes);
    for (const w of themesResult.warnings) {
      if (w.severity === "error") errors++; else warnings++;
      // eslint-disable-next-line no-console
      console.log(`  [${w.severity}] ${w.field}: ${w.message}`);
    }
    if (themesResult.warnings.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`[config:validate] themes.yaml: OK (${Object.keys(themesResult.themes).length} entries)`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(`[config:validate] themes.local.yaml: not present (skipped)`);
  }

  // eslint-disable-next-line no-console
  console.log(`[config:validate] Summary: ${errors} error(s), ${warnings} warning(s).`);
  if (errors > 0) process.exit(1);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[config:validate] Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
