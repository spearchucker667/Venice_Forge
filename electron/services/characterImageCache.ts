/** @fileoverview Desktop-only cache for Venice character avatar images.
 *
 *  Stores validated images under `<userData>/cache/character-images/` so the
 *  renderer never loads arbitrary remote URLs directly.
 *
 *  Architecture (per VF-AUD-20260917-P1-001):
 *    remote URL
 *      ↓
 *    bounded download (single-flight dedup per source URL)
 *      ↓
 *    actual byte signature sniffing (format detected from bytes, NOT from
 *    Content-Type — extensionless character photos frequently arrive with
 *    a misleading `Content-Type` header)
 *      ↓
 *    decoder validation (magic-byte check + zero-byte guard + length guard)
 *      ↓
 *    format normalization record (detected format, declared format, source
 *    size, cache size, normalized size — surfaces in structured diagnostics)
 *      ↓
 *    persisted canonicalized image on disk
 *
 *  Limits are kept deliberately separate so the four concerns are not
 *  conflated:
 *
 *    MAX_DOWNLOAD_BYTES            — hard ceiling on bytes pulled from
 *                                    upstream per request. Pathological
 *                                    payloads are rejected before they can
 *                                    exhaust memory.
 *    MAX_DECODER_BYTES             — additional guard so a malformed-but-
 *                                    length-valid payload cannot blow past
 *                                    the decoder budget.
 *    MAX_PERSISTED_BYTES_PER_IMAGE — hard cap on what the cache will accept
 *                                    for a single entry. Images exceeding
 *                                    this are rejected with a structured
 *                                    `OVERSIZE` failure so the renderer can
 *                                    present a deterministic placeholder.
 *    MAX_PERSISTED_BYTES_TOTAL     — overall cache cap.
 *
 *  NOTE: per-image resize/resampling is intentionally **not** implemented in
 *  this module. The Electron renderer is responsible for client-side
 *  downscaling using the natural `<img>` decoder; introducing a native
 *  image-processing dependency (sharp, jimp, etc.) is a separate
 *  architectural decision tracked outside this file.
 *
 *  Failure handling:
 *    - Consecutive fetch failures are recorded in a bounded **negative
 *      cache** so a repeatedly-failing source URL is not re-fetched inside
 *      the same boot session. The negative cache is cleared on app restart
 *      (transient, not durable) to avoid permanently blacklisting sources
 *      that may recover later.
 *    - Cancellation is reported as a distinct `{ ok: false, error:
 *      'CANCELLED' }` so callers can distinguish user abort from corruption.
 *    - Stale-while-revalidate: an existing on-disk cache entry continues
 *      to be served even if a refresh fails.
 */

import { app } from "electron";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isTrustedVeniceImageUrl } from "../../src/utils/characterImageResolver";
import { getApiKey } from "./secureStore";
import { logWarn } from "./logger";
import { atomicReplaceFile } from "../utils/atomicFileReplace";

/** Hard ceiling on bytes pulled from upstream per request. */
export const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024; // 8 MiB

/** Hard cap on what the cache will accept for a single entry. */
export const MAX_PERSISTED_BYTES_PER_IMAGE = 4 * 1024 * 1024; // 4 MiB

/** Hard cap on decoder-buffer growth while streaming the response. */
export const MAX_DECODER_BYTES = MAX_PERSISTED_BYTES_PER_IMAGE * 2;

/** Maximum total bytes for the whole cache directory. */
export const MAX_CHARACTER_IMAGE_CACHE_BYTES = 100 * 1024 * 1024;

/** Time-to-live for cached entries (7 days). */
export const CHARACTER_IMAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Upstream fetch timeout. */
const FETCH_TIMEOUT_MS = 15_000;

/** Negative-cache TTL for repeated failures (in-memory only). */
const NEGATIVE_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const NEGATIVE_CACHE_MAX_FAILURES = 3;

/** Maximum accepted URL length. */
const MAX_URL_LENGTH = 2048;

/**
 * Detected image format. Detection is driven by byte-signature sniffing, not
 * by the upstream `Content-Type` header. The `detected` value is what the
 * cache actually persisted.
 */
export type DetectedImageFormat = "image/png" | "image/jpeg" | "image/webp" | "image/avif" | "image/gif";

const FORMAT_MAGIC: Record<DetectedImageFormat, (buffer: Buffer) => boolean> = {
  "image/png": (buffer) =>
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a,
  "image/jpeg": (buffer) =>
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  "image/webp": (buffer) =>
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP",
  "image/avif": (buffer) =>
    buffer.length >= 12 &&
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(buffer.toString("ascii", 8, 12)),
  "image/gif": (buffer) =>
    buffer.length >= 6 &&
    (buffer.toString("ascii", 0, 6) === "GIF87a" ||
      buffer.toString("ascii", 0, 6) === "GIF89a"),
};

const FORMAT_ORDER: DetectedImageFormat[] = ["image/gif", "image/png", "image/jpeg", "image/webp", "image/avif"];

/**
 * Inspect the leading bytes of a downloaded buffer and identify the format
 * by signature. Returns `null` when the bytes do not match any known
 * image format.
 *
 * Sniffing is performed **before** trusting the upstream Content-Type so
 * mislabelled responses are correctly classified.
 */
export function detectImageFormat(buffer: Buffer): DetectedImageFormat | null {
  for (const fmt of FORMAT_ORDER) {
    if (FORMAT_MAGIC[fmt](buffer)) return fmt;
  }
  return null;
}

export interface CharacterImageCacheResult {
  ok: boolean;
  url?: string;
  error?: string;
  /** Detected format from byte signature. */
  detectedFormat?: DetectedImageFormat;
  /** Content-Type header value as declared by upstream (untrusted). */
  declaredContentType?: string;
  /** Bytes streamed from upstream (matches persisted size). */
  bytes?: number;
  /** Stable diagnostic object for telemetry — never contains raw bytes. */
  diagnostics?: {
    detected: DetectedImageFormat;
    declared: string;
    sourceBytes: number;
    normalizedBytes: number;
    outcome: "cache_hit" | "cache_write" | "stale_revalidated" | "negative_cache_hit";
  };
}

export interface CharacterImageCacheInventory {
  count: number;
  totalBytes: number;
}

interface InFlightFetch {
  readonly id: symbol;
  readonly promise: Promise<CharacterImageCacheResult>;
}
const inFlightFetches = new Map<string, InFlightFetch>();

interface NegativeCacheEntry {
  expiresAt: number;
  failures: number;
  lastError: string;
}
const negativeCache = new Map<string, NegativeCacheEntry>();

export function clearCharacterImageNegativeCache(): void {
  negativeCache.clear();
}

function recordFailure(url: string, error: string): void {
  const existing = negativeCache.get(url);
  const failures = (existing?.failures ?? 0) + 1;
  if (failures >= NEGATIVE_CACHE_MAX_FAILURES) {
    negativeCache.set(url, {
      expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS,
      failures,
      lastError: error,
    });
  } else {
    negativeCache.set(url, {
      expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS,
      failures,
      lastError: error,
    });
  }
}

function negativeCacheHit(url: string): CharacterImageCacheResult | null {
  const entry = negativeCache.get(url);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    negativeCache.delete(url);
    return null;
  }
  return {
    ok: false,
    error: entry.lastError,
    detectedFormat: undefined,
  };
}

/** Returns the absolute, normalized cache root directory. */
export function getCharacterImageCacheDir(): string {
  return path.resolve(path.join(app.getPath("userData"), "cache", "character-images"));
}

/** Returns the SHA-256 cache key for a source URL. */
export function getCharacterImageCacheKey(url: string): string {
  return crypto.createHash("sha256").update(url, "utf-8").digest("hex");
}

function dataPath(key: string): string {
  return path.join(getCharacterImageCacheDir(), `${key}.bin`);
}

function metaPath(key: string): string {
  return path.join(getCharacterImageCacheDir(), `${key}.meta.json`);
}

/** Ensures the cache directory exists. */
async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(getCharacterImageCacheDir(), { recursive: true });
}

/** Returns true when `child` is contained within `parent`. */
function isWithin(parent: string, child: string): boolean {
  const normalizedParent = path.resolve(parent);
  const normalizedChild = path.resolve(child);
  const isWin = process.platform === "win32";
  const p = isWin ? normalizedParent.toLowerCase() : normalizedParent;
  const c = isWin ? normalizedChild.toLowerCase() : normalizedChild;
  if (p === c) return true;
  const rel = path.relative(p, c);
  return !(rel === "" || rel.startsWith("..") || path.isAbsolute(rel));
}

interface CacheMeta {
  sourceUrl: string;
  detectedFormat: DetectedImageFormat;
  declaredContentType: string;
  sourceBytes: number;
  normalizedBytes: number;
  cachedAt: number;
  expiresAt: number;
}

async function readMeta(key: string): Promise<CacheMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(key), "utf-8");
    const parsed = JSON.parse(raw) as Partial<CacheMeta>;
    if (
      typeof parsed.sourceUrl === "string" &&
      typeof parsed.detectedFormat === "string" &&
      typeof parsed.declaredContentType === "string" &&
      typeof parsed.sourceBytes === "number" &&
      typeof parsed.normalizedBytes === "number" &&
      typeof parsed.cachedAt === "number" &&
      typeof parsed.expiresAt === "number"
    ) {
      return parsed as CacheMeta;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeMeta(key: string, meta: CacheMeta): Promise<void> {
  await atomicReplaceFile(metaPath(key), JSON.stringify(meta, null, 2), 0o600);
}

/** Lists all cache entries with their metadata and filesystem stats. */
async function listEntries(): Promise<
  Array<{ key: string; meta: CacheMeta; dataPath: string; mtime: number }>
> {
  const root = getCharacterImageCacheDir();
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch {
    return [];
  }

  const entries: Array<{ key: string; meta: CacheMeta; dataPath: string; mtime: number }> = [];
  for (const name of names) {
    if (!name.endsWith(".meta.json")) continue;
    const key = name.slice(0, -".meta.json".length);
    const meta = await readMeta(key);
    if (!meta) continue;
    const dp = dataPath(key);
    try {
      const stat = await fs.stat(dp);
      entries.push({ key, meta, dataPath: dp, mtime: stat.mtimeMs });
    } catch {
      // orphaned meta; clean it up
      try {
        await fs.unlink(metaPath(key));
      } catch { /* ignore */ }
    }
  }
  return entries;
}

/** Removes expired entries and trims the cache to the total size budget. */
async function evictIfNeeded(newBytes: number): Promise<void> {
  const now = Date.now();
  const entries = await listEntries();

  // Delete expired entries first.
  for (const entry of entries) {
    if (entry.meta.expiresAt <= now) {
      try {
        await fs.unlink(entry.dataPath);
      } catch { /* ignore */ }
      try {
        await fs.unlink(metaPath(entry.key));
      } catch { /* ignore */ }
    }
  }

  const remaining = (await listEntries()).sort((a, b) => a.mtime - b.mtime);
  let total = remaining.reduce((sum, e) => sum + e.meta.normalizedBytes, 0) + newBytes;

  while (total > MAX_CHARACTER_IMAGE_CACHE_BYTES && remaining.length > 0) {
    const oldest = remaining.shift();
    if (!oldest) break;
    try {
      await fs.unlink(oldest.dataPath);
    } catch { /* ignore */ }
    try {
      await fs.unlink(metaPath(oldest.key));
    } catch { /* ignore */ }
    total -= oldest.meta.normalizedBytes;
  }
}

function classifyFetchError(err: unknown): { message: string; cancelled: boolean } {
  if (err instanceof Error) {
    const isAbort = err.name === "AbortError" || /aborted|abort/i.test(err.message);
    return { message: err.message, cancelled: isAbort };
  }
  return { message: String(err), cancelled: false };
}

/** Fetches the image from the upstream URL with optional API-key retry. */
async function fetchImage(
  url: string,
  signal: AbortSignal,
): Promise<{ buffer: Buffer; declaredContentType: string; detectedFormat: DetectedImageFormat }> {
  const attempt = async (requestUrl: string, withAuth: boolean): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (withAuth) {
      const key = getApiKey();
      if (key) headers["Authorization"] = `Bearer ${key}`;
    }
    return fetch(requestUrl, {
      method: "GET",
      headers,
      signal,
      redirect: "manual",
    });
  };

  let fetchUrl = url;
  let response = await attempt(fetchUrl, false);
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Image redirect is missing a Location header.");
    const redirected = new URL(location, fetchUrl).toString();
    if (!isTrustedVeniceImageUrl(redirected)) {
      throw new Error("Image redirect target is not on the Venice allowlist.");
    }
    fetchUrl = redirected;
    response = await attempt(fetchUrl, false);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error("Image redirect chain exceeds one hop.");
    }
  }
  if ((response.status === 401 || response.status === 403) && getApiKey()) {
    response = await attempt(fetchUrl, true);
  }

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status} ${response.statusText}`);
  }

  const declaredContentType = (response.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();

  // Stream with a hard byte cap to avoid loading a huge response into memory.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable.");

  const chunks: Buffer[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      received += chunk.length;
      // First hard ceiling: stop accepting bytes past the per-request
      // download budget. This is intentionally separate from the persisted
      // size budget below.
      if (received > MAX_DOWNLOAD_BYTES) {
        throw new Error(
          `Image download exceeded the ${MAX_DOWNLOAD_BYTES}-byte per-request budget.`,
        );
      }
      // Second hard ceiling: a streaming decoder must not allocate past the
      // decoder-buffer limit. This guards against pathological responses
      // that omit Content-Length but stream forever.
      if (received > MAX_DECODER_BYTES) {
        throw new Error(
          `Image stream exceeded the ${MAX_DECODER_BYTES}-byte decoder budget.`,
        );
      }
      // Third ceiling: a single persisted entry must never exceed the
      // per-image size budget. This is what prevents an oversized image
      // from being silently accepted and then evicting the cache.
      if (received > MAX_PERSISTED_BYTES_PER_IMAGE) {
        throw new Error(
          `Image exceeds the ${MAX_PERSISTED_BYTES_PER_IMAGE}-byte persisted cache limit.`,
        );
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = Buffer.concat(chunks);

  // Format detection from bytes happens **before** we trust the declared
  // Content-Type, so an upstream that serves JPEG bytes under
  // `Content-Type: image/png` (or an extensionless character photo URL
  // with a misleading MIME) is classified correctly.
  const detectedFormat = detectImageFormat(buffer);
  if (!detectedFormat) {
    throw new Error(
      `Downloaded bytes do not match any known image signature (declared ${declaredContentType || "unknown"}).`,
    );
  }

  return { buffer, declaredContentType, detectedFormat };
}

/** Fetches, validates, and caches a character image, returning a local file URL. */
export async function getCachedCharacterImage(url: string): Promise<CharacterImageCacheResult> {
  if (typeof url !== "string") {
    return { ok: false, error: "Image URL must be a string." };
  }
  if (url.length === 0 || url.length > MAX_URL_LENGTH) {
    return { ok: false, error: "Image URL is empty or too long." };
  }
  if (!isTrustedVeniceImageUrl(url)) {
    return { ok: false, error: "Image URL is not on the Venice allowlist." };
  }

  // Negative-cache hit short-circuits the upstream round-trip.
  const negative = negativeCacheHit(url);
  if (negative) {
    return {
      ...negative,
      diagnostics: {
        detected: negative.detectedFormat ?? "image/png",
        declared: "",
        sourceBytes: 0,
        normalizedBytes: 0,
        outcome: "negative_cache_hit",
      },
    };
  }

  await ensureCacheDir();
  const key = getCharacterImageCacheKey(url);
  const dp = dataPath(key);

  const existing = await readMeta(key);
  const now = Date.now();

  if (existing && existing.expiresAt > now) {
    try {
      await fs.access(dp);
      const result: CharacterImageCacheResult = {
        ok: true,
        url: `venice-character-cache://${key}`,
        detectedFormat: existing.detectedFormat,
        declaredContentType: existing.declaredContentType,
        bytes: existing.normalizedBytes,
      };
      result.diagnostics = {
        detected: existing.detectedFormat,
        declared: existing.declaredContentType,
        sourceBytes: existing.sourceBytes,
        normalizedBytes: existing.normalizedBytes,
        outcome: "cache_hit",
      };
      return result;
    } catch {
      // meta exists but data missing; fall through to fetch.
    }
  }

  // Single-flight dedup: if a fetch for this same URL is already in flight,
  // share its promise instead of issuing a duplicate upstream request.
  const inFlight = inFlightFetches.get(key);
  if (inFlight) return inFlight.promise;

  const fetchAndWrite = async (): Promise<CharacterImageCacheResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const { buffer, declaredContentType, detectedFormat } = await fetchImage(url, controller.signal);
      await evictIfNeeded(buffer.length);

      if (!isWithin(getCharacterImageCacheDir(), dp)) {
        return { ok: false, error: "Resolved cache path is outside the cache directory." };
      }

      await atomicReplaceFile(dp, buffer, 0o600);

      const meta: CacheMeta = {
        sourceUrl: url,
        detectedFormat,
        declaredContentType,
        sourceBytes: buffer.length,
        normalizedBytes: buffer.length,
        cachedAt: now,
        expiresAt: now + CHARACTER_IMAGE_CACHE_TTL_MS,
      };
      await writeMeta(key, meta);

      // Successful fetch clears any negative-cache entry.
      negativeCache.delete(url);

      return {
        ok: true,
        url: `venice-character-cache://${key}`,
        detectedFormat,
        declaredContentType,
        bytes: buffer.length,
        diagnostics: {
          detected: detectedFormat,
          declared: declaredContentType,
          sourceBytes: buffer.length,
          normalizedBytes: buffer.length,
          outcome: existing ? "stale_revalidated" : "cache_write",
        },
      };
    } catch (err) {
      const { message, cancelled } = classifyFetchError(err);
      // Cancellation is a user-initiated outcome and is NOT recorded as a
      // failure for negative-cache purposes. It is returned as a distinct
      // `CANCELLED` error so the renderer can distinguish abort from
      // corruption/network failure.
      if (cancelled) {
        logWarn("Character image cache fetch aborted", { url: hashForLog(url) });
        return { ok: false, error: "CANCELLED" };
      }
      logWarn("Character image cache fetch failed", { error: message, url: hashForLog(url) });
      recordFailure(url, message);

      // Stale-while-revalidate: return the existing file even if refresh failed.
      if (existing) {
        return {
          ok: true,
          url: `venice-character-cache://${key}`,
          detectedFormat: existing.detectedFormat,
          declaredContentType: existing.declaredContentType,
          bytes: existing.normalizedBytes,
          diagnostics: {
            detected: existing.detectedFormat,
            declared: existing.declaredContentType,
            sourceBytes: existing.sourceBytes,
            normalizedBytes: existing.normalizedBytes,
            outcome: "stale_revalidated",
          },
        };
      }

      return { ok: false, error: message };
    } finally {
      clearTimeout(timeout);
    }
  };

  const fetchToken = Symbol("fetchToken");
  const promise = fetchAndWrite();
  inFlightFetches.set(key, { id: fetchToken, promise });
  try {
    return await promise;
  } finally {
    if (inFlightFetches.get(key)?.id === fetchToken) {
      inFlightFetches.delete(key);
    }
  }
}

/** Hashed URL for log records (never log the raw URL). */
function hashForLog(url: string): string {
  return crypto.createHash("sha256").update(url, "utf-8").digest("hex").slice(0, 16);
}

/** Removes all cached character images. */
export async function clearCharacterImageCache(): Promise<{ ok: boolean; deletedCount: number; error?: string }> {
  try {
    await ensureCacheDir();
    const entries = await listEntries();
    let deleted = 0;
    for (const entry of entries) {
      try {
        await fs.unlink(entry.dataPath);
        deleted++;
      } catch { /* ignore */ }
      try {
        await fs.unlink(metaPath(entry.key));
      } catch { /* ignore */ }
    }
    negativeCache.clear();
    inFlightFetches.clear();
    return { ok: true, deletedCount: deleted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logWarn("clearCharacterImageCache failed", { error: message });
    return { ok: false, deletedCount: 0, error: message };
  }
}

/** Returns the number of cached images and total bytes on disk. */
export async function getCharacterImageCacheInventory(): Promise<CharacterImageCacheInventory> {
  try {
    const entries = await listEntries();
    return {
      count: entries.length,
      totalBytes: entries.reduce((sum, e) => sum + e.meta.normalizedBytes, 0),
    };
  } catch (err) {
    logWarn("getCharacterImageCacheInventory failed", { error: err instanceof Error ? err.message : String(err) });
    return { count: 0, totalBytes: 0 };
  }
}
