// @vitest-environment node

// VERIFY-053 regression guard: desktop character image cache enforces the
// Venice allowlist, per-item and total size budgets, TTL/stale-while-revalidate,
// content-type allowlist, and API-key retry on 401/403.

/** @fileoverview Tests for the desktop character image cache service. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const TEMP_ROOT = fsSync.mkdtempSync(path.join(os.tmpdir(), "vf-char-img-cache-"));
fsSync.mkdirSync(path.join(TEMP_ROOT, "UserData"), { recursive: true });
const TMP_USERDATA = fsSync.realpathSync(path.join(TEMP_ROOT, "UserData"));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === "userData") return TMP_USERDATA;
      return os.tmpdir();
    }),
  },
}));

import * as secureStore from "./secureStore";

import {
  getCachedCharacterImage,
  clearCharacterImageCache,
  getCharacterImageCacheInventory,
  getCharacterImageCacheDir,
  MAX_CHARACTER_IMAGE_BYTES,
  CHARACTER_IMAGE_CACHE_TTL_MS,
} from "./characterImageCache";

const OFFICIAL_URL = "https://outerface.venice.ai/api/characters/abc/photo";

function pngBytes(bytes = 1024): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(Math.max(0, bytes - 8), 0xab),
  ]);
}

function avifBytes(bytes = 512): Buffer {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypavif", "ascii"),
    Buffer.alloc(Math.max(0, bytes - 12), 0xab),
  ]);
}

function makeImageResponse(bytes: number, contentType = "image/png", status = 200, body?: Buffer): Response {
  const buffer = body ?? (contentType === "image/avif" ? avifBytes(bytes) : pngBytes(bytes));
  return new Response(buffer, {
    status,
    headers: { "content-type": contentType },
  });
}

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanCacheDir(): Promise<void> {
  const dir = getCharacterImageCacheDir();
  try {
    const entries = await fs.readdir(dir);
    await Promise.all(entries.map((e) => fs.unlink(path.join(dir, e)).catch(() => undefined)));
  } catch {
    // directory may not exist
  }
}

describe("characterImageCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(secureStore, "getApiKey").mockReturnValue(null);
    globalThis.fetch = vi.fn();
  });

  afterEach(async () => {
    await cleanCacheDir();
  });

  it("rejects non-string, empty, or overly long URLs", async () => {
    expect((await getCachedCharacterImage(123 as unknown as string)).ok).toBe(false);
    expect((await getCachedCharacterImage("")).ok).toBe(false);
    expect((await getCachedCharacterImage("x".repeat(3000))).ok).toBe(false);
  });

  it("rejects URLs outside the Venice allowlist", async () => {
    const result = await getCachedCharacterImage("https://evil.example/avatar.png");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/allowlist/i);
  });

  it("fetches and caches a valid image", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(1024));

    const first = await getCachedCharacterImage(OFFICIAL_URL);
    expect(first.ok).toBe(true);
    expect(first.url).toMatch(/^venice-character-cache:\/\//);
    expect(first.bytes).toBe(1024);
    expect(first.contentType).toBe("image/png");
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    const second = await getCachedCharacterImage(OFFICIAL_URL);
    expect(second.ok).toBe(true);
    expect(second.url).toBe(first.url);
    expect(mockedFetch).toHaveBeenCalledTimes(1); // no refetch
  });

  it("accepts AVIF images returned by the Venice character CDN", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(makeImageResponse(512, "image/avif"));
    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result).toMatchObject({ ok: true, contentType: "image/avif", bytes: 512 });
  });

  it("rejects disallowed content types", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(100, "image/gif"));

    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/content type/i);
  });

  it("rejects HTML bytes served with an image content type", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(100, "image/png", 200, Buffer.from("<html>not an image</html>")));

    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/bytes do not match/i);
  });

  it("rejects images exceeding the per-item size limit", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(MAX_CHARACTER_IMAGE_BYTES + 1));

    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds/i);
  });

  it("retries with the API key on 401/403", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch
      .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }))
      .mockResolvedValueOnce(makeImageResponse(512));
    vi.spyOn(secureStore, "getApiKey").mockReturnValue("test-api-key");

    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(true);
    expect(result.bytes).toBe(512);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    const secondCall = mockedFetch.mock.calls[1] as [string, RequestInit | undefined];
    expect((secondCall[1]?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer test-api-key");
  });

  it("returns stale image and refreshes in the background", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(100, "image/png", 200));

    const first = await getCachedCharacterImage(OFFICIAL_URL);
    expect(first.ok).toBe(true);

    // Age the metadata so the entry is stale.
    const key = crypto
      .createHash("sha256")
      .update(OFFICIAL_URL, "utf-8")
      .digest("hex");
    const metaFile = path.join(getCharacterImageCacheDir(), `${key}.meta.json`);
    const staleMeta = JSON.parse(await fs.readFile(metaFile, "utf-8"));
    staleMeta.expiresAt = Date.now() - 1000;
    staleMeta.cachedAt = Date.now() - CHARACTER_IMAGE_CACHE_TTL_MS - 1000;
    await fs.writeFile(metaFile, JSON.stringify(staleMeta));

    mockedFetch.mockResolvedValueOnce(makeImageResponse(200, "image/png", 200));
    const stale = await getCachedCharacterImage(OFFICIAL_URL);
    expect(stale.ok).toBe(true);
    expect(stale.url).toBe(first.url);

    // Wait for background refresh.
    await wait(50);
    const refreshed = await getCachedCharacterImage(OFFICIAL_URL);
    expect(refreshed.ok).toBe(true);
    expect(refreshed.bytes).toBe(200);
  });

  it("clears all cached entries", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(100));
    await getCachedCharacterImage(OFFICIAL_URL);

    const before = await getCharacterImageCacheInventory();
    expect(before.count).toBe(1);

    const cleared = await clearCharacterImageCache();
    expect(cleared.ok).toBe(true);
    expect(cleared.deletedCount).toBe(1);

    const after = await getCharacterImageCacheInventory();
    expect(after.count).toBe(0);
  });

  it("inventory reports count and total bytes", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(100));
    await getCachedCharacterImage(OFFICIAL_URL);

    const inventory = await getCharacterImageCacheInventory();
    expect(inventory.count).toBe(1);
    expect(inventory.totalBytes).toBe(100);
  });
});
