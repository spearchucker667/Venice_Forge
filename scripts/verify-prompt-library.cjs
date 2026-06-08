#!/usr/bin/env node
/**
 * verify-prompt-library.cjs
 *
 * Phase 2D Prompt Library contract guard (VERIFY-046).
 * Fails if any of the following invariants are violated:
 *
 *  1. `src/types/prompt-library.ts` exports `PromptKind`, `PromptScope`,
 *     `PromptVersion`, `PromptLibraryItem`, `PromptLibraryExport`,
 *     `sanitizePromptLibraryItem`, `sanitizePromptVersion`,
 *     `exportPromptLibraryItems`, `parsePromptLibraryImport`,
 *     `isPromptSecretLike`, `redactPromptSecrets`.
 *  2. `src/stores/prompt-library-store.ts` exports the `usePromptLibraryStore`
 *     Zustand store with the canonical actions
 *     (`ensureLoaded`, `createPrompt`, `updatePrompt`, `addPromptVersion`,
 *      `setCurrentVersion`, `archivePrompt`, `deletePrompt`,
 *      `toggleFavorite`, `importPrompts`, `exportPrompts`).
 *  3. `src/components/prompts/PromptLibraryView.tsx` exports the view and
 *     is mounted in `src/App.tsx` for the canonical `prompts` tab.
 *  4. `src/config/tabs.ts` declares the `prompts` tab id in both
 *     `TAB_IDS` and `TAB_REGISTRY`.
 *  5. The IndexedDB schema bump to v8 added a `promptLibrary` store
 *     (visible in `src/services/dbMigrations.ts`).
 *  6. The sidebar mounts an icon for the `prompts` tab id.
 *  7. The Command Palette renders a Prompt Library section.
 *  8. The Image Studio and Media Inspector expose "Save to Prompt
 *     Library" actions.
 *
 * Usage:
 *   node scripts/verify-prompt-library.cjs
 *
 * Exit 0 on success; non-zero on any violation.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const TYPES_FILE = path.join(REPO, "src/types/prompt-library.ts");
const STORE_FILE = path.join(REPO, "src/stores/prompt-library-store.ts");
const VIEW_FILE = path.join(REPO, "src/components/prompts/PromptLibraryView.tsx");
const TABS_FILE = path.join(REPO, "src/config/tabs.ts");
const APP_FILE = path.join(REPO, "src/App.tsx");
const SIDEBAR_FILE = path.join(REPO, "src/components/layout/sidebar.tsx");
const MIGRATIONS_FILE = path.join(REPO, "src/services/dbMigrations.ts");
const CONSTANTS_FILE = path.join(REPO, "src/constants/venice.ts");
const STORAGE_FILE = path.join(REPO, "src/services/storageService.ts");
const IMAGE_VIEW_FILE = path.join(REPO, "src/components/image/image-view.tsx");
const INSPECTOR_FILE = path.join(REPO, "src/components/gallery/media-inspector.tsx");
const PALETTE_FILE = path.join(REPO, "src/components/command-palette/CommandPalette.tsx");

let failures = 0;
function check(label, ok, detail) {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures += 1;
  const tail = detail ? ` — ${detail}` : "";
  console.log(`  [${tag}] ${label}${tail}`);
}

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

console.log("VERIFY-046: prompt-library contract guard");

const types = readIfExists(TYPES_FILE);
const store = readIfExists(STORE_FILE);
const view = readIfExists(VIEW_FILE);
const tabs = readIfExists(TABS_FILE);
const app = readIfExists(APP_FILE);
const sidebar = readIfExists(SIDEBAR_FILE);
const migrations = readIfExists(MIGRATIONS_FILE);
const constants = readIfExists(CONSTANTS_FILE);
const storage = readIfExists(STORAGE_FILE);
const imageView = readIfExists(IMAGE_VIEW_FILE);
const inspector = readIfExists(INSPECTOR_FILE);
const palette = readIfExists(PALETTE_FILE);

check("src/types/prompt-library.ts exists", Boolean(types));
check("src/stores/prompt-library-store.ts exists", Boolean(store));
check("src/components/prompts/PromptLibraryView.tsx exists", Boolean(view));

if (types) {
  for (const sym of [
    "PromptKind",
    "PromptScope",
    "PromptVersion",
    "PromptLibraryItem",
    "PromptLibraryExport",
    "sanitizePromptLibraryItem",
    "sanitizePromptVersion",
    "exportPromptLibraryItems",
    "parsePromptLibraryImport",
    "isPromptSecretLike",
    "redactPromptSecrets",
  ]) {
    check(`src/types/prompt-library.ts exports ${sym}`, types.includes(sym));
  }
  // The default tab id `prompts` and the snapshot version constant
  // must both exist.
  check("src/types/prompt-library.ts declares PROMPT_LIBRARY_VERSION", /PROMPT_LIBRARY_VERSION\s*=\s*1/.test(types));
}

if (store) {
  check("src/stores/prompt-library-store.ts uses zustand `create`", /from\s+["']zustand["']/.test(store));
  check("src/stores/prompt-library-store.ts exports usePromptLibraryStore", /export\s+const\s+usePromptLibraryStore/.test(store));
  for (const action of [
    "ensureLoaded",
    "createPrompt",
    "updatePrompt",
    "addPromptVersion",
    "setCurrentVersion",
    "archivePrompt",
    "deletePrompt",
    "toggleFavorite",
    "importPrompts",
    "exportPrompts",
  ]) {
    check(`src/stores/prompt-library-store.ts has action ${action}`, new RegExp(`\\b${action}\\b`).test(store));
  }
}

if (tabs) {
  check("src/config/tabs.ts declares 'prompts' in TAB_IDS", /'prompts'/.test(tabs));
  check("src/config/tabs.ts declares a `prompts` entry in TAB_REGISTRY", /id:\s*'prompts'/.test(tabs));
}

if (app) {
  check("src/App.tsx mounts <PromptLibraryView /> for the prompts tab", /prompts:\s*PromptLibraryView/.test(app));
}

if (sidebar) {
  check("src/components/layout/sidebar.tsx mounts an icon for the 'prompts' tab", /prompts:\s*[A-Za-z]+Icon/.test(sidebar));
}

if (migrations) {
  check(
    "src/services/dbMigrations.ts adds a `promptLibrary` store at toVersion 8",
    /toVersion:\s*8[\s\S]+promptLibrary[\s\S]+createObjectStore\(\s*["']promptLibrary["']/m.test(migrations),
  );
}

if (constants) {
  check(
    "src/constants/venice.ts adds `promptLibrary` to STORE_NAMES",
    /STORE_NAMES\s*=\s*\[[\s\S]+["']promptLibrary["']/m.test(constants),
  );
  check(
    "src/constants/venice.ts bumps DB_VERSION to at least 8",
    /DB_VERSION\s*=\s*(8|9|10)/.test(constants),
  );
}

if (storage) {
  check(
    "src/services/storageService.ts encrypts the `promptLibrary` store",
    /ENCRYPTED_STORES[\s\S]+["']promptLibrary["']/m.test(storage),
  );
}

if (imageView) {
  check(
    "Image Studio exposes a 'Save to library' action on the prompt field",
    /data-testid="image-save-prompt-to-library"/.test(imageView) &&
      /usePromptLibraryStore/.test(imageView),
  );
  check(
    "Image Studio exposes a 'Save to library' action on the negative prompt field",
    /data-testid="image-save-negative-to-library"/.test(imageView),
  );
}

if (inspector) {
  check(
    "Media Inspector exposes a 'Save recipe' action to the Prompt Library",
    /data-testid="inspector-save-recipe-to-library"/.test(inspector) &&
      /usePromptLibraryStore/.test(inspector),
  );
}

if (palette) {
  check(
    "Command Palette renders an Open Prompt Library action",
    /data-testid="command-palette-open-prompts"/.test(palette),
  );
  check(
    "Command Palette renders a New Prompt action",
    /data-testid="command-palette-new-prompt"/.test(palette),
  );
  check(
    "Command Palette renders an Export Prompts action",
    /data-testid="command-palette-export-prompts"/.test(palette),
  );
  check(
    "Command Palette renders an Import Prompts action",
    /data-testid="command-palette-import-prompts"/.test(palette),
  );
}

console.log("");
if (failures === 0) {
  console.log("OK — verify:prompt-library passed (VERIFY-046).");
  process.exit(0);
} else {
  console.error(`FAIL — ${failures} prompt-library invariant(s) violated.`);
  process.exit(1);
}
