/** @fileoverview Maps a typed `VeniceRateLimitInfo` to an i18n key + English
 *  fallback. UI surfaces should call `resolveRateLimitMessageKey()` to obtain
 *  the key and pass it to their own translator (e.g. `useTranslation('errors')`
 *  in React, or `translateRuntime('errors:...')` for service-layer code).
 *  This module deliberately does not import i18next itself so it stays usable
 *  from Electron main-process paths that lack a renderer i18n instance.
 *
 *  Routing follows §8 of the 2026-09-16 Venice API feature-gap handoff:
 *  - `reason` is the primary driver.
 *  - When `reason` is `unspecified` but `limitType` is known (RPM / RPD /
 *    TPM / TPD / CONCURRENT), fall back to the matching key.
 *  - When neither is set, return `rateLimit429` (existing generic key) so
 *    existing UX remains intact.
 *  - `retryAfterSeconds` is propagated so the UI can compose a more specific
 *    message ("Try again in 23 seconds.") when present.
 */

import type { VeniceRateLimitInfo } from "../../types/venice";

export interface RateLimitMessageResolution {
  /** Key into the `errors` namespace (e.g. `rateLimitRpm`). */
  key: string;
  /** English fallback the caller can render when no translator is available
   *  (e.g. main-process log lines, diagnostic breadcrumbs). */
  fallback: string;
  /** Retry-after seconds when known. UI should append "in N seconds" hint
   *  when this is present. */
  retryAfterSeconds?: number;
}

const FALLBACK_BY_KEY: Record<string, string> = {
  rateLimit429: "Rate limit exceeded. Please wait before retrying.",
  rateLimitRpm: "Too many requests in a short time. Please wait before retrying.",
  rateLimitRpd: "Daily request quota reached. Please wait until tomorrow or upgrade your plan.",
  rateLimitTpm: "Token-per-minute limit reached. Please slow down or use a shorter prompt.",
  rateLimitTpd: "Daily token quota reached. Please wait until tomorrow or upgrade your plan.",
  rateLimitConcurrent: "Too many concurrent requests. Please wait for in-flight calls to finish.",
  rateLimitGeneric: "Rate limit exceeded. Please wait before retrying.",
};

const REASON_TO_KEY: Record<string, string> = {
  requests_per_minute: "rateLimitRpm",
  requests_per_day: "rateLimitRpd",
  tokens_per_minute: "rateLimitTpm",
  tokens_per_day: "rateLimitTpd",
  concurrent_requests: "rateLimitConcurrent",
};

const LIMIT_TYPE_TO_KEY: Record<string, string> = {
  RPM: "rateLimitRpm",
  RPD: "rateLimitRpd",
  TPM: "rateLimitTpm",
  TPD: "rateLimitTpd",
  CONCURRENT: "rateLimitConcurrent",
};

/** Resolve the UX message key for a typed rate-limit info block. Pure
 *  function — no translator dependency. Returns the existing
 *  `rateLimit429` key (and its fallback) when nothing more specific is
 *  available, so existing UX remains intact for opaque upstream responses. */
export function resolveRateLimitMessageKey(
  info: VeniceRateLimitInfo | undefined | null,
): RateLimitMessageResolution {
  if (!info) {
    return {
      key: "rateLimit429",
      fallback: FALLBACK_BY_KEY.rateLimit429,
    };
  }

  let key = REASON_TO_KEY[info.reason];
  if (!key && info.limitType) {
    key = LIMIT_TYPE_TO_KEY[info.limitType];
  }
  if (!key) {
    key = "rateLimitGeneric";
  }

  return {
    key,
    fallback: FALLBACK_BY_KEY[key] ?? FALLBACK_BY_KEY.rateLimit429,
    retryAfterSeconds: info.retryAfterSeconds,
  };
}
