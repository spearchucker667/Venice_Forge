/** @fileoverview Hook that resolves a Venice character avatar through the
 *  desktop image cache (or direct allowlisted URL in web mode). */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  avatarFallback,
  resolveCharacterImageUrl,
} from "../utils/characterImageResolver";
import { desktopCharacterImage } from "../services/desktopBridge";
import { tryResolveCharacterImageFromPublicPage } from "../services/characterImageFallback";
import { recordCharacterImageResolution } from "../services/characterImageDiagnostics";
import type { VeniceCharacter } from "../types/characters";
import type { ConversationCharacterMeta } from "../types/conversationVault";

export interface UseCharacterImageResult {
  /** Local file:// URL (desktop) or trusted HTTPS URL (web), or undefined. */
  imageUrl: string | undefined;
  /** True while a cache request is in flight. */
  loading: boolean;
  /** Set when the image could not be resolved or cached. */
  error: string | undefined;
  /** Retry the cache request. */
  retry: () => void;
  /** Initials fallback derived from the character name. */
  fallbackInitials: string;
  /** True when the caller should show initials instead of an image. */
  showInitials: boolean;
}

export interface UseCharacterImageOptions {
  /** Caller-owned identity boundary, e.g. a conversation id, used to prevent
   *  late async avatar resolutions from crossing chat/profile boundaries. */
  cacheKey?: string | null;
}

/** Resolves and caches a character avatar image for display.
 *
 *  In desktop mode the URL is passed through
 *  `desktopCharacterImage.getCachedUrl`, which fetches the image in the main
 *  process and returns a local `file://` URL. In web mode the allowlisted
 *  HTTPS URL is returned directly.
 *
 *  If the API response has no image field and the synthetic photo URL does
 *  not resolve, an optional public-page fallback (gated by env flag) can
 *  scrape `venice.ai/characters/{slug}` for Open Graph / JSON-LD data.
 */
type CharacterImageInput =
  | (Pick<VeniceCharacter, "slug" | "name" | "photoUrl"> & { id?: string })
  | (Pick<ConversationCharacterMeta, "name" | "modelId" | "localCharacterId"> & { slug?: string; photoUrl?: string; id?: string });

export function useCharacterImage(
  character: CharacterImageInput | undefined | null,
  options: UseCharacterImageOptions = {},
): UseCharacterImageResult {
  const cacheKey = options.cacheKey ?? "global";
  const [imageState, setImageState] = useState<{ requestKey: string; url: string | undefined }>({
    requestKey: "initial",
    url: undefined,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [retryToken, setRetryToken] = useState(0);
  const latestRequestRef = useRef(0);

  const charSlug = character?.slug;
  const charId = character?.id;
  const charPhotoUrl = character && "photoUrl" in character ? character.photoUrl : undefined;
  const charLocalId = character && "localCharacterId" in character ? character.localCharacterId : undefined;

  const sourceUrl = useMemo(
    () => (character ? resolveCharacterImageUrl(character) ?? undefined : undefined),
    [charSlug, charId, charPhotoUrl],
  );

  const requestKey = useMemo(
    () => [
      cacheKey,
      sourceUrl ?? "no-source",
      charId ?? "no-id",
      charSlug ?? "no-slug",
      charPhotoUrl ?? "no-photo",
      charLocalId ?? "no-local-id",
    ].join("|"),
    [cacheKey, charId, charSlug, charPhotoUrl, charLocalId, sourceUrl],
  );

  const fallbackInitials = useMemo(
    () => avatarFallback(character?.name ?? ""),
    [character?.name],
  );

  useEffect(() => {
    const hasAnyIdentity = !!(charSlug || charId || charPhotoUrl || charLocalId);
    if (!hasAnyIdentity) {
      setImageState({ requestKey, url: undefined });
      setError(undefined);
      setLoading(false);
      return;
    }

    const charPhotoUrlForSource = charPhotoUrl;
    const charLocalIdForGuard = charLocalId;
    const charSlugForFallback = charSlug;
    const diagnosticSlug = charSlug || charId || "unknown";
    const requestId = ++latestRequestRef.current;
    let cancelled = false;

    async function resolveAndCache(targetUrl: string, source: import("../services/characterImageDiagnostics").CharacterImageSource): Promise<boolean> {
      try {
        const result = await desktopCharacterImage.getCachedUrl(targetUrl);
        if (cancelled || requestId !== latestRequestRef.current) return false;
        if (result.ok && result.url) {
          setImageState({ requestKey, url: result.url });
          setError(undefined);
          recordCharacterImageResolution({ slug: diagnosticSlug, source, ok: true, cached: !result.url.startsWith("http") });
          return true;
        } else {
          setImageState({ requestKey, url: undefined });
          setError(result.error ?? "Failed to load character image.");
          recordCharacterImageResolution({
            slug: diagnosticSlug,
            source,
            ok: false,
            cached: false,
            errorCategory: "unknown",
          });
          return false;
        }
      } catch (err) {
        if (cancelled || requestId !== latestRequestRef.current) return false;
        setImageState({ requestKey, url: undefined });
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        recordCharacterImageResolution({
          slug: diagnosticSlug,
          source,
          ok: false,
          cached: false,
          errorCategory: /content-type|MIME/i.test(message) ? "content-type" : "network",
        });
        return false;
      } finally {
        if (!cancelled && requestId === latestRequestRef.current) {
          setLoading(false);
        }
      }
    }

    async function load() {
      setLoading(true);
      setError(undefined);

      // Local RP characters never resolve through Venice.ai image endpoints.
      if (charLocalIdForGuard) {
        setImageState({ requestKey, url: undefined });
        setLoading(false);
        return;
      }

      let primaryFailed = false;

      if (sourceUrl) {
        const source =
          charPhotoUrlForSource ? "api-photoUrl" :
          sourceUrl.includes("/api/characters/") && sourceUrl.endsWith("/photo") ? "synthetic-photo" :
          "api-field";
        const primaryOk = await resolveAndCache(sourceUrl, source);

        if (cancelled || requestId !== latestRequestRef.current) return;

        if (!primaryOk) {
          primaryFailed = true;
        } else {
          return;
        }
      }

      const fallbackUrl = charSlugForFallback ? await tryResolveCharacterImageFromPublicPage(charSlugForFallback) : null;
      if (cancelled || requestId !== latestRequestRef.current) return;

      if (fallbackUrl) {
        await resolveAndCache(fallbackUrl, "page-fallback");
      } else if (!sourceUrl) {
        setImageState({ requestKey, url: undefined });
        recordCharacterImageResolution({
          slug: diagnosticSlug,
          source: "none",
          ok: false,
          cached: false,
          errorCategory: "unknown",
        });
        if (!cancelled && requestId === latestRequestRef.current) {
          setLoading(false);
        }
      } else if (primaryFailed && !cancelled && requestId === latestRequestRef.current) {
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [requestKey, sourceUrl, charSlug, charId, charPhotoUrl, charLocalId, retryToken]);

  const imageUrl = imageState.requestKey === requestKey ? imageState.url : undefined;

  return {
    imageUrl,
    loading,
    error,
    retry: () => setRetryToken((t) => t + 1),
    fallbackInitials,
    showInitials: !imageUrl || !!error,
  };
}
