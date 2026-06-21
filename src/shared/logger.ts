// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Conditional logger that no-ops in production builds and
 * redacts secrets, tokens, and local paths before writing to the console in
 * development/test builds.
 *
 * Use this instead of raw console.* calls to avoid leaking development
 * diagnostics or machine-specific paths into end-user production builds.
 */
import { sanitizeErrorText, SECRET_KEY_PATTERN } from "./redaction";

const noop = () => {};

/** Detect production via Vite's injected env (fallback to process.env for Node/Electron main). */
const isProduction =
  (typeof import.meta !== "undefined" && (import.meta as unknown as Record<string, Record<string, string>>).env?.MODE === "production") ||
  (typeof process !== "undefined" && process.env?.NODE_ENV === "production");

function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/**
 * Recursively sanitizes a single log argument, redacting secrets, tokens,
 * and local paths. Returns a deep copy for objects and preserves circular
 * references with a placeholder.
 */
function sanitizeArg(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return sanitizeErrorText(value);
  if (isPrimitive(value)) return value;
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "bigint") return `${value.toString()}n`;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeErrorText(value.message),
      stack: value.stack ? sanitizeErrorText(value.stack) : undefined,
    };
  }

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeArg(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitizeArg(entry, seen);
    }
  }
  return sanitized;
}

/** Warn sink — active in development/test, silent in production. */
export const warn = isProduction
  ? noop
  : (...args: unknown[]) => console.warn(...args.map((arg) => sanitizeArg(arg)));

/** Error sink — active in development/test, silent in production. */
export const error = isProduction
  ? noop
  : (...args: unknown[]) => console.error(...args.map((arg) => sanitizeArg(arg)));
