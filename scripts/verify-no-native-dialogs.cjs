#!/usr/bin/env node
/**
 * Verify that no production code uses native blocking dialogs.
 *
 * Allowed exceptions:
 * - Test fixture strings containing alert/confirm/prompt (e.g. "javascript:alert(1)")
 * - Lines marked with an explicit override comment:
 *     // verify-no-native-dialogs: allow
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const DIALOG_PATTERNS = [
  /\bwindow\.confirm\s*\(/,
  /\bwindow\.prompt\s*\(/,
  /\bwindow\.alert\s*\(/,
  /\bglobalThis\.confirm\s*\(/,
  /\bglobalThis\.prompt\s*\(/,
  /\bglobalThis\.alert\s*\(/,
  /(?<!\.)\bconfirm\(/,
  /(?<!\.)\bprompt\(/,
  /(?<!\.)\balert\(/,
];

const OVERRIDE_COMMENT = /verify-no-native-dialogs:\s*allow/;

const EXCLUDED_DIRS = [
  "node_modules",
  "dist",
  "dist-electron",
  "release",
  ".git",
];

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function isTestFile(relativePath) {
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(relativePath);
}

function isInsideStringLiteral(line, matchIndex) {
  // Simple heuristic: if there are quote characters on both sides of the match
  // and the quote state at the match position is "inside a string", treat it as
  // a fixture string. This is intentionally conservative and may require the
  // explicit override marker for edge cases.
  let inString = false;
  let stringChar = null;
  for (let i = 0; i < matchIndex; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : "";
    if (!inString && (ch === '"' || ch === "'" || ch === "`")) {
      inString = true;
      stringChar = ch;
    } else if (inString && ch === stringChar && prev !== "\\") {
      inString = false;
      stringChar = null;
    }
  }
  return inString;
}

function walk(dir, relative = "") {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = relative ? path.join(relative, name) : name;
    if (EXCLUDED_DIRS.includes(name)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walk(full, rel));
    } else if (stat.isFile() && EXTENSIONS.has(path.extname(name))) {
      entries.push(rel);
    }
  }
  return entries;
}

function main() {
  const files = [
    ...walk(path.join(ROOT, "src"), "src"),
    ...walk(path.join(ROOT, "electron"), "electron"),
    "server.ts",
  ];

  let violations = [];

  for (const rel of files) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, "utf-8");
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      if (OVERRIDE_COMMENT.test(line)) continue;

      for (const pattern of DIALOG_PATTERNS) {
        const match = pattern.exec(line);
        if (!match) continue;

        if (isTestFile(rel) && isInsideStringLiteral(line, match.index)) {
          continue;
        }

        violations.push({ file: rel, line: lineNumber, text: line.trim() });
      }
    }
  }

  if (violations.length > 0) {
    console.error("FAIL: native blocking dialogs found in production code:\n");
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}\n    ${v.text}\n`);
    }
    process.exit(1);
  }

  console.log("PASS: no native blocking dialogs found in production code.");
}

main();
