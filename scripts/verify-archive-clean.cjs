#!/usr/bin/env node
/**
 * verify-archive-clean.cjs
 *
 * Archive hygiene guard (P1).
 * Fails if the working tree or a provided scan root contains AppleDouble,
 * macOS metadata, or build/secret artifacts that must never be included in
 * uploaded zips, source tarballs, or release artifacts.
 *
 * Usage:
 *   node scripts/verify-archive-clean.cjs
 *   node scripts/verify-archive-clean.cjs --root /tmp/some-extract
 *
 * Exit 0 on clean; non-zero + diagnostic list on violations.
 *
 * Patterns (must not appear under the scan root):
 *   __MACOSX/, .DS_Store, ._* (AppleDouble), .AppleDouble/,
 *   node_modules/, dist/, dist-electron/, release/, coverage/,
 *   .env (except .env.example), *.db, *.sqlite, chat-history/ (local desktop),
 *   .config/*.yaml (except examples)
 */

const fs = require("fs");
const path = require("path");

const BAD_PATTERNS = [
  /__MACOSX\//,
  /(^|\/)\.DS_Store$/,
  /(^|\/)\._[^/]+$/,
  /\.AppleDouble\//,
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)dist-electron\//,
  /(^|\/)release\//,
  /(^|\/)coverage\//,
  /(^|\/)\.env(?!(\.example)?$)/, // .env and .env.local etc., but allow .env.example
  /(^|\/)[^/]+\.(db|sqlite|sqlite3)$/i,
  /(^|\/)chat-history\//,
  /(^|\/)\.config\/(?!.*\.example\.(yaml|yml)).*\.(yaml|yml)$/,
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

function main() {
  const args = process.argv.slice(2);
  let root = process.cwd();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      root = path.resolve(args[i + 1]);
      i++;
    }
  }

  const violations = [];
  walk(root, root, violations);

  if (violations.length > 0) {
    console.error("[verify:archive-clean] FAIL — forbidden paths present in scan root:");
    for (const v of violations.slice(0, 50)) {
      console.error("  " + v);
    }
    if (violations.length > 50) console.error(`  ... +${violations.length - 50} more`);
    console.error("\nThese must never be committed or included in archives/zips:");
    console.error("  __MACOSX/ .DS_Store ._* .AppleDouble/ node_modules/ dist/ dist-electron/ release/ .env* (non-example) local DBs/caches chat-history/ .config/*.yaml (non-example)");
    process.exit(1);
  }

  console.log("[verify:archive-clean] OK — no forbidden archive contaminants under", root);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { BAD_PATTERNS }; // for test
