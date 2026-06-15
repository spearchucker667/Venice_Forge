/** @fileoverview Desktop-only cache for Venice character avatar images.
 *
 *  Stores validated images under `<userData>/cache/character-images/` so the
 *  renderer never loads arbitrary remote URLs directly. The cache is bounded
 *  (2 MiB per image, 100 MiB total, 7-day TTL) and isolated from encrypted
 *  user-content stores.
 */

import { app } from "electron";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isTrustedVeniceImageUrl } from "../../src/utils/characterImageResolver";
import { getApiKey } from "./secureStore";
import { logError, logWarn } from "./logger";

/** Maximum raw image bytes the cache will accept for a single entry. */
export const MAX_CHARACTER_IMAGE_BYTES = 2 * 1024 * 1024;

/** Maximum total bytes for the whole cache directory. */
export const MAX_CHARACTER_IMAGE_CACHE_BYTES = 100 * 1024 * 1024;

/** Time-to-live for cached entries (7 days). */
export const CHARACTER_IMAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Upstream fetch timeout. */
const FETCH_TIMEOUT_MS = 15_000;

/** Allowed image content types. GIF is intentionally excluded. */
const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
]);

/** Maximum accepted URL length. */
const MAX_URL_LENGTH = 2048;

export interface CharacterImageCacheResult {
  ok: boolean;
  url?: string;
  error?: string;
  contentType?: string;
  bytes?: number;
}

export interface CharacterImageCacheInventory {
  count: number;
  totalBytes: number;
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

function tempPath(key: string): string {
  return path.join(getCharacterImageCacheDir(), `${key}.${process.pid}.${Date.now()}.tmp`);
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
  contentType: string;
  bytes: number;
  cachedAt: number;
  expiresAt: number;
}

async function readMeta(key: string): Promise<CacheMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(key), "utf-8");
    const parsed = JSON.parse(raw) as Partial<CacheMeta>;
    if (
      typeof parsed.sourceUrl === "string" &&
      typeof parsed.contentType === "string" &&
      typeof parsed.bytes === "number" &&
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
  await fs.writeFile(metaPath(key), JSON.stringify(meta, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
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
  let total = remaining.reduce((sum, e) => sum + e.meta.bytes, 0) + newBytes;

  while (total > MAX_CHARACTER_IMAGE_CACHE_BYTES && remaining.length > 0) {
    const oldest = remaining.shift();
    if (!oldest) break;
    try {
      await fs.unlink(oldest.dataPath);
    } catch { /* ignore */ }
    try {
      await fs.unlink(metaPath(oldest.key));
    } catch { /* ignore */ }
    total -= oldest.meta.bytes;
  }
}

/** Fetches the image from the upstream URL with optional API-key retry. */
async function fetchImage(
  url: string,
  signal: AbortSignal,
): Promise<{ buffer: Buffer; contentType: string }> {
  const attempt = async (withAuth: boolean): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (withAuth) {
      const key = getApiKey();
      if (key) headers["Authorization"] = `Bearer ${key}`;
    }
    return fetch(url, {
      method: "GET",
      headers,
      signal,
    });
  };

  let response = await attempt(false);
  if ((response.status === 401 || response.status === 403) && getApiKey()) {
    response = await attempt(true);
  }

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status} ${response.statusText}`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(`Content type "${contentType}" is not an allowed image type.`);
  }

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
      if (received > MAX_CHARACTER_IMAGE_BYTES) {
        throw new Error(`Image exceeds the ${MAX_CHARACTER_IMAGE_BYTES} byte cache limit.`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return { buffer: Buffer.concat(chunks), contentType };
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

  await ensureCacheDir();
  const key = getCharacterImageCacheKey(url);
  const dp = dataPath(key);

  const existing = await readMeta(key);
  const now = Date.now();

  if (existing && existing.expiresAt > now) {
    try {
      await fs.access(dp);
      return {
        ok: true,
        url: `venice-character-cache://${key}`,
        contentType: existing.contentType,
        bytes: existing.bytes,
      };
    } catch {
      // meta exists but data missing; fall through to fetch.
    }
  }

  const staleUrl = existing ? `venice-character-cache://${key}` : undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { buffer, contentType } = await fetchImage(url, controller.signal);
    await evictIfNeeded(buffer.length);

    const tmp = tempPath(key);
    await fs.writeFile(tmp, buffer, { mode: 0o600 });

    // Validate containment after writing (paranoid: temp path is under root).
    if (!isWithin(getCharacterImageCacheDir(), dp) || !isWithin(getCharacterImageCacheDir(), tmp)) {
      try { await fs.unlink(tmp); } catch { /* ignore */ }
      return { ok: false, error: "Resolved cache path is outside the cache directory." };
    }

    await fs.rename(tmp, dp);

    const meta: CacheMeta = {
      sourceUrl: url,
      contentType,
      bytes: buffer.length,
      cachedAt: now,
      expiresAt: now + CHARACTER_IMAGE_CACHE_TTL_MS,
    };
    await writeMeta(key, meta);

    return {
      ok: true,
      url: `venice-character-cache://${key}`,
      contentType,
      bytes: buffer.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logWarn("Character image cache fetch failed", { error: message });

    // Stale-while-revalidate: return the existing file even if refresh failed.
    if (staleUrl) {
      return {
        ok: true,
        url: staleUrl,
        contentType: existing?.contentType,
        bytes: existing?.bytes,
      };
    }

    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
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
    return { ok: true, deletedCount: deleted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("clearCharacterImageCache failed", message);
    return { ok: false, deletedCount: 0, error: message };
  }
}

/** Returns the number of cached images and total bytes on disk. */
export async function getCharacterImageCacheInventory(): Promise<CharacterImageCacheInventory> {
  try {
    const entries = await listEntries();
    return {
      count: entries.length,
      totalBytes: entries.reduce((sum, e) => sum + e.meta.bytes, 0),
    };
  } catch (err) {
    logError("getCharacterImageCacheInventory failed", err);
    return { count: 0, totalBytes: 0 };
  }
}
