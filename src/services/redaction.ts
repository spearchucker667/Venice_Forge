const SECRET_KEY_PATTERN = /(authorization|api[-_ ]?key|token|secret|password)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const ASSIGNMENT_PATTERN =
  /\b(api[-_ ]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi;
const VENICE_KEY_PATTERN = /\bvn-[A-Za-z0-9._~+/=-]{8,}\b/gi;

function redactString(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(ASSIGNMENT_PATTERN, "$1=[REDACTED]")
    .replace(VENICE_KEY_PATTERN, "[REDACTED]");
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") return redactString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (!value || typeof value !== "object") return value;

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redactSecrets(entry);
    }
  }
  return redacted as T;
}

export function redactErrorMessage(value: unknown): string {
  if (value instanceof Error) return redactString(value.message);
  return redactString(String(value || "Unknown error"));
}
