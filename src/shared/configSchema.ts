// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Central validation and typing for environment configuration.
 */
import { VENICE_MAX_BODY_BYTES } from "./limits";
import { isValidColorValue } from "../theme/validateColor";

/**
 * Provider identifiers. The env / yaml layers may carry a `default_provider`
 * field that selects which transport handles chat / research / image
 * requests. The set is intentionally small and additive: every legacy
 * Venice-only path still works when `default_provider === "venice"`.
 *
 * BUG-006: provider abstraction scaffolding for a future MiniMax LLM
 * migration. Adding `minimax` to the union does NOT change runtime
 * behaviour — all call sites continue to dispatch to Venice until the
 * new path is explicitly wired up. See `PROVIDER_CAPABILITIES` for the
 * endpoint matrix.
 */
export type ProviderId = "venice" | "jina" | "minimax";

export interface EnvConfig {
  VENICE_API_KEY?: string;
  JINA_API_KEY?: string;
  /**
   * MiniMax API key (provider abstraction scaffolding). Only consulted
   * when `DEFAULT_PROVIDER === "minimax"`. The Venice code paths never
   * read this field. Empty string means "not configured".
   */
  MINIMAX_API_KEY?: string;
  VENICE_API_HOST: string;
  VENICE_API_BASE_PATH: string;
  VENICE_API_TIMEOUT_MS: number;
  /**
   * Optional MiniMax host. The default MiniMax endpoint is the public
   * MiniMax API; an enterprise deployment can override it here. The
   * proxy never reads this field when `DEFAULT_PROVIDER === "venice"`.
   */
  MINIMAX_API_HOST: string;
  MINIMAX_API_BASE_PATH: string;
  /**
   * Selects which provider the web proxy and renderer fall back to
   * when no per-request override is set. Defaults to "venice" so the
   * existing behaviour is preserved. Migration to "minimax" requires
   * additional wiring in the IPC + renderer + provider capability
   * matrix.
   */
  DEFAULT_PROVIDER: ProviderId;
  PORT: number;
  HOST: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  MAX_PROXY_BODY_BYTES: number;
  NODE_ENV: string;
  TRUST_PROXY?: string | number;
}

export function parsePositiveInt(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  if (!rawValue) return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function env(key: string, fallback: string): string {
  try {
    if (typeof process !== "undefined" && process.env?.[key]) {
      return process.env[key]!;
    }
  } catch {
    // Sandbox
  }
  return fallback;
}

function parseProviderId(value: string): ProviderId {
  // Default to "venice" for any unknown / empty value so the existing
  // config keeps working. MiniMax is opt-in by setting
  // `DEFAULT_PROVIDER=minimax` and `MINIMAX_API_KEY=...`.
  if (value === "jina" || value === "minimax" || value === "venice") return value;
  return "venice";
}

export const AppConfig: EnvConfig = {
  get VENICE_API_KEY() { return env("VENICE_API_KEY", ""); },
  get JINA_API_KEY() { return env("JINA_API_KEY", ""); },
  get MINIMAX_API_KEY() { return env("MINIMAX_API_KEY", ""); },
  get VENICE_API_HOST() { return env("VENICE_API_HOST", "api.venice.ai"); },
  get VENICE_API_BASE_PATH() { return env("VENICE_API_BASE_PATH", "/api/v1"); },
  get VENICE_API_TIMEOUT_MS() { return parsePositiveInt(env("VENICE_API_TIMEOUT_MS", env("VENICE_TIMEOUT_MS", "60000")), 60000, 1000, 300000); },
  get MINIMAX_API_HOST() { return env("MINIMAX_API_HOST", "api.minimax.io"); },
  get MINIMAX_API_BASE_PATH() { return env("MINIMAX_API_BASE_PATH", "/v1"); },
  get DEFAULT_PROVIDER() { return parseProviderId(env("DEFAULT_PROVIDER", "venice")); },
  get PORT() { return parsePositiveInt(env("PORT", "3000"), 3000, 1, 65535); },
  get HOST() { return env("HOST", "127.0.0.1"); },
  get RATE_LIMIT_WINDOW_MS() { return parsePositiveInt(env("RATE_LIMIT_WINDOW_MS", "60000"), 60000, 1000, 3600000); },
  get RATE_LIMIT_MAX_REQUESTS() { return parsePositiveInt(env("RATE_LIMIT_MAX_REQUESTS", "60"), 60, 1, 10000); },
  get MAX_PROXY_BODY_BYTES() {
    const fallback = VENICE_MAX_BODY_BYTES;
    return parsePositiveInt(env("MAX_PROXY_BODY_BYTES", String(fallback)), fallback, 1024, fallback);
  },
  get NODE_ENV() { return env("NODE_ENV", "development"); },
  get TRUST_PROXY() {
    const trustProxyRaw = env("TRUST_PROXY", "");
    if (!trustProxyRaw) return undefined;
    const numeric = Number(trustProxyRaw);
    return Number.isFinite(numeric) ? numeric : trustProxyRaw;
  }
};

/**
 * Validates and sanitizes a raw settings object from storage.
 * Drops unrecognized keys and enforces basic type safety.
 */
export function validateAppSettings(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }

  const record = raw as Record<string, unknown>;
  const valid: Record<string, unknown> = {};

  if (typeof record.defaultSystemPrompt === "string") {
    valid.defaultSystemPrompt = record.defaultSystemPrompt;
  }
  if (typeof record.includeVeniceSystemPrompt === "boolean") {
    valid.includeVeniceSystemPrompt = record.includeVeniceSystemPrompt;
  }
  if (typeof record.webSearch === "string" || typeof record.webSearch === "boolean") {
    valid.webSearch = record.webSearch; // Let the reducer's normalizeWebSearchSetting handle the exact coercion
  }
  if (typeof record.webScraping === "boolean") {
    valid.webScraping = record.webScraping;
  }
  if (typeof record.webCitations === "boolean") {
    valid.webCitations = record.webCitations;
  }
  if (typeof record.theme === "string") {
    valid.theme = record.theme;
  }
  if (Array.isArray(record.customModels)) {
    valid.customModels = record.customModels.filter(m => typeof m === "string");
  }
  if (typeof record.selectedThemeId === "string") {
    valid.selectedThemeId = record.selectedThemeId;
  }
  if (record.appearanceMode === "light" || record.appearanceMode === "dark") {
    valid.appearanceMode = record.appearanceMode;
  }
  if (typeof record.customTheme === "object" && record.customTheme !== null) {
    const t = record.customTheme as Record<string, unknown>;
    const isThemeValid =
      typeof t.id === "string" &&
      typeof t.name === "string" &&
      (t.mode === "dark" || t.mode === "light") &&
      typeof t.tokens === "object" &&
      t.tokens !== null &&
      Object.values(t.tokens as Record<string, unknown>).every(
        (v) => typeof v === "string" && isValidColorValue(v)
      );
    if (isThemeValid) {
      valid.customTheme = record.customTheme;
    }
  }

  return valid;
}
