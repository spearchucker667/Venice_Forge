#!/usr/bin/env node
/**
 * verify-theme-tokens.cjs
 *
 * Static theme-token verifier for themeable UI components.
 * Enforces semantic theme tokens over hardcoded light/dark Tailwind colors.
 *
 * Forbidden patterns:
 *   - text-white, text-black
 *   - bg-white, bg-black
 *   - border-white, border-black
 *   - divide-white
 *   - placeholder:text-white
 *   - ring-white, shadow-white
 *   - hardcoded near-black panels: bg-[#000], bg-[#050505], bg-neutral-950,
 *     bg-zinc-950, bg-slate-950
 *
 * Intentional fixed colors can be allowlisted per-line with:
 *   // THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR
 *
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ALLOW_COMMENT = "THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR";

const SCAN_ROOTS = ["src/App.tsx", "src/components"];
const INVALID_BROWSER_TOKEN_SCAN_ROOTS = [
  "src/components/research",
  "src/components/search",
  "src/styles",
  "electron/services/researchBrowserHome.ts",
  "electron/services/researchBrowserServer.ts",
  "assets",
];

const FORBIDDEN = [
  { pattern: /\btext-white(?:\/|\b)/, name: "text-white" },
  { pattern: /\btext-black(?:\/|\b)/, name: "text-black" },
  { pattern: /\bbg-white(?:\/|\b)/, name: "bg-white" },
  { pattern: /\bbg-black(?:\/|\b)/, name: "bg-black" },
  { pattern: /\bborder-white(?:\/|\b)/, name: "border-white" },
  { pattern: /\bborder-black(?:\/|\b)/, name: "border-black" },
  { pattern: /\bdivide-white(?:\/|\b)/, name: "divide-white" },
  { pattern: /\bdivide-black(?:\/|\b)/, name: "divide-black" },
  { pattern: /\bplaceholder:text-white(?:\/|\b)/, name: "placeholder:text-white" },
  { pattern: /\bplaceholder:text-black(?:\/|\b)/, name: "placeholder:text-black" },
  { pattern: /\bring-white(?:\/|\b)/, name: "ring-white" },
  { pattern: /\bring-black(?:\/|\b)/, name: "ring-black" },
  { pattern: /\bshadow-white(?:\/|\b)/, name: "shadow-white" },
  { pattern: /\bshadow-black(?:\/|\b)/, name: "shadow-black" },
  { pattern: /\bbg-\[#0{3,6}\]/, name: "hardcoded bg-[#000]" },
  { pattern: /\bbg-\[#050505\]/, name: "hardcoded bg-[#050505]" },
  { pattern: /\bbg-neutral-950\b/, name: "bg-neutral-950" },
  { pattern: /\bbg-zinc-950\b/, name: "bg-zinc-950" },
  { pattern: /\bbg-slate-950\b/, name: "bg-slate-950" },
  // Static dark surface scale in theme.css is not theme-aware.
  { pattern: /\bbg-bg-base\b/, name: "hardcoded bg-bg-base" },
  { pattern: /\bbg-bg-raised\b/, name: "hardcoded bg-bg-raised" },
  { pattern: /\bbg-bg-overlay\b/, name: "hardcoded bg-bg-overlay" },
];

const INVALID_BROWSER_TOKENS = [
  "--surface-sunken",
  "--surface-base",
  "--surface-raised",
  "--surface-hover",
  "--border-subtle",
  "--brand-primary",
  "--brand-primary-hover",
  "--brand-primary-fg",
  "--tone-error",
  "--tone-warning",
  "--tone-success",
  "--tone-info",
  "--glow-primary",
];

function isSourceFile(entry) {
  return (
    (entry.endsWith(".tsx") || entry.endsWith(".ts")) &&
    !entry.endsWith(".test.ts") &&
    !entry.endsWith(".test.tsx")
  );
}

function isThemeScanFile(entry) {
  return (
    entry.endsWith(".tsx") ||
    entry.endsWith(".ts") ||
    entry.endsWith(".css") ||
    entry.endsWith(".html")
  );
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function collectScanFiles(root, scanRoots) {
  const files = new Set();
  for (const target of scanRoots) {
    const abs = path.resolve(root, target);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      files.add(toPosixPath(path.relative(root, abs)));
      continue;
    }
    function walk(dir) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const s = fs.statSync(full);
        if (s.isDirectory()) {
          walk(full);
        } else if (s.isFile() && isSourceFile(entry)) {
          files.add(toPosixPath(path.relative(root, full)));
        }
      }
    }
    walk(abs);
  }
  return files;
}

function collectTokenScanFiles(root, scanRoots) {
  const files = new Set();
  for (const target of scanRoots) {
    const abs = path.resolve(root, target);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      files.add(toPosixPath(path.relative(root, abs)));
      continue;
    }
    function walk(dir) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const s = fs.statSync(full);
        if (s.isDirectory()) {
          walk(full);
        } else if (s.isFile() && isThemeScanFile(entry)) {
          files.add(toPosixPath(path.relative(root, full)));
        }
      }
    }
    walk(abs);
  }
  return files;
}

function scanFile(root, relPath, forbidden, allowComment) {
  const abs = path.resolve(root, relPath);
  const content = fs.readFileSync(abs, "utf8");
  const lines = content.split(/\r?\n/);
  const violations = [];
  lines.forEach((line, idx) => {
    if (line.includes(allowComment)) return;
    for (const { pattern, name } of forbidden) {
      if (pattern.test(line)) {
        violations.push(`${relPath}:${idx + 1}: ${name}: ${line.trim()}`);
      }
    }
  });
  return violations;
}

function verifyThemeTokens(root, options = {}) {
  const scanRoots = options.scanRoots ?? SCAN_ROOTS;
  const forbidden = options.forbidden ?? FORBIDDEN;
  const allowComment = options.allowComment ?? ALLOW_COMMENT;

  const files = collectScanFiles(root, scanRoots);
  const allViolations = [];

  for (const file of files) {
    const fileViolations = scanFile(root, file, forbidden, allowComment);
    allViolations.push(...fileViolations);
  }

  const invalidBrowserTokenFiles = collectTokenScanFiles(root, options.invalidTokenScanRoots ?? INVALID_BROWSER_TOKEN_SCAN_ROOTS);
  for (const file of invalidBrowserTokenFiles) {
    const content = fs.readFileSync(path.resolve(root, file), "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (line.includes(allowComment)) return;
      for (const token of INVALID_BROWSER_TOKENS) {
        if (line.includes(token)) {
          allViolations.push(`${file}:${idx + 1}: invalid browser theme token ${token}: ${line.trim()}`);
        }
      }
    });
  }

  return {
    ok: allViolations.length === 0,
    filesScanned: files.size + invalidBrowserTokenFiles.size,
    violations: allViolations,
  };
}

function main() {
  const result = verifyThemeTokens(ROOT);

  if (result.ok) {
    console.log(
      `[verify:theme-tokens] OK: no forbidden hardcoded color classes in themeable UI (${result.filesScanned} files scanned).`,
    );
    process.exit(0);
  }

  if (result.violations.length > 0) {
    console.error(`[verify:theme-tokens] FAILED: ${result.violations.length} violation(s)`);
    for (const v of result.violations) {
      console.error(`  ${v}`);
    }
    console.error(`\nUse \`// ${ALLOW_COMMENT}\` sparingly to document intentional fixed colors.`);
  }

  process.exit(1);
}

module.exports = {
  ALLOW_COMMENT,
  FORBIDDEN,
  INVALID_BROWSER_TOKENS,
  INVALID_BROWSER_TOKEN_SCAN_ROOTS,
  SCAN_ROOTS,
  collectScanFiles,
  collectTokenScanFiles,
  isSourceFile,
  isThemeScanFile,
  scanFile,
  toPosixPath,
  verifyThemeTokens,
};

if (require.main === module) {
  main();
}
