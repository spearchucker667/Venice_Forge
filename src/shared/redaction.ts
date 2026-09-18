/** @fileoverview Redacts secrets, API keys, and bearer tokens from strings and objects. */

/** Pattern matching secret-related key names. */
export const SECRET_KEY_PATTERN =
  /(authorization|api[-_ ]?key|token|secret|password|credential|private[_-]?key|passphrase|^session$)/i;

/** Pattern matching Bearer token strings. */
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

/** Pattern matching secret assignment expressions like apiKey="value". */
const ASSIGNMENT_PATTERN =
  /\b(api[-_ ]?key|token|secret|password|credential|private[_-]?key|passphrase)\s*[:=]\s*["']?[^"',\s}]+["']?/gi;

/**
 * Matches `session=` assignments only. The English word "session" in ordinary
 * prose is not a secret; object keys named session are covered by SECRET_KEY_PATTERN.
 */
const SESSION_ASSIGNMENT_PATTERN =
  /\b(session)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi;

/** Pattern matching Venice API keys (vn-...). */
const VENICE_KEY_PATTERN = /\bvn-[A-Za-z0-9._~+/=-]{8,}\b/gi;

/** Pattern matching Venice underscore-prefixed tokens (venice_...). */
const VENICE_UNDERSCORE_PATTERN = /\bvenice_[A-Za-z0-9._~+/=-]{8,}\b/gi;

/** Pattern matching common OpenAI-compatible API keys (sk-...). */
const SK_KEY_PATTERN = /\bsk-[A-Za-z0-9._~+/=-]{8,}\b/gi;

/** Pattern matching Hugging Face access tokens (hf_ + 20+ alphanumerics). */
const HF_TOKEN_PATTERN = /\bhf_[A-Za-z0-9]{20,}\b/g;

/** Pattern matching GitHub personal access tokens (ghp_ + 20+ alphanumerics). */
const GITHUB_PAT_PATTERN = /\bghp_[A-Za-z0-9]{20,}\b/g;

/** Pattern matching AWS access key IDs (AKIA + 16 A-Z/0-9). */
const AWS_ACCESS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/g;

/** Pattern matching Slack API tokens (xoxb-/xoxp-/xoxa-/xoxr-/xoxs-). */
const SLACK_TOKEN_PATTERN = /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g;

/** Pattern matching named environment-variable secret assignments, including quoted values. */
const ENV_ASSIGNMENT_PATTERN =
  /\b([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))\s*=\s*(?:"[^"]*"|'[^']*'|[^"'\s,;}]+)/g;

/** Absolute Unix paths that identify a machine/user. Relative API paths and
 *  ISO dates (`2026/09/12`) must not match (VF-AUD-20260912-GSS-P3-007). */
const UNIX_ABS_PATH_PATTERN =
  /(?:\/(?:Users|home|tmp|var|etc|opt|usr|private|Volumes|root|mnt)\/[^\s"')]+)/g;

/** Drive-letter paths. Negative lookahead avoids matching URL schemes (`https://`). */
const WINDOWS_ABS_PATH_PATTERN = /[A-Za-z]:(?:\\[^\s"')]+|\/(?!\/)[^\s"')]+)/g;

const FILE_URL_PATTERN = /file:\/\/[^\s"')]+/gi;

const HTTP_URL_PATTERN = /https?:\/\/[^\s"')]+/gi;

/**
 * Redacts sensitive patterns from a single string.
 * @param value The raw string to sanitize.
 * @returns The redacted string.
 */
function redactString(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(ASSIGNMENT_PATTERN, "$1=[REDACTED]")
    .replace(SESSION_ASSIGNMENT_PATTERN, "$1=[REDACTED]")
    .replace(VENICE_KEY_PATTERN, "[REDACTED]")
    .replace(VENICE_UNDERSCORE_PATTERN, "[REDACTED]")
    .replace(SK_KEY_PATTERN, "[REDACTED]")
    .replace(HF_TOKEN_PATTERN, "[REDACTED]")
    .replace(GITHUB_PAT_PATTERN, "[REDACTED]")
    .replace(AWS_ACCESS_KEY_PATTERN, "[REDACTED]")
    .replace(SLACK_TOKEN_PATTERN, "[REDACTED]")
    .replace(ENV_ASSIGNMENT_PATTERN, "$1=[REDACTED]");
}

/**
 * Redacts local paths and source URLs from a string.
 * @param value The raw string to sanitize.
 * @returns The redacted string.
 */
function isLoopbackOrPrivateHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
      return true;
    }
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

function redactPaths(value: string): string {
  return value
    .replace(HTTP_URL_PATTERN, (url) => {
      if (isLoopbackOrPrivateHttpUrl(url)) return "[REDACTED-PATH]";
      try {
        return redactUrl(url);
      } catch {
        return "[REDACTED-PATH]";
      }
    })
    .replace(FILE_URL_PATTERN, "[REDACTED-PATH]")
    .replace(UNIX_ABS_PATH_PATTERN, "[REDACTED-PATH]")
    .replace(WINDOWS_ABS_PATH_PATTERN, "[REDACTED-PATH]");
}

/**
 * Recursively redacts secrets from a value of any type.
 *
 * Uses an ancestor-stack approach to distinguish **real cycles** from
 * shared references (DAG edges). A node that re-enters an already-ancestor
 * is collapsed to the `[Circular]` placeholder; a node referenced from two
 * distinct parents is preserved with its full value in both positions.
 *
 * @template T The type of the input value.
 * @param value The value to redact.
 * @returns A deep copy with secrets replaced by placeholders.
 */
export function redactSecrets<T>(value: T, ancestors: WeakSet<object> = new WeakSet()): T {
  if (typeof value === "string") return redactString(value) as T;
  if (!value || typeof value !== "object") return value;

  if (ancestors.has(value as object)) return "[Circular]" as T;
  ancestors.add(value as object);

  let result: T;
  if (Array.isArray(value)) {
    result = value.map((item) => redactSecrets(item, ancestors)) as T;
  } else {
    const entries: [string, unknown][] = [];
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }
      if (SECRET_KEY_PATTERN.test(key)) {
        entries.push([key, "[REDACTED]"]);
      } else {
        entries.push([key, redactSecrets(entry, ancestors)]);
      }
    }
    result = (
      Object.getPrototypeOf(value) === null
        ? Object.assign(Object.create(null), Object.fromEntries(entries))
        : Object.fromEntries(entries)
    ) as T;
  }

  ancestors.delete(value as object);
  return result;
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

/**
 * Additional credential-shaped URL query parameter names that are not
 * matched by {@link SECRET_KEY_PATTERN}. Used by {@link redactUrl} to mask
 * values such as `?key=...`, `?apiKey=...`, and `?x-goog-api-key=...`
 * (VF-AUD-20260916-P2-004).
 *
 * Lookup is case-insensitive and intentionally narrow — this is NOT a
 * general "every field named key is secret" rule (per audit: avoid blindly
 * treating ordinary object fields named `key` as secret unless policy
 * explicitly wants that).
 */
const SENSITIVE_URL_QUERY_NAMES = new Set<string>([
  "key",
  "apikey",
  "api_key",
  "api-key",
  "x-goog-api-key",
]);

/**
 * Redacts query-string credentials, usernames, and fragments from a URL while
 * preserving the host and path for diagnostics.
 * @param value The raw URL string.
 * @returns A sanitized URL string.
 */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "[REDACTED]";
      url.password = "[REDACTED]";
    }
    for (const [key] of url.searchParams) {
      const lowered = key.toLowerCase();
      if (SECRET_KEY_PATTERN.test(key) || SENSITIVE_URL_QUERY_NAMES.has(lowered)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "[REDACTED-URL]";
  }
}
