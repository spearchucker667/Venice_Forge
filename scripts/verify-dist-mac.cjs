#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

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

try {
  if (!fs.existsSync(releaseDir)) throw new Error("Missing release folder.");
  requireFile(path.join(root, "dist", "index.html"), 100);
  requireFile(path.join(root, "dist-electron", "electron", "main.js"), 1000);
  requireFile(path.join(root, "dist-electron", "package.json"), 10);
  requireFile(path.join(root, "build", "icon.icns"), 1024);

  const files = fs.readdirSync(releaseDir);
  
  // Determine which archs to check.
  const args = process.argv.slice(2);
  let archs = [];
  if (args.includes("--arm64")) {
    archs = ["arm64"];
  } else if (args.includes("--x64")) {
    archs = ["x64"];
  } else {
    // If no arch is passed, verify whatever targets exist, but require at least one.
    const hasArm64 = files.some(f => f.includes("-arm64.dmg"));
    const hasX64 = files.some(f => f.includes("-x64.dmg"));
    if (hasArm64) archs.push("arm64");
    if (hasX64) archs.push("x64");
    if (archs.length === 0) {
      // Default to both on CI
      archs = ["x64", "arm64"];
    }
  }

  for (const arch of archs) {
    const dmgPattern = new RegExp(`^Venice-Forge-${escapedVersion}-${arch}\\.dmg$`);
    const zipPattern = new RegExp(`^Venice-Forge-${escapedVersion}-${arch}\\.zip$`);
    const dmg = files.find((name) => dmgPattern.test(name));
    const zip = files.find((name) => zipPattern.test(name));

    if (!dmg) throw new Error(`Missing DMG for arch ${arch} in release/.`);
    if (!zip) throw new Error(`Missing ZIP for arch ${arch} in release/.`);

    requireFile(path.join(releaseDir, dmg), 5 * 1024 * 1024); // DMG is typically >5MB
    requireFile(path.join(releaseDir, zip), 5 * 1024 * 1024); // ZIP is typically >5MB
    requireFile(path.join(releaseDir, `${dmg}.sha256`), 32);
    requireFile(path.join(releaseDir, `${zip}.sha256`), 32);
  }

  console.log(`[verify:dist:mac] OK checked architectures: ${archs.join(", ")}`);
} catch (err) {
  console.error(`[verify:dist:mac] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
