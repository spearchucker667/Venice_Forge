#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const INIT_DIR = ".superdesign/init";
const REQUIRED_FILES = [
  "components.md",
  "layouts.md",
  "routes.md",
  "theme.md",
  "pages.md",
  "extractable-components.md",
];
const REQUIRED_SOURCE_PATHS = [
  "src/App.tsx",
  "src/components/layout/sidebar.tsx",
  "src/components/layout/header.tsx",
  "src/config/tabs.ts",
  "src/theme/themeTypes.ts",
  "src/theme/builtins/venice.ts",
];
const KEY_PAGE_PATHS = [
  "Chat",
  "Image Studio",
  "Media Studio",
  "Workflows",
  "Documents",
  "Settings",
  "Theme Maker",
  "Status",
  "RP Studio",
  "Playground",
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function verifySuperdesignInit(repoRoot) {
  const errors = [];
  const initRoot = path.join(repoRoot, INIT_DIR);
  const contents = new Map();

  for (const file of REQUIRED_FILES) {
    const target = path.join(initRoot, file);
    if (!fs.existsSync(target)) {
      errors.push(`${INIT_DIR}/${file} is missing.`);
      continue;
    }
    const content = fs.readFileSync(target, "utf8");
    contents.set(file, content);
    if (!content.trim()) errors.push(`${INIT_DIR}/${file} is empty.`);
  }

  const components = contents.get("components.md") || "";
  const layouts = contents.get("layouts.md") || "";
  const routes = contents.get("routes.md") || "";
  const theme = contents.get("theme.md") || "";
  const pages = contents.get("pages.md") || "";
  const extractable = contents.get("extractable-components.md") || "";

  for (const sourcePath of REQUIRED_SOURCE_PATHS) {
    if (!routes.includes(sourcePath) && !components.includes(sourcePath) && !layouts.includes(sourcePath) && !theme.includes(sourcePath)) {
      errors.push(`Init bundle does not reference required source path ${sourcePath}.`);
    }
  }

  if (!components.includes("```tsx") && !components.includes("```typescript")) {
    errors.push("components.md must include fenced actual TypeScript/TSX source.");
  }
  if (!layouts.includes("```tsx") && !layouts.includes("```typescript")) {
    errors.push("layouts.md must include fenced actual TypeScript/TSX layout source.");
  }
  if (!routes.includes("src/config/tabs.ts") || !routes.includes("CANONICAL_TAB_ORDER")) {
    errors.push("routes.md must identify src/config/tabs.ts and CANONICAL_TAB_ORDER as authority.");
  }
  for (const page of KEY_PAGE_PATHS) {
    if (!pages.includes(`**${page}**`) && !pages.includes(`## ${page}`) && !pages.includes(`### ${page}`) && !pages.includes(`**${page}:`)) {
      errors.push(`pages.md is missing key page entry ${page}.`);
    }
  }
  for (const field of ["name", "source path", "category", "description", "state/navigation props", "hardcoded elements"]) {
    if (!extractable.toLowerCase().includes(field.toLowerCase())) {
      errors.push(`extractable-components.md is missing schema field ${field}.`);
    }
  }
  if (!theme.includes("#050505") || !theme.includes("#ef555f") || !theme.includes("src/theme/builtins/venice.ts")) {
    errors.push("theme.md does not contain current Venice near-black/crimson fingerprints and source authority.");
  }
  if (!theme.includes("```css") && !theme.includes("```css")) {
    errors.push("theme.md must include a fenced raw CSS/token source section.");
  }

  const fingerprintSource = REQUIRED_SOURCE_PATHS.map((sourcePath) => `${sourcePath}\n${read(repoRoot, sourcePath)}`).join("\n");
  const fingerprint = sha256(fingerprintSource).slice(0, 16);
  if (!contents.get("routes.md")?.includes(fingerprint)) {
    errors.push(`routes.md source fingerprint is stale or missing (expected ${fingerprint}).`);
  }

  return { passed: errors.length === 0, errors, fingerprint };
}

function main() {
  const result = verifySuperdesignInit(path.resolve(__dirname, ".."));
  if (!result.passed) {
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  console.log(`[verify:superdesign-init] passed (source fingerprint ${result.fingerprint}).`);
}

module.exports = { verifySuperdesignInit, REQUIRED_FILES, REQUIRED_SOURCE_PATHS };
if (require.main === module) main();
