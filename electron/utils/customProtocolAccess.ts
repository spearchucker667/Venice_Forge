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
 *
 *  ## Capability-token design for provenance-less media requests
 *
 *  Chromium media elements (`<img>`, `<video>`, `<audio>`) often omit both
 *  `Origin` and `Referer` when fetching a custom-scheme URL. The current
 *  `evaluateCustomProtocolAccess()` therefore treats originless requests as
 *  renderer-initiated, which is necessary for playback but relies on the
 *  unguessability of the object id (sha256) for access control.
 *
 *  The preferred future model (VF-CAPABILITY-PROVENANCE-2026-08-31) is a
 *  short-lived capability token carried in the URL query string:
 *
 *    `venice-media://<opaque-object-id>?cap=<unguessable-token>`
 *
 *  Lifecycle:
 *  1. Renderer asks the trusted preload/main for a renderer-scoped media URL.
 *  2. Main generates a high-entropy token, binds it to
 *     `{ objectId, profileId, sessionId, issuedAt, expiresAt }`, stores it only
 *     in main-process memory, and returns the URL above.
 *  3. Renderer uses that URL in `<img>` / `<video>` / `<audio>`.
 *  4. Main-process `protocol.handle` extracts the token, verifies it against the
 *     in-memory store, and serves the object. Verification is the primary gate;
 *     `evaluateCustomProtocolAccess()` remains as defense-in-depth.
 *  5. Tokens are revoked on profile switch, renderer reload, and app shutdown.
 *     They are never persisted, never rotated into logs, and never exposed to
 *     the renderer except inside the issued URL.
 *
 *  The scaffolding below (`createCustomProtocolCapabilityManager`,
 *  `parseCustomProtocolCapabilityUrl`) is the canonical place for that logic;
 *  it is not yet wired into `createGeneratedMediaResponse()` so the existing
 *  origin/referer defense-in-depth and current media-playback tests remain
 *  untouched.
 */

import crypto from "node:crypto";
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
 *
 *  This function remains the defense-in-depth gate. The primary gate for
 *  provenance-less media requests will be the capability-token manager below.
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

/** Default capability-token lifetime. Tokens are meant for a single renderer
 *  session/media element load cycle, so five minutes is generous. */
export const DEFAULT_CAPABILITY_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Opportunistic reaping threshold (VF-AUD-20260912-C6-P3-001). `issue()` sweeps
 *  expired entries once the store exceeds this size so memory stays proportional
 *  to live tokens instead of cumulative issuance. Chosen well above realistic
 *  concurrent live tokens (media-element loads) so the O(n) sweep amortizes to
 *  effectively nothing while capping worst-case growth. */
export const CAPABILITY_TOKEN_REAP_THRESHOLD = 512;

/** Token entropy in bytes. 32 bytes → 256 bits, base64url-encoded as 43 chars. */
export const CAPABILITY_TOKEN_BYTES = 32;

/** In-memory record describing a single issued capability token. The token
 *  value itself is stored only as the key in the manager's internal Map; this
 *  spec is what is returned by `verify()` for successful lookups. */
export interface CustomProtocolCapabilitySpec {
  /** Object id the token grants access to (e.g., a sha256 content hash). */
  objectId: string;
  /** Profile the token is bound to. */
  profileId: string;
  /** Renderer session the token is bound to. */
  sessionId: string;
  /** Timestamp (ms since Unix epoch) when the token was issued. */
  issuedAt: number;
  /** Timestamp (ms since Unix epoch) when the token expires. */
  expiresAt: number;
}

/** Metrics that can be safely logged/diagnosed — no token values. */
export interface CustomProtocolCapabilityMetrics {
  /** Number of currently valid issued tokens. */
  issuedCount: number;
  /** Number of distinct profile scopes among issued tokens. */
  profileCount: number;
  /** Number of distinct session scopes among issued tokens. */
  sessionCount: number;
  /** Age of the oldest still-valid token in ms, or null when empty. */
  oldestTokenAgeMs: number | null;
}

/** Main-process capability-token authority. All state is held in memory only;
 *  tokens are never persisted, never rotated into logs, and never leave main
 *  except inside the issued URL. */
export interface CustomProtocolCapabilityManager {
  /** Issue a token bound to the given object/profile/session and return both
   *  the raw token and the full custom-protocol URL that carries it. */
  issue(input: {
    scheme: string;
    objectId: string;
    profileId: string;
    sessionId: string;
    ttlMs?: number;
    resourceUrl?: string;
  }): { token: string; url: string };

  /** Verify a token. Returns the spec if valid and not expired; otherwise
   *  returns null and removes the token from the store. */
  verify(token: string): CustomProtocolCapabilitySpec | null;

  /** Revoke every token bound to the given session (e.g., renderer reload). */
  revokeSession(sessionId: string): void;

  /** Revoke every token bound to the given profile (e.g., profile switch). */
  revokeProfile(profileId: string): void;

  /** Revoke every issued token (e.g., app shutdown). */
  revokeAll(): void;

  /** Return safe metadata about currently issued tokens. */
  metrics(): CustomProtocolCapabilityMetrics;
}

/** Validates the object id shape expected for generated-media blobs. Keeps the
 *  capability surface narrow so tokens cannot be minted for arbitrary paths. */
function isValidObjectId(objectId: string): boolean {
  return /^[a-f0-9]{64}$/.test(objectId);
}

/** Creates an in-memory capability-token authority. */
export function createCustomProtocolCapabilityManager(options: {
  now?: () => number;
} = {}): CustomProtocolCapabilityManager {
  // SECURITY: token value is the Map key; the spec is the value. The token
  // value must never be logged, persisted, or sent anywhere except inside the
  // issued URL returned to the renderer.
  const tokens = new Map<string, CustomProtocolCapabilitySpec>();
  const now = options.now ?? Date.now;

  function issue(input: {
    scheme: string;
    objectId: string;
    profileId: string;
    sessionId: string;
    ttlMs?: number;
    resourceUrl?: string;
  }): { token: string; url: string } {
    if (!isValidObjectId(input.objectId)) {
      throw new Error("Invalid capability object id.");
    }
    if (!input.profileId || typeof input.profileId !== "string") {
      throw new Error("Invalid capability profile id.");
    }
    if (!input.sessionId || typeof input.sessionId !== "string") {
      throw new Error("Invalid capability session id.");
    }
    if (!input.scheme || /[:/?#\s]/.test(input.scheme)) {
      throw new Error("Invalid capability scheme.");
    }

    const ttlMs = input.ttlMs ?? DEFAULT_CAPABILITY_TOKEN_TTL_MS;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 24 * 60 * 60 * 1000) {
      throw new Error("Capability TTL must be between 1 ms and 24 hours.");
    }

    const issuedAt = now();
    const token = crypto.randomBytes(CAPABILITY_TOKEN_BYTES).toString("base64url");
    const spec: CustomProtocolCapabilitySpec = {
      objectId: input.objectId,
      profileId: input.profileId,
      sessionId: input.sessionId,
      issuedAt,
      expiresAt: issuedAt + ttlMs,
    };

    tokens.set(token, spec);
    reapExpiredTokens();
    const base = input.resourceUrl ?? `${input.scheme}://${input.objectId}`;
    const separator = base.includes("?") ? "&" : "?";
    const url = `${base}${separator}cap=${encodeURIComponent(token)}`;
    return { token, url };
  }

  /** Deletes every expired entry once the store crosses the reap threshold.
   *  Expiry was previously enforced only lazily inside `verify()`, so tokens
   *  that were never presented again (navigation away, superseded media URLs)
   *  accumulated for the app lifetime (VF-AUD-20260912-C6-P3-001). Expired
   *  tokens already fail verification, so removing them here is pure hygiene. */
  function reapExpiredTokens(): void {
    if (tokens.size <= CAPABILITY_TOKEN_REAP_THRESHOLD) return;
    const observedAt = now();
    for (const [token, spec] of tokens) {
      if (observedAt >= spec.expiresAt) tokens.delete(token);
    }
  }

  function verify(token: string): CustomProtocolCapabilitySpec | null {
    const spec = tokens.get(token);
    if (!spec) return null;
    if (now() >= spec.expiresAt) {
      tokens.delete(token);
      return null;
    }
    return spec;
  }

  function revokeSession(sessionId: string): void {
    for (const [token, spec] of tokens) {
      if (spec.sessionId === sessionId) tokens.delete(token);
    }
  }

  function revokeProfile(profileId: string): void {
    for (const [token, spec] of tokens) {
      if (spec.profileId === profileId) tokens.delete(token);
    }
  }

  function revokeAll(): void {
    tokens.clear();
  }

  function metrics(): CustomProtocolCapabilityMetrics {
    let oldestTokenAgeMs: number | null = null;
    const profiles = new Set<string>();
    const sessions = new Set<string>();
    const observedAt = now();
    for (const spec of tokens.values()) {
      profiles.add(spec.profileId);
      sessions.add(spec.sessionId);
      const age = observedAt - spec.issuedAt;
      if (oldestTokenAgeMs === null || age > oldestTokenAgeMs) {
        oldestTokenAgeMs = age;
      }
    }
    return {
      issuedCount: tokens.size,
      profileCount: profiles.size,
      sessionCount: sessions.size,
      oldestTokenAgeMs,
    };
  }

  return { issue, verify, revokeSession, revokeProfile, revokeAll, metrics };
}

/** Parses a capability-token URL and returns the object id and optional token.
 *  Does not validate the token; use the manager's `verify()` for that. */
export function parseCustomProtocolCapabilityUrl(url: string): { objectId: string; token: string | null } {
  try {
    const parsed = new URL(url);
    const objectId = parsed.hostname || parsed.pathname.replace(/^\/+/, "");
    const token = parsed.searchParams.get("cap");
    return { objectId, token };
  } catch {
    return { objectId: "", token: null };
  }
}

/** Primary capability-token gate for custom-protocol requests. */
export function authorizeCustomProtocolCapability(input: {
  requestUrl: string;
  objectId: string;
  manager: CustomProtocolCapabilityManager;
  expectedProfileId?: string;
}): { allowed: true; spec: CustomProtocolCapabilitySpec } | { allowed: false } {
  const parsed = parseCustomProtocolCapabilityUrl(input.requestUrl);
  if (!parsed.token) return { allowed: false };
  const spec = input.manager.verify(parsed.token);
  if (!spec) return { allowed: false };
  if (spec.objectId !== input.objectId) return { allowed: false };
  if (input.expectedProfileId && spec.profileId !== input.expectedProfileId) return { allowed: false };
  return { allowed: true, spec };
}
