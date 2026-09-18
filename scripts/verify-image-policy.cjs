#!/usr/bin/env node
/**
 * verify-image-policy.cjs
 *
 * Phase 2J Image Policy guard (VERIFY-053).
 * Static audit of the source tree to ensure PNG/JPEG/WEBP normalization
 * across user ingress paths while allowing byte-validated AVIF and GIF from
 * the Venice avatar CDN.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const violations = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mustContain(rel, fragments, label) {
  const text = read(rel);
  for (const f of fragments) {
    if (!text.includes(f)) {
      violations.push(`${rel}: missing ${label || "fragment"} ${JSON.stringify(f)}`);
    }
  }
}

function mustNotContain(rel, fragments, label) {
  const text = read(rel);
  for (const f of fragments) {
    if (text.includes(f)) {
      violations.push(`${rel}: contains forbidden ${label || "fragment"} ${JSON.stringify(f)}`);
    }
  }
}

function main() {
  const POLICY_TYPES = ["image/png", "image/jpeg", "image/webp"];
  const CHARACTER_CACHE_TYPES = [...POLICY_TYPES, "image/avif", "image/gif"];
  const ACCEPT_LIST = "image/png,image/jpeg,image/webp";

  // 1. attachmentService.ts (canonical set)
  mustContain("src/services/attachmentService.ts", POLICY_TYPES, "supported image types");
  mustNotContain("src/services/attachmentService.ts", ["image/gif", "image/avif"], "legacy/modern image types");

  // 2. mediaService.ts (Electron import/thumb)
  mustContain("electron/services/mediaService.ts", POLICY_TYPES, "mediaService supported types");
  mustNotContain("electron/services/mediaService.ts", ["image/gif", "decodeGif", "isGif"], "GIF support");

  // 3. characterImageCache.ts (Venice avatar cache)
  mustContain("electron/services/characterImageCache.ts", [
    ...CHARACTER_CACHE_TYPES,
    "detectImageFormat",
    "FORMAT_MAGIC",
  ], "byte-validated character cache types");

  // 4. Canonical native media Save As validation boundary
  mustContain("electron/services/generatedMediaExport.ts", [
    "mediaBytesMatchMime",
    "saveGeneratedMediaBytesAs",
    "saveGeneratedMediaAs",
    "saveDataUrlAs",
  ], "canonical media Save As validation boundary");
  mustNotContain("electron/ipc/handlers/fileHandlers.ts", [
    "app:saveRoutedImage",
    "app:media:export\"",
  ], "obsolete fixed-folder media writers");

  // 5. Component Accept Lists
  mustContain("src/components/image/image-tools.tsx", [`accept="${ACCEPT_LIST}"`], "image-tools accept list");
  mustContain("src/components/video/video-view.tsx", [`accept="${ACCEPT_LIST}"`], "video-view accept list");

  if (violations.length > 0) {
    console.error("[verify:image-policy] FAIL — Image policy drift detected:");
    for (const v of violations) {
      console.error("  " + v);
    }
    process.exit(1);
  }

  console.log("[verify:image-policy] OK — ingress uses PNG/JPEG/WEBP and the Venice avatar cache also permits byte-validated AVIF/GIF.");
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
