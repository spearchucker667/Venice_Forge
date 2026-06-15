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
 * Files that are intentionally non-themeable (e.g. media previews that must
 * keep a fixed dark surface regardless of the active theme) are listed in
 * KNOWN_EXCEPTIONS below. This list must be kept tight: a violation-free
 * exception file is reported as stale so it can be removed from the list.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ALLOW_COMMENT = "THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR";

const SCAN_ROOTS = ["src/App.tsx", "src/components"];

// Files known to contain intentional fixed light/dark classes. These are
// primarily media-centric views and workflow/playground tool canvases where
// a fixed dark surface preserves content fidelity across themes. New themeable
// UI must not be added here; migrate existing files to semantic tokens and
// remove them from this list.
const KNOWN_EXCEPTIONS = [
  "src/components/audio/audio-view.tsx",
  "src/components/command-palette/CommandPalette.tsx",
  "src/components/embeddings/embeddings-view.tsx",
  "src/components/gallery/gallery-view.tsx",
  "src/components/gallery/media-card.tsx",
  "src/components/gallery/media-detail-dialog.tsx",
  "src/components/gallery/media-inspector.tsx",
  "src/components/image/image-page.tsx",
  "src/components/image/image-tools.tsx",
  "src/components/image/image-view.tsx",
  "src/components/music/music-view.tsx",
  "src/components/playground/agent-model-picker.tsx",
  "src/components/playground/playground-chat.tsx",
  "src/components/playground/playground-view.tsx",
  "src/components/playground/preview-node.tsx",
  "src/components/playground/workflow-preview.tsx",
  "src/components/video/video-view.tsx",
  "src/components/workflows/workflow-node.tsx",
  "src/components/workflows/workflows-view.tsx",
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

function isSourceFile(entry) {
  return (
    (entry.endsWith(".tsx") || entry.endsWith(".ts")) &&
    !entry.endsWith(".test.ts") &&
    !entry.endsWith(".test.tsx")
  );
}

function collectScanFiles(root, scanRoots) {
  const files = new Set();
  for (const target of scanRoots) {
    const abs = path.resolve(root, target);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      files.add(path.relative(root, abs));
      continue;
    }
    function walk(dir) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const s = fs.statSync(full);
        if (s.isDirectory()) {
          walk(full);
        } else if (s.isFile() && isSourceFile(entry)) {
          files.add(path.relative(root, full));
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
  const knownExceptions = new Set(options.knownExceptions ?? KNOWN_EXCEPTIONS);

  const files = collectScanFiles(root, scanRoots);
  const allViolations = [];
  const filesWithViolations = new Set();

  for (const file of files) {
    const fileViolations = scanFile(root, file, forbidden, allowComment);
    if (fileViolations.length > 0) {
      filesWithViolations.add(file);
      if (!knownExceptions.has(file)) {
        allViolations.push(...fileViolations);
      }
    }
  }

  const staleExceptions = [...knownExceptions].filter((file) => !filesWithViolations.has(file));

  return {
    ok: allViolations.length === 0 && staleExceptions.length === 0,
    filesScanned: files.size,
    violations: allViolations,
    staleExceptions,
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

  if (result.staleExceptions.length > 0) {
    console.error(
      `\n[verify:theme-tokens] STALE EXCEPTIONS: remove these files from KNOWN_EXCEPTIONS because they no longer contain forbidden patterns:`,
    );
    for (const file of result.staleExceptions) {
      console.error(`  ${file}`);
    }
  }

  process.exit(1);
}

module.exports = {
  ALLOW_COMMENT,
  FORBIDDEN,
  KNOWN_EXCEPTIONS,
  SCAN_ROOTS,
  collectScanFiles,
  isSourceFile,
  scanFile,
  verifyThemeTokens,
};

if (require.main === module) {
  main();
}
