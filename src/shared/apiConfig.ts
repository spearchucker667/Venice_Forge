// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Central Venice API configuration shared between renderer and main process.
 *
 * In Node contexts (Electron main, server) env vars override defaults.
 * In the sandboxed renderer, defaults are always used.
 */

/**
 * Reads an environment variable or returns a fallback value.
 *
 * @param key The environment variable name.
 * @param fallback The default value when the variable is unset.
 * @returns The environment variable value, or the fallback.
 */
function env(key: string, fallback: string): string {
  try {
    if (typeof process !== "undefined" && process.env?.[key]) {
      return process.env[key]!;
    }
  } catch {
    // Renderer sandbox — process is unavailable.
  }
  return fallback;
}

/**
 * Parses a string as a positive integer, clamping it to a range.
 *
 * @param rawValue The raw string value from an environment variable.
 * @param fallback The default to use when parsing fails.
 * @param min The minimum allowed value.
 * @param max The maximum allowed value.
 * @returns The parsed, clamped integer.
 */
export function parsePositiveIntEnv(
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!rawValue) return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Hostname for the Venice API. */
export const VENICE_API_HOST = env("VENICE_API_HOST", "api.venice.ai");

/** Base path for Venice API requests. */
export const VENICE_API_BASE_PATH = env("VENICE_API_BASE_PATH", "/api/v1");

/** Request timeout in milliseconds for Venice API calls. */
export const VENICE_API_TIMEOUT_MS = parsePositiveIntEnv(
  env("VENICE_API_TIMEOUT_MS", env("VENICE_TIMEOUT_MS", "60000")),
  60000,
  1000,
  300000
);

/** Base path for the local development proxy. */
export const PROXY_BASE_PATH = "/api/venice";
