#!/usr/bin/env node
/**
 * checksum-release.cjs — generate SHA-256 sidecars for every packaged release
 * artifact. Invoked by the `checksum:release` npm script and by the GitHub
 * release workflow (macOS, Windows, Linux jobs).
 *
 * The allowlist MUST stay in lock-step with `scripts/verify-dist.cjs`. If
 * `verify-dist` ever asserts the existence of an artifact in `release/`, that
 * artifact must be in `CHECKSUMMED_RELEASE_EXTENSIONS` here — otherwise the
 * workflow will package, then `verify:dist` will fail with a missing sidecar.
 *
 * Regression guard: P0-001 / Phase 2J hardening. The Linux triple
 * (`.AppImage`, `.deb`, `.rpm`) was added in 2026-06-09 because the release
 * workflow had `verify:dist:linux` but the checksum script was not aware of
 * Linux artifact extensions.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CHECKSUMMED_RELEASE_EXTENSIONS = [
  // Windows
  ".exe",
  // macOS
  ".dmg",
  ".zip",
  // Updater metadata (Windows + macOS + Linux share the .yml/.blockmap shape)
  ".yml",
  ".yaml",
  ".blockmap",
  // Linux (P0-001)
  ".AppImage",
  ".deb",
  ".rpm",
];

// Helpers exported for unit tests so we can exercise the filter without
// invoking the script's I/O side-effects.
function isChecksummedArtifact(filename) {
  if (typeof filename !== "string") return false;
  if (filename.endsWith(".sha256")) return false;
  return CHECKSUMMED_RELEASE_EXTENSIONS.some((ext) => filename.endsWith(ext));
}

// Resolve the release directory from process.cwd() so the script can run in a
// fresh clone (CI), a developer checkout, or a temporary directory (tests).
// This matches the convention used by `scripts/verify-dist.cjs` and
// `scripts/verify-release-packaging-hardening.cjs`.
const root = process.cwd();
const releaseDir = path.join(root, "release");

if (require.main === module) {
  if (!fs.existsSync(releaseDir)) {
    console.log("[checksum:release] No release directory found. Skipping.");
    process.exit(0);
  }

  const files = fs.readdirSync(releaseDir);
  const artifacts = files.filter(isChecksummedArtifact);

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
}

module.exports = {
  CHECKSUMMED_RELEASE_EXTENSIONS,
  isChecksummedArtifact,
};
