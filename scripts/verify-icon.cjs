#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const icoPath = path.join(__dirname, "..", "build", "icon.ico");
const icnsPath = path.join(__dirname, "..", "build", "icon.icns");

function fail(message) {
  console.error(`[verify:icon] ${message}`);
  console.error("[verify:icon] Run `npm run generate:icon` to recreate the placeholders.");
  process.exit(1);
}

// Verify ICO
if (!fs.existsSync(icoPath)) fail("Missing build/icon.ico.");
const ico = fs.readFileSync(icoPath);
if (ico.length < 1024) fail("build/icon.ico is too small to be a valid Windows icon.");
if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) < 1) {
  fail("build/icon.ico does not have a valid ICO header.");
}
console.log(`[verify:icon] ICO OK: ${icoPath} (${ico.length} bytes)`);

// Verify ICNS
if (!fs.existsSync(icnsPath)) fail("Missing build/icon.icns.");
const icns = fs.readFileSync(icnsPath);
if (icns.length < 1024) fail("build/icon.icns is too small to be a valid macOS icon.");
if (icns.toString("ascii", 0, 4) !== "icns") {
  fail("build/icon.icns does not have a valid ICNS header.");
}
console.log(`[verify:icon] ICNS OK: ${icnsPath} (${icns.length} bytes)`);
