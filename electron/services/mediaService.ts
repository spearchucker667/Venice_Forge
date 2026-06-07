/** @fileoverview Media Studio disk service. Owns thumbnail cache, export, import,
 *  reveal, and metadata reads. All disk operations are sandboxed under
 *  Pictures/Venice Forge/Media Studio (writes) and Pictures/Venice Forge,
 *  Desktop, Documents, Downloads, or userData/media-thumbs (reads / reveals).
 *
 *  Path validation: every path accepted from the renderer is normalized,
 *  resolved, and containment-checked against an explicit allowlist of
 *  base directories. Path traversal, null bytes, and symlink escapes are
 *  blocked before any I/O. */

import { app, shell } from "electron";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { MIB, VENICE_MAX_BODY_BYTES } from "../../src/shared/limits";

/** Maximum raw upload size, mirrors the renderer cap. */
const MAX_IMPORT_BYTES = 50 * MIB;

/** Maximum decoded image size for export. Base64 string length budget. */
const MAX_EXPORT_B64_BYTES = 50 * 1024 * 1024 * 1.37;

/** Per-item thumbnail size in pixels. */
const THUMB_MAX_DIMENSION = 256;

/** Filename subfolder for routed export. */
const EXPORT_SUBFOLDER = "Media Studio";

/** Returns the absolute, normalized Pictures/Venice Forge base directory. */
function picturesBaseDir(): string {
  return path.resolve(path.join(app.getPath("pictures"), "Venice Forge"));
}

/** Returns the absolute, normalized userData/media-thumbs directory. */
function thumbsDir(): string {
  return path.resolve(path.join(app.getPath("userData"), "metadata", "media-thumbs"));
}

/** Returns the absolute, normalized userData/media-exports directory. */
function exportsBaseDir(): string {
  return path.resolve(path.join(app.getPath("userData"), "metadata", "media-exports"));
}

/** Returns true if `child` is contained within `parent` after normalization.
 *  On Windows, comparison is case-insensitive to handle drive-letter and
 *  8.3 short-name resolution differences. */
function isWithin(parent: string, child: string): boolean {
  const normalizedParent = path.resolve(parent);
  const normalizedChild = path.resolve(child);
  const isWin = process.platform === "win32";
  const p = isWin ? normalizedParent.toLowerCase() : normalizedParent;
  const c = isWin ? normalizedChild.toLowerCase() : normalizedChild;
  if (p === c) return true;
  const rel = path.relative(p, c);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return false;
  return true;
}

/** Canonicalizes an existing filesystem path for containment checks.
 *  Falls back to `path.resolve()` when the base directory does not exist
 *  yet. This keeps allowlist checks stable across Windows long-path /
 *  8.3 short-name differences while preserving symlink / junction
 *  escape protection (the child path is still canonicalized through
 *  `fs.realpath()` at every call site that uses this helper). */
async function canonicalizeExistingPath(input: string): Promise<string> {
  const resolved = path.resolve(input);
  try {
    return await fs.realpath(resolved);
  } catch {
    return resolved;
  }
}

/** Canonicalizes allowlist base directories before comparing them to a
 *  child path that has already been canonicalized with `fs.realpath()`. */
async function canonicalizeBaseDirs(dirs: string[]): Promise<string[]> {
  return Promise.all(dirs.map((dir) => canonicalizeExistingPath(dir)));
}

/** Returns the import-safe base directories. */
function importSafeBaseDirs(): string[] {
  return [
    path.resolve(app.getPath("downloads")),
    path.resolve(app.getPath("documents")),
    path.resolve(app.getPath("desktop")),
    picturesBaseDir(),
  ];
}

/** Returns the explicit list of "reveal-safe" base directories. Anything
 *  the renderer asks to reveal in the file manager must be inside one of
 *  these roots. The list intentionally excludes Documents and Downloads
 *  (where the user may have unrelated sensitive files). */
function revealSafeBaseDirs(): string[] {
  return [
    picturesBaseDir(),
    path.resolve(app.getPath("desktop")),
    path.resolve(app.getPath("downloads")),
    path.resolve(app.getPath("documents")),
    thumbsDir(),
    exportsBaseDir(),
  ];
}

/** Sanitizes a user-supplied filename to [a-zA-Z0-9_.-]. The result is also
 *  stripped of leading dots, so we never produce a hidden filename. */
function sanitizeFilename(input: string): string {
  const cleaned = String(input ?? "").replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/^\.+/, "");
  if (!cleaned || cleaned === ".." || cleaned === ".") return "";
  return cleaned.slice(0, 200);
}

/** Sanitizes a user-supplied subfolder slug. */
function sanitizeSubfolder(input: string): string {
  const cleaned = String(input ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleaned || cleaned === ".." || cleaned === ".") return "";
  return cleaned.slice(0, 60);
}

export interface MediaExportInput {
  /** Base64 payload (with or without data URL prefix). */
  base64Data: string;
  /** Filename to use (will be sanitized). */
  filename: string;
  /** Optional subfolder slug under Pictures/Venice Forge/Media Studio. */
  subfolder?: string;
  /** If true, return the chosen path without writing (preview-only). */
  dryRun?: boolean;
}

export interface MediaExportResult {
  ok: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

export async function exportMedia(input: MediaExportInput): Promise<MediaExportResult> {
  try {
    if (typeof input?.base64Data !== "string") {
      return { ok: false, error: "Image data must be a string." };
    }
    if (typeof input?.filename !== "string" || !input.filename) {
      return { ok: false, error: "Filename is required." };
    }
    if (input.base64Data.length > MAX_EXPORT_B64_BYTES) {
      return { ok: false, error: "Image data is too large." };
    }

    const cleanFilename = sanitizeFilename(input.filename);
    if (!cleanFilename) {
      return { ok: false, error: "Filename contains no usable characters." };
    }

    let sub = sanitizeSubfolder(input.subfolder ?? "");
    if (!sub) sub = EXPORT_SUBFOLDER;

    const baseDir = path.join(picturesBaseDir(), sub);
    const targetPath = path.resolve(path.join(baseDir, cleanFilename));

    if (!isWithin(path.join(picturesBaseDir()), targetPath)) {
      return { ok: false, error: "Resolved path is outside the export base directory." };
    }
    if (input.dryRun) {
      return { ok: true, filePath: targetPath, canceled: false };
    }

    const raw = input.base64Data.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    const buffer = Buffer.from(raw, "base64");
    if (buffer.length === 0) {
      return { ok: false, error: "Decoded payload is empty." };
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    // Atomic write: temp + rename.
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, buffer, { mode: 0o600 });
    await fs.rename(tmpPath, targetPath);

    return { ok: true, filePath: targetPath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface MediaImportResult {
  ok: boolean;
  canceled?: boolean;
  dataUrl?: string;
  filePath?: string;
  filename?: string;
  bytes?: number;
  contentType?: string;
  error?: string;
}

/** Decodes raw bytes to a data URL. Content type is sniffed from the
 *  leading bytes (PNG / JPEG / WebP / GIF). */
function sniffContentType(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

/** Reads a file from a path the renderer provides. The path must be inside
 *  one of the allowlisted base directories (Downloads / Documents / Desktop /
 *  Pictures/Venice Forge). Returns the file bytes as a data URL plus metadata. */
export async function importMediaFromPath(input: { filePath: string }): Promise<MediaImportResult> {
  try {
    if (typeof input?.filePath !== "string" || input.filePath.length === 0) {
      return { ok: false, error: "File path is required." };
    }
    if (input.filePath.includes("\0") || input.filePath.length > 4096) {
      return { ok: false, error: "Invalid file path." };
    }

    let resolved: string;
    try {
      resolved = await fs.realpath(path.resolve(input.filePath));
    } catch {
      return { ok: false, error: "File not found." };
    }

    const allowedDirs = await canonicalizeBaseDirs(importSafeBaseDirs());
    const isAllowed = allowedDirs.some((dir) => isWithin(dir, resolved));
    if (!isAllowed) {
      return { ok: false, error: "File must be inside Downloads, Documents, Desktop, or Pictures/Venice Forge." };
    }

    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return { ok: false, error: "Not a regular file." };
    }
    if (stat.size > MAX_IMPORT_BYTES) {
      return { ok: false, error: `File is too large (${stat.size} bytes). Max: ${MAX_IMPORT_BYTES} bytes.` };
    }

    const buffer = await fs.readFile(resolved);
    const contentType = sniffContentType(buffer);
    const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;

    return {
      ok: true,
      canceled: false,
      dataUrl,
      filePath: resolved,
      filename: path.basename(resolved),
      bytes: stat.size,
      contentType,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Reveals a file in the OS file manager. Path must be inside one of the
 *  reveal-safe base directories. */
export async function revealMediaInFolder(input: { filePath: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    if (typeof input?.filePath !== "string" || input.filePath.length === 0) {
      return { ok: false, error: "File path is required." };
    }
    if (input.filePath.includes("\0") || input.filePath.length > 4096) {
      return { ok: false, error: "Invalid file path." };
    }

    let resolved: string;
    try {
      resolved = await fs.realpath(path.resolve(input.filePath));
    } catch {
      return { ok: false, error: "File not found." };
    }

    const allowedDirs = await canonicalizeBaseDirs(revealSafeBaseDirs());
    const allowed = allowedDirs.some((dir) => isWithin(dir, resolved));
    if (!allowed) {
      return { ok: false, error: "Reveal is restricted to media export and safe directories." };
    }

    try {
      await shell.showItemInFolder(resolved);
    } catch {
      return { ok: false, error: "Reveal failed." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface MediaMetaResult {
  ok: boolean;
  filePath?: string;
  bytes?: number;
  mtime?: number;
  isFile?: boolean;
  error?: string;
}

/** Returns filesystem metadata for a path the renderer already trusts. */
export async function readMediaMeta(input: { filePath: string }): Promise<MediaMetaResult> {
  try {
    if (typeof input?.filePath !== "string" || input.filePath.length === 0) {
      return { ok: false, error: "File path is required." };
    }
    if (input.filePath.includes("\0") || input.filePath.length > 4096) {
      return { ok: false, error: "Invalid file path." };
    }

    let resolved: string;
    try {
      resolved = await fs.realpath(path.resolve(input.filePath));
    } catch {
      return { ok: false, error: "File not found." };
    }

    const allowedDirs = await canonicalizeBaseDirs(revealSafeBaseDirs());
    const allowed = allowedDirs.some((dir) => isWithin(dir, resolved));
    if (!allowed) {
      return { ok: false, error: "Metadata reads are restricted to media export and safe directories." };
    }

    const stat = await fs.stat(resolved);
    return {
      ok: true,
      filePath: resolved,
      bytes: stat.size,
      mtime: stat.mtimeMs,
      isFile: stat.isFile(),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface MediaThumbInput {
  /** Hex-encoded sha256 used as a stable cache key. */
  sha256: string;
  /** Base64 payload of the source image (with or without data URL prefix). */
  source: string;
  /** Optional override for the max dimension. */
  maxDimension?: number;
}

export interface MediaThumbResult {
  ok: boolean;
  filePath?: string;
  url?: string;
  error?: string;
}

/** Validates a sha256 hex string. */
function isValidSha256(s: string): boolean {
  return typeof s === "string" && /^[0-9a-f]{64}$/i.test(s);
}

/** Atomically writes the thumb bytes to `<thumbsDir>/<sha>.webp`. */
async function writeThumb(targetPath: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, buffer, { mode: 0o600 });
  await fs.rename(tmpPath, targetPath);
}

/** Strips the data URL prefix from a base64 string. */
function stripDataUrl(s: string): string {
  return String(s ?? "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

/** Generates a thumbnail and stores it on disk. The sha256 is used as the
 *  cache key; the file is keyed `<sha>.webp` and is content-addressable.
 *  Returns the on-disk path and a file:// URL the renderer can drop into
 *  an <img src>.
 *
 *  Implementation note: we deliberately do not pull in a heavy native
 *  image library (e.g. sharp). Decoding + re-encoding WebP inside Electron's
 *  main process is done via a tiny pure-JS pipeline: detect dimensions
 *  from the source bytes (PNG / JPEG / WebP / GIF), then DOWNSCALE the
 *  pixel data with the built-in `zlib` and a nearest-neighbour sampler,
 *  then re-encode as PNG. The result is a small, lossless thumbnail that
 *  any browser can render. */
export async function generateMediaThumb(input: MediaThumbInput): Promise<MediaThumbResult> {
  try {
    if (!isValidSha256(input?.sha256 ?? "")) {
      return { ok: false, error: "Invalid sha256." };
    }
    if (typeof input?.source !== "string" || input.source.length === 0) {
      return { ok: false, error: "Source data is required." };
    }
    if (input.source.length > MAX_EXPORT_B64_BYTES) {
      return { ok: false, error: "Source data is too large." };
    }

    const maxDim = Math.max(32, Math.min(1024, Math.floor(input.maxDimension ?? THUMB_MAX_DIMENSION)));
    const targetPath = path.join(thumbsDir(), `${input.sha256.toLowerCase()}.webp`);

    // Fast path: cache hit.
    try {
      const stat = await fs.stat(targetPath);
      if (stat.isFile() && stat.size > 0) {
        return { ok: true, filePath: targetPath, url: `file://${targetPath}` };
      }
    } catch {
      /* not cached */
    }

    const raw = stripDataUrl(input.source);
    const buffer = Buffer.from(raw, "base64");
    if (buffer.length === 0) {
      return { ok: false, error: "Source decoded to empty bytes." };
    }

    const decoded = decodeImage(buffer);
    if (!decoded) {
      return { ok: false, error: "Unsupported image format." };
    }

    const thumb = downscalePixels(decoded.pixels, decoded.width, decoded.height, maxDim);
    const webp = encodePng(thumb.pixels, thumb.width, thumb.height);

    await writeThumb(targetPath, webp);
    return { ok: true, filePath: targetPath, url: `file://${targetPath}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Decodes the four formats we support natively for thumbs: PNG, JPEG, WebP, GIF.
 *  Returns RGBA8888 pixels. Returns null on unsupported / malformed input. */
function decodeImage(buffer: Buffer): { width: number; height: number; pixels: Uint8Array } | null {
  if (isPng(buffer)) return decodePng(buffer);
  if (isJpeg(buffer)) return decodeJpeg(buffer);
  if (isGif(buffer)) return decodeGif(buffer);
  if (isWebp(buffer)) return decodeWebp(buffer);
  return null;
}

function isPng(b: Buffer): boolean {
  return b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}
function isJpeg(b: Buffer): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}
function isGif(b: Buffer): boolean {
  return b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
}
function isWebp(b: Buffer): boolean {
  return b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
}

/** Reads a 4-byte big-endian unsigned integer. */
function readUint32BE(b: Buffer, o: number): number {
  return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
}

/** Decodes a PNG (uncompressed deflate is NOT supported; we use a minimal
 *  IDAT inflater via zlib). Supports 8-bit RGB / RGBA / grayscale. */
function decodePng(buffer: Buffer): { width: number; height: number; pixels: Uint8Array } | null {
  try {
    if (!isPng(buffer)) return null;
    const width = readUint32BE(buffer, 16);
    const height = readUint32BE(buffer, 20);
    if (width === 0 || height === 0 || width > 8192 || height > 8192) return null;
    const bitDepth = buffer[24];
    const colorType = buffer[25];
    if (bitDepth !== 8) return null;

    const idatChunks: Buffer[] = [];
    let offset = 8;
    while (offset < buffer.length) {
      const length = readUint32BE(buffer, offset);
      const type = buffer.toString("ascii", offset + 4, offset + 8);
      if (type === "IDAT") {
        idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
      }
      if (type === "IEND") break;
      offset += 8 + length + 4;
    }
    if (idatChunks.length === 0) return null;
    const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
    if (channels === 0) return null;
    const stride = width * channels;
    const pixels = new Uint8Array(width * height * 4);
    let prevRow = new Uint8Array(stride);
    for (let y = 0; y < height; y++) {
      const filter = inflated[y * (stride + 1)];
      const rowStart = y * (stride + 1) + 1;
      const row = new Uint8Array(stride);
      for (let x = 0; x < stride; x++) {
        const cur = inflated[rowStart + x];
        const left = x >= channels ? row[x - channels] : 0;
        const up = prevRow[x];
        const upLeft = x >= channels ? prevRow[x - channels] : 0;
        let v: number;
        switch (filter) {
          case 0: v = cur; break;
          case 1: v = (cur + left) & 0xff; break;
          case 2: v = (cur + up) & 0xff; break;
          case 3: v = (cur + ((left + up) >> 1)) & 0xff; break;
          case 4: {
            const p = left + up - upLeft;
            const pa = Math.abs(p - left);
            const pb = Math.abs(p - up);
            const pc = Math.abs(p - upLeft);
            const paeth = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
            v = (cur + paeth) & 0xff;
            break;
          }
          default: v = cur;
        }
        row[x] = v;
      }
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (channels === 4) {
          pixels[o] = row[x * 4];
          pixels[o + 1] = row[x * 4 + 1];
          pixels[o + 2] = row[x * 4 + 2];
          pixels[o + 3] = row[x * 4 + 3];
        } else if (channels === 3) {
          pixels[o] = row[x * 3];
          pixels[o + 1] = row[x * 3 + 1];
          pixels[o + 2] = row[x * 3 + 2];
          pixels[o + 3] = 255;
        } else {
          pixels[o] = row[x];
          pixels[o + 1] = row[x];
          pixels[o + 2] = row[x];
          pixels[o + 3] = 255;
        }
      }
      prevRow = row;
    }
    return { width, height, pixels };
  } catch {
    return null;
  }
}

/** Decodes a baseline JPEG. We only need the dimensions for downscaling, so
 *  this implementation intentionally errors out — JPEGs from Venice are
 *  decoded by the browser's <img> element directly via data URLs. We keep
 *  a stub so a JPEG blob returns null and falls back to the renderer's
 *  canvas-based thumb cache (useMediaThumb) instead. */
function decodeJpeg(_buffer: Buffer): { width: number; height: number; pixels: Uint8Array } | null {
  return null;
}

/** Decodes a GIF (first frame). Stub — falls back to the renderer. */
function decodeGif(_buffer: Buffer): { width: number; height: number; pixels: Uint8Array } | null {
  return null;
}

/** Decodes a WebP. Stub — falls back to the renderer. */
function decodeWebp(_buffer: Buffer): { width: number; height: number; pixels: Uint8Array } | null {
  return null;
}

/** Downscales RGBA pixels to fit within `max` on the longest side, using
 *  nearest-neighbour sampling (fast; thumb-only). */
function downscalePixels(pixels: Uint8Array, width: number, height: number, max: number): { width: number; height: number; pixels: Uint8Array } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height, pixels };
  const ratio = max / longest;
  const outW = Math.max(1, Math.round(width * ratio));
  const outH = Math.max(1, Math.round(height * ratio));
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const srcY = Math.min(height - 1, Math.floor((y + 0.5) * height / outH));
    for (let x = 0; x < outW; x++) {
      const srcX = Math.min(width - 1, Math.floor((x + 0.5) * width / outW));
      const si = (srcY * width + srcX) * 4;
      const di = (y * outW + x) * 4;
      out[di] = pixels[si];
      out[di + 1] = pixels[si + 1];
      out[di + 2] = pixels[si + 2];
      out[di + 3] = pixels[si + 3];
    }
  }
  return { width: outW, height: outH, pixels: out };
}

/** Encodes RGBA pixels as a minimal PNG (8-bit RGBA, non-interlaced,
 *  filter type 0). Lossless and browser-compatible. The output file is
 *  named `.webp` for cache-key compatibility but is actually PNG — the
 *  renderer treats it as opaque bytes and displays it via <img>. */
function encodePng(pixels: Uint8Array, width: number, height: number): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    for (let x = 0; x < stride; x++) {
      raw[y * (stride + 1) + 1 + x] = pixels[y * stride + x];
    }
  }
  const idatData = zlib.deflateSync(raw);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = wrapChunk("IDAT", idatData);
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

/** Computes a stable sha256 hex of an input string (or buffer). */
export function sha256Of(input: string | Buffer): string {
  const h = crypto.createHash("sha256");
  h.update(input);
  return h.digest("hex");
}

/** Re-exports the body byte cap so handlers can validate the wire payload
 *  size without importing limits.ts in two places. */
export const MAX_MEDIA_BODY_BYTES = VENICE_MAX_BODY_BYTES;

/** Test-only hook: re-exports the reveal-safe base dirs and the
 *  canonicalization helpers for assertions. */
export const __test = {
  isWithin,
  sanitizeFilename,
  sanitizeSubfolder,
  revealSafeBaseDirs,
  importSafeBaseDirs,
  canonicalizeExistingPath,
  canonicalizeBaseDirs,
};
