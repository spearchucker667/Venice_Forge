// @vitest-environment node

/** @fileoverview Unit tests for the Electron main-process Media Studio disk service.
 *
 *  Path-source contract: the Electron `app.getPath()` mock returns the exact
 *  realpath-resolved temp directories created at module load. The test
 *  fixtures write into those directories and the mediaService call site
 *  compares the realpath of the input path against `path.resolve(getPath())`
 *  via `isWithin`. On Windows the realpath form of a directory can change
 *  if the directory is deleted and recreated mid-test (new 8.3 short name,
 *  junction expansion, or case change), which silently breaks the
 *  containment check even though the directory is logically the same.
 *  The cleanup helpers in this file therefore only remove the fixture
 *  files between tests, never the parent temp directories. */

import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import zlibSync from "node:zlib";

const TEMP_ROOT = fsSync.mkdtempSync(path.join(os.tmpdir(), "vf-media-service-"));
const TMP_PICTURES_RAW = path.join(TEMP_ROOT, "Pictures");
const TMP_USERDATA_RAW = path.join(TEMP_ROOT, "UserData");
const TMP_DOWNLOADS_RAW = path.join(TEMP_ROOT, "Downloads");
const TMP_DESKTOP_RAW = path.join(TEMP_ROOT, "Desktop");
const TMP_DOCS_RAW = path.join(TEMP_ROOT, "Documents");
const TMP_VIDEOS_RAW = path.join(TEMP_ROOT, "Videos");
const TMP_MUSIC_RAW = path.join(TEMP_ROOT, "Music");
const TMP_OUTSIDE_RAW = path.join(TEMP_ROOT, "Outside");

for (const d of [TMP_PICTURES_RAW, TMP_USERDATA_RAW, TMP_DOWNLOADS_RAW, TMP_DESKTOP_RAW, TMP_DOCS_RAW, TMP_VIDEOS_RAW, TMP_MUSIC_RAW, TMP_OUTSIDE_RAW]) {
  fsSync.mkdirSync(d, { recursive: true });
}

const TMP_PICTURES = fsSync.realpathSync(TMP_PICTURES_RAW);
const TMP_USERDATA = fsSync.realpathSync(TMP_USERDATA_RAW);
const TMP_DOWNLOADS = fsSync.realpathSync(TMP_DOWNLOADS_RAW);
const TMP_DESKTOP = fsSync.realpathSync(TMP_DESKTOP_RAW);
const TMP_DOCS = fsSync.realpathSync(TMP_DOCS_RAW);
const TMP_VIDEOS = fsSync.realpathSync(TMP_VIDEOS_RAW);
const TMP_MUSIC = fsSync.realpathSync(TMP_MUSIC_RAW);
const TMP_OUTSIDE = fsSync.realpathSync(TMP_OUTSIDE_RAW);

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((name: string) => {
      switch (name) {
        case "pictures": return TMP_PICTURES;
        case "userData": return TMP_USERDATA;
        case "downloads": return TMP_DOWNLOADS;
        case "desktop": return TMP_DESKTOP;
        case "documents": return TMP_DOCS;
        case "videos": return TMP_VIDEOS;
        case "music": return TMP_MUSIC;
        default: return os.tmpdir();
      }
    }),
  },
  shell: {
    showItemInFolder: vi.fn(async () => undefined),
  },
}));

import {
  exportMedia,
  importMediaFromPath,
  readMediaMeta,
  generateMediaThumb,
  sha256Of,
  __test,
} from "./mediaService";

/** Removes only the named fixture file from a directory. The directory
 *  itself is preserved so its realpath form stays stable for the entire
 *  test run (critical on Windows, where deleting and recreating a
 *  directory can change its 8.3 short name or junction expansion). */
async function removeFixture(...paths: string[]) {
  for (const p of paths) {
    try { await fs.rm(p, { force: true }); } catch { /* ignore */ }
  }
}

/** Removes a list of fixture file basenames from a directory without
 *  touching the directory itself. */
async function removeFixturesIn(dir: string, basenames: string[]) {
  for (const b of basenames) {
    try { await fs.rm(path.join(dir, b), { force: true }); } catch { /* ignore */ }
  }
}

afterAll(async () => {
  await fs.rm(TEMP_ROOT, { recursive: true, force: true }).catch(() => {});
});

// A 4x4 fully-opaque red PNG, generated locally with zlib. This is used
// as a round-trip-able fixture for the thumb decoder.
function tinyPngBuffer() {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0); // width
  ihdr.writeUInt32BE(4, 4); // height
  ihdr[8] = 8;               // bit depth
  ihdr[9] = 6;               // color type RGBA
  ihdr[10] = 0;              // compression
  ihdr[11] = 0;              // filter
  ihdr[12] = 0;              // interlace
  const stride = 4 * 4;      // width * channels
  const raw = Buffer.alloc((stride + 1) * 4);
  for (let y = 0; y < 4; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    for (let x = 0; x < stride; x += 4) {
      raw[y * (stride + 1) + 1 + x + 0] = 0xff; // R
      raw[y * (stride + 1) + 1 + x + 1] = 0x00; // G
      raw[y * (stride + 1) + 1 + x + 2] = 0x00; // B
      raw[y * (stride + 1) + 1 + x + 3] = 0xff; // A
    }
  }
  const deflated = zlibSync.deflateSync(raw);
  const idat = wrapChunk("IDAT", deflated);
  const iend = wrapChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, wrapChunk("IHDR", ihdr), idat, iend]);
}

function wrapChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

describe("mediaService.sanitizeFilename", () => {
  it("replaces path separators and dots-prefix", () => {
    expect(__test.sanitizeFilename("../etc/passwd")).toBe("_etc_passwd");
    expect(__test.sanitizeFilename("..")).toBe("");
    expect(__test.sanitizeFilename(".hidden")).toBe("hidden");
    expect(__test.sanitizeFilename("file with space.png")).toBe("file_with_space.png");
  });

  it("caps length to 200", () => {
    const long = "a".repeat(500) + ".png";
    const out = __test.sanitizeFilename(long);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("strips leading dots", () => {
    expect(__test.sanitizeFilename("...secret.png")).toBe("secret.png");
  });
});

describe("mediaService.sanitizeSubfolder", () => {
  it("strips non-alphanumerics and dots", () => {
    expect(__test.sanitizeSubfolder("hello world")).toBe("helloworld");
    expect(__test.sanitizeSubfolder("../etc")).toBe("etc");
    expect(__test.sanitizeSubfolder("..")).toBe("");
  });

  it("caps length to 60", () => {
    const out = __test.sanitizeSubfolder("a".repeat(200));
    expect(out.length).toBeLessThanOrEqual(60);
  });
});

describe("mediaService.isWithin", () => {
  it("returns true for an exact child", () => {
    const parent = path.resolve(TEMP_ROOT, "isWithinParent");
    expect(__test.isWithin(parent, path.join(parent, "child.png"))).toBe(true);
  });

  it("returns false for a sibling or escape", () => {
    const parent = path.resolve(TEMP_ROOT, "isWithinParent");
    const sibling = path.resolve(TEMP_ROOT, "isWithinSibling", "x.png");
    const other = path.resolve(TEMP_ROOT, "isWithinParent2", "x.png");
    expect(__test.isWithin(parent, sibling)).toBe(false);
    expect(__test.isWithin(parent, other)).toBe(false);
  });

  it("handles case-insensitive paths on Windows when drive letter differs", () => {
    // On Windows, isWithin normalizes case; on POSIX the paths
    // genuinely differ (different-case dir names), so we expect
    // false on non-Windows but true on Windows.
    const parent = path.resolve(TEMP_ROOT, "CASE");
    const child = path.resolve(TEMP_ROOT, "case", "file.png");
    if (process.platform === "win32") {
      expect(__test.isWithin(parent, child)).toBe(true);
    } else {
      expect(__test.isWithin(parent, child)).toBe(false);
    }
  });
});

describe("exportMedia", () => {
  beforeEach(async () => {
    await removeFixturesIn(
      path.join(TMP_PICTURES, "Venice Forge", "Media Studio"),
      ["My_Image.png", "preview.png", "stripped.png"],
    );
  });
  afterEach(async () => {
    await removeFixturesIn(
      path.join(TMP_PICTURES, "Venice Forge", "Media Studio"),
      ["My_Image.png", "preview.png", "stripped.png"],
    );
  });

  it("writes a sanitized file under Pictures/Venice Forge/Media Studio", async () => {
    const result = await exportMedia({
      base64Data: tinyPngBuffer().toString("base64"),
      filename: "My Image.png",
    });
    expect(result.ok, `exportMedia failed: ${result.error ?? "<no error>"}`).toBe(true);
    expect(result.filePath).toBeDefined();
    const written = await fs.readFile(result.filePath!);
    expect(written.equals(tinyPngBuffer())).toBe(true);
    // The file lives in the Media Studio subfolder.
    expect(result.filePath).toMatch(/Venice Forge[\\/]Media Studio[\\/]My_Image\.png$/);
  });

  it("returns the resolved path without writing when dryRun is true", async () => {
    const result = await exportMedia({
      base64Data: tinyPngBuffer().toString("base64"),
      filename: "preview.png",
      dryRun: true,
    });
    expect(result.ok, `exportMedia dryRun failed: ${result.error ?? "<no error>"}`).toBe(true);
    expect(result.filePath).toMatch(/Media Studio[\\/]preview\.png$/);
    // File should NOT exist on disk
    await expect(fs.access(result.filePath!)).rejects.toThrow();
  });

  it("rejects filenames with no usable characters", async () => {
    const result = await exportMedia({ base64Data: tinyPngBuffer().toString("base64"), filename: "." });
    expect(result.ok, `exportMedia unexpectedly succeeded: ${result.error ?? "<no error>"}`).toBe(false);
    expect(result.error).toMatch(/no usable characters/);
  });

  it("rejects missing or non-string base64Data", async () => {
    const r1 = await exportMedia({ filename: "x.png" } as unknown as { base64Data: string; filename: string });
    expect(r1.ok, `exportMedia unexpectedly succeeded: ${r1.error ?? "<no error>"}`).toBe(false);
    const r2 = await exportMedia({ base64Data: 123 as unknown as string, filename: "x.png" });
    expect(r2.ok, `exportMedia unexpectedly succeeded: ${r2.error ?? "<no error>"}`).toBe(false);
  });

  it("strips data URL prefix before decoding", async () => {
    const result = await exportMedia({
      base64Data: `data:image/png;base64,${tinyPngBuffer().toString("base64")}`,
      filename: "stripped.png",
    });
    expect(result.ok, `exportMedia failed: ${result.error ?? "<no error>"}`).toBe(true);
    const written = await fs.readFile(result.filePath!);
    expect(written.equals(tinyPngBuffer())).toBe(true);
  });

  it("rejects arbitrary bytes renamed to an image extension", async () => {
    const result = await exportMedia({
      base64Data: Buffer.from("not really a png").toString("base64"),
      filename: "spoof.png",
    });
    expect(result).toMatchObject({ ok: false, error: "Decoded payload is not a supported image." });
  });

  it("rejects mismatched data URL MIME and filename extension", async () => {
    const mimeMismatch = await exportMedia({
      base64Data: `data:image/jpeg;base64,${tinyPngBuffer().toString("base64")}`,
      filename: "image.jpg",
    });
    expect(mimeMismatch).toMatchObject({
      ok: false,
      error: "Image data URL MIME type does not match decoded bytes.",
    });

    const extensionMismatch = await exportMedia({
      base64Data: `data:image/png;base64,${tinyPngBuffer().toString("base64")}`,
      filename: "image.webp",
    });
    expect(extensionMismatch).toMatchObject({
      ok: false,
      error: "Filename extension does not match decoded image type.",
    });
  });

  it("rejects unsupported media data URLs in the image export path", async () => {
    const result = await exportMedia({
      base64Data: `data:video/mp4;base64,${tinyPngBuffer().toString("base64")}`,
      filename: "video.mp4",
    });
    expect(result).toMatchObject({ ok: false, error: "Image data URL MIME type is not supported." });
  });
});

describe("importMediaFromPath", () => {
  const managedImportDir = path.join(TMP_PICTURES, "Venice Forge");

  beforeEach(async () => {
    await fs.mkdir(managedImportDir, { recursive: true });
    await removeFixturesIn(managedImportDir, ["import.png", "unknown.bin", "secret.json", "vault.db"]);
    await removeFixture(path.join(TMP_OUTSIDE, "outside.txt"));
  });
  afterEach(async () => {
    await removeFixturesIn(managedImportDir, ["import.png", "unknown.bin", "secret.json", "vault.db"]);
    await removeFixture(path.join(TMP_OUTSIDE, "outside.txt"));
  });

  it("reads an app-managed image and returns a typed data URL", async () => {
    const target = path.join(managedImportDir, "import.png");
    await fs.writeFile(target, tinyPngBuffer());
    const result = await importMediaFromPath({ filePath: target });
    expect(result.ok, result.error).toBe(true);
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.bytes).toBe(tinyPngBuffer().length);
    expect(result.contentType).toBe("image/png");
    expect(result.filename).toBe("import.png");
  });

  it("rejects paths outside the allowlist", async () => {
    const outsideFile = path.join(TMP_OUTSIDE, "outside.txt");
    await fs.writeFile(outsideFile, "not an image");
    const result = await importMediaFromPath({ filePath: outsideFile });
    expect(result.ok, `importMediaFromPath unexpectedly succeeded: ${result.error ?? "<no error>"}`).toBe(false);
    expect(result.error).toMatch(/Pictures\/Venice Forge/);
  });

  it("rejects renderer-directed files from Downloads", async () => {
    const target = path.join(TMP_DOWNLOADS, "import.png");
    await fs.writeFile(target, tinyPngBuffer());
    const result = await importMediaFromPath({ filePath: target });
    expect(result).toMatchObject({ ok: false, error: "File must be inside Pictures/Venice Forge." });
    await removeFixture(target);
  });

  it.each([
    ["unknown.bin", Buffer.from([0x00, 0x01, 0x02, 0x03])],
    ["secret.json", Buffer.from('{"apiKey":"not-media"}')],
    ["vault.db", Buffer.from("SQLite format 3\0")],
  ])("rejects non-image bytes in %s", async (filename, bytes) => {
    const target = path.join(managedImportDir, filename);
    await fs.writeFile(target, bytes);
    const result = await importMediaFromPath({ filePath: target });
    expect(result).toMatchObject({ ok: false, error: "Unsupported media type." });
    expect(result.dataUrl).toBeUndefined();
  });

  it("rejects null bytes and overlong paths", async () => {
    const r1 = await importMediaFromPath({ filePath: "ok\0bad" });
    expect(r1.ok, `importMediaFromPath unexpectedly succeeded: ${r1.error ?? "<no error>"}`).toBe(false);
    const r2 = await importMediaFromPath({ filePath: "a".repeat(5000) });
    expect(r2.ok, `importMediaFromPath unexpectedly succeeded: ${r2.error ?? "<no error>"}`).toBe(false);
  });

  it("rejects empty / missing path", async () => {
    const r1 = await importMediaFromPath({ filePath: "" });
    expect(r1.ok, `importMediaFromPath unexpectedly succeeded: ${r1.error ?? "<no error>"}`).toBe(false);
    const r2 = await importMediaFromPath({ filePath: undefined as unknown as string });
    expect(r2.ok, `importMediaFromPath unexpectedly succeeded: ${r2.error ?? "<no error>"}`).toBe(false);
  });

  it("rejects a sibling-directory path traversal escape", async () => {
    // The Downloads mock is TMP_DOWNLOADS, so ../Outside/inside.txt
    // resolves outside the allowlist even though it lives under TEMP_ROOT.
    const escape = path.join(TMP_DOWNLOADS, "..", "Outside", "inside.txt");
    await fs.writeFile(path.resolve(escape), "not an image");
    const result = await importMediaFromPath({ filePath: escape });
    expect(result.ok, `importMediaFromPath allowed a traversal: ${result.error ?? "<no error>"}`).toBe(false);
  });
});

describe("readMediaMeta", () => {
  beforeEach(async () => {
    await removeFixture(path.join(TMP_DOWNLOADS, "m.png"));
    await removeFixture(path.join(TMP_OUTSIDE, "meta-outside.txt"));
  });
  afterEach(async () => {
    await removeFixture(path.join(TMP_DOWNLOADS, "m.png"));
    await removeFixture(path.join(TMP_OUTSIDE, "meta-outside.txt"));
  });

  it("returns bytes and mtime for a file inside the allowlist", async () => {
    const target = path.join(TMP_DOWNLOADS, "m.png");
    await fs.writeFile(target, tinyPngBuffer());
    const result = await readMediaMeta({ filePath: target });
    expect(
      result.ok,
      `readMediaMeta returned ok=false for ${target}; error=${result.error ?? "<none>"}; ` +
        `TMP_DOWNLOADS=${TMP_DOWNLOADS}; mock getPath('downloads')=${TMP_DOWNLOADS}`,
    ).toBe(true);
    expect(result.bytes).toBe(tinyPngBuffer().length);
    expect(result.isFile).toBe(true);
    expect(typeof result.mtime).toBe("number");
  });

  it("refuses to read files outside the allowlist", async () => {
    const outsideFile = path.join(TMP_OUTSIDE, "meta-outside.txt");
    await fs.writeFile(outsideFile, "not an image");
    const result = await readMediaMeta({ filePath: outsideFile });
    expect(result.ok, `readMediaMeta unexpectedly succeeded: ${result.error ?? "<no error>"}`).toBe(false);
  });
});

describe("generateMediaThumb", () => {
  beforeEach(async () => {
    // Clean any cached thumb under <TMP_USERDATA>/metadata/media-thumbs.
    const thumbs = path.join(TMP_USERDATA, "metadata", "media-thumbs");
    try { await fs.rm(thumbs, { recursive: true, force: true }); } catch { /* ignore */ }
    await fs.mkdir(thumbs, { recursive: true });
  });
  afterEach(async () => {
    const thumbs = path.join(TMP_USERDATA, "metadata", "media-thumbs");
    try { await fs.rm(thumbs, { recursive: true, force: true }); } catch { /* ignore */ }
    await fs.mkdir(thumbs, { recursive: true });
  });

  it("returns a cache miss on first call and a cache hit on the second", async () => {
    const sha = sha256Of(tinyPngBuffer());
    const r1 = await generateMediaThumb({ sha256: sha, source: tinyPngBuffer().toString("base64") });
    expect(r1.ok, `generateMediaThumb failed: ${r1.error ?? "<no error>"}`).toBe(true);
    expect(r1.filePath).toBeDefined();
    expect(r1.url).toMatch(/^file:\/\//);
    const onDisk = await fs.stat(r1.filePath!);
    expect(onDisk.size).toBeGreaterThan(0);

    const r2 = await generateMediaThumb({ sha256: sha, source: tinyPngBuffer().toString("base64") });
    expect(r2.ok, `generateMediaThumb cache-hit failed: ${r2.error ?? "<no error>"}`).toBe(true);
    expect(r2.filePath).toBe(r1.filePath);
  });

  it("rejects an invalid sha256", async () => {
    const r1 = await generateMediaThumb({ sha256: "nope", source: tinyPngBuffer().toString("base64") });
    expect(r1.ok, `generateMediaThumb unexpectedly succeeded: ${r1.error ?? "<no error>"}`).toBe(false);
    const r2 = await generateMediaThumb({ sha256: "a".repeat(63), source: tinyPngBuffer().toString("base64") });
    expect(r2.ok, `generateMediaThumb unexpectedly succeeded: ${r2.error ?? "<no error>"}`).toBe(false);
  });

  it("rejects empty source", async () => {
    const sha = crypto.randomBytes(32).toString("hex");
    const r = await generateMediaThumb({ sha256: sha, source: "" });
    expect(r.ok, `generateMediaThumb unexpectedly succeeded: ${r.error ?? "<no error>"}`).toBe(false);
  });

  it("returns error for an unsupported format (JPEG stub)", async () => {
    const sha = crypto.randomBytes(32).toString("hex");
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    const r = await generateMediaThumb({ sha256: sha, source: jpegBytes.toString("base64") });
    expect(r.ok, `generateMediaThumb unexpectedly succeeded: ${r.error ?? "<no error>"}`).toBe(false);
    expect(r.error).toMatch(/Unsupported|decode|JPEG/);
  });
});

describe("sha256Of", () => {
  it("matches a known vector for an empty buffer", () => {
    expect(sha256Of("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("matches a known vector for 'abc'", () => {
    expect(sha256Of("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("returns a 64-char hex string", () => {
    expect(sha256Of("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
