/** @fileoverview Optional public-page fallback for Venice character images.
 *
 *  When the official API response omits every recognized image field and the
 *  canonical synthetic photo URL does not resolve, this module can scrape the
 *  public character page on `venice.ai` and extract an allowlisted image URL
 *  from Open Graph / Twitter Card / JSON-LD / Next.js data.
 *
 *  The fallback is gated by the `VENICE_FORGE_DISABLE_CHARACTER_PAGE_IMAGE_FALLBACK`
 *  environment flag and is ON by default. It never relaxes the 3-host SSRF
 *  allowlist; every extracted URL is validated with `isTrustedVeniceImageUrl`.
 */

import { isTrustedVeniceImageUrl, extractCharacterImageFromPage } from "../utils/characterImageResolver";
import { desktopApp } from "./desktopBridge";
import * as logger from "../shared/logger";

const DISABLED =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VENICE_FORGE_DISABLE_CHARACTER_PAGE_IMAGE_FALLBACK === "true";

/** Builds the public character page URL for a safe slug. */
function buildCharacterPageUrl(slug: string): string | null {
  // Restrict to the same safe character-id grammar used by the resolver.
  if (!slug || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(slug)) return null;
  return `https://venice.ai/characters/${encodeURIComponent(slug)}`;
}

/** Attempts to resolve a character image from its public page.
 *  @returns The extracted HTTPS URL, or undefined if disabled/unsupported.
 */
export async function tryResolveCharacterImageFromPublicPage(
  slug: string,
): Promise<string | undefined> {
  if (DISABLED) return undefined;

  const url = buildCharacterPageUrl(slug);
  if (!url) return undefined;

  try {
    const result = await desktopApp.proxyScrape(url);
    if (!result.ok || !result.data?.body || typeof result.data.body !== "string") {
      return undefined;
    }
    const extracted = extractCharacterImageFromPage(slug, result.data.body);
    if (extracted && isTrustedVeniceImageUrl(extracted)) {
      return extracted;
    }
  } catch (err) {
    logger.error("Character page image fallback failed", err);
  }

  return undefined;
}
