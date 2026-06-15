export function safeMediaPreviewUrl(value: string, allowed: readonly string[]): string {
  const trimmed = value.trim();
  for (const prefix of allowed) {
    if (prefix === "blob:" && trimmed.startsWith("blob:")) return trimmed;
    if (prefix.startsWith("data:") && trimmed.startsWith(prefix)) return trimmed;
    if (prefix === "https://" || prefix === "http://") {
      try {
        if (new URL(trimmed).protocol === prefix.slice(0, -2)) return trimmed;
      } catch {
        continue;
      }
    }
    try {
      const candidate = new URL(trimmed);
      const allowedUrl = new URL(prefix);
      if (candidate.protocol === allowedUrl.protocol &&
          candidate.origin === allowedUrl.origin &&
          candidate.pathname.startsWith(allowedUrl.pathname)) {
        return trimmed;
      }
    } catch {
      // Non-URL prefixes are not accepted.
    }
  }
  return "";
}
