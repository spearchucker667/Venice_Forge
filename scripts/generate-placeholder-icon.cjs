#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const outPath = path.join(__dirname, "..", "build", "icon.ico");
const sizes = [16, 32, 48, 256];

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
  const images = sizes.map((size) => ({ size, data: dibForSize(size) }));
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

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buildIco());
console.log(`Generated ${outPath}`);
