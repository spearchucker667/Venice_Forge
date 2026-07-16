#!/usr/bin/env node
const { existsSync, readFileSync } = require("node:fs");
const codecPath = "electron/services/characterCardPngCodec.ts";
if (!existsSync(codecPath)) throw new Error("Main-process character-card PNG codec is missing.");
const codec = readFileSync(codecPath, "utf8");
for (const token of ["crc32", "MAX_PNG_BYTES", "MAX_METADATA_BYTES", "TextDecoder", "fatal: true", "IEND", "inspectCharacterCardPng(output)"]) if (!codec.includes(token)) throw new Error(`PNG codec hardening missing ${token}`);
for (const fixture of ["basic-v2.png", "non-ascii-v2.png", "malformed-chunk.png", "oversized-metadata.png"]) if (!existsSync(`tests/fixtures/character-cards/png/${fixture}`)) throw new Error(`Missing PNG fixture: ${fixture}`);
const rendererFiles = ["src/services/desktopBridge.ts", "src/components/rp-studio/CharacterLibrary.tsx", "src/components/rp-studio/CharacterEditor.tsx"];
for (const file of rendererFiles) {
  const content = readFileSync(file, "utf8");
  if (/from ["'](?:node:)?fs/.test(content) || content.includes("characterCardPngCodec")) throw new Error(`Renderer PNG boundary violated in ${file}`);
}
console.log("[verify:character-card-png] OK");
