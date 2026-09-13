/** Resolves stored custom-protocol media URLs into short-lived capability URLs. */
import { desktopMedia, isElectron } from "./desktopBridge";

const MEDIA_RE = /^venice-media:\/\/([a-f0-9]{64})(?:\?|$)/i;
const CACHE_RE = /^venice-character-cache:\/\/([a-f0-9]{64})(?:\?|$)/i;
const TTS_RE = /^venice-tts:\/\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-f0-9]{64})\.mp3(?:\?|$)/i;

export async function resolvePlayableMediaUrl(url: string): Promise<string> {
  try {
    if (!isElectron() || !url || url.includes("cap=")) return url;
    if (MEDIA_RE.test(url)) {
      const objectId = MEDIA_RE.exec(url)?.[1];
      if (!objectId) return url;
      return await desktopMedia.resolveUrl({ scheme: "venice-media", objectId, resourceUrl: url.split("?")[0] });
    }
    if (CACHE_RE.test(url)) {
      const objectId = CACHE_RE.exec(url)?.[1];
      if (!objectId) return url;
      return await desktopMedia.resolveUrl({
        scheme: "venice-character-cache",
        objectId,
        resourceUrl: url.split("?")[0],
      });
    }
    const tts = TTS_RE.exec(url);
    if (tts) {
      return await desktopMedia.resolveUrl({
        scheme: "venice-tts",
        objectId: tts[2],
        resourceUrl: url.split("?")[0],
      });
    }
    return url;
  } catch {
    return url;
  }
}
