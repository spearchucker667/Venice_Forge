/** @fileoverview Safe diagnostics logging for character image resolution.
 *
 *  Records resolution source and load outcome without exposing upstream URLs,
 *  local paths, or API keys. This data is suitable for the diagnostics drawer
 *  and logs.
 */

import * as logger from "../shared/logger";

export type CharacterImageSource =
  | "api-photoUrl"
  | "api-field"
  | "synthetic"
  | "synthetic-photo"
  | "page-fallback"
  | "none";

export interface CharacterImageResolutionEvent {
  slug: string;
  source: CharacterImageSource;
  ok: boolean;
  cached: boolean;
  errorCategory?: "allowlist" | "network" | "size" | "content-type" | "unknown";
}

/** Logs a safe, redacted character-image resolution event.
 *  Successful resolutions produce no log output (they are normal operation).
 *  Failed resolutions emit a deduplicated warning so they remain visible
 *  without flooding logs on normal avatar loads.
 */
export function recordCharacterImageResolution(
  event: CharacterImageResolutionEvent,
): void {
  if (!event.ok) {
    // Only failed resolutions warrant a warning.
    logger.warn("Character image resolution failed", {
      slug: event.slug,
      source: event.source,
      cached: event.cached,
      errorCategory: event.errorCategory,
    });
    // Successful resolutions intentionally produce no log output.
  }
}
