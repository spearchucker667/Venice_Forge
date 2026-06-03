#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");

if (!fs.existsSync(releaseDir)) {
  console.log("[checksum:release] No release directory found. Skipping.");
  process.exit(0);
}

const files = fs.readdirSync(releaseDir);
const artifacts = files.filter((f) => {
  if (f.endsWith(".sha256")) return false;
  return (
    f.endsWith(".exe") ||
    f.endsWith(".dmg") ||
    f.endsWith(".zip") ||
    f.endsWith(".yml") ||
    f.endsWith(".blockmap")
  );
});

if (artifacts.length === 0) {
  console.log("[checksum:release] No release artifacts found to checksum.");
  process.exit(0);
}

(async () => {
  for (const artifact of artifacts) {
    const filePath = path.join(releaseDir, artifact);
    const sidecarPath = `${filePath}.sha256`;

    const hashSum = crypto.createHash("sha256");
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => hashSum.update(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const hex = hashSum.digest("hex");

    const content = `${hex}  ${artifact}\n`;
    fs.writeFileSync(sidecarPath, content, "ascii");
    console.log(`[checksum:release] Wrote ${artifact}.sha256`);
  }
})();
