#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function requireFile(filePath, minBytes) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${path.relative(root, filePath)}`);
  const stat = fs.statSync(filePath);
  if (stat.size < minBytes) {
    throw new Error(`${path.relative(root, filePath)} is unexpectedly small (${stat.size} bytes)`);
  }
  return stat.size;
}

function verifyChecksum(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  const actualHash = hash.digest("hex");
  
  const checksumFile = `${filePath}.sha256`;
  if (!fs.existsSync(checksumFile)) throw new Error(`Missing checksum file for ${path.basename(filePath)}`);
  
  const checksumContent = fs.readFileSync(checksumFile, "utf8").trim();
  const expectedHash = checksumContent.split(/\s+/)[0];
  
  if (actualHash !== expectedHash) {
    throw new Error(`Checksum mismatch for ${path.basename(filePath)}! Expected ${expectedHash}, got ${actualHash}`);
  }
}

try {
  if (!fs.existsSync(releaseDir)) throw new Error("Missing release folder.");
  requireFile(path.join(root, "dist", "index.html"), 100);
  requireFile(path.join(root, "dist-electron", "electron", "main.js"), 1000);
  requireFile(path.join(root, "dist-electron", "package.json"), 10);
  requireFile(path.join(root, "build", "icon.ico"), 1024);

  const files = fs.readdirSync(releaseDir);
  const args = process.argv.slice(2);
  
  // Decide what to verify based on targets built
  const checkSetup = !args.includes("--portable");
  const checkPortable = !args.includes("--win"); // if --win only, check setup

  if (checkSetup) {
    const setupPattern = new RegExp(`^Venice-Forge-${escapedVersion}-x64-Setup\\.exe$`);
    const setup = files.find((name) => setupPattern.test(name));
    if (!setup) throw new Error("Missing NSIS setup exe in release/.");
    requireFile(path.join(releaseDir, setup), 1024 * 1024);
    verifyChecksum(path.join(releaseDir, setup));
  }

  if (checkPortable) {
    const portablePattern = new RegExp(`^Venice-Forge-${escapedVersion}-x64-Portable\\.exe$`);
    const portable = files.find((name) => portablePattern.test(name));
    if (!portable) throw new Error("Missing portable exe in release/.");
    requireFile(path.join(releaseDir, portable), 1024 * 1024);
    verifyChecksum(path.join(releaseDir, portable));
  }

  console.log(`[verify:dist:win] OK`);
} catch (err) {
  console.error(`[verify:dist:win] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
