#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outIcoPath = path.join(__dirname, "..", "build", "icon.ico");
const outIcnsPath = path.join(__dirname, "..", "build", "icon.icns");

// --- CRC32 Calculation for PNG Chunks ---
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

// --- PNG Generator ---
function generatePng(size, getPixel) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: RGBA (6)
  ihdrData[10] = 0; // Compression: deflate
  ihdrData[11] = 0; // Filter: none
  ihdrData[12] = 0; // Interlace: none
  const ihdr = makeChunk("IHDR", ihdrData);

  const rowSize = 1 + size * 4;
  const rawBytes = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawBytes[rowOffset] = 0; // Filter type 0
    for (let x = 0; x < size; x++) {
      const pixel = getPixel(x, y, size);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawBytes[pixelOffset] = pixel[0]; // R
      rawBytes[pixelOffset + 1] = pixel[1]; // G
      rawBytes[pixelOffset + 2] = pixel[2]; // B
      rawBytes[pixelOffset + 3] = pixel[3]; // A
    }
  }

  const compressed = zlib.deflateSync(rawBytes);
  const idat = makeChunk("IDAT", compressed);
  const iend = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// --- Visual Logo Color Generator ---
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

// --- ICO Generator (Unchanged) ---
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

  const bg = [24, 31, 46, 255];
  const teal = [20, 184, 166, 255];
  const amber = [245, 158, 11, 255];
  const pad = Math.max(2, Math.round(size * 0.14));
  const stroke = Math.max(2, Math.round(size * 0.11));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const topY = size - 1 - y;
      const off = 40 + (y * size + x) * 4;
      const leftLine = Math.abs(x - (pad + topY * 0.34)) < stroke;
      const rightLine = Math.abs(x - (size - pad - topY * 0.34)) < stroke;
      const inLower = topY > size * 0.18 && topY < size * 0.84;
      const color = inLower && (leftLine || rightLine) ? (leftLine ? teal : amber) : bg;
      dib[off] = color[2];
      dib[off + 1] = color[1];
      dib[off + 2] = color[0];
      dib[off + 3] = color[3];
    }
  }

  return dib;
}

function buildIco() {
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

  return ico;
}

// --- ICNS Generator ---
function buildIcns() {
  const targets = [
    { type: "ic07", size: 128 },
    { type: "ic08", size: 256 },
    { type: "ic09", size: 512 },
    { type: "ic10", size: 1024 },
  ];

  const pngs = targets.map((target) => ({
    type: target.type,
    data: generatePng(target.size, getPixelColor),
  }));

  let totalSize = 8;
  for (const png of pngs) {
    totalSize += 8 + png.data.length;
  }

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

  return fileBuf;
}

// --- Write Outputs ---
fs.mkdirSync(path.dirname(outIcoPath), { recursive: true });

// Write ICO
fs.writeFileSync(outIcoPath, buildIco());
console.log(`Generated ${outIcoPath}`);

// Write ICNS
fs.writeFileSync(outIcnsPath, buildIcns());
console.log(`Generated ${outIcnsPath}`);
