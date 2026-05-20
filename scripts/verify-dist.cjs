#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");

function requireFile(filePath, minBytes) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${path.relative(root, filePath)}`);
  const stat = fs.statSync(filePath);
  if (stat.size < minBytes) {
    throw new Error(`${path.relative(root, filePath)} is unexpectedly small (${stat.size} bytes)`);
  }
  return stat.size;
}

try {
  if (!fs.existsSync(releaseDir)) throw new Error("Missing release folder.");
  requireFile(path.join(root, "dist", "index.html"), 100);
  requireFile(path.join(root, "dist-electron", "main.js"), 1000);
  requireFile(path.join(root, "dist-electron", "package.json"), 10);
  requireFile(path.join(root, "build", "icon.ico"), 1024);

  const files = fs.readdirSync(releaseDir);
  const setup = files.find((name) => /^Venice-Forge-\d+\.\d+\.\d+-x64-Setup\.exe$/.test(name));
  const portable = files.find((name) => /^Venice-Forge-\d+\.\d+\.\d+-x64-Portable\.exe$/.test(name));
  if (!setup) throw new Error("Missing NSIS setup exe in release/.");
  if (!portable) throw new Error("Missing portable exe in release/.");
  requireFile(path.join(releaseDir, setup), 1024 * 1024);
  requireFile(path.join(releaseDir, portable), 1024 * 1024);

  console.log(`[verify:dist] OK setup=${setup} portable=${portable}`);
} catch (err) {
  console.error(`[verify:dist] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
