/**
 * @fileoverview User-friendly error classification for the Research tab.
 *
 * Translates low-level fetch/transport/safety errors thrown by the Venice and
 * Jina APIs into copy that is safe to display in the Research tab. The
 * classifier is intentionally conservative: it never invents errors and never
 * reports "network error" for failures that have a more specific cause.
 */

export type ResearchErrorProvider = "venice" | "jina" | "auto";

export interface ResearchError {
  name?: string;
  message?: string;
}

/**
 * Classifies a thrown error from the Venice or Jina API into a user-friendly
 * message. Network failures and safety-guard blocks are called out explicitly
 * so the generic "network error" string never appears when the request never
 * left the renderer.
 *
 * The `provider` argument controls which service name is used in the copy and
 * how 401/403 messages are framed. Pass `"auto"` to derive the provider from
 * the error message itself (used when the caller's provider is unknown).
 */
export function describeResearchError(
  err: ResearchError | null | undefined,
  fallback: string,
  provider: ResearchErrorProvider = "auto",
): string {
  if (!err) return fallback;
  if (err.name === "AbortError") return "Cancelled.";

  const raw = (err.message ?? "").trim();
  if (!raw) return fallback;

  const lower = raw.toLowerCase();
  const mentionsJina = lower.includes("jina");
  const mentionsVenice = lower.includes("venice") || lower.includes("/augment/");
  const detected: "venice" | "jina" =
    provider === "venice" || provider === "jina"
      ? provider
      : mentionsJina && !mentionsVenice
        ? "jina"
        : "venice";
  const service = detected === "jina" ? "Jina" : "Venice";

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed")
  ) {
    return `Network error: unable to reach ${service} API. Check your internet connection and try again.`;
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return `${service} API request timed out. Check your connection and try again.`;
  }
  if (lower.includes("safety") || lower.includes("blocked")) {
    return raw;
  }
  if (lower.includes("401") || lower.includes("unauthorized")) {
    return `${service} API key is invalid or expired. Re-enter your key and try again.`;
  }
  if (lower.includes("403") || lower.includes("forbidden")) {
    return `${service} API denied the request. Verify your key permissions and try again.`;
  }
  if (lower.includes("429")) {
    return `${service} API rate limit reached. Wait a moment and try again.`;
  }
  if (/\b5\d{2}\b/.test(lower)) {
    return `${service} API is temporarily unavailable. Please try again in a few seconds.`;
  }
  return raw;
}
