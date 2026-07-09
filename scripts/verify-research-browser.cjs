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
  "src/components/research/ResearchBrowserView.test.tsx",
  "src/components/SearchScrapeView.tsx",
  "src/components/command-palette/CommandPalette.tsx",
  // Phase 2I+ additions
  "src/components/search/ResearchProviderStatus.tsx",
  "src/components/search/ResearchProviderStatus.test.tsx",
  "src/components/search/SearchScrapeView.tsx",
  "src/components/search/AiResearchTab.tsx",
  "src/components/search/SearchTab.tsx",
  "src/components/search/searchScrapeTypes.ts",
  "src/services/researchBrowserBridge.ts",
  "electron/services/researchBrowserServer.ts",
  "electron/services/researchBrowserServer.test.ts",
  "electron/security/researchBrowserNetworkPolicy.ts",
  "electron/security/researchBrowserNetworkPolicy.test.ts",
  "src/types/researchBrowser.ts",
];

console.log("Checking for required Phase 2I+ files...");
const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error("[verify:research-browser] Missing required files:");
  for (const file of missing) console.error(` - ${file}`);
  process.exit(1);
}
console.log("✅ All required files present.");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (!pkg.scripts || pkg.scripts["verify:research-browser"] !== "node scripts/verify-research-browser.cjs") {
  console.error("[verify:research-browser] package.json script is missing or incorrect.");
  process.exit(1);
}
console.log("✅ package.json script verified.");

const agents = readFileSync("AGENTS.md", "utf8");
if (!agents.includes("VERIFY-057") || !agents.includes("verify:research-browser")) {
  console.error("[verify:research-browser] AGENTS.md is missing VERIFY-057.");
  process.exit(1);
}
console.log("✅ AGENTS.md updated with VERIFY-057.");

const tabs = readFileSync("src/config/tabs.ts", "utf8");
if (!tabs.includes("'search'") || !tabs.includes("Research")) {
  console.error("[verify:research-browser] canonical search/Research tab missing.");
  process.exit(1);
}
console.log("✅ Canonical search tab verified.");

const palette = readFileSync("src/components/command-palette/CommandPalette.tsx", "utf8");
for (const token of ["Research Workspace", "New Research Session", "Export Research Sessions"]) {
  if (!palette.includes(token)) {
    console.error(`[verify:research-browser] Command Palette missing token: ${token}`);
    process.exit(1);
  }
}
console.log("✅ Command Palette integration verified.");

// Verify browser-specific components
const searchView = readFileSync("src/components/search/SearchScrapeView.tsx", "utf8");
for (const token of ["ResearchProviderStatus", "browser", "ResearchBrowserView", "onCaptureWithJina", "researchBrowserBridge"]) {
  if (!searchView.includes(token)) {
    console.error(`[verify:research-browser] SearchScrapeView missing token: ${token}`);
    process.exit(1);
  }
}
console.log("✅ SearchScrapeView browser integration verified.");

const browserView = readFileSync("src/components/research/ResearchBrowserView.tsx", "utf8");
for (const token of ["research-browser-viewport", "MIN_BROWSER_VIEWPORT_SIZE", "setVisible(false)", "getBoundingClientRect"]) {
  if (!browserView.includes(token)) {
    console.error(`[verify:research-browser] ResearchBrowserView missing native viewport safety token: ${token}`);
    process.exit(1);
  }
}
console.log("✅ ResearchBrowserView native viewport safety verified.");

// Browser-traffic-contained invariants (Embedded Browser Remediation contract
// — Problems 3-8). The in-app home lives in a TS module so the theme snapshot
// can be embedded into it at build time. The split is intentional; if a
// "public/research-browser-home.html" file appears, the verifier refuses.
if (existsSync("public/research-browser-home.html")) {
  console.error("[verify:research-browser] public/research-browser-home.html re-introduced — split-out home module must own the home page.");
  process.exit(1);
}

const browserHome = readFileSync("electron/services/researchBrowserHome.ts", "utf8");
for (const token of [
  "Content-Security-Policy",
  "https://www.google.com/",
  "https://search.brave.com/",
  "https://duckduckgo.com/",
  "https://venice.ai/",
  "https://jina.ai/",
  "__venice_research_internal_home__=1",
  "buildResearchBrowserHomeHtml",
  "isInternalResearchHomeUrl",
  "getFallbackResearchBrowserThemeSnapshot",
]) {
  if (!browserHome.includes(token)) {
    console.error(`[verify:research-browser] research-browser-home module missing token: ${token}`);
    process.exit(1);
  }
}
if (/target\s*=\s*"_blank"/i.test(browserHome) || /\bonclick\s*=\s*/i.test(browserHome)) {
  console.error("[verify:research-browser] Home page contains target=_blank or onclick handlers.");
  process.exit(1);
}
if (/<script\b/i.test(browserHome)) {
  console.error("[verify:research-browser] Home page contains <script> tags — must be CSP-locked with script-src 'none'.");
  process.exit(1);
}
console.log("✅ Research Browser in-app home page verified (split module + sentinel + quick links + strict CSP).");

const configStore = readFileSync("src/stores/config-store.ts", "utf8");
if (!configStore.includes("live_browser_allow_external_open")) {
  console.error("[verify:research-browser] config-store missing live_browser_allow_external_open flag.");
  process.exit(1);
}
console.log("✅ Config store gates openExternal with live_browser_allow_external_open.");

const configSchema = readFileSync("src/config/configSchema.ts", "utf8");
if (!configSchema.includes("live_browser_allow_external_open")) {
  console.error("[verify:research-browser] configSchema missing live_browser_allow_external_open schema field.");
  process.exit(1);
}
console.log("✅ Config schema exposes live_browser_allow_external_open field.");

const browserServer = readFileSync("electron/services/researchBrowserServer.ts", "utf8");
for (const token of [
  "setTheme",
  "isInternalResearchHomeUrl",
  "live_browser_allow_external_open",
  "researchBrowser:requestOpenInSystemBrowser",
]) {
  if (!browserServer.includes(token)) {
    console.error(`[verify:research-browser] researchBrowserServer missing token: ${token}`);
    process.exit(1);
  }
}
console.log("✅ researchBrowserServer wires theme snapshot + sentinel + config gate.");

const preload = readFileSync("electron/preload.ts", "utf8");
if (!preload.includes("setTheme")) {
  console.error("[verify:research-browser] preload missing setTheme bridge.");
  process.exit(1);
}
if (!/researchBrowser[\s\S]+requestOpenInSystemBrowser/.test(preload) || /openExternal\b/.test(preload.replace(/requestOpenInSystemBrowser/g, ""))) {
  console.error("[verify:research-browser] preload IPC channel rename (requestOpenInSystemBrowser) not applied.");
  process.exit(1);
}
console.log("✅ preload bridge exposes setTheme + renamed open-external channel.");

const aiResearch = readFileSync("src/components/search/AiResearchTab.tsx", "utf8");
for (const token of ["researchBudget", "maxQueries", "maxResultsPerQuery", "maxPages", "maxCharsPerPage", "researchRunMode", "retrieve-only", "retrieve-and-synthesize"]) {
  if (!aiResearch.includes(token)) {
    console.error(`[verify:research-browser] AiResearchTab missing token: ${token}`);
    process.exit(1);
  }
}
console.log("✅ AiResearchTab budget controls verified.");

const searchTab = readFileSync("src/components/search/SearchTab.tsx", "utf8");
for (const token of ["onOpenInBrowser", "onOpenExternal", "isTrustedExternalUrl"]) {
  if (!searchTab.includes(token)) {
    console.error(`[verify:research-browser] SearchTab missing token: ${token}`);
    process.exit(1);
  }
}
console.log("✅ SearchTab browser integration verified.");

const tests = [
  "electron/security/researchBrowserNetworkPolicy.test.ts",
  "electron/services/researchBrowserServer.test.ts",
  "src/types/research.test.ts",
  "src/stores/research-store.test.ts",
  "src/services/researchService.test.ts",
  "src/services/researchSummaries.test.ts",
  "src/components/research/ResearchWorkspaceView.test.tsx",
  "src/components/research/ResearchBrowserView.test.tsx",
  "src/components/search/ResearchProviderStatus.test.tsx",
  "src/services/diagnosticsService.test.ts",
  "src/components/command-palette/CommandPalette.test.tsx"
];

console.log("Running Phase 2I+ unit tests...");
const result = spawnSync(
  "npx",
  ["vitest", "run", ...tests, "--fileParallelism=false"],
  {
    stdio: "inherit",
    shell: process.platform === "win32"
  }
);

if (result.status !== 0) {
  console.error("[verify:research-browser] Unit tests failed.");
  process.exit(1);
}

console.log("\n✅ VERIFY-057: Research Browser validation passed.");
process.exit(0);
