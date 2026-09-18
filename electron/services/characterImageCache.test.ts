// @vitest-environment node

/**
 * @fileoverview Regression coverage for the desktop character image cache.
 *
 * Verifies the architecture specified in VF-AUD-20260917-P1-001:
 *   - magic-byte-driven format detection (NOT Content-Type trust)
 *   - GIF, PNG, JPEG, WebP, AVIF support
 *   - separate download / decoder / persist byte ceilings
 *   - in-flight dedup (single-flight)
 *   - negative cache for repeated failures
 *   - cancellation is a distinct outcome from corruption / failure
 *   - stale-while-revalidate returns the existing file when refresh fails
 */

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
  MAX_PERSISTED_BYTES_PER_IMAGE,
  MAX_DOWNLOAD_BYTES,
  CHARACTER_IMAGE_CACHE_TTL_MS,
  detectImageFormat,
  clearCharacterImageNegativeCache,
} from "./characterImageCache";

const OFFICIAL_URL = "https://outerface.venice.ai/api/characters/abc/photo";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const GIF89A_SIG = Buffer.from("GIF89a", "ascii");
const WEBP_RIFF = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4, 0), Buffer.from("WEBP", "ascii")]);
const AVIF_HEADER = Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp", "ascii"), Buffer.from("avif", "ascii")]);

function pngBytes(bytes = 1024): Buffer {
  return Buffer.concat([PNG_SIG, Buffer.alloc(Math.max(0, bytes - PNG_SIG.length), 0xab)]);
}

function jpegBytes(bytes = 1024): Buffer {
  return Buffer.concat([JPEG_SIG, Buffer.alloc(Math.max(0, bytes - JPEG_SIG.length), 0xab)]);
}

function gifBytes(bytes = 1024): Buffer {
  return Buffer.concat([GIF89A_SIG, Buffer.alloc(Math.max(0, bytes - GIF89A_SIG.length), 0xab)]);
}

function webpBytes(bytes = 1024): Buffer {
  return Buffer.concat([WEBP_RIFF, Buffer.alloc(Math.max(0, bytes - WEBP_RIFF.length), 0xab)]);
}

function avifBytes(bytes = 512): Buffer {
  return Buffer.concat([AVIF_HEADER, Buffer.alloc(Math.max(0, bytes - AVIF_HEADER.length), 0xab)]);
}

function makeImageResponse(
  body: Buffer,
  contentType = "image/png",
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": contentType, ...headers },
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
  clearCharacterImageNegativeCache();
}

describe("detectImageFormat (byte sniffing)", () => {
  it("identifies PNG, JPEG, GIF, WebP, AVIF", () => {
    expect(detectImageFormat(pngBytes())).toBe("image/png");
    expect(detectImageFormat(jpegBytes())).toBe("image/jpeg");
    expect(detectImageFormat(gifBytes())).toBe("image/gif");
    expect(detectImageFormat(webpBytes())).toBe("image/webp");
    expect(detectImageFormat(avifBytes())).toBe("image/avif");
  });

  it("returns null for arbitrary bytes", () => {
    expect(detectImageFormat(Buffer.from("<html>not an image</html>"))).toBeNull();
    expect(detectImageFormat(Buffer.alloc(0))).toBeNull();
    expect(detectImageFormat(Buffer.from("PK", "ascii"))).toBeNull();
  });
});

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

  it("fetches and caches a valid PNG image", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(pngBytes(1024), "image/png"));

    const first = await getCachedCharacterImage(OFFICIAL_URL);
    expect(first.ok).toBe(true);
    expect(first.url).toMatch(/^venice-character-cache:\/\//);
    expect(first.bytes).toBe(1024);
    expect(first.detectedFormat).toBe("image/png");
    expect(first.declaredContentType).toBe("image/png");
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    const second = await getCachedCharacterImage(OFFICIAL_URL);
    expect(second.ok).toBe(true);
    expect(second.url).toBe(first.url);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("accepts valid JPEG bytes regardless of Content-Type (byte-driven detection)", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    // Upstream declares image/png but bytes are JPEG.
    mockedFetch.mockResolvedValueOnce(makeImageResponse(jpegBytes(800), "image/png"));

    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(true);
    expect(result.detectedFormat).toBe("image/jpeg");
    expect(result.declaredContentType).toBe("image/png");
    expect(result.diagnostics?.detected).toBe("image/jpeg");
    expect(result.diagnostics?.declared).toBe("image/png");
  });

  it("accepts valid WebP bytes", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(makeImageResponse(webpBytes(1024), "image/webp"));
    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(true);
    expect(result.detectedFormat).toBe("image/webp");
  });

  it("accepts GIF bytes via byte signature (no Content-Type trust required)", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    // GIF87a/89a header is the canonical format identifier. Real Venice
    // character photos have been observed to arrive with no Content-Type or
    // a misleading one; the previous implementation rejected GIF outright,
    // breaking valid artwork.
    mockedFetch.mockResolvedValueOnce(makeImageResponse(gifBytes(2048), "image/gif"));

    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(true);
    expect(result.detectedFormat).toBe("image/gif");
  });

  it("accepts AVIF images", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(makeImageResponse(avifBytes(512), "image/avif"));
    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result).toMatchObject({ ok: true, detectedFormat: "image/avif", bytes: 512 });
  });

  it("rejects HTML bytes served with an image content type", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(
      makeImageResponse(Buffer.from("<html>not an image</html>"), "image/png"),
    );

    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/bytes do not match any known image signature/i);
  });

  it("deduplicates concurrent cache misses for the same source URL", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(makeImageResponse(pngBytes(1024))), 10)),
    );

    const [first, second] = await Promise.all([
      getCachedCharacterImage(OFFICIAL_URL),
      getCachedCharacterImage(OFFICIAL_URL),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.url).toBe(first.url);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects images exceeding the per-image persist limit", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(pngBytes(MAX_PERSISTED_BYTES_PER_IMAGE + 1), "image/png"));

    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds/i);
  });

  it("enforces the per-request download budget separately from the persist limit", async () => {
    // Build a Response whose declared content-length exceeds MAX_DOWNLOAD_BYTES
    // but does NOT claim a Content-Length. The streaming cap should still
    // trip before the persist cap, preventing memory bloat.
    const mockedFetch = vi.mocked(globalThis.fetch);
    let resolveStream!: (resp: Response) => void;
    mockedFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveStream = resolve;
        }),
    );

    const promise = getCachedCharacterImage(OFFICIAL_URL);
    const oversized = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        // Emit a single chunk larger than MAX_DOWNLOAD_BYTES.
        const buf = Buffer.alloc(MAX_DOWNLOAD_BYTES + 1024, 0xab);
        // Prepend PNG magic so the format is at least initially detected.
        Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(buf, 0);
        controller.enqueue(new Uint8Array(buf));
        controller.close();
      },
    }), { status: 200, headers: { "content-type": "image/png" } });
    resolveStream(oversized);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeded the .*-byte per-request budget/i);
  });

  it("retries with the API key on 401/403", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch
      .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }))
      .mockResolvedValueOnce(makeImageResponse(pngBytes(512), "image/png"));
    vi.spyOn(secureStore, "getApiKey").mockReturnValue("test-api-key");

    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(true);
    expect(result.bytes).toBe(512);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    const secondCall = mockedFetch.mock.calls[1] as [string, RequestInit | undefined];
    expect((secondCall[1]?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer test-api-key");
  });

  it("follows one validated redirect to a trusted Venice image URL", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: OFFICIAL_URL } }))
      .mockResolvedValueOnce(makeImageResponse(pngBytes(512), "image/png"));

    const result = await getCachedCharacterImage(OFFICIAL_URL);

    expect(result.ok).toBe(true);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect((mockedFetch.mock.calls[0][1] as RequestInit).redirect).toBe("manual");
  });

  it.each([
    ["http://192.168.1.1/secret"],
    ["http://localhost/avatar.png"],
    ["http://outerface.venice.ai/api/characters/abc/photo"],
    ["https://evil.example/avatar.png"],
  ])("rejects unsafe redirect target %s", async (location) => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }));

    const result = await getCachedCharacterImage(OFFICIAL_URL);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/redirect target/i);
  });

  it("rejects redirects without a Location header", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(null, { status: 302 }));

    const result = await getCachedCharacterImage(OFFICIAL_URL);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/location/i);
  });

  it("returns stale image and refreshes in the background", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(pngBytes(100), "image/png"));

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

    mockedFetch.mockResolvedValueOnce(makeImageResponse(pngBytes(200), "image/png"));
    const stale = await getCachedCharacterImage(OFFICIAL_URL);
    expect(stale.ok).toBe(true);
    expect(stale.url).toBe(first.url);

    // Wait for background refresh.
    await wait(50);
    const refreshed = await getCachedCharacterImage(OFFICIAL_URL);
    expect(refreshed.ok).toBe(true);
    expect(refreshed.bytes).toBe(200);
  });

  it("serves stale cache when refresh fails (stale-while-revalidate)", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(pngBytes(100), "image/png"));

    const first = await getCachedCharacterImage(OFFICIAL_URL);
    expect(first.ok).toBe(true);

    // Age the entry so the next call would normally refresh.
    const key = crypto
      .createHash("sha256")
      .update(OFFICIAL_URL, "utf-8")
      .digest("hex");
    const metaFile = path.join(getCharacterImageCacheDir(), `${key}.meta.json`);
    const staleMeta = JSON.parse(await fs.readFile(metaFile, "utf-8"));
    staleMeta.expiresAt = Date.now() - 1000;
    await fs.writeFile(metaFile, JSON.stringify(staleMeta));

    // Refresh attempt fails with HTTP 500.
    mockedFetch.mockResolvedValueOnce(new Response("upstream broken", { status: 500 }));

    const refreshed = await getCachedCharacterImage(OFFICIAL_URL);
    expect(refreshed.ok).toBe(true);
    expect(refreshed.url).toBe(first.url);
    expect(refreshed.diagnostics?.outcome).toBe("stale_revalidated");
  });

  it("negative-caches repeated failures so a flaky source is not hammered", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValue(new Response("fail", { status: 500 }));

    // First three failures record into the negative cache.
    const r1 = await getCachedCharacterImage(OFFICIAL_URL);
    const r2 = await getCachedCharacterImage(OFFICIAL_URL);
    const r3 = await getCachedCharacterImage(OFFICIAL_URL);
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);

    // Fourth call should short-circuit without issuing another upstream request.
    const beforeCount = mockedFetch.mock.calls.length;
    const r4 = await getCachedCharacterImage(OFFICIAL_URL);
    expect(r4.ok).toBe(false);
    expect(r4.diagnostics?.outcome).toBe("negative_cache_hit");
    expect(mockedFetch.mock.calls.length).toBe(beforeCount);
  });

  it("cancellation is reported as CANCELLED, distinct from corruption", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockImplementationOnce(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const result = await getCachedCharacterImage(OFFICIAL_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("CANCELLED");
  });

  it("clears all cached entries", async () => {
    const mockedFetch = vi.mocked(globalThis.fetch);
    mockedFetch.mockResolvedValueOnce(makeImageResponse(pngBytes(100), "image/png"));
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
    mockedFetch.mockResolvedValueOnce(makeImageResponse(pngBytes(100), "image/png"));
    await getCachedCharacterImage(OFFICIAL_URL);

    const inventory = await getCharacterImageCacheInventory();
    expect(inventory.count).toBe(1);
    expect(inventory.totalBytes).toBe(100);
  });
});
