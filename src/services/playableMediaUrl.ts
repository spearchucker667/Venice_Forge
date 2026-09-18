/** Resolves stored custom-protocol media URLs into capability URLs.
 *
 * IMPORTANT: capability tokens have a TTL (5 min default, see
 * DEFAULT_CAPABILITY_TOKEN_TTL_MS in electron/utils/customProtocolAccess.ts) and
 * are tied to the renderer session + profile. Any URL that has been lying around
 * in a renderer store may carry an expired or wrong-session token. The only
 * safe contract is to ALWAYS re-issue a fresh token for any custom-protocol URL
 * we are about to fetch or play. The previous "short-circuit when cap= is
 * already present" optimization caused the gallery to return 403 on
 * Save-As for any image older than the TTL, because Chromium's image cache
 * continued to render the stale bytes but the fresh fetch saw the expired
 * token (VF-REGRESSION-2026-09-18).
 */
import * as desktopBridge from "./desktopBridge";

// The id may be followed by an optional path slash: URL serialization of
// `venice-media://<hash>` normalizes the empty path to `/`, and persisted
// records may already carry that form.
const MEDIA_RE = /^venice-media:\/\/([a-f0-9]{64})\/?(?:\?|$)/i;
const CACHE_RE = /^venice-character-cache:\/\/([a-f0-9]{64})\/?(?:\?|$)/i;
const TTS_RE = /^venice-tts:\/\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-f0-9]{64})\.mp3(?:\?|$)/i;
const CUSTOM_MEDIA_PROTOCOL_RE = /^venice-(?:media|character-cache|tts):\/\//i;

export async function resolvePlayableMediaUrl(url: string): Promise<string> {
  if (!url || typeof url !== "string") return url;
  // Always re-issue for custom-protocol URLs in Electron; the previous
  // `if (url.includes("cap=")) return url;` short-circuit caused the
  // "Media source returned 403" error when the renderer tried to Save As
  // an image whose 5-minute capability token had expired.
  if (!CUSTOM_MEDIA_PROTOCOL_RE.test(url)) return url;

  const isElectron = typeof desktopBridge.isElectron === "function" ? desktopBridge.isElectron() : false;
  if (!isElectron) return "";

  try {
    // Canonical base for the issued capability URL — strip any serialized
    // trailing slash so the token is attached to `scheme://<id>`, not
    // `scheme://<id>/`.
    const base = url.split("?")[0].replace(/\/+$/, "");
    let resolved: string | undefined;

    const desktopMedia = desktopBridge.desktopMedia;
    if (!desktopMedia || typeof desktopMedia.resolveUrl !== "function") return "";

    if (MEDIA_RE.test(url)) {
      const objectId = MEDIA_RE.exec(url)?.[1];
      if (!objectId) return "";
      resolved = await desktopMedia.resolveUrl({ scheme: "venice-media", objectId, resourceUrl: base });
    } else if (CACHE_RE.test(url)) {
      const objectId = CACHE_RE.exec(url)?.[1];
      if (!objectId) return "";
      resolved = await desktopMedia.resolveUrl({
        scheme: "venice-character-cache",
        objectId,
        resourceUrl: base,
      });
    } else if (TTS_RE.test(url)) {
      const tts = TTS_RE.exec(url);
      if (!tts?.[2]) return "";
      resolved = await desktopMedia.resolveUrl({
        scheme: "venice-tts",
        objectId: tts[2],
        resourceUrl: base,
      });
    }

    if (resolved && resolved.includes("cap=")) {
      return resolved;
    }
    return "";
  } catch {
    return "";
  }
}

