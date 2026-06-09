/** @fileoverview Static verifier for the localStorage access policy.
 *
 * Scans `src/` for any direct reference to `localStorage` and requires an
 * inline `/* localStorage-allowed: <reason> *\/` marker. The allowed call
 * sites are documented in `docs/DEVELOPMENT/storage-policy.md`.
 *
 * Test files (`.test.` / `.spec.`) are out of scope because they intentionally
 * mock localStorage and do not execute in production.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const allowedMarker = /localStorage-allowed:/;
const localStorageRef = /\blocalStorage\b/;
const sourceExts = /\.(ts|tsx|js|jsx|cjs|mjs)$/;
const testFilePattern = /\.(test|spec)\.(ts|tsx|js|jsx|cjs|mjs)$/;

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      files.push(...walk(full));
    } else if (sourceExts.test(entry.name) && !testFilePattern.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function isCommentLine(line, inBlock) {
  const trimmed = line.trim();
  if (inBlock) {
    return { inBlock: !trimmed.includes("*/") };
  }
  if (trimmed.startsWith("//")) return { inBlock: false };
  if (trimmed.startsWith("/*") && trimmed.includes("*/")) return { inBlock: false, singleLineBlock: true };
  if (trimmed.startsWith("/*")) return { inBlock: true };
  return { inBlock: false };
}

function main() {
  const files = fs.existsSync(srcDir) ? walk(srcDir) : [];
  const violations = [];

  for (const file of files) {
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const { inBlock, singleLineBlock } = isCommentLine(line, inBlockComment);
      inBlockComment = inBlock;

      if (!localStorageRef.test(line)) continue;
      if (allowedMarker.test(line)) continue;
      if (inBlockComment || singleLineBlock) continue;

      const trimmed = line.trim();
      if (trimmed.startsWith("//")) continue;

      violations.push(`${rel}:${i + 1}: ${trimmed}`);
    }
  }

  if (violations.length > 0) {
    console.error("[verify:storage-policy] FAIL — untagged localStorage reference(s):");
    for (const v of violations) console.error("  " + v);
    process.exit(1);
  }

  console.log("[verify:storage-policy] OK — all localStorage references are tagged.");
}

main();
