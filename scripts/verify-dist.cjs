#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2);
const verifyRelease = args.some((arg) => ["--win", "--mac", "--all", "--portable", "--release"].includes(arg));

/** Logic extracted for unit testing */
function getTargets(platform, args) {
  const checkWin =
    args.includes("--win") ||
    args.includes("--all") ||
    (!args.includes("--mac") && platform === "win32") ||
    (args.length === 0 && platform === "win32");
  const checkMac =
    args.includes("--mac") ||
    args.includes("--all") ||
    (!args.includes("--win") && platform === "darwin") ||
    (args.length === 0 && platform === "darwin");

  let targetArches = ["x64", "arm64"];
  const archIdx = args.indexOf("--arch");
  const noExplicitPlatform =
    !args.includes("--win") && !args.includes("--mac") && !args.includes("--all");
  if (archIdx !== -1 && archIdx + 1 < args.length) {
    targetArches = [args[archIdx + 1]];
  } else if (args.includes("--all")) {
    targetArches = ["x64", "arm64"];
  } else if (noExplicitPlatform && platform === "win32") {
    targetArches = ["x64"];
  }
  return { checkWin, checkMac, targetArches };
}

if (require.main !== module) {
  module.exports = { getTargets };
} else {

const { checkWin, checkMac, targetArches } = getTargets(process.platform, args);

const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const version = pkg.version;

function fail(msg) {
  console.error(`[verify:dist] FAIL: ${msg}`);
  process.exit(1);
}

function verifyFileExists(filePath, minSize = 0) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${path.relative(root, filePath)}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size < minSize) {
    fail(`File too small: ${path.relative(root, filePath)} (Size: ${stat.size} bytes, Expected at least: ${minSize} bytes)`);
  }
  return true;
}

function verifyChecksum(filePath) {
  const sidecar = `${filePath}.sha256`;
  if (!fs.existsSync(sidecar)) {
    fail(`Missing checksum sidecar for ${path.basename(filePath)}`);
  }
  const expectedHash = fs.readFileSync(sidecar, "ascii").split(" ")[0].trim();
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  const actualHash = hashSum.digest("hex");
  if (expectedHash !== actualHash) {
    fail(`Checksum mismatch for ${path.basename(filePath)}. Expected: ${expectedHash}, Actual: ${actualHash}`);
  }
}

console.log(`[verify:dist] Starting verification for version ${version}`);

// Base build validation
verifyFileExists(path.join(root, "dist", "index.html"), 100);
verifyFileExists(path.join(root, "dist", "server.cjs"), 1000);
verifyFileExists(path.join(root, "dist-electron", "electron", "main.js"), 1000);
verifyFileExists(path.join(root, "dist-electron", "package.json"), 20);

if (!verifyRelease) {
  console.log("[verify:dist] Successfully verified build outputs.");
  process.exit(0);
}

const releaseDir = path.join(root, "release");
if (!fs.existsSync(releaseDir)) fail("Missing release directory.");

const verified = [];

if (checkWin) {
  console.log("[verify:dist] Verifying Windows artifacts...");
  verifyFileExists(path.join(root, "build", "icon.ico"), 1024);
  const isPortableOnly = args.includes("--portable") && !args.includes("--all");

  const winArches = targetArches.includes("x64") ? ["x64"] : []; // Windows is only x64 for now
  for (const arch of winArches) {
    if (!isPortableOnly) {
      const setupExe = path.join(releaseDir, `Venice-Forge-${version}-${arch}-Setup.exe`);
      verifyFileExists(setupExe, 1024 * 1024 * 10); // 10MB min
      verifyChecksum(setupExe);
      verified.push(`Venice-Forge-${version}-${arch}-Setup.exe`);
    }

    const portableExe = path.join(releaseDir, `Venice-Forge-${version}-${arch}-Portable.exe`);
    verifyFileExists(portableExe, 1024 * 1024 * 10);
    verifyChecksum(portableExe);
    verified.push(`Venice-Forge-${version}-${arch}-Portable.exe`);
  }

  const latestYml = path.join(releaseDir, "latest.yml");
  verifyFileExists(latestYml, 50);
  verified.push("latest.yml");

  const blockmapFiles = fs.readdirSync(releaseDir).filter((f) => f.endsWith(".blockmap"));
  if (blockmapFiles.length === 0) {
    fail("Missing .blockmap file(s) for Windows updater metadata.");
  }
  blockmapFiles.forEach((f) => {
    verifyFileExists(path.join(releaseDir, f), 50);
    verified.push(f);
  });
}

if (checkMac) {
  console.log("[verify:dist] Verifying macOS artifacts...");
  verifyFileExists(path.join(root, "build", "icon.icns"), 1024);

  for (const arch of targetArches) {
    const dmg = path.join(releaseDir, `Venice-Forge-${version}-${arch}.dmg`);
    verifyFileExists(dmg, 1024 * 1024 * 10); // 10MB min
    verifyChecksum(dmg);
    verified.push(`Venice-Forge-${version}-${arch}.dmg`);

    const zip = path.join(releaseDir, `Venice-Forge-${version}-${arch}.zip`);
    verifyFileExists(zip, 1024 * 1024 * 10);
    verifyChecksum(zip);
    verified.push(`Venice-Forge-${version}-${arch}.zip`);
  }

  const latestMacYml = path.join(releaseDir, "latest-mac.yml");
  verifyFileExists(latestMacYml, 50);
  verified.push("latest-mac.yml");

  const macBlockmapFiles = fs.readdirSync(releaseDir).filter((f) => f.endsWith(".blockmap"));
  if (macBlockmapFiles.length === 0) {
    fail("Missing .blockmap file(s) for macOS updater metadata.");
  }
  macBlockmapFiles.forEach((f) => {
    verifyFileExists(path.join(releaseDir, f), 50);
    verified.push(f);
  });
}

console.log("[verify:dist] Successfully verified artifacts:");
verified.forEach((v) => console.log(`  - ${v}`));
}
