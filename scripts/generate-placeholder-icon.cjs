#!/usr/bin/env node
/**
 * generate-placeholder-icon.cjs — Generate app icons from the Venice seal SVG.
 *
 * Produces:
 *   build/icon.ico   (16, 32, 48, 256 — PNG-in-ICO format)
 *   build/icon.icns  (128, 256, 512, 1024 — via macOS iconutil)
 *   build/icon.png   (512×512 — Linux / BrowserWindow runtime icon)
 *
 * Prerequisites:
 *   - rsvg-convert (from librsvg; `brew install librsvg`)
 *   - iconutil (macOS-native, ships with Xcode CLI tools)
 *
 * Fallback:
 *   If rsvg-convert is unavailable, the script falls back to the original
 *   procedural placeholder generator (teal/amber diagonal lines) so that
 *   CI environments without librsvg can still produce valid icon binaries.
 *
 * Usage:
 *   node scripts/generate-placeholder-icon.cjs
 *   npm run generate:icon
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const SVG_SOURCE = path.join(ROOT, "assets", "branding", "venice-seal-red-fill.svg");
const BUILD_DIR = path.join(ROOT, "build");
const outIcoPath = path.join(BUILD_DIR, "icon.ico");
const outIcnsPath = path.join(BUILD_DIR, "icon.icns");
const outPngPath = path.join(BUILD_DIR, "icon.png");

fs.mkdirSync(BUILD_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Check if rsvg-convert is available
// ---------------------------------------------------------------------------
function hasRsvgConvert() {
  try {
    execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasIconutil() {
  try {
    execFileSync("which", ["iconutil"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// SVG-based generation (preferred path)
// ---------------------------------------------------------------------------
function rsvgRasterize(svgPath, size, outPath) {
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), svgPath, "-o", outPath], { stdio: "ignore" });
}

function buildIcoFromPngs(pngPaths) {
  // Modern ICO: embed raw PNGs (supported by Windows Vista+)
  const pngs = pngPaths.map((p) => ({ data: fs.readFileSync(p.path), size: p.size }));
  const headerSize = 6 + pngs.length * 16;
  let dataOffset = headerSize;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const entries = Buffer.alloc(pngs.length * 16);
  for (let i = 0; i < pngs.length; i++) {
    const off = i * 16;
    entries[off] = pngs[i].size === 256 ? 0 : pngs[i].size;
    entries[off + 1] = pngs[i].size === 256 ? 0 : pngs[i].size;
    entries[off + 2] = 0;
    entries[off + 3] = 0;
    entries.writeUInt16LE(1, off + 4);
    entries.writeUInt16LE(32, off + 6);
    entries.writeUInt32LE(pngs[i].data.length, off + 8);
    entries.writeUInt32LE(dataOffset, off + 12);
    dataOffset += pngs[i].data.length;
  }

  return Buffer.concat([header, entries, ...pngs.map((p) => p.data)]);
}

function generateFromSvg() {
  console.log(`[generate:icon] Source: ${path.relative(ROOT, SVG_SOURCE)}`);

  const tmpDir = path.join(BUILD_DIR, ".icon-tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Rasterize all needed sizes
    const icoSizes = [16, 32, 48, 256];
    const icnsSizes = [
      { size: 16, name: "icon_16x16.png" },
      { size: 32, name: "icon_16x16@2x.png" },
      { size: 32, name: "icon_32x32.png" },
      { size: 64, name: "icon_32x32@2x.png" },
      { size: 128, name: "icon_128x128.png" },
      { size: 256, name: "icon_128x128@2x.png" },
      { size: 256, name: "icon_256x256.png" },
      { size: 512, name: "icon_256x256@2x.png" },
      { size: 512, name: "icon_512x512.png" },
      { size: 1024, name: "icon_512x512@2x.png" },
    ];

    const allSizes = new Set([
      ...icoSizes,
      ...icnsSizes.map((s) => s.size),
      512, // icon.png
    ]);

    for (const size of allSizes) {
      const outPath = path.join(tmpDir, `icon-${size}.png`);
      if (!fs.existsSync(outPath)) {
        rsvgRasterize(SVG_SOURCE, size, outPath);
      }
    }

    // --- icon.png (512×512) ---
    fs.copyFileSync(path.join(tmpDir, "icon-512.png"), outPngPath);
    console.log(`[generate:icon] Generated ${outPngPath}`);

    // --- icon.ico ---
    const icoPngs = icoSizes.map((size) => ({
      size,
      path: path.join(tmpDir, `icon-${size}.png`),
    }));
    fs.writeFileSync(outIcoPath, buildIcoFromPngs(icoPngs));
    console.log(`[generate:icon] Generated ${outIcoPath}`);

    // --- icon.icns ---
    if (hasIconutil()) {
      const iconsetDir = path.join(tmpDir, "icon.iconset");
      fs.mkdirSync(iconsetDir, { recursive: true });
      for (const entry of icnsSizes) {
        fs.copyFileSync(
          path.join(tmpDir, `icon-${entry.size}.png`),
          path.join(iconsetDir, entry.name)
        );
      }
      execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", outIcnsPath], { stdio: "inherit" });
      console.log(`[generate:icon] Generated ${outIcnsPath}`);
    } else {
      // Fallback: build ICNS manually (same approach as the old script)
      buildIcnsFromPngs(tmpDir);
      console.log(`[generate:icon] Generated ${outIcnsPath} (manual builder — iconutil unavailable)`);
    }
  } finally {
    // Clean up tmp
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Manual ICNS builder (fallback when iconutil is unavailable)
// ---------------------------------------------------------------------------
function buildIcnsFromPngs(tmpDir) {
  const targets = [
    { type: "ic07", size: 128 },
    { type: "ic08", size: 256 },
    { type: "ic09", size: 512 },
    { type: "ic10", size: 1024 },
  ];

  const pngs = targets.map((t) => ({
    type: t.type,
    data: fs.readFileSync(path.join(tmpDir, `icon-${t.size}.png`)),
  }));

  let totalSize = 8;
  for (const png of pngs) totalSize += 8 + png.data.length;

  const fileBuf = Buffer.alloc(totalSize);
  fileBuf.write("icns", 0, "ascii");
  fileBuf.writeUInt32BE(totalSize, 4);

  let offset = 8;
  for (const png of pngs) {
    fileBuf.write(png.type, offset, "ascii");
    fileBuf.writeUInt32BE(8 + png.data.length, offset + 4);
    png.data.copy(fileBuf, offset + 8);
    offset += 8 + png.data.length;
  }

  fs.writeFileSync(outIcnsPath, fileBuf);
}

// ---------------------------------------------------------------------------
// Procedural fallback (original placeholder generator)
// ---------------------------------------------------------------------------
// CRC32 for PNG chunk construction
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function generatePng(size, getPixel) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk("IHDR", ihdrData);

  const rowSize = 1 + size * 4;
  const rawBytes = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawBytes[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      const pixel = getPixel(x, y, size);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawBytes[pixelOffset] = pixel[0];
      rawBytes[pixelOffset + 1] = pixel[1];
      rawBytes[pixelOffset + 2] = pixel[2];
      rawBytes[pixelOffset + 3] = pixel[3];
    }
  }

  const compressed = zlib.deflateSync(rawBytes);
  const idat = makeChunk("IDAT", compressed);
  const iend = makeChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function getPixelColor(x, y, size) {
  const bg = [24, 31, 46, 255];
  const teal = [20, 184, 166, 255];
  const amber = [245, 158, 11, 255];
  const pad = Math.max(2, Math.round(size * 0.14));
  const stroke = Math.max(2, Math.round(size * 0.11));
  const topY = y;
  const leftLine = Math.abs(x - (pad + topY * 0.34)) < stroke;
  const rightLine = Math.abs(x - (size - pad - topY * 0.34)) < stroke;
  const inLower = topY > size * 0.18 && topY < size * 0.84;
  return inLower && (leftLine || rightLine) ? (leftLine ? teal : amber) : bg;
}

function generateFallback() {
  console.log("[generate:icon] WARNING: rsvg-convert not found. Generating procedural placeholder icons.");
  console.log("[generate:icon] Install librsvg (brew install librsvg) for branded Venice icons.");

  // ICO (DIB format for small sizes)
  const icoSizes = [16, 32, 48, 256];
  function dibForSize(size) {
    const colorBytes = size * size * 4;
    const maskRowBytes = Math.ceil(size / 32) * 4;
    const maskBytes = maskRowBytes * size;
    const dib = Buffer.alloc(40 + colorBytes + maskBytes);
    dib.writeUInt32LE(40, 0);
    dib.writeInt32LE(size, 4);
    dib.writeInt32LE(size * 2, 8);
    dib.writeUInt16LE(1, 12);
    dib.writeUInt16LE(32, 14);
    dib.writeUInt32LE(0, 16);
    dib.writeUInt32LE(colorBytes + maskBytes, 20);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const topY = size - 1 - y;
        const off = 40 + (y * size + x) * 4;
        const color = getPixelColor(x, topY, size);
        dib[off] = color[2];
        dib[off + 1] = color[1];
        dib[off + 2] = color[0];
        dib[off + 3] = color[3];
      }
    }
    return dib;
  }

  const images = icoSizes.map((size) => ({ size, data: dibForSize(size) }));
  const headerBytes = 6 + images.length * 16;
  let offset = headerBytes;
  const ico = Buffer.alloc(headerBytes + images.reduce((sum, img) => sum + img.data.length, 0));
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(images.length, 4);
  images.forEach((img, index) => {
    const entry = 6 + index * 16;
    ico[entry] = img.size === 256 ? 0 : img.size;
    ico[entry + 1] = img.size === 256 ? 0 : img.size;
    ico[entry + 2] = 0;
    ico[entry + 3] = 0;
    ico.writeUInt16LE(1, entry + 4);
    ico.writeUInt16LE(32, entry + 6);
    ico.writeUInt32LE(img.data.length, entry + 8);
    ico.writeUInt32LE(offset, entry + 12);
    img.data.copy(ico, offset);
    offset += img.data.length;
  });
  fs.writeFileSync(outIcoPath, ico);
  console.log(`[generate:icon] Generated ${outIcoPath}`);

  // ICNS
  const icnsTargets = [
    { type: "ic07", size: 128 },
    { type: "ic08", size: 256 },
    { type: "ic09", size: 512 },
    { type: "ic10", size: 1024 },
  ];
  const pngs = icnsTargets.map((t) => ({
    type: t.type,
    data: generatePng(t.size, getPixelColor),
  }));
  let totalSize = 8;
  for (const png of pngs) totalSize += 8 + png.data.length;
  const fileBuf = Buffer.alloc(totalSize);
  fileBuf.write("icns", 0, "ascii");
  fileBuf.writeUInt32BE(totalSize, 4);
  let icnsOffset = 8;
  for (const png of pngs) {
    fileBuf.write(png.type, icnsOffset, "ascii");
    fileBuf.writeUInt32BE(8 + png.data.length, icnsOffset + 4);
    png.data.copy(fileBuf, icnsOffset + 8);
    icnsOffset += 8 + png.data.length;
  }
  fs.writeFileSync(outIcnsPath, fileBuf);
  console.log(`[generate:icon] Generated ${outIcnsPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
if (fs.existsSync(SVG_SOURCE) && hasRsvgConvert()) {
  generateFromSvg();
} else {
  generateFallback();
}
