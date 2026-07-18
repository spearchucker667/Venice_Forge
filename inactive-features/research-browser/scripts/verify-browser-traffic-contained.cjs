#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

const checks = [];
let failed = false;

function assert(condition, message) {
  checks.push({ ok: Boolean(condition), message });
  if (!condition) failed = true;
}

const searchScrape = read("src/components/search/SearchScrapeView.tsx");
const searchTab = read("src/components/search/SearchTab.tsx");
const researchBrowserView = read("src/components/research/ResearchBrowserView.tsx");
const bridge = read("src/services/researchBrowserBridge.ts");
const server = read("electron/services/researchBrowserServer.ts");

assert(!/researchBrowserBridge\.openExternal\b/.test(`${searchScrape}\n${researchBrowserView}\n${bridge}`),
  "legacy researchBrowserBridge.openExternal is absent");
assert(!/shell\.openExternal/.test(`${searchScrape}\n${searchTab}\n${researchBrowserView}`),
  "renderer search/research UI never calls shell.openExternal");
assert(!/Popup blocked\. Open externally|Open externally if you trust/.test(`${server}\n${searchScrape}\n${searchTab}\n${researchBrowserView}`),
  "blocked popup messaging never suggests an external-browser fallback");
assert(!exists("assets/browser-splash.html"),
  "stale hardcoded assets/browser-splash.html is deleted");

const primaryOpenBrowserBlock = searchScrape.includes("onOpenInBrowser={(url) => {") &&
  searchScrape.includes("setPendingBrowserUrl(url);") &&
  searchScrape.includes('setSubTab("browser");');
assert(primaryOpenBrowserBlock, "search-result primary Open in Browser action routes through pending in-app Browser URL");

const primaryOpenBlock = searchTab.match(/onOpenInBrowser \? \([\s\S]*?\) : \([\s\S]*?\)/)?.[0] ?? "";
assert(!primaryOpenBlock.includes("requestOpenInSystemBrowser") && !primaryOpenBlock.includes("window.open"),
  "search-result primary URL action does not external-open when Browser callback is absent");

const explicitExternalPropBlock = searchScrape.match(/onRequestOpenInSystemBrowser=\{allowExternalOpen \? async \(url\) => \{[\s\S]*?\} : undefined\}/)?.[0] ?? "";
assert(explicitExternalPropBlock.includes("allowExternalOpen"),
  "SearchScrapeView passes explicit external-open action only when config gate is enabled");
assert(!/window\.open/.test(searchScrape) || explicitExternalPropBlock.includes("window.open"),
  "any web-mode window.open path is confined to the explicit gated external-open action");

const browserExternalButtonBlock = researchBrowserView.match(/\{actualUrl && actualUrl\.startsWith\("http"\) && allowExternalOpen && \([\s\S]*?research-browser-open-external[\s\S]*?\)\}/)?.[0] ?? "";
assert(browserExternalButtonBlock.includes("allowExternalOpen"),
  "ResearchBrowserView external-open affordance is hidden unless the config gate is enabled");

const serverExternalBlock = server.match(/handleIpc\("researchBrowser:requestOpenInSystemBrowser"[\s\S]*?\n {2}\}\);/)?.[0] ?? "";
assert(serverExternalBlock.includes("live_browser_allow_external_open"),
  "main-process external-open IPC is gated by research.live_browser_allow_external_open");
assert(serverExternalBlock.indexOf("live_browser_allow_external_open") < serverExternalBlock.indexOf("promptExternalLink"),
  "main-process external-open gate runs before confirmation/openExternal");
assert(serverExternalBlock.includes("promptExternalLink"),
  "main-process external-open IPC requires explicit confirmation");

const popupHandlerBlock = server.match(/setWindowOpenHandler\(\(\{ url \}\) => \{[\s\S]*?return \{ action: "deny" \};[\s\S]*?\}\);/)?.[0] ?? "";
assert(popupHandlerBlock.includes("navigateCurrentViewIfSafe"),
  "safe target=_blank/popups route into the current WebContentsView");
assert(!popupHandlerBlock.includes("requestOpenInSystemBrowser") && !popupHandlerBlock.includes("openExternal"),
  "popup handling never calls an external browser path");

for (const check of checks) {
  console.log(`${check.ok ? "✅" : "❌"} ${check.message}`);
}

if (failed) {
  console.error("❌ VERIFY-068: Browser traffic containment failed.");
  process.exit(1);
}

console.log("✅ VERIFY-068: Browser traffic containment verified.");
