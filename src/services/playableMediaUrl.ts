/** Resolves stored custom-protocol media URLs into short-lived capability URLs. */
import { desktopMedia, isElectron } from "./desktopBridge";

// The id may be followed by an optional path slash: URL serialization of
// `venice-media://<hash>` normalizes the empty path to `/`, and persisted
// records may already carry that form.
const MEDIA_RE = /^venice-media:\/\/([a-f0-9]{64})\/?(?:\?|$)/i;
const CACHE_RE = /^venice-character-cache:\/\/([a-f0-9]{64})\/?(?:\?|$)/i;
const TTS_RE = /^venice-tts:\/\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-f0-9]{64})\.mp3(?:\?|$)/i;
const CUSTOM_MEDIA_PROTOCOL_RE = /^venice-(?:media|character-cache|tts):\/\//i;

export async function resolvePlayableMediaUrl(url: string): Promise<string> {
  if (!url || typeof url !== "string") return url;
  if (url.includes("cap=")) return url;
  if (!CUSTOM_MEDIA_PROTOCOL_RE.test(url)) return url;

  if (!isElectron()) return "";

  try {
    // Canonical base for the issued capability URL — strip any serialized
    // trailing slash so the token is attached to `scheme://<id>`, not
    // `scheme://<id>/`.
    const base = url.split("?")[0].replace(/\/+$/, "");
    let resolved: string | undefined;

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

