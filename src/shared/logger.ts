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
 * and local paths. Returns a deep copy for objects and preserves shared
 * references (a node that is referenced from two parents is emitted twice
 * with its full value) while replacing **real** ancestor cycles with a
 * `[Circular]` placeholder.
 *
 * The previous implementation used a `WeakSet` of "seen" objects which
 * incorrectly collapsed shared references into `[Circular]`. We now use an
 * ancestor-stack approach: only references that re-enter a node already on
 * the current path are cycles.
 */
function sanitizeArg(value: unknown, ancestors: WeakSet<object> = new WeakSet()): unknown {
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

  // Real cycle detection: only collapse if the node is already on the
  // current ancestor chain. Shared (DAG) references are preserved.
  if (ancestors.has(value as object)) return "[Circular]";
  ancestors.add(value as object);

  let result: unknown;
  if (Array.isArray(value)) {
    result = value.map((item) => sanitizeArg(item, ancestors));
  } else {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeArg(entry, ancestors);
      }
    }
    result = sanitized;
  }

  ancestors.delete(value as object);
  return result;
}

/** Warn sink — active in development/test, silent in production. */
export const warn = isProduction
  ? noop
  : (...args: unknown[]) => console.warn(...args.map((arg) => sanitizeArg(arg)));

/** Error sink — active in development/test, silent in production. */
export const error = isProduction
  ? noop
  : (...args: unknown[]) => console.error(...args.map((arg) => sanitizeArg(arg)));
