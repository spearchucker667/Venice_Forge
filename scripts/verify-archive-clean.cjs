#!/usr/bin/env node
/**
 * verify-archive-clean.cjs
 *
 * Archive hygiene guard (P1 — Phase 2J hardening).
 * Fails if the working tree or a provided scan root contains AppleDouble,
 * macOS metadata, build/secret artifacts, local-only configs, or any other
 * contamination that must never end up in uploaded zips, source tarballs,
 * release artifacts, or GPT/shared source archives.
 *
 * Usage:
 *   node scripts/verify-archive-clean.cjs
 *   node scripts/verify-archive-clean.cjs --root /tmp/some-extract
 *   node scripts/verify-archive-clean.cjs --strict
 *
 * Exit 0 on clean; non-zero + diagnostic list on violations.
 *
 * Patterns (must not appear under the scan root):
 *   __MACOSX/, .DS_Store, ._* (AppleDouble), .AppleDouble/,
 *   Thumbs.db, desktop.ini, ._* (resource fork),
 *   node_modules/, dist/, dist-electron/, release/, coverage/, .integration-src/,
 *   .env (except .env.example), *.db, *.sqlite, *.log, *.tmp,
 *   chat-history/ (local desktop),
 *   .config/*.yaml (except examples), .config/*.local.yaml (explicit),
 *   .design-captures/ (dev-tool scratch), docs/AGENTS/ (agent scratch)
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const BAD_PATTERNS = [
  // macOS / AppleDouble / Windows metadata
  /__MACOSX\//,
  /(^|\/)\.DS_Store$/,
  /(^|\/)\._[^/]+$/,
  /\.AppleDouble\//,
  /(^|\/)Thumbs\.db$/i,
  /(^|\/)desktop\.ini$/i,
  // Generated build / test output (must never be archived)
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)dist-electron\//,
  /(^|\/)release\//,
  /(^|\/)coverage\//,
  /(^|\/)\.integration-src\//,
  /(^|\/)\.vite\//,
  /(^|\/)\.design-captures\//,
  // Secrets & local env (allow .env.example only)
  /(^|\/)\.env(?!(\.example)?$)/,
  /(^|\/)\.env\.(?!example$).+$/i, // .env.local, .env.development, .env.production, etc.
  // Database / cache / log files
  /(^|\/)[^/]+\.(db|sqlite|sqlite3)$/i,
  /(^|\/)[^/]+\.log$/i,
  /(^|\/)[^/]+\.tmp$/i,
  /(^|\/)chat-history\//,
  /(^|\/)target_inventory\.txt$/,
  // Local-only config (designer/operator secrets). Examples are explicit allowlist.
  /(^|\/)\.config\/(?!.*\.example\.(yaml|yml)).*\.(yaml|yml)$/,
  /(^|\/)\.config\/.*\.local\.(yaml|yml)$/,
  // Agent scratch space (gitignored, never archive)
  /(^|\/)docs\/AGENTS\//,
];

function walk(dir, root, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full).split(path.sep).join("/") + (e.isDirectory() ? "/" : "");
    if (BAD_PATTERNS.some((re) => re.test(rel) || re.test("/" + rel))) {
      out.push(rel);
    }
    if (e.isDirectory()) {
      walk(full, root, out);
    }
  }
}

function trackedPaths(root) {
  try {
    return execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  let root = process.cwd();
  let explicitRoot = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      root = path.resolve(args[i + 1]);
      explicitRoot = true;
      i++;
    }
  }

  const violations = [];
  const tracked = explicitRoot ? null : trackedPaths(root);
  if (tracked) {
    for (const rel of tracked) {
      if (BAD_PATTERNS.some((re) => re.test(rel) || re.test("/" + rel))) violations.push(rel);
    }
  } else {
    walk(root, root, violations);
  }

  if (violations.length > 0) {
    console.error("[verify-archive-clean] FAIL — forbidden paths present in scan root:");
    for (const v of violations.slice(0, 50)) {
      console.error("  " + v);
    }
    if (violations.length > 50) console.error(`  ... +${violations.length - 50} more`);
    console.error("\nThese must never be committed or included in archives/zips/GPT source drops:");
    console.error("  __MACOSX/  .DS_Store  ._*  .AppleDouble/  Thumbs.db  desktop.ini");
    console.error("  node_modules/  dist/  dist-electron/  release/  coverage/  .integration-src/  .vite/  .design-captures/");
    console.error("  .env*  (non-example),  .env.<name>  (e.g. .env.local, .env.development)");
    console.error("  *.db  *.sqlite*  *.log  *.tmp  chat-history/  target_inventory.txt");
    console.error("  .config/*.yaml  (non-example),  .config/*.local.yaml");
    console.error("  docs/AGENTS/  (gitignored agent scratch)");
    process.exit(1);
  }

  console.log(
    tracked
      ? "[verify:archive-clean] OK — no forbidden tracked archive contaminants under"
      : "[verify:archive-clean] OK — no forbidden archive contaminants under",
    root,
  );
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { BAD_PATTERNS }; // for test
