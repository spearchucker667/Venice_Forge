// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview CLI: print the sanitized effective config. Never prints raw
 *  API keys. */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "yaml";
import { sanitizeConfig, validateConfig } from "../src/config/configSchema";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = process.env.VENICE_FORGE_CONFIG_FILE?.trim() || path.join(REPO_DIR, ".config", "config.local.yaml");

async function readIfExists(p: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return yaml.parse(raw);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const raw = await readIfExists(CONFIG_PATH);
  if (raw === null) {
    // eslint-disable-next-line no-console
    console.log(`[config:print] No config found at ${CONFIG_PATH}. Using built-in defaults.`);
    const { emptyConfig } = await import("../src/config/configSchema");
    const sanitized = sanitizeConfig(emptyConfig());
    // eslint-disable-next-line no-console
    console.log(yaml.stringify(sanitized));
    return;
  }
  const result = validateConfig(raw);
  const sanitized = sanitizeConfig(result.config);
  // eslint-disable-next-line no-console
  console.log(`# Sanitized config (source: ${CONFIG_PATH})`);
  // eslint-disable-next-line no-console
  console.log(`# Keys detected: venice=${sanitized.secrets.has_venice_api_key} jina=${sanitized.secrets.has_jina_api_key}`);
  // eslint-disable-next-line no-console
  console.log(yaml.stringify(sanitized));
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[config:print] Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
