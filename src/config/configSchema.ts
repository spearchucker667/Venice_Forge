// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Strict runtime validation for the local master YAML config.
 *
 * The schema is intentionally tiny and self-contained: no Zod / io-ts / etc.
 * We deliberately avoid pulling in another schema framework because the config
 * shape is small, the rules are explicit, and the existing codebase already
 * rolls its own validators (see src/shared/validation.ts).
 *
 * SECURITY:
 *   - This module never returns raw API keys. The sanitized view returned to
 *     the renderer always strips secrets.venice_api_key / secrets.jina_api_key.
 *   - All path values must be local. URLs are rejected.
 *   - All numeric inputs are clamped; unknown enum strings fall back with a
 *     warning so the UI can surface parse problems.
 */
import { DEFAULT_PROMPT_ENHANCER_MODEL } from "../constants/venice";
import { isValidColorValue } from "../theme/validateColor";

/** Current schema version. Bumping this is a breaking change. */
export const CONFIG_SCHEMA_VERSION = 1 as const;

/** Allowed value for `chat.enable_web_search`. */
export type EnableWebSearch = "off" | "on" | "auto";

/** Allowed research provider. */
export type ResearchProvider = "venice" | "jina" | "auto";

/** Allowed Venice search provider. */
export type VeniceSearchProvider = "brave" | "google";

/** Allowed Jina reader provider fallback. */
export type JinaReaderProvider = "jina" | "generic-http";

/** Theme mode. */
export type ThemeMode = "dark" | "light";

/** Theme token keys. Mirrors src/theme/themeTypes.ts but kept inline to avoid
 *  a circular import (this module is consumed by main process too). */
export const REQUIRED_THEME_TOKEN_KEYS = [
  "background",
  "surface",
  "surfaceElevated",
  "surfaceMuted",
  "border",
  "borderStrong",
  "textPrimary",
  "textSecondary",
  "textMuted",
  "foreground",
  "foregroundMuted",
  "foregroundSubtle",
  "accent",
  "accentHover",
  "accentForeground",
  "success",
  "successForeground",
  "warning",
  "warningForeground",
  "danger",
  "dangerForeground",
  "info",
  "inputBackground",
  "inputForeground",
  "placeholder",
  "disabledForeground",
  "buttonPrimaryBackground",
  "buttonPrimaryForeground",
  "buttonSecondaryBackground",
  "buttonSecondaryForeground",
  "link",
  "focusRing",
  "selectionBackground",
  "selectionForeground",
  "overlay",
  "glow",
] as const;

export type RequiredThemeTokenKey = (typeof REQUIRED_THEME_TOKEN_KEYS)[number];

/** Theme tokens map. Keys are camelCase. */
export type ThemeTokens = Record<RequiredThemeTokenKey, string>;

/** A single theme entry as it appears in `themes.<name>`. */
export interface YamlTheme {
  display_name: string;
  mode: ThemeMode;
  tokens: Partial<ThemeTokens>;
}

/** Themes block. */
export interface YamlThemesFile {
  version: 1;
  themes: Record<string, YamlTheme>;
}

/** App section. */
export interface YamlApp {
  config_name: string;
  profile: string;
  auto_open_devtools: boolean;
  check_for_updates: boolean;
}

/** Secrets section. Never sent to the renderer. */
export interface YamlSecrets {
  venice_api_key: string;
  jina_api_key: string;
  keep_plaintext_keys: boolean;
}

/** Theme section. */
export interface YamlThemeRef {
  active: string;
  themes_file: string;
}

/** Models section. Empty string means "use built-in default". */
export interface YamlModels {
  chat: string;
  image: string;
  video: string;
  audio: string;
  music: string;
  embedding: string;
  upscale: string;
}

/** Chat section. */
export interface YamlChat {
  system_prompt: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  include_venice_system_prompt: boolean;
  enable_web_search: EnableWebSearch;
  enable_web_scraping: boolean;
  enable_web_citations: boolean;
  strip_thinking_response: boolean;
  disable_thinking: boolean;
}

/** Memory section. */
export interface YamlMemory {
  enable_memory_retrieval: boolean;
  show_pulled_context_before_sending: boolean;
}

/** Research section. */
export interface YamlResearch {
  default_provider: ResearchProvider;
  default_search_provider: VeniceSearchProvider;
  default_reader_provider: JinaReaderProvider;
  enable_jina: boolean;
  enable_social_discovery: boolean;
  enable_live_browser: boolean;
  live_browser_search_provider: VeniceSearchProvider;
  live_browser_persist_session: boolean;
  live_browser_javascript_enabled: boolean;
  max_browser_extract_chars: number;
}

/** Characters section. */
export interface YamlCharacters {
  enabled: boolean;
  include_adult_characters: boolean;
  default_character_slug: string;
}

/** Independent local and provider-side safety settings. */
export interface YamlSafety {
  local_family_safe_mode_enabled: boolean;
  venice_api_safe_mode: boolean;
}

/** Developer section. */
export interface YamlDeveloper {
  verbose_config_logging: boolean;
  allow_config_key_import: boolean;
  force_import_keys: boolean;
  force_apply_config: boolean;
}

/** Internal prompt-enhancer LLM configuration. */
export interface YamlInternalPromptEnhancer {
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  remixSystemPrompt: string;
}

/** Full validated config shape. */
export interface YamlConfig {
  version: 1;
  app: YamlApp;
  secrets: YamlSecrets;
  theme: YamlThemeRef;
  models: YamlModels;
  chat: YamlChat;
  memory: YamlMemory;
  research: YamlResearch;
  characters: YamlCharacters;
  safety: YamlSafety;
  developer: YamlDeveloper;
  internal_prompt_enhancer: YamlInternalPromptEnhancer;
}

/** Sanitized view of the config safe to send to the renderer.
 *  Strips secrets.venice_api_key and secrets.jina_api_key. */
export interface SanitizedConfig {
  version: 1;
  app: YamlApp;
  secrets: {
    has_venice_api_key: boolean;
    has_jina_api_key: boolean;
    keep_plaintext_keys: boolean;
  };
  theme: YamlThemeRef;
  models: YamlModels;
  chat: YamlChat;
  memory: YamlMemory;
  research: YamlResearch;
  characters: YamlCharacters;
  safety: YamlSafety;
  developer: {
    verbose_config_logging: boolean;
    allow_config_key_import: boolean;
    force_apply_config: boolean;
    // force_import_keys is intentionally exposed as the renderer can show
    // whether re-import is enabled. The flag is read-only here.
    force_import_keys: boolean;
  };
  internal_prompt_enhancer: YamlInternalPromptEnhancer;
}

/** Single validation/parse warning, returned alongside the sanitized config. */
export interface ConfigWarning {
  field: string;
  message: string;
  severity: "warn" | "error";
}

/** Result of a single validation+normalization pass. */
export interface ConfigValidationResult {
  config: YamlConfig;
  warnings: ConfigWarning[];
  redactedFields: string[];
}

const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 2;
const TOP_P_MIN = 0;
const TOP_P_MAX = 1;
const MAX_TOKENS_MIN = 1;
const MAX_TOKENS_MAX = 200000;
const KEY_MAX_LENGTH = 512;
const THEME_NAME_MAX_LENGTH = 128;
const PATH_MAX_LENGTH = 4096;
const SYSTEM_PROMPT_MAX_LENGTH = 32768;
const ENHANCER_PROMPT_MAX_LENGTH = 4096;

/** Default enhance system prompt. The Venice Forge safety guard and the
 *  upstream provider controls remain authoritative. This prompt is a
 *  task-focused rewrite instruction; it must not reframe itself as
 *  overriding safety, and it must not instruct the model to ignore
 *  provider-level safety guidance. */
const DEFAULT_ENHANCE_SYSTEM_PROMPT = `You are Venice Forge's internal image-prompt enhancer. Rewrite the user's image prompt into one concise, vivid, production-ready image-generation prompt. Preserve the user's subject, composition, style, medium, and constraints. Improve specificity, visual language, lighting, camera/composition, material detail, and quality cues.

Do not add moral commentary, policy commentary, disclaimers, refusals, markdown, alternatives, or explanations. Return only the improved prompt. The final prompt must stay under the absolute 1500-character ceiling.

The app's existing safety guard and upstream provider controls remain authoritative. You do not override them.`;

/** Default remix system prompt. Same safety posture as the enhance prompt. */
const DEFAULT_REMIX_SYSTEM_PROMPT = `You are Venice Forge's internal image-prompt remix engine. Create one visually distinct variation of the user's image prompt while preserving the core subject identity and user intent. Change composition, setting, lighting, camera angle, mood, and style.

Do not add moral commentary, policy commentary, disclaimers, refusals, markdown, alternatives, or explanations. Return only the remixed prompt. The final prompt must stay under the absolute 1500-character ceiling.

The app's existing safety guard and upstream provider controls remain authoritative. You do not override them.`;

/** Returns true if the input is a local filesystem path (no scheme). */
function looksLikeUrl(value: string): boolean {
  if (!value) return false;
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/** Clamps a number into [min, max]. Returns `fallback` for non-finite values. */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Returns the input if it is a finite integer, otherwise `fallback`. */
function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const n = Math.trunc(value);
  return Math.min(max, Math.max(min, n));
}

/** Returns the input if it is a non-empty string under `maxLen`, else `fallback`. */
function clampString(value: unknown, maxLen: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value;
  if (trimmed.length === 0) return fallback;
  if (trimmed.length > maxLen) return trimmed.slice(0, maxLen);
  return trimmed;
}

function clampBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clampEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function clampPath(value: unknown, warnings: ConfigWarning[], field: string, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (value.length === 0) return fallback;
  if (value.length > PATH_MAX_LENGTH) {
    warnings.push({ field, message: `Path exceeds ${PATH_MAX_LENGTH} characters; rejected.`, severity: "error" });
    return fallback;
  }
  if (looksLikeUrl(value)) {
    warnings.push({ field, message: `Path "${value}" looks like a URL. Local file paths only.`, severity: "error" });
    return fallback;
  }
  // Reject control characters and NUL bytes that some FS APIs mishandle.
  // eslint-disable-next-line no-control-regex -- intentional rejection of control chars
  if (/[\u0000-\u001f]/.test(value)) {
    warnings.push({ field, message: `Path contains control characters; rejected.`, severity: "error" });
    return fallback;
  }
  return value;
}

function clampKey(value: unknown, field: string, redactedFields: string[], warnings: ConfigWarning[]): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length > KEY_MAX_LENGTH) {
    warnings.push({ field, message: `Key length exceeds ${KEY_MAX_LENGTH}; rejected.`, severity: "error" });
    redactedFields.push(field);
    return "";
  }
  return trimmed;
}

function clampThemeName(value: unknown, field: string, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  if (trimmed.length > THEME_NAME_MAX_LENGTH) return trimmed.slice(0, THEME_NAME_MAX_LENGTH);
  return trimmed;
}

function validateThemeBlock(name: string, raw: unknown): { theme: YamlTheme | null; warnings: ConfigWarning[] } {
  const warnings: ConfigWarning[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    warnings.push({ field: `themes.${name}`, message: "Theme entry must be an object; skipped.", severity: "error" });
    return { theme: null, warnings };
  }
  const rec = raw as Record<string, unknown>;
  if (rec.mode !== "dark" && rec.mode !== "light") {
    warnings.push({ field: `themes.${name}.mode`, message: `Invalid mode "${String(rec.mode)}"; skipped.`, severity: "error" });
    return { theme: null, warnings };
  }
  if (typeof rec.display_name !== "string" || rec.display_name.length === 0) {
    warnings.push({ field: `themes.${name}.display_name`, message: "display_name must be a non-empty string; skipped.", severity: "error" });
    return { theme: null, warnings };
  }
  if (rec.display_name.length > THEME_NAME_MAX_LENGTH) {
    warnings.push({ field: `themes.${name}.display_name`, message: `display_name exceeds ${THEME_NAME_MAX_LENGTH} chars; skipped.`, severity: "error" });
    return { theme: null, warnings };
  }
  if (typeof rec.tokens !== "object" || rec.tokens === null || Array.isArray(rec.tokens)) {
    warnings.push({ field: `themes.${name}.tokens`, message: "tokens must be an object; skipped.", severity: "error" });
    return { theme: null, warnings };
  }
  const tokens: Record<string, string> = {};
  const allowedTokens = new Set<string>(REQUIRED_THEME_TOKEN_KEYS);
  let allValid = true;
  for (const [k, v] of Object.entries(rec.tokens as Record<string, unknown>)) {
    const normalizedKey = k.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (!allowedTokens.has(normalizedKey)) {
      warnings.push({ field: `themes.${name}.tokens.${k}`, message: "Unknown theme token; ignored.", severity: "warn" });
      continue;
    }
    if (typeof v !== "string" || !isValidColorValue(v)) {
      warnings.push({ field: `themes.${name}.tokens.${k}`, message: "Invalid color value; theme skipped.", severity: "error" });
      allValid = false;
      break;
    }
    tokens[normalizedKey] = v;
  }
  
  if (allValid) {
    for (const req of REQUIRED_THEME_TOKEN_KEYS) {
      if (!(req in tokens)) {
        warnings.push({ field: `themes.${name}.tokens.${req}`, message: `Missing required theme token: ${req}; theme skipped.`, severity: "error" });
        allValid = false;
        break;
      }
    }
  }

  if (!allValid) return { theme: null, warnings };
  return {
    theme: {
      display_name: rec.display_name,
      mode: rec.mode,
      tokens: tokens as Partial<ThemeTokens>,
    },
    warnings,
  };
}

/** Validates and normalizes a parsed YAML config object. */
export function validateConfig(raw: unknown): ConfigValidationResult {
  const warnings: ConfigWarning[] = [];
  const redactedFields: string[] = [];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return makeFallback(warnings, "Top-level config must be a mapping.");
  }
  const r = raw as Record<string, unknown>;

  if (r.version !== 1) {
    warnings.push({ field: "version", message: `Unknown config version "${String(r.version)}"; expected 1. Falling back to defaults.`, severity: "error" });
    return { config: emptyConfig(), warnings, redactedFields };
  }

  // ── app ──
  const appRaw = (typeof r.app === "object" && r.app !== null) ? r.app as Record<string, unknown> : {};
  const app: YamlApp = {
    config_name: clampString(appRaw.config_name, 128, "local-dev"),
    profile: clampString(appRaw.profile, 32, "development"),
    auto_open_devtools: clampBool(appRaw.auto_open_devtools, false),
    check_for_updates: clampBool(appRaw.check_for_updates, true),
  };

  // ── secrets ──
  const secRaw = (typeof r.secrets === "object" && r.secrets !== null) ? r.secrets as Record<string, unknown> : {};
  const secrets: YamlSecrets = {
    venice_api_key: clampKey(secRaw.venice_api_key, "secrets.venice_api_key", redactedFields, warnings),
    jina_api_key: clampKey(secRaw.jina_api_key, "secrets.jina_api_key", redactedFields, warnings),
    keep_plaintext_keys: clampBool(secRaw.keep_plaintext_keys, false),
  };

  // ── theme ──
  const themeRaw = (typeof r.theme === "object" && r.theme !== null) ? r.theme as Record<string, unknown> : {};
  const theme: YamlThemeRef = {
    active: clampThemeName(themeRaw.active, "theme.active", "builtin-venice"),
    themes_file: clampPath(themeRaw.themes_file, warnings, "theme.themes_file", ""),
  };

  // ── models ──
  const modelsRaw = (typeof r.models === "object" && r.models !== null) ? r.models as Record<string, unknown> : {};
  const models: YamlModels = {
    chat: clampString(modelsRaw.chat, 256, ""),
    image: clampString(modelsRaw.image, 256, ""),
    video: clampString(modelsRaw.video, 256, ""),
    audio: clampString(modelsRaw.audio, 256, ""),
    music: clampString(modelsRaw.music, 256, ""),
    embedding: clampString(modelsRaw.embedding, 256, ""),
    upscale: clampString(modelsRaw.upscale, 256, ""),
  };

  // ── chat ──
  const chatRaw = (typeof r.chat === "object" && r.chat !== null) ? r.chat as Record<string, unknown> : {};
  const chat: YamlChat = {
    system_prompt: clampString(chatRaw.system_prompt, SYSTEM_PROMPT_MAX_LENGTH, ""),
    temperature: clampNumber(chatRaw.temperature, TEMPERATURE_MIN, TEMPERATURE_MAX, 0.7),
    top_p: clampNumber(chatRaw.top_p, TOP_P_MIN, TOP_P_MAX, 1),
    max_tokens: clampInteger(chatRaw.max_tokens, MAX_TOKENS_MIN, MAX_TOKENS_MAX, 4096),
    include_venice_system_prompt: clampBool(chatRaw.include_venice_system_prompt, true),
    enable_web_search: clampEnum(chatRaw.enable_web_search, ["off", "on", "auto"] as const, "off"),
    enable_web_scraping: clampBool(chatRaw.enable_web_scraping, false),
    enable_web_citations: clampBool(chatRaw.enable_web_citations, false),
    strip_thinking_response: clampBool(chatRaw.strip_thinking_response, false),
    disable_thinking: clampBool(chatRaw.disable_thinking, false),
  };

  // ── memory ──
  const memoryRaw = (typeof r.memory === "object" && r.memory !== null) ? r.memory as Record<string, unknown> : {};
  const memory: YamlMemory = {
    enable_memory_retrieval: clampBool(memoryRaw.enable_memory_retrieval, true),
    show_pulled_context_before_sending: clampBool(memoryRaw.show_pulled_context_before_sending, false),
  };

  // ── research ──
  const researchRaw = (typeof r.research === "object" && r.research !== null) ? r.research as Record<string, unknown> : {};
  const research: YamlResearch = {
    default_provider: clampEnum(researchRaw.default_provider, ["venice", "jina", "auto"] as const, "venice"),
    default_search_provider: clampEnum(researchRaw.default_search_provider, ["brave", "google"] as const, "brave"),
    default_reader_provider: clampEnum(researchRaw.default_reader_provider, ["jina", "generic-http"] as const, "jina"),
    enable_jina: clampBool(researchRaw.enable_jina, false),
    enable_social_discovery: clampBool(researchRaw.enable_social_discovery, false),
    enable_live_browser: clampBool(researchRaw.enable_live_browser, false),
    live_browser_search_provider: clampEnum(researchRaw.live_browser_search_provider, ["brave", "google"] as const, "google"),
    live_browser_persist_session: clampBool(researchRaw.live_browser_persist_session, true),
    live_browser_javascript_enabled: clampBool(researchRaw.live_browser_javascript_enabled, true),
    max_browser_extract_chars: clampInteger(researchRaw.max_browser_extract_chars, 1000, 100_000, 40_000),
  };

  // ── characters ──
  const charRaw = (typeof r.characters === "object" && r.characters !== null) ? r.characters as Record<string, unknown> : {};
  const characters: YamlCharacters = {
    enabled: clampBool(charRaw.enabled, true),
    include_adult_characters: clampBool(charRaw.include_adult_characters, false),
    default_character_slug: clampString(charRaw.default_character_slug, 128, ""),
  };

  const safetyRaw = (typeof r.safety === "object" && r.safety !== null) ? r.safety as Record<string, unknown> : {};
  const safety: YamlSafety = {
    local_family_safe_mode_enabled: clampBool(safetyRaw.local_family_safe_mode_enabled, true),
    venice_api_safe_mode: clampBool(safetyRaw.venice_api_safe_mode, true),
  };

  // ── developer ──
  const devRaw = (typeof r.developer === "object" && r.developer !== null) ? r.developer as Record<string, unknown> : {};
  const developer: YamlDeveloper = {
    verbose_config_logging: clampBool(devRaw.verbose_config_logging, false),
    allow_config_key_import: clampBool(devRaw.allow_config_key_import, true),
    force_import_keys: clampBool(devRaw.force_import_keys, false),
    force_apply_config: clampBool(devRaw.force_apply_config, false),
  };

  // ── internal_prompt_enhancer ──
  const enhancerRaw = (typeof r.internal_prompt_enhancer === "object" && r.internal_prompt_enhancer !== null)
    ? r.internal_prompt_enhancer as Record<string, unknown>
    : {};
  const internal_prompt_enhancer: YamlInternalPromptEnhancer = {
    enabled: clampBool(enhancerRaw.enabled, true),
    model: clampString(enhancerRaw.model, 256, DEFAULT_PROMPT_ENHANCER_MODEL),
    temperature: clampNumber(enhancerRaw.temperature, 0, 2, 0.4),
    maxTokens: clampInteger(enhancerRaw.maxTokens, 1, 4000, 350),
    systemPrompt: clampString(enhancerRaw.systemPrompt, ENHANCER_PROMPT_MAX_LENGTH, DEFAULT_ENHANCE_SYSTEM_PROMPT),
    remixSystemPrompt: clampString(enhancerRaw.remixSystemPrompt, ENHANCER_PROMPT_MAX_LENGTH, DEFAULT_REMIX_SYSTEM_PROMPT),
  };

  return {
    config: {
      version: 1,
      app,
      secrets,
      theme,
      models,
      chat,
      memory,
      research,
      characters,
      safety,
      developer,
      internal_prompt_enhancer,
    },
    warnings,
    redactedFields,
  };
}

/** Validates a themes.yaml mapping. Skips invalid entries with a warning. */
export function validateThemesFile(raw: unknown): { themes: Record<string, YamlTheme>; warnings: ConfigWarning[] } {
  const warnings: ConfigWarning[] = [];
  const out: Record<string, YamlTheme> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    warnings.push({ field: "(root)", message: "Themes file root must be a mapping; using built-in themes only.", severity: "error" });
    return { themes: out, warnings };
  }
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) {
    warnings.push({ field: "version", message: `Unknown themes version "${String(r.version)}"; expected 1. Skipping file.`, severity: "error" });
    return { themes: out, warnings };
  }
  if (typeof r.themes !== "object" || r.themes === null || Array.isArray(r.themes)) {
    warnings.push({ field: "themes", message: "themes block must be a mapping; using built-in themes only.", severity: "error" });
    return { themes: out, warnings };
  }
  for (const [name, value] of Object.entries(r.themes as Record<string, unknown>)) {
    if (name.length === 0 || name.length > THEME_NAME_MAX_LENGTH) {
      warnings.push({ field: `themes.${name || "<empty>"}`, message: "Theme name must be 1..128 characters; skipped.", severity: "error" });
      continue;
    }
    const { theme, warnings: themeWarnings } = validateThemeBlock(name, value);
    warnings.push(...themeWarnings);
    if (theme) out[name] = theme;
  }
  return { themes: out, warnings };
}

/** Strips API keys from a YamlConfig. Used for renderer-bound payloads
 *  and for sanitized exports. */
export function sanitizeConfig(config: YamlConfig): SanitizedConfig {
  return {
    version: config.version,
    app: { ...config.app },
    secrets: {
      has_venice_api_key: config.secrets.venice_api_key.length > 0,
      has_jina_api_key: config.secrets.jina_api_key.length > 0,
      keep_plaintext_keys: config.secrets.keep_plaintext_keys,
    },
    theme: { ...config.theme },
    models: { ...config.models },
    chat: { ...config.chat },
    memory: { ...config.memory },
    research: { ...config.research },
    characters: { ...config.characters },
    safety: { ...config.safety },
    developer: { ...config.developer },
    internal_prompt_enhancer: { ...config.internal_prompt_enhancer },
  };
}

function makeFallback(warnings: ConfigWarning[], message: string): ConfigValidationResult {
  warnings.push({ field: "(root)", message, severity: "error" });
  return { config: emptyConfig(), warnings, redactedFields: [] };
}

/** Returns a fully-populated config of safe defaults. */
export function emptyConfig(): YamlConfig {
  return {
    version: 1,
    app: { config_name: "default", profile: "default", auto_open_devtools: false, check_for_updates: true },
    secrets: { venice_api_key: "", jina_api_key: "", keep_plaintext_keys: false },
    theme: { active: "builtin-venice", themes_file: "" },
    models: { chat: "", image: "", video: "", audio: "", music: "", embedding: "", upscale: "" },
    chat: {
      system_prompt: "",
      temperature: 0.7,
      top_p: 1,
      max_tokens: 4096,
      include_venice_system_prompt: true,
      enable_web_search: "off",
      enable_web_scraping: false,
      enable_web_citations: false,
      strip_thinking_response: false,
      disable_thinking: false,
    },
    memory: { enable_memory_retrieval: true, show_pulled_context_before_sending: false },
    research: { default_provider: "venice", default_search_provider: "brave", default_reader_provider: "jina", enable_jina: false, enable_social_discovery: false, enable_live_browser: false, live_browser_search_provider: "google", live_browser_persist_session: true, live_browser_javascript_enabled: true, max_browser_extract_chars: 40_000 },
    characters: { enabled: true, include_adult_characters: false, default_character_slug: "" },
    safety: { local_family_safe_mode_enabled: true, venice_api_safe_mode: true },
    developer: { verbose_config_logging: false, allow_config_key_import: true, force_import_keys: false, force_apply_config: false },
    internal_prompt_enhancer: {
      enabled: true,
      model: DEFAULT_PROMPT_ENHANCER_MODEL,
      temperature: 0.4,
      maxTokens: 350,
      systemPrompt: DEFAULT_ENHANCE_SYSTEM_PROMPT,
      remixSystemPrompt: DEFAULT_REMIX_SYSTEM_PROMPT,
    },
  };
}
