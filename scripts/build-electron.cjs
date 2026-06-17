#!/usr/bin/env node
/**
 * Bundles the Electron main process and preload script with esbuild.
 *
 * This prevents compiled renderer source code from leaking into dist-electron/src/
 * (the legacy tsc build copied every src/ module imported by electron/).  Both
 * entry points are emitted as CommonJS so the dist-electron/package.json
 * "type": "commonjs" wrapper continues to work.
 */
const { build } = require("esbuild");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outdir = path.join(root, "dist-electron", "electron");

const sharedConfig = {
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  external: ["electron"],
  logOverride: { "empty-import-meta": "silent" },
  sourcemap: false,
};

async function main() {
  // Remove stale output so a previous tsc build cannot leave unbundled service
  // files next to the bundled main/preload entry points.
  if (fs.existsSync(outdir)) {
    fs.rmSync(outdir, { recursive: true, force: true });
  }
  const staleSrc = path.join(root, "dist-electron", "src");
  if (fs.existsSync(staleSrc)) {
    fs.rmSync(staleSrc, { recursive: true, force: true });
  }
  fs.mkdirSync(outdir, { recursive: true });

  await Promise.all([
    build({
      ...sharedConfig,
      entryPoints: [path.join(root, "electron", "main.ts")],
      outfile: path.join(outdir, "main.js"),
    }),
    build({
      ...sharedConfig,
      entryPoints: [path.join(root, "electron", "preload.ts")],
      outfile: path.join(outdir, "preload.js"),
    }),
  ]);

  console.log("[build:electron] Bundled main + preload to dist-electron/electron/");
}

main().catch((err) => {
  console.error("[build:electron] Failed:", err);
  process.exit(1);
});
