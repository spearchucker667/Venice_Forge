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
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ALLOW_COMMENT = "THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR";

const TARGETS = [
  "src/App.tsx",
  "src/components/chat",
  "src/components/layout",
  "src/components/privacy",
  "src/components/research",
  "src/components/search",
  "src/components/status",
  "src/components/ui",
  "src/components/CharactersView.tsx",
  "src/components/StatusView.tsx",
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

function collectFiles(target) {
  const abs = path.resolve(ROOT, target);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [target];
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const s = fs.statSync(full);
      if (s.isDirectory()) {
        walk(full);
      } else if (
        s.isFile() &&
        (entry.endsWith(".tsx") || entry.endsWith(".ts")) &&
        !entry.endsWith(".test.ts") &&
        !entry.endsWith(".test.tsx")
      ) {
        files.push(path.relative(ROOT, full));
      }
    }
  }
  walk(abs);
  return files;
}

function main() {
  const violations = [];
  const files = new Set();
  for (const target of TARGETS) {
    for (const f of collectFiles(target)) files.add(f);
  }

  for (const file of files) {
    const abs = path.resolve(ROOT, file);
    const content = fs.readFileSync(abs, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (line.includes(ALLOW_COMMENT)) return;
      for (const { pattern, name } of FORBIDDEN) {
        if (pattern.test(line)) {
          violations.push(`${file}:${idx + 1}: ${name}: ${line.trim()}`);
        }
      }
    });
  }

  if (violations.length === 0) {
    console.log(`[verify:theme-tokens] OK: no forbidden hardcoded color classes in themeable UI.`);
    process.exit(0);
  }

  console.error(`[verify:theme-tokens] FAILED: ${violations.length} violation(s)`);
  for (const v of violations) {
    console.error(`  ${v}`);
  }
  console.error(`\nUse \`// ${ALLOW_COMMENT}\` sparingly to document intentional fixed colors.`);
  process.exit(1);
}

main();
