#!/usr/bin/env node

const { existsSync, readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const requiredFiles = [
  "src/types/rp.ts",
  "src/stores/character-card-store.ts",
  "src/stores/persona-store.ts",
  "src/stores/lorebook-store.ts",
  "src/stores/scenario-store.ts",
  "src/stores/rp-chat-store.ts",
  "src/services/rpHelpers.ts",
  "src/services/rpPromptCompiler.ts",
  "src/services/characterCardImportExport.ts",
  "src/components/rp-studio/CharacterEditor.tsx",
  "src/components/rp-studio/CharacterEditor.test.tsx",
];

console.log("[verify:rp-studio-polish] Checking for required files...");
const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error("[verify:rp-studio-polish] Missing required files:");
  for (const file of missing) console.error(` - ${file}`);
  process.exit(1);
}

console.log("[verify:rp-studio-polish] Checking package.json...");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (!pkg.scripts || pkg.scripts["verify:rp-studio-polish"] !== "node scripts/verify-rp-studio-polish.cjs") {
  console.error("[verify:rp-studio-polish] package.json script is missing or incorrect.");
  process.exit(1);
}

console.log("[verify:rp-studio-polish] Checking AGENTS.md...");
const agents = readFileSync("AGENTS.md", "utf8");
if (!agents.includes("VERIFY-048") || !agents.includes("verify:rp-studio-polish")) {
  console.error("[verify:rp-studio-polish] AGENTS.md is missing VERIFY-048 or verify:rp-studio-polish.");
  process.exit(1);
}

console.log("[verify:rp-studio-polish] Checking DB v10 contract...");
const constants = readFileSync("src/constants/venice.ts", "utf8");
if (!constants.includes('"rpScenarios"') || (!constants.includes("DB_VERSION = 10") && !constants.includes("DB_VERSION = 11") && !constants.includes("DB_VERSION = 12"))) {
  console.error("[verify:rp-studio-polish] DB v10+ / rpScenarios contract missing in src/constants/venice.ts.");
  process.exit(1);
}

console.log("[verify:rp-studio-polish] Checking storage registration...");
const storage = readFileSync("src/services/storageService.ts", "utf8");
if (!storage.includes('"rpScenarios"')) {
  console.error("[verify:rp-studio-polish] rpScenarios encrypted/storage registration missing in src/services/storageService.ts.");
  process.exit(1);
}

console.log("[verify:rp-studio-polish] Checking DB migrations...");
const migrations = readFileSync("src/services/dbMigrations.ts", "utf8");
if (!migrations.includes("toVersion: 10") || !migrations.includes("rpScenarios")) {
  console.error("[verify:rp-studio-polish] DB migration to v10 for rpScenarios missing in src/services/dbMigrations.ts.");
  process.exit(1);
}

console.log("[verify:rp-studio-polish] Checking Command Palette integration...");
const palette = readFileSync("src/components/command-palette/CommandPalette.tsx", "utf8");
for (const token of ["RP Studio", "New Character", "New Scenario"]) {
  if (!palette.includes(token)) {
    console.error(`[verify:rp-studio-polish] Command Palette missing token: ${token}`);
    process.exit(1);
  }
}

const tests = [
  "src/stores/scenario-store.test.ts",
  "src/stores/character-card-store.test.ts",
  "src/services/characterCardImportExport.test.ts",
  "src/services/rpPromptCompiler.test.ts",
  "src/components/rp-studio/CharacterEditor.test.tsx",
  "src/components/command-palette/CommandPalette.test.tsx",
];

console.log("[verify:rp-studio-polish] Running targeted tests...");
const result = spawnSync(
  "npx",
  ["vitest", "run", ...tests, "--fileParallelism=false"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.status !== 0) {
  console.error("[verify:rp-studio-polish] Targeted tests failed.");
  process.exit(result.status ?? 1);
}

console.log("[verify:rp-studio-polish] PASS");
process.exit(0);
