// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Central validation and typing for environment configuration.
 */
import { VENICE_MAX_BODY_BYTES } from "./limits";
import { isValidColorValue } from "../theme/validateColor";

export interface EnvConfig {
  VENICE_API_KEY?: string;
  JINA_API_KEY?: string;
  VENICE_API_HOST: string;
  VENICE_API_BASE_PATH: string;
  VENICE_API_TIMEOUT_MS: number;
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

export const AppConfig: EnvConfig = {
  get VENICE_API_KEY() { return env("VENICE_API_KEY", ""); },
  get JINA_API_KEY() { return env("JINA_API_KEY", ""); },
  get VENICE_API_HOST() { return env("VENICE_API_HOST", "api.venice.ai"); },
  get VENICE_API_BASE_PATH() { return env("VENICE_API_BASE_PATH", "/api/v1"); },
  get VENICE_API_TIMEOUT_MS() { return parsePositiveInt(env("VENICE_API_TIMEOUT_MS", env("VENICE_TIMEOUT_MS", "60000")), 60000, 1000, 300000); },
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
