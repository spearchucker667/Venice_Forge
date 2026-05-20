#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const iconPath = path.join(__dirname, "..", "build", "icon.ico");

function fail(message) {
  console.error(`[verify:icon] ${message}`);
  console.error("[verify:icon] Run `npm run generate:icon` to create the placeholder, or replace build/icon.ico with the final Windows icon.");
  process.exit(1);
}

if (!fs.existsSync(iconPath)) fail("Missing build/icon.ico.");
const icon = fs.readFileSync(iconPath);
if (icon.length < 1024) fail("build/icon.ico is too small to be a valid Windows icon.");
if (icon.readUInt16LE(0) !== 0 || icon.readUInt16LE(2) !== 1 || icon.readUInt16LE(4) < 1) {
  fail("build/icon.ico does not have a valid ICO header.");
}

console.log(`[verify:icon] OK ${iconPath} (${icon.length} bytes)`);
