/** @fileoverview Redacts secrets, API keys, and bearer tokens from strings and objects. */

/** Pattern matching secret-related key names. */
export const SECRET_KEY_PATTERN = /(authorization|api[-_ ]?key|token|secret|password)/i;

/** Pattern matching Bearer token strings. */
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

/** Pattern matching secret assignment expressions like apiKey="value". */
const ASSIGNMENT_PATTERN =
  /\b(api[-_ ]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s}]+["']?/gi;

/** Pattern matching Venice API keys (vn-...). */
const VENICE_KEY_PATTERN = /\bvn-[A-Za-z0-9._~+/=-]{8,}\b/gi;

/** Pattern matching Venice underscore-prefixed tokens (venice_...). */
const VENICE_UNDERSCORE_PATTERN = /\bvenice_[A-Za-z0-9._~+/=-]{8,}\b/gi;

/** Pattern matching common OpenAI-compatible API keys (sk-...). */
const SK_KEY_PATTERN = /\bsk-[A-Za-z0-9._~+/=-]{8,}\b/gi;

/** Pattern matching named environment-variable secret assignments. */
const ENV_ASSIGNMENT_PATTERN =
  /\b([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))\s*=\s*["']?[^"'\s,;}]+["']?/g;

/** Pattern matching local source URLs and absolute file paths that can leak machine/user info. */
const LOCAL_PATH_PATTERN =
  /(?:https?:\/\/|file:\/\/)[^\s"')]+|(?:\/[A-Za-z0-9._ -]+){2,}(?:\.[A-Za-z0-9]+(?::\d+:\d+)?)?|[A-Za-z]:[\\/][^\s"')]+/gi;

/**
 * Redacts sensitive patterns from a single string.
 * @param value The raw string to sanitize.
 * @returns The redacted string.
 */
function redactString(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(ASSIGNMENT_PATTERN, "$1=[REDACTED]")
    .replace(VENICE_KEY_PATTERN, "[REDACTED]")
    .replace(VENICE_UNDERSCORE_PATTERN, "[REDACTED]")
    .replace(SK_KEY_PATTERN, "[REDACTED]")
    .replace(ENV_ASSIGNMENT_PATTERN, "$1=[REDACTED]");
}

/**
 * Redacts local paths and source URLs from a string.
 * @param value The raw string to sanitize.
 * @returns The redacted string.
 */
function redactPaths(value: string): string {
  return value.replace(LOCAL_PATH_PATTERN, "[REDACTED-PATH]");
}

/**
 * Recursively redacts secrets from a value of any type.
 * @template T The type of the input value.
 * @param value The value to redact.
 * @returns A deep copy with secrets replaced by placeholders.
 */
export function redactSecrets<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === "string") return redactString(value) as T;
  if (!value || typeof value !== "object") return value;

  if (seen.has(value)) return "[Circular]" as T;
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, seen)) as T;

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redactSecrets(entry, seen);
    }
  }
  return redacted as T;
}

/**
 * Redacts secrets from an error or unknown value, returning a safe message string.
 * @param value The error or value to process.
 * @returns A redacted string representation.
 */
export function redactErrorMessage(value: unknown): string {
  if (value instanceof Error) return sanitizeErrorText(value.message);
  return sanitizeErrorText(String(value || "Unknown error"));
}

/**
 * Sanitizes a string for logging or display by redacting secrets and local paths.
 * @param value The raw string to sanitize.
 * @returns The sanitized string.
 */
export function sanitizeErrorText(value: string): string {
  return redactPaths(redactString(value));
}

/**
 * Redacts secrets and local paths from an Error, returning a safe details object.
 * @param error The error to sanitize.
 * @returns A safe object with redacted message and optional stack.
 */
export function redactErrorDetails(error: Error): { message: string; stack?: string } {
  const message = sanitizeErrorText(error.message);
  const stack = error.stack ? sanitizeErrorText(error.stack) : undefined;
  return { message, stack };
}
