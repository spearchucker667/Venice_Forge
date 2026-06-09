// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Local master YAML config service.
 *
 *  Responsibilities:
 *    - Resolve the canonical config paths (env override > repo-local > userData).
 *    - Create default `config.yaml` and `themes.yaml` if missing.
 *    - Parse and validate the YAML safely (defensive; never throws to the caller).
 *    - Optionally import plaintext API keys from the YAML into the existing
 *      secure store, redacting them afterwards.
 *    - Expose a sanitized view (no raw keys) to the renderer via IPC.
 *    - Provide a status object suitable for the Settings UI.
 *
 *  SECURITY MODEL (non-negotiable):
 *    - Renderer never sees `secrets.venice_api_key` or `secrets.jina_api_key`.
 *    - Default behaviour: import plaintext keys to secure store, then strip
 *      them from the YAML on disk (only when `secrets.keep_plaintext_keys`
 *      is NOT true).
 *    - Default generated config files must never contain real keys.
 *    - No remote URLs.
 *    - Family Safe Mode is explicit and defaults on; provider safemode remains independent.
 */
import { app, shell } from "electron";
import { promises as fs, constants as fsConstants } from "fs";
import path from "path";
import yaml from "yaml";
import {
  emptyConfig,
  sanitizeConfig,
  validateConfig,
  validateThemesFile,
  type ConfigWarning,
  type SanitizedConfig,
  type YamlConfig,
  type YamlTheme,
} from "../../src/config/configSchema";
import { logError, logInfo } from "./logger";
import {
  deleteApiKey,
  deleteJinaApiKey,
  getApiKey,
  getJinaApiKey,
  isApiKeyConfigured,
  isJinaApiKeyConfigured,
  setApiKey,
  setJinaApiKey,
} from "./secureStore";
import { setRuntimeLocalFamilySafeModeEnabled } from "./runtimeSafetySettings";

/** Status object returned to the renderer for the Settings UI. */
export interface ConfigStatus {
  configPath: string;
  themesPath: string;
  /** "userdata" | "repo-local" | "env-override" | "defaults" */
  source: "userdata" | "repo-local" | "env-override" | "defaults";
  configName: string;
  profile: string;
  loaded: boolean;
  parseError: string | null;
  warnings: ConfigWarning[];
  hasVeniceApiKey: boolean;
  hasJinaApiKey: boolean;
  /** Whether plaintext keys were imported on this run. */
  keysImported: { venice: boolean; jina: boolean };
  /** Whether plaintext keys were redacted from the YAML on this run. */
  keysRedacted: { venice: boolean; jina: boolean };
  /** Whether secure store has a key, after import. */
  secureStore: { venice: boolean; jina: boolean };
  activeTheme: string;
  availableThemes: string[];
  redactedFields: string[];
}

/** Sanitized config payload returned to the renderer. */
export interface SanitizedConfigPayload {
  config: SanitizedConfig;
  status: ConfigStatus;
}

/** Result of writing a sanitized config back to disk. */
export interface WriteSanitizedResult {
  ok: boolean;
  error?: string;
  redactedFields: string[];
}

/** Path resolution result. */
interface ResolvedPaths {
  configPath: string;
  themesPath: string;
  source: ConfigStatus["source"];
}

const USERDATA_CONFIG_DIRNAME = ".config";
const REPO_CONFIG_DIRNAME = ".config";
const DEFAULT_CONFIG_FILENAME = "config.yaml";
const DEFAULT_THEMES_FILENAME = "themes.yaml";

/** Snapshot of the in-memory config used by the renderer. */
let currentConfig: YamlConfig = emptyConfig();
let currentStatus: ConfigStatus = buildDefaultStatus();
const lastImportSummary: { venice: boolean; jina: boolean; redacted: { venice: boolean; jina: boolean } } = {
  venice: false,
  jina: false,
  redacted: { venice: false, jina: false },
};

/** Returns true if a string looks like a URL (scheme present). */
function isUrl(value: string): boolean {
  if (!value) return false;
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
}

/** Returns the active repo-local config dir if we are running in dev and the
 *  repo has a `.config/` folder. Otherwise returns null. */
function getRepoLocalConfigDir(): string | null {
  if (!app.isPackaged) {
    // In dev, app.getAppPath() is the repo root.
    const repoRoot = app.getAppPath();
    return path.join(repoRoot, REPO_CONFIG_DIRNAME);
  }
  return null;
}

/** Returns the canonical userData config dir. */
function getUserDataConfigDir(): string {
  return path.join(app.getPath("userData"), USERDATA_CONFIG_DIRNAME);
}

/** Resolves the active config paths, honoring env overrides. */
function resolvePaths(): ResolvedPaths {
  const envConfig = process.env.VENICE_FORGE_CONFIG_FILE?.trim();
  const envThemes = process.env.VENICE_FORGE_THEMES_FILE?.trim();

  if (envConfig) {
    if (isUrl(envConfig)) {
      logError("VENICE_FORGE_CONFIG_FILE looks like a URL; ignoring.");
    } else {
      return {
        configPath: envConfig,
        themesPath: envThemes && !isUrl(envThemes) ? envThemes : deriveSiblingThemesPath(envConfig),
        source: "env-override",
      };
    }
  }

  const repoDir = getRepoLocalConfigDir();
  if (repoDir) {
    const localConfig = path.join(repoDir, "config.local.yaml");
    return {
      configPath: localConfig,
      themesPath: envThemes && !isUrl(envThemes) ? envThemes : path.join(repoDir, "themes.local.yaml"),
      source: "repo-local",
    };
  }

  const userDataDir = getUserDataConfigDir();
  return {
    configPath: path.join(userDataDir, DEFAULT_CONFIG_FILENAME),
    themesPath: envThemes && !isUrl(envThemes) ? envThemes : path.join(userDataDir, DEFAULT_THEMES_FILENAME),
    source: "userdata",
  };
}

/** Heuristic: when env override sets config but not themes, use a sibling
 *  themes file with the same base name. */
function deriveSiblingThemesPath(configPath: string): string {
  const ext = path.extname(configPath);
  const base = ext ? configPath.slice(0, -ext.length) : configPath;
  return `${base}.themes.yaml`;
}

/** Builds a safe default status (used when no file is present). */
function buildDefaultStatus(): ConfigStatus {
  const paths = resolvePaths();
  return {
    configPath: paths.configPath,
    themesPath: paths.themesPath,
    source: "defaults",
    configName: "default",
    profile: "default",
    loaded: false,
    parseError: null,
    warnings: [],
    hasVeniceApiKey: isApiKeyConfigured(),
    hasJinaApiKey: isJinaApiKeyConfigured(),
    keysImported: { venice: false, jina: false },
    keysRedacted: { venice: false, jina: false },
    secureStore: { venice: isApiKeyConfigured(), jina: isJinaApiKeyConfigured() },
    activeTheme: "builtin-dark",
    availableThemes: [],
    redactedFields: [],
  };
}

/** Reads the file at `filePath` or returns null when missing/unreadable. */
async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, { encoding: "utf-8" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

/** Generates a comment-headed default YAML for a brand-new config file.
 *  Critically, no real keys are ever placed in the default template. */
function renderDefaultConfigYaml(): string {
  return [
    "# Venice Forge local config",
    "# See docs/CONFIG.md for the full schema.",
    "# This file is ignored by git if it lives in .config/ and is not *.example.yaml.",
    "",
    "version: 1",
    "",
    "app:",
    '  config_name: "default"',
    '  profile: "default"',
    "  auto_open_devtools: false",
    "  check_for_updates: true",
    "",
    "secrets:",
    "  # Leave blank by default. If provided, plaintext keys are imported",
    "  # into OS secure storage on startup and then redacted from this file.",
    "  venice_api_key: \"\"",
    "  jina_api_key: \"\"",
    "  keep_plaintext_keys: false",
    "",
    "theme:",
    '  active: "builtin-dark"',
    '  themes_file: ""',
    "",
    "models:",
    "  chat: \"\"",
    "  image: \"\"",
    "  video: \"\"",
    "  audio: \"\"",
    "  music: \"\"",
    "  embedding: \"\"",
    "  upscale: \"\"",
    "",
    "chat:",
    "  system_prompt: \"\"",
    "  temperature: 0.7",
    "  top_p: 1",
    "  max_tokens: 4096",
    "  include_venice_system_prompt: false",
    '  enable_web_search: "off"',
    "  enable_web_scraping: false",
    "  enable_web_citations: false",
    "  strip_thinking_response: false",
    "  disable_thinking: false",
    "",
    "memory:",
    "  enable_memory_retrieval: true",
    "  show_pulled_context_before_sending: false",
    "",
    "research:",
    '  default_provider: "venice"',
    "  enable_jina: false",
    "  enable_social_discovery: false",
    "",
    "characters:",
    "  enabled: true",
    "  include_adult_characters: false",
    "  default_character_slug: \"\"",
    "",
    "safety:",
    "  # Venice Forge local filter. Set false for Adult Mode.",
    "  local_family_safe_mode_enabled: true",
    "  # Provider-side Venice safe_mode parameter; separate from the local filter.",
    "  venice_api_safe_mode: true",
    "",
    "developer:",
    "  verbose_config_logging: false",
    "  allow_config_key_import: true",
    "  force_import_keys: false",
    "  force_apply_config: false",
    "",
    "# Internal prompt-enhancer LLM. Hidden under-app helper for image",
    "# prompt enhance / remix. Not user-chat-accessible; the model id",
    "# is not exposed in the normal chat selector. Existing safety guard",
    "# remains authoritative.",
    "internal_prompt_enhancer:",
    "  enabled: true",
    '  model: "venice-uncensored-1-2"',
    "  temperature: 0.4",
    "  maxTokens: 350",
    "  systemPrompt: \"\"",
    "  remixSystemPrompt: \"\"",
    "",
  ].join("\n");
}

/** Generates a default themes YAML with the built-in entries. */
function renderDefaultThemesYaml(): string {
  return [
    "# Venice Forge local themes overlay",
    "# Built-in themes are loaded first. Add or override themes here.",
    "",
    "version: 1",
    "",
    "themes: {}",
    "",
  ].join("\n");
}

/** Ensures the config and themes files exist. Creates them if missing. */
async function ensureFiles(paths: ResolvedPaths): Promise<void> {
  const dir = path.dirname(paths.configPath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });

  const configExists = await pathExists(paths.configPath);
  if (!configExists) {
    await fs.writeFile(paths.configPath, renderDefaultConfigYaml(), { encoding: "utf-8", mode: 0o600 });
    logInfo("Created default config.yaml", { path: paths.configPath });
  }

  const themesExists = await pathExists(paths.themesPath);
  if (!themesExists) {
    await fs.writeFile(paths.themesPath, renderDefaultThemesYaml(), { encoding: "utf-8", mode: 0o600 });
    logInfo("Created default themes.yaml", { path: paths.themesPath });
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Loads a YAML file, returning a tuple of parsed value + parse error. */
async function loadYaml(filePath: string): Promise<{ value: unknown; error: string | null }> {
  const raw = await readFileIfExists(filePath);
  if (raw === null) return { value: null, error: null };
  try {
    return { value: yaml.parse(raw), error: null };
  } catch (err) {
    return { value: null, error: redactYamlError(err, filePath) };
  }
}

/** Returns a redacted message for YAML parse errors. */
function redactYamlError(err: unknown, filePath: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Trim to a single line, drop any line/column numbers that could reveal structure.
  return `Failed to parse ${path.basename(filePath)}: ${raw.split("\n")[0].slice(0, 200)}`;
}

/** Performs the API key import/redact pass on the validated config. */
async function importKeys(config: YamlConfig, originalYaml: string | null, filePath: string): Promise<{
  config: YamlConfig;
  imported: { venice: boolean; jina: boolean };
  redacted: { venice: boolean; jina: boolean };
  redactedFields: string[];
}> {
  const imported = { venice: false, jina: false };
  const redacted = { venice: false, jina: false };
  const redactedFields: string[] = [];
  const allowImport = config.developer.allow_config_key_import;
  const forceImport = config.developer.force_import_keys;
  const keepPlain = config.secrets.keep_plaintext_keys;

  // Always record the summary, even when allowImport is false.
  setLastImportSummary({ venice: false, jina: false, redacted: { venice: false, jina: false } });

  if (!allowImport) {
    logInfo("Config key import disabled by developer.allow_config_key_import=false");
    return { config, imported, redacted, redactedFields };
  }

  // Venice key
  const veniceKey = config.secrets.venice_api_key.trim();
  if (veniceKey) {
    const existing = getApiKey();
    if (!existing || forceImport) {
      try {
        setApiKey(veniceKey);
        imported.venice = true;
        logInfo("Imported Venice API key from config into secure store", { forced: forceImport });
        if (!keepPlain) {
          redacted.venice = true;
          redactedFields.push("secrets.venice_api_key");
        }
      } catch (err) {
        logError("Failed to import Venice API key from config", String(err));
      }
    } else {
      logInfo("Skipped Venice API key import: secure store already has a key (set developer.force_import_keys=true to override)");
    }
  }

  // Jina key
  const jinaKey = config.secrets.jina_api_key.trim();
  if (jinaKey) {
    const existing = getJinaApiKey();
    if (!existing || forceImport) {
      try {
        setJinaApiKey(jinaKey);
        imported.jina = true;
        logInfo("Imported Jina API key from config into secure store", { forced: forceImport });
        if (!keepPlain) {
          redacted.jina = true;
          redactedFields.push("secrets.jina_api_key");
        }
      } catch (err) {
        logError("Failed to import Jina API key from config", String(err));
      }
    } else {
      logInfo("Skipped Jina API key import: secure store already has a key (set developer.force_import_keys=true to override)");
    }
  }

  // Redact plaintext keys on disk if we imported them and keep_plaintext_keys is false.
  if ((redacted.venice || redacted.jina) && originalYaml !== null) {
    try {
      const redactedYaml = redactKeysInYaml(originalYaml, redacted);
      if (redactedYaml !== originalYaml) {
        const tempPath = `${filePath}.redact-${process.pid}-${Date.now()}.tmp`;
        try {
          await fs.writeFile(tempPath, redactedYaml, { encoding: "utf-8", mode: 0o600 });
          await fs.rename(tempPath, filePath);
        } catch (err) {
          await fs.rm(tempPath, { force: true }).catch(() => undefined);
          throw err;
        }
      }
    } catch (err) {
      logError("Failed to redact keys in config.yaml", String(err));
      throw new Error(`Failed to redact imported API keys: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  setLastImportSummary({ venice: imported.venice, jina: imported.jina, redacted });
  return { config, imported, redacted, redactedFields };
}

/** Replaces plaintext API keys with empty strings while preserving the YAML
 * document structure. Regex replacement is unsafe here because indentation is
 * semantically significant and quoted values have multiple valid forms. */
function redactKeysInYaml(raw: string, redacted: { venice: boolean; jina: boolean }): string {
  const document = yaml.parseDocument(raw);
  if (document.errors.length > 0) {
    throw document.errors[0];
  }
  if (redacted.venice) {
    document.setIn(["secrets", "venice_api_key"], "");
  }
  if (redacted.jina) {
    document.setIn(["secrets", "jina_api_key"], "");
  }
  return document.toString();
}

/** Builds the in-memory status snapshot. */
function buildStatus(args: {
  paths: ResolvedPaths;
  config: YamlConfig;
  warnings: ConfigWarning[];
  parseError: string | null;
  loaded: boolean;
  imported: { venice: boolean; jina: boolean };
  redacted: { venice: boolean; jina: boolean };
  redactedFields: string[];
  availableThemes: string[];
}): ConfigStatus {
  return {
    configPath: args.paths.configPath,
    themesPath: args.paths.themesPath,
    source: args.paths.source,
    configName: args.config.app.config_name,
    profile: args.config.app.profile,
    loaded: args.loaded,
    parseError: args.parseError,
    warnings: args.warnings,
    hasVeniceApiKey: args.config.secrets.venice_api_key.length > 0,
    hasJinaApiKey: args.config.secrets.jina_api_key.length > 0,
    keysImported: args.imported,
    keysRedacted: args.redacted,
    secureStore: { venice: isApiKeyConfigured(), jina: isJinaApiKeyConfigured() },
    activeTheme: args.config.theme.active,
    availableThemes: args.availableThemes,
    redactedFields: args.redactedFields,
  };
}

/** Discovers available built-in + merged theme ids. */
async function discoverAvailableThemes(themesPath: string, _fallback: string): Promise<{ ids: string[]; warnings: ConfigWarning[] }> {
  const warnings: ConfigWarning[] = [];
  const { BUILTIN_THEMES } = await import("../../src/theme/themes");
  const ids = BUILTIN_THEMES.map((t) => t.id);

  // Merge in local themes.
  const themes = await loadYaml(themesPath);
  if (themes.error) {
    warnings.push({ field: "(themes)", message: themes.error, severity: "error" });
    return { ids, warnings };
  }
  if (themes.value === null) {
    return { ids, warnings };
  }
  const result = validateThemesFile(themes.value);
  warnings.push(...result.warnings);
  for (const name of Object.keys(result.themes)) {
    if (!ids.includes(name)) ids.push(name);
  }
  return { ids, warnings };
}

/** Initializes the config service: resolves paths, ensures files, parses,
 *  imports keys, redacts plaintext keys, and updates the in-memory snapshot. */
export async function initializeConfig(): Promise<ConfigStatus> {
  try {
    const paths = resolvePaths();
    await ensureFiles(paths);

    const configRaw = await loadYaml(paths.configPath);
    const warnings: ConfigWarning[] = [];
    let parsed: YamlConfig = emptyConfig();
    let parseError: string | null = null;
    let redactedFields: string[] = [];

    if (configRaw.error) {
      parseError = configRaw.error;
      warnings.push({ field: "(config.yaml)", message: configRaw.error, severity: "error" });
    } else if (configRaw.value === null) {
      // Should not happen — we just ensured the file exists.
      parseError = "config.yaml is empty or unreadable.";
    } else {
      const result = validateConfig(configRaw.value);
      parsed = result.config;
      warnings.push(...result.warnings);
      // Re-serialize the validated config so any normalisation is persisted.
      try {
        await fs.writeFile(paths.configPath, yaml.stringify(parsed), { encoding: "utf-8", mode: 0o600 });
      } catch (err) {
        logError("Failed to persist normalised config.yaml", String(err));
      }
      // Import keys (may redact plaintext on disk).
      const importResult = await importKeys(
        parsed,
        configRaw.value ? await readFileIfExists(paths.configPath) : null,
        paths.configPath,
      );
      parsed = importResult.config;
      redactedFields = importResult.redactedFields;
      warnings.push(...(await discoverAvailableThemes(paths.themesPath, parsed.theme.active)).warnings);
    }

    const { ids: availableThemes } = await discoverAvailableThemes(paths.themesPath, parsed.theme.active);

    // Effective active theme: only fall back if the configured one is missing.
    let activeTheme = parsed.theme.active;
    if (!availableThemes.includes(activeTheme)) {
      // Fall back to first available built-in.
      const { BUILTIN_THEMES } = await import("../../src/theme/themes");
      activeTheme = BUILTIN_THEMES[0]?.id ?? "builtin-dark";
      warnings.push({ field: "theme.active", message: `Configured theme "${parsed.theme.active}" not found; falling back to "${activeTheme}".`, severity: "warn" });
    }

    const imported = { venice: lastImportSummary.venice, jina: lastImportSummary.jina };
    const redacted = { venice: lastImportSummary.redacted.venice, jina: lastImportSummary.redacted.jina };

    currentConfig = { ...parsed, theme: { ...parsed.theme, active: activeTheme } };
    currentStatus = buildStatus({
      paths,
      config: currentConfig,
      warnings,
      parseError,
      loaded: parseError === null,
      imported,
      redacted,
      redactedFields,
      availableThemes,
    });

    logInfo("Config initialized", {
      source: paths.source,
      configPath: paths.configPath,
      themesPath: paths.themesPath,
      activeTheme,
      warnings: warnings.length,
    });

    setRuntimeLocalFamilySafeModeEnabled(currentConfig.safety.local_family_safe_mode_enabled);
    return currentStatus;
  } catch (err) {
    logError("Config initialization failed", String(err));
    // Fall back to defaults so the app still boots.
    currentConfig = emptyConfig();
    setRuntimeLocalFamilySafeModeEnabled(true);
    currentStatus = buildDefaultStatus();
    currentStatus.parseError = err instanceof Error ? err.message : "Unknown config error";
    return currentStatus;
  }
}

/** Re-reads the config from disk and updates the in-memory snapshot. */
export async function reloadConfig(): Promise<ConfigStatus> {
  return initializeConfig();
}

/** Returns the sanitized config + status. */
export function getSanitizedConfig(): SanitizedConfigPayload {
  return {
    config: sanitizeConfig(currentConfig),
    status: currentStatus,
  };
}

/** Returns the current status only. */
export function getStatus(): ConfigStatus {
  return currentStatus;
}

/** Returns the resolved config paths. */
export function getPaths(): ResolvedPaths {
  return resolvePaths();
}

/** Returns the parsed themes file (built-in + merged) for theme loaders. */
export async function loadMergedThemes(): Promise<{ themes: Record<string, YamlTheme>; warnings: ConfigWarning[] }> {
  const paths = resolvePaths();
  const themes = await loadYaml(paths.themesPath);
  if (themes.error || themes.value === null) {
    return { themes: {}, warnings: themes.error ? [{ field: "(themes)", message: themes.error, severity: "error" }] : [] };
  }
  return validateThemesFile(themes.value);
}

/** Opens the active config directory in the OS file manager. */
export async function openConfigFolder(): Promise<{ ok: boolean; path: string; error?: string }> {
  try {
    const dir = path.dirname(currentStatus.configPath);
    await fs.mkdir(dir, { recursive: true });
    const err = await shell.openPath(dir);
    if (err) return { ok: false, path: dir, error: err };
    return { ok: true, path: dir };
  } catch (err) {
    return { ok: false, path: "", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Updates the in-memory config (non-secret values only) and writes the
 *  sanitized YAML back to disk. The renderer is responsible for providing
 *  a sanitized patch; this function enforces the sanitization one more time. */
export async function writeSanitizedConfig(patch: unknown): Promise<WriteSanitizedResult> {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { ok: false, error: "Patch must be an object.", redactedFields: [] };
  }
  const sanitized = sanitizeConfig(currentConfig);
  const merged = mergeSanitized(sanitized, patch as Record<string, unknown>);
  // Re-validate the merged config to make sure we don't write back invalid values.
  const result = validateConfig(merged);
  const redactedFields: string[] = [];
  // We never accept a patch that contains a non-empty plaintext key.
  const p = patch as Record<string, unknown>;
  const sec = p.secrets as Record<string, unknown> | undefined;
  if (sec && typeof sec === "object") {
    if (typeof sec.venice_api_key === "string" && sec.venice_api_key.length > 0) {
      redactedFields.push("secrets.venice_api_key");
    }
    if (typeof sec.jina_api_key === "string" && sec.jina_api_key.length > 0) {
      redactedFields.push("secrets.jina_api_key");
    }
  }
  // Strip secrets.* values back to empty.
  const finalConfig: YamlConfig = {
    ...result.config,
    secrets: { ...result.config.secrets, venice_api_key: "", jina_api_key: "" },
  };
  try {
    const yamlText = yaml.stringify(finalConfig);
    await fs.writeFile(currentStatus.configPath, yamlText, { encoding: "utf-8", mode: 0o600 });
    currentConfig = finalConfig;
    setRuntimeLocalFamilySafeModeEnabled(finalConfig.safety.local_family_safe_mode_enabled);
    currentStatus = { ...currentStatus, configName: finalConfig.app.config_name, profile: finalConfig.app.profile, activeTheme: finalConfig.theme.active, redactedFields };
    return { ok: true, redactedFields };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), redactedFields };
  }
}

/** Deep-merges a sanitized patch into a sanitized base, ensuring structure
 *  stays aligned. The patch is treated as a partial overlay. */
function mergeSanitized(base: SanitizedConfig, patch: Record<string, unknown>): YamlConfig {
  // Re-derive a YamlConfig shape from the sanitized base. The patch can only
  // override leaf fields.
  const baseYaml: YamlConfig = {
    version: base.version,
    app: base.app,
    secrets: { venice_api_key: "", jina_api_key: "", keep_plaintext_keys: base.secrets.keep_plaintext_keys },
    theme: base.theme,
    models: base.models,
    chat: base.chat,
    memory: base.memory,
    research: base.research,
    characters: base.characters,
    safety: base.safety,
    developer: {
      verbose_config_logging: base.developer.verbose_config_logging,
      allow_config_key_import: base.developer.allow_config_key_import,
      force_import_keys: base.developer.force_import_keys,
      force_apply_config: base.developer.force_apply_config,
    },
    internal_prompt_enhancer: base.internal_prompt_enhancer,
  };

  if (typeof patch.app === "object" && patch.app) {
    Object.assign(baseYaml.app, patch.app as object);
  }
  if (typeof patch.theme === "object" && patch.theme) {
    Object.assign(baseYaml.theme, patch.theme as object);
  }
  if (typeof patch.models === "object" && patch.models) {
    Object.assign(baseYaml.models, patch.models as object);
  }
  if (typeof patch.chat === "object" && patch.chat) {
    Object.assign(baseYaml.chat, patch.chat as object);
  }
  if (typeof patch.memory === "object" && patch.memory) {
    Object.assign(baseYaml.memory, patch.memory as object);
  }
  if (typeof patch.research === "object" && patch.research) {
    Object.assign(baseYaml.research, patch.research as object);
  }
  if (typeof patch.characters === "object" && patch.characters) {
    Object.assign(baseYaml.characters, patch.characters as object);
  }
  if (typeof patch.safety === "object" && patch.safety) {
    Object.assign(baseYaml.safety, patch.safety as object);
  }
  if (typeof patch.developer === "object" && patch.developer) {
    Object.assign(baseYaml.developer, patch.developer as object);
  }
  // Internal prompt-enhancer: model, temperature, maxTokens, system
  // prompts, and the `enabled` flag all flow through the renderer-driven
  // patch path. We deep-merge the override so a partial update (e.g.
  // "just toggle enabled") does not wipe the other fields.
  if (typeof patch.internal_prompt_enhancer === "object" && patch.internal_prompt_enhancer) {
    Object.assign(
      baseYaml.internal_prompt_enhancer,
      patch.internal_prompt_enhancer as object,
    );
  }
  // Intentionally ignore `secrets` from the patch: API keys must use the
  // dedicated `apiKey:set` / `jinaApiKey:set` IPC channels.

  return baseYaml;
}

/** Returns the in-memory current config (used by the IPC layer for status). */
export function getCurrentConfig(): YamlConfig {
  return currentConfig;
}

// (lastImportSummary is module-level state, mutated only by setLastImportSummary.)

/** Updates the last import summary (called by importKeys). */
function setLastImportSummary(value: { venice: boolean; jina: boolean; redacted: { venice: boolean; jina: boolean } }): void {
  lastImportSummary.venice = value.venice;
  lastImportSummary.jina = value.jina;
  lastImportSummary.redacted = value.redacted;
}

/** Resets the secure store keys (used by Settings UI). */
export function resetSecureStoreKeys(): { venice: boolean; jina: boolean } {
  let v = false;
  let j = false;
  if (isApiKeyConfigured()) {
    deleteApiKey();
    v = true;
  }
  if (isJinaApiKeyConfigured()) {
    deleteJinaApiKey();
    j = true;
  }
  currentStatus = { ...currentStatus, secureStore: { venice: isApiKeyConfigured(), jina: isJinaApiKeyConfigured() } };
  return { venice: v, jina: j };
}

/** Allowed base directories for config template exports (matches app:readLocalFile policy). */
const EXPORT_ALLOWED_DIRS = ["downloads", "documents"] as const;

/** Writes a sanitized config template (no secrets) to a chosen path.
 *  Restricted to Downloads or Documents to prevent arbitrary file writes. */
export async function exportConfigTemplate(targetPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (typeof targetPath !== "string" || targetPath.length === 0 || targetPath.length > 4096 || targetPath.includes("\0")) {
      return { ok: false, error: "Invalid export path." };
    }
    if (isUrl(targetPath)) {
      return { ok: false, error: "Remote URLs are not allowed." };
    }
    const resolvedTarget = path.resolve(targetPath);
    // Resolve allowed base directories once. We keep BOTH the lexical form
    // (for the deterministic cross-platform check below) and the realpath
    // form (for symlink defense). On macOS the temp dir lives at
    // /var/.../T/... but realpath is /private/var/.../T/... — mixing the
    // two forms in a comparison would falsely classify a target inside
    // /var/.../T/.../downloads as outside the allowlist.
    const rawAllowedDirs = EXPORT_ALLOWED_DIRS
      .map((name) => app.getPath(name))
      .filter((d): d is string => Boolean(d));
    const realAllowedDirs = await Promise.all(
      rawAllowedDirs.map(async (dir) => {
        try {
          return await fs.realpath(dir);
        } catch {
          return dir;
        }
      })
    );
    const isInside = (candidate: string, allowed: string[]): boolean =>
      allowed.some((dir) => candidate === dir || candidate.startsWith(dir + path.sep));
    // 1. Lexical allowlist check. If the lexical resolved target is outside
    //    Downloads/Documents, classify it as an allowlist violation
    //    REGARDLESS of whether the target's parent exists on this platform.
    //    This is the fix for the 2026-06-09 Windows CI failure: on Windows,
    //    path.resolve("/etc/passwd") becomes a drive-rooted path whose
    //    parent usually does not exist, so the previous realpath() fallback
    //    returned "Invalid export path." before reaching the allowlist
    //    rejection. With the lexical check first, /etc/passwd is always
    //    classified as outside the allowlist.
    if (!isInside(resolvedTarget, rawAllowedDirs)) {
      return { ok: false, error: "Export must be inside Downloads or Documents." };
    }
    // 2. Resolve symlinks (defense against symlinks that lexically live
    //    inside Downloads/Documents but point elsewhere on disk). Prefer
    //    realpath(target); fall back to realpath(parent) when the target
    //    itself does not exist yet.
    let resolved: string;
    try {
      resolved = await fs.realpath(resolvedTarget);
    } catch {
      try {
        resolved = await fs.realpath(path.dirname(resolvedTarget));
      } catch {
        return { ok: false, error: "Invalid export path." };
      }
    }
    // 3. Re-check the realpath result against the allowlist. This catches
    //    symlinks that lexically live inside Downloads/Documents but point
    //    outside on disk. We compare in realpath space to handle macOS
    //    /var/... <-> /private/var/... transparently.
    if (!isInside(resolved, realAllowedDirs)) {
      return { ok: false, error: "Export must be inside Downloads or Documents." };
    }
    const sanitized = sanitizeConfig(currentConfig);
    // Build a YamlConfig-shaped object (no raw keys) for the template.
    const template: YamlConfig = {
      version: sanitized.version,
      app: sanitized.app,
      secrets: { venice_api_key: "", jina_api_key: "", keep_plaintext_keys: sanitized.secrets.keep_plaintext_keys },
      theme: sanitized.theme,
      models: sanitized.models,
      chat: sanitized.chat,
      memory: sanitized.memory,
      research: sanitized.research,
      characters: sanitized.characters,
      safety: sanitized.safety,
      developer: {
        verbose_config_logging: sanitized.developer.verbose_config_logging,
        allow_config_key_import: sanitized.developer.allow_config_key_import,
        force_import_keys: sanitized.developer.force_import_keys,
        force_apply_config: sanitized.developer.force_apply_config,
      },
      internal_prompt_enhancer: sanitized.internal_prompt_enhancer,
    };
    const yamlText = yaml.stringify(template);
    await fs.writeFile(resolvedTarget, yamlText, { encoding: "utf-8", mode: 0o600 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
