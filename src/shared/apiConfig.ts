// Code Owner: fayeblade (@spearchucker667)
// Central Venice API configuration shared between renderer and main process.
// In Node contexts (Electron main, server) env vars override defaults.
// In the sandboxed renderer, defaults are always used.

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

export const VENICE_API_HOST = env("VENICE_API_HOST", "api.venice.ai");
export const VENICE_API_BASE_PATH = env("VENICE_API_BASE_PATH", "/api/v1");
export const VENICE_API_TIMEOUT_MS = parsePositiveIntEnv(
  env("VENICE_API_TIMEOUT_MS", env("VENICE_TIMEOUT_MS", "60000")),
  60000,
  1000,
  300000
);
export const PROXY_BASE_PATH = "/api/venice";
