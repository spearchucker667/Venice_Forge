#!/usr/bin/env node

const { existsSync, readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const requiredFiles = [
  "src/types/research.ts",
  "src/types/research.test.ts",
  "src/stores/research-store.ts",
  "src/stores/research-store.test.ts",
  "src/services/researchService.ts",
  "src/services/researchService.test.ts",
  "src/services/researchSummaries.ts",
  "src/services/researchSummaries.test.ts",
  "src/components/research/ResearchWorkspaceView.tsx",
  "src/components/research/ResearchWorkspaceView.test.tsx",
  "src/components/SearchScrapeView.tsx",
  "src/components/command-palette/CommandPalette.tsx"
];

console.log("Checking for required Phase 2I files...");
const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error("[verify:research-workspace] Missing required files:");
  for (const file of missing) console.error(` - ${file}`);
  process.exit(1);
}
console.log("✅ All required files present.");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (!pkg.scripts || pkg.scripts["verify:research-workspace"] !== "node scripts/verify-research-workspace.cjs") {
  console.error("[verify:research-workspace] package.json script is missing or incorrect.");
  process.exit(1);
}
console.log("✅ package.json script verified.");

const agents = readFileSync("AGENTS.md", "utf8");
if (!agents.includes("VERIFY-051") || !agents.includes("verify:research-workspace")) {
  console.error("[verify:research-workspace] AGENTS.md is missing VERIFY-051.");
  process.exit(1);
}
console.log("✅ AGENTS.md updated with VERIFY-051.");

const tabs = readFileSync("src/config/tabs.ts", "utf8");
if (!tabs.includes("'search'") || !tabs.includes("Research")) {
  console.error("[verify:research-workspace] canonical search/Research tab missing.");
  process.exit(1);
}
console.log("✅ Canonical search tab verified.");

const palette = readFileSync("src/components/command-palette/CommandPalette.tsx", "utf8");
for (const token of ["Research Workspace", "New Research Session", "Export Research Sessions"]) {
  if (!palette.includes(token)) {
    console.error(`[verify:research-workspace] Command Palette missing token: ${token}`);
    process.exit(1);
  }
}
console.log("✅ Command Palette integration verified.");

const searchView = readFileSync("src/components/SearchScrapeView.tsx", "utf8");
for (const token of ["Workspace", "Search / Scrape", "AI Research", "Profile Discovery", "Text Parser"]) {
  if (!searchView.includes(token)) {
    console.error(`[verify:research-workspace] SearchScrapeView compatibility token missing: ${token}`);
    process.exit(1);
  }
}
console.log("✅ SearchScrapeView compatibility verified.");

const tests = [
  "src/types/research.test.ts",
  "src/stores/research-store.test.ts",
  "src/services/researchService.test.ts",
  "src/services/researchSummaries.test.ts",
  "src/components/research/ResearchWorkspaceView.test.tsx",
  "src/services/diagnosticsService.test.ts",
  "src/components/command-palette/CommandPalette.test.tsx"
];

console.log("Running Phase 2I unit tests...");
const result = spawnSync(
  "npx",
  ["vitest", "run", ...tests, "--fileParallelism=false"],
  {
    stdio: "inherit",
    shell: process.platform === "win32"
  }
);

if (result.status !== 0) {
  console.error("[verify:research-workspace] Unit tests failed.");
  process.exit(1);
}

console.log("\n✅ VERIFY-051: Research Workspace validation passed.");
process.exit(0);
