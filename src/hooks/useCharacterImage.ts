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
export function useCharacterImage(
  character: (Pick<VeniceCharacter, "slug" | "name" | "photoUrl"> & { id?: string }) | undefined | null,
): UseCharacterImageResult {
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [retryToken, setRetryToken] = useState(0);
  const latestRequestRef = useRef(0);

  const sourceUrl = useMemo(
    () => (character ? resolveCharacterImageUrl(character) ?? undefined : undefined),
    [character],
  );

  const fallbackInitials = useMemo(
    () => avatarFallback(character?.name ?? ""),
    [character?.name],
  );

  useEffect(() => {
    if (!character) {
      setImageUrl(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }

    const char = character;
    const requestId = ++latestRequestRef.current;
    let cancelled = false;

    async function resolveAndCache(targetUrl: string, source: import("../services/characterImageDiagnostics").CharacterImageSource) {
      try {
        const result = await desktopCharacterImage.getCachedUrl(targetUrl);
        if (cancelled || requestId !== latestRequestRef.current) return;
        if (result.ok && result.url) {
          setImageUrl(result.url);
          setError(undefined);
          recordCharacterImageResolution({ slug: char.slug, source, ok: true, cached: !result.url.startsWith("http") });
        } else {
          setImageUrl(undefined);
          setError(result.error ?? "Failed to load character image.");
          recordCharacterImageResolution({
            slug: char.slug,
            source,
            ok: false,
            cached: false,
            errorCategory: "unknown",
          });
        }
      } catch (err) {
        if (cancelled || requestId !== latestRequestRef.current) return;
        setImageUrl(undefined);
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        recordCharacterImageResolution({
          slug: char.slug,
          source,
          ok: false,
          cached: false,
          errorCategory: /content-type|MIME/i.test(message) ? "content-type" : "network",
        });
      } finally {
        if (!cancelled && requestId === latestRequestRef.current) {
          setLoading(false);
        }
      }
    }

    async function load() {
      setLoading(true);
      setError(undefined);

      if (sourceUrl) {
        const source = char.photoUrl ? "api-photoUrl" : "api-field";
        await resolveAndCache(sourceUrl, source);
        return;
      }

      // Optional public-page fallback when no API/synthetic URL exists.
      const fallbackUrl = await tryResolveCharacterImageFromPublicPage(char.slug);
      if (cancelled || requestId !== latestRequestRef.current) return;

      if (fallbackUrl) {
        await resolveAndCache(fallbackUrl, "page-fallback");
      } else {
        setImageUrl(undefined);
        recordCharacterImageResolution({
          slug: char.slug,
          source: "none",
          ok: false,
          cached: false,
          errorCategory: "unknown",
        });
        if (!cancelled && requestId === latestRequestRef.current) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [character, sourceUrl, retryToken]);

  return {
    imageUrl,
    loading,
    error,
    retry: () => setRetryToken((t) => t + 1),
    fallbackInitials,
    showInitials: !imageUrl || !!error,
  };
}
