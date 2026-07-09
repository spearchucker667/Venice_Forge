const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "../src");
const ELECTRON_DIR = path.join(__dirname, "../electron");

const CHECK_FILES = [
  "components/search/SearchTab.tsx",
  "components/search/SearchScrapeView.tsx",
  "components/research/ResearchBrowserView.tsx"
];

let failed = false;

for (const file of CHECK_FILES) {
  const fullPath = path.join(SRC_DIR, file);
  if (!fs.existsSync(fullPath)) continue;
  
  const content = fs.readFileSync(fullPath, "utf8");
  
  if (content.includes("onOpenExternal={")) {
    console.error(`❌ ${file} still uses onOpenExternal`);
    failed = true;
  }
  
  if (file === "components/search/SearchTab.tsx" && content.includes('target="_blank"')) {
    // There shouldn't be target="_blank" for standard search result links that can be opened in browser
    if (content.match(/<a[^>]*href=\{safeHref[^>]*target="_blank"/)) {
       console.error(`❌ ${file} still uses target="_blank" for standard links without fallback`);
       failed = true;
    }
  }
}

const serverPath = path.join(ELECTRON_DIR, "services/researchBrowserServer.ts");
if (fs.existsSync(serverPath)) {
  const content = fs.readFileSync(serverPath, "utf8");
  if (!content.includes("liveBrowserAllowExternalOpen")) {
    console.error(`❌ researchBrowserServer.ts missing liveBrowserAllowExternalOpen check`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("✅ VERIFY-068: Browser traffic containment verified.");
}
