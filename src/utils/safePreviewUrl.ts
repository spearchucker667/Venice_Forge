export function safeMediaPreviewUrl(value: string, allowed: readonly string[]): string {
  const trimmed = value.trim();
  if (allowed.some((prefix) => trimmed.startsWith(prefix))) return trimmed;
  return "";
}
