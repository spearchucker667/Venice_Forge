/** @fileoverview Shared origin guard + CORS response-header helper for the
 *  Venice Forge custom protocols (`venice-character-cache://`, `venice-tts://`,
 *  `venice-media://`).
 *
 *  Chromium rejects cross-origin `<img>` / `<video>` / `<audio>` / `fetch`
 *  requests to a custom scheme unless the scheme is registered as
 *  `corsEnabled: true` AND the resource response carries the
 *  `Access-Control-Allow-Origin`, `Vary: Origin`, and
 *  `Access-Control-Expose-Headers` headers that identify the permitted origin.
 *  This module is the single source of truth for both pieces.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** Vite dev-server origin (Electron loadURL target in development). */
export const DEV_RENDERER_ORIGIN = "http://localhost:5173";

/** Exposed media/byte-range headers the renderer must be able to read. */
export const EXPOSED_MEDIA_HEADERS = [
  "Accept-Ranges",
  "Content-Length",
  "Content-Range",
  "Content-Type",
].join(", ");

export interface CustomProtocolAccessInput {
  /** True when running under `npm run dev:electron` (renderer served from Vite). */
  isDev: boolean;
  /** `Origin` header from the protocol request. May be null when Chromium did not populate it. */
  origin: string | null | undefined;
  /** `Referer` (Chromium "referrer") of the protocol request — null when omitted. */
  referrer: string | null | undefined;
  /** Absolute path to the packaged renderer root (used to constrain `file:` referrers). */
  rendererRoot: string;
}

export interface CustomProtocolAccessDecision {
  /** True when the request is allowed to read the resource. */
  allowed: boolean;
  /** `Access-Control-Allow-Origin` value to emit on allowed responses, or `null`.
   *  Never `*` — the renderer has its own opaque origin in packaged builds. */
  allowOrigin: string | null;
  /** `Vary` value — always `Origin` so caches do not alias responses across origins. */
  vary: "Origin";
}

function pathIsInsideOrEqual(childPath: string, parentPath: string): boolean {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const isWin = process.platform === "win32";
  const normalizedParent = isWin ? parent.toLowerCase() : parent;
  const normalizedChild = isWin ? child.toLowerCase() : child;
  if (normalizedChild === normalizedParent) return true;
  const relative = path.relative(normalizedParent, normalizedChild);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isAllowedRendererReferrer(
  referrer: string | null | undefined,
  isDev: boolean,
  rendererRoot: string,
): boolean {
  if (!referrer) return false;

  try {
    const parsed = new URL(referrer);
    if (isDev) {
      return parsed.origin === DEV_RENDERER_ORIGIN;
    }
    if (parsed.protocol !== "file:") return false;
    return pathIsInsideOrEqual(fileURLToPath(parsed), rendererRoot);
  } catch {
    return false;
  }
}

/** Returns the CORS access decision for a custom-protocol request.
 *
 *  Behaviour mirrors the original `isAllowedCharacterImageCacheProtocolAccess`:
 *  image/audio/video loads may omit both Origin and Referer (Chromium does not
 *  always populate them for `<img>` / `<video>` elements). Those requests
 *  remain allowed so the packaged renderer does not lose cached avatars,
 *  generated audio, or video playback. Requests with explicit browser
 *  provenance are constrained to the Venice Forge renderer.
 */
export function evaluateCustomProtocolAccess(
  input: CustomProtocolAccessInput,
): CustomProtocolAccessDecision {
  const origin = input.origin?.trim() ?? "";
  const referrer = input.referrer?.trim() ?? "";

  // Image / media loads may omit both. Without an explicit foreign origin, treat
  // the request as renderer-initiated so we still serve the cached resource.
  if (!origin) {
    if (referrer.length === 0 || isAllowedRendererReferrer(referrer, input.isDev, input.rendererRoot)) {
      const allowOrigin = input.isDev ? DEV_RENDERER_ORIGIN : "null";
      return { allowed: true, allowOrigin, vary: "Origin" };
    }
    return { allowed: false, allowOrigin: null, vary: "Origin" };
  }

  if (input.isDev && origin === DEV_RENDERER_ORIGIN) {
    if (referrer.length === 0 || isAllowedRendererReferrer(referrer, input.isDev, input.rendererRoot)) {
      return { allowed: true, allowOrigin: DEV_RENDERER_ORIGIN, vary: "Origin" };
    }
    return { allowed: false, allowOrigin: null, vary: "Origin" };
  }

  if (origin === "null") {
    if (isAllowedRendererReferrer(referrer, input.isDev, input.rendererRoot)) {
      return { allowed: true, allowOrigin: "null", vary: "Origin" };
    }
    return { allowed: false, allowOrigin: null, vary: "Origin" };
  }

  return { allowed: false, allowOrigin: null, vary: "Origin" };
}

/** Builds the conservative CORS response header set for a sanctioned response.
 *  Always emits `Access-Control-Allow-Origin`, `Vary: Origin`, and
 *  `Access-Control-Expose-Headers` so the renderer can read byte-range
 *  metadata. Never emits `Access-Control-Allow-Origin: *`.
 */
export function buildCorsHeaders(decision: CustomProtocolAccessDecision): Record<string, string> {
  if (!decision.allowed || decision.allowOrigin === null) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": decision.allowOrigin,
    Vary: decision.vary,
    "Access-Control-Expose-Headers": EXPOSED_MEDIA_HEADERS,
  };
}
