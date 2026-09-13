/** Resolves stored custom-protocol media URLs (`venice-media://`,
 *  `venice-character-cache://`, `venice-tts://`) into short-lived capability
 *  URLs before they are handed to `<img>` / `<video>` elements.
 *
 *  The main-process protocol handlers reject tokenless requests with 403, so
 *  rendering a durable `venice-media://<hash>` URL directly breaks images.
 *  URLs that do not need resolution pass through synchronously; custom-protocol
 *  URLs return `null` until the capability URL has been issued so the element
 *  never fires a tokenless (403) request.
 *
 *  Capability tokens are short-lived (see
 *  `electron/utils/customProtocolAccess.ts#DEFAULT_CAPABILITY_TOKEN_TTL_MS`).
 *  When a long-lived media element outlives its token and the browser fires
 *  `onError`, the consumer should call the `retry()` returned from this hook
 *  to issue a fresh token. `retry()` is a one-shot: it triggers exactly one
 *  fresh resolution, and any further call is a no-op until `src` changes.
 *
 *  When `src` changes mid-flight, the hook retains the previously-resolved
 *  URL until the new resolution completes — that avoids flashing through
 *  `null` and re-triggering 403s on rapidly-updating lists.
 */
import { useEffect, useState, useCallback } from "react";
import { resolvePlayableMediaUrl } from "../services/playableMediaUrl";

const CUSTOM_PROTOCOL_RE = /^venice-(?:media|character-cache|tts):\/\//;

export interface ResolvedMediaUrl {
  /** The capability URL once issued, the original URL when no resolution is
   *  needed, or `null` until either becomes available. */
  url: string | null;
  /** Issue a fresh capability token for the current `src`. Returns `true`
   *  when a new resolution was scheduled (consumers should NOT also fire
   *  their own `onError` handler), or `false` if no resolution is needed /
   *  possible. One-shot per `src`: subsequent calls before `src` changes are
   *  no-ops to prevent an unbounded retry loop. */
  retry: () => boolean;
}

export function useResolvedMediaUrl(
  src: string | null | undefined,
): ResolvedMediaUrl {
  const needsResolution =
    !!src && CUSTOM_PROTOCOL_RE.test(src) && !src.includes("cap=");
  const [resolved, setResolved] = useState<string | null>(null);
  // When the user-driven retry fires, we bump a counter so the existing
  // resolution effect re-runs even if `src` is unchanged.
  const [retryToken, setRetryToken] = useState(0);
  // Track whether we've already issued a one-shot retry for the current src,
  // so a retry loop on a permanently-failing element can't loop forever.
  const [retryConsumed, setRetryConsumed] = useState(false);

  // Re-arm the one-shot retry budget whenever `src` changes. This effect is
  // intentionally separate from the resolution effect below — putting
  // `setRetryConsumed(false)` next to the resolution triggers would reset
  // the budget on every `retryToken` bump, defeating the one-shot guard.
  useEffect(() => {
    setRetryConsumed(false);
  }, [src]);

  useEffect(() => {
    let cancelled = false;
    if (!src || !needsResolution) {
      setResolved(src || null);
      return;
    }
    void resolvePlayableMediaUrl(src).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src, needsResolution, retryToken]);

  const retry = useCallback((): boolean => {
    if (!needsResolution) return false;
    if (retryConsumed) return false;
    setRetryConsumed(true);
    setRetryToken((n) => n + 1);
    return true;
  }, [needsResolution, retryConsumed]);

  if (!needsResolution) {
    return { url: src || null, retry };
  }
  return { url: resolved, retry };
}
