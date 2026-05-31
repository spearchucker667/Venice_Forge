// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Conditional logger that no-ops in production builds.
 *
 * Use this instead of raw console.* calls to avoid leaking development
 * diagnostics into end-user production builds.
 */
const noop = () => {};

/** Detect production via Vite's injected env (fallback to process.env for Node/Electron main). */
const isProduction =
  (typeof import.meta !== "undefined" && (import.meta as unknown as Record<string, Record<string, string>>).env?.MODE === "production") ||
  (typeof process !== "undefined" && process.env?.NODE_ENV === "production");

/** Warn sink — active in development/test, silent in production. */
export const warn = isProduction ? noop : (...args: unknown[]) => console.warn(...args);

/** Error sink — active in development/test, silent in production. */
export const error = isProduction ? noop : (...args: unknown[]) => console.error(...args);
