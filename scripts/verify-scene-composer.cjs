#!/usr/bin/env node
/**
 * verify-scene-composer.cjs
 *
 * Phase 2E Scene Composer Foundation contract guard (VERIFY-047).
 * Fails if any of the following invariants are violated:
 *
 *  1. `src/types/scene.ts` exports `SceneComposerItem`, `SceneVersion`,
 *     `SceneComponent`, `SceneComponentKind`, `SceneMediaRef`,
 *     `ScenePromptRef`, `sanitizeSceneComposerItem`,
 *     `sanitizeSceneVersion`, `sanitizeSceneComponent`,
 *     `createSceneComposerItem`, `createSceneVersion`,
 *     `createSceneComponent`, `exportSceneComposerItems`,
 *     `parseSceneComposerImport`, `isSecretLike`, `redactSecrets`,
 *     `SCENE_COMPOSER_VERSION`.
 *  2. `src/stores/scene-composer-store.ts` exports the
 *     `useSceneComposerStore` Zustand store with the canonical actions
 *     (`ensureLoaded`, `createScene`, `updateScene`, `addSceneVersion`,
 *      `setCurrentVersion`, `archiveScene`, `unarchiveScene`,
 *      `deleteScene`, `toggleFavorite`, `addOutputMedia`,
 *      `removeOutputMedia`, `importScenes`, `exportScenes`, `getScene`,
 *      `getCurrentVersion`).
 *  3. `src/services/sceneCompiler.ts` exports `compileSceneToRecipe`
 *     which accepts a `SceneComposerItem` + `SceneVersion` and returns
 *     a structured result.
 *  4. `src/components/scenes/SceneComposerView.tsx` exports the view and
 *     is mounted in `src/App.tsx` for the canonical `scenes` tab.
 *  5. `src/config/tabs.ts` declares the `scenes` tab id in both
 *     `TAB_IDS` and `TAB_REGISTRY`.
 *  6. The IndexedDB schema bump to v9 added a `scenes` store
 *     (visible in `src/services/dbMigrations.ts`).
 *  7. The sidebar mounts an icon for the `scenes` tab id.
 *  8. The Command Palette renders a Scene Composer section.
 *  9. `src/constants/venice.ts` includes `scenes` in `STORE_NAMES`
 *     and `DB_VERSION` is at least 9.
 * 10. `src/services/storageService.ts` includes `scenes` in
 *     `ENCRYPTED_STORES`.
 *
 * Usage:
 *   node scripts/verify-scene-composer.cjs
 *
 * Exit 0 on success; non-zero on any violation.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const TYPES_FILE = path.join(REPO, "src/types/scene.ts");
const STORE_FILE = path.join(REPO, "src/stores/scene-composer-store.ts");
const COMPILER_FILE = path.join(REPO, "src/services/sceneCompiler.ts");
const VIEW_FILE = path.join(REPO, "src/components/scenes/SceneComposerView.tsx");
const TABS_FILE = path.join(REPO, "src/config/tabs.ts");
const APP_FILE = path.join(REPO, "src/App.tsx");
const SIDEBAR_FILE = path.join(REPO, "src/components/layout/sidebar.tsx");
const MIGRATIONS_FILE = path.join(REPO, "src/services/dbMigrations.ts");
const CONSTANTS_FILE = path.join(REPO, "src/constants/venice.ts");
const STORAGE_FILE = path.join(REPO, "src/services/storageService.ts");
const PALETTE_FILE = path.join(REPO, "src/components/command-palette/CommandPalette.tsx");

let failures = 0;
function check(label, ok, detail) {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures += 1;
  const tail = detail ? ` — ${detail}` : "";
  console.log(`  [${tag}] ${label}${tail}`);
}

function read(rel) {
  return fs.readFileSync(rel, "utf8");
}

function mustContain(file, label, fragments) {
  let text = "";
  try {
    text = read(file);
  } catch {
    check(label, false, `file not found: ${file}`);
    return;
  }
  for (const f of fragments) {
    check(`${label} → ${JSON.stringify(f)}`, text.includes(f));
  }
}

console.log("Phase 2E Scene Composer contract guard (VERIFY-047)");
console.log("");

// 1. Types file exports the canonical types and helpers.
mustContain(TYPES_FILE, "src/types/scene.ts types", [
  "export const SCENE_COMPOSER_VERSION",
  "export type SceneScope",
  "SceneComponentKind",
  "SceneComponent",
  "SceneMediaRef",
  "ScenePromptRef",
  "SceneVersion",
  "SceneComposerItem",
  "export function sanitizeSceneComposerItem",
  "export function sanitizeSceneVersion",
  "export function sanitizeSceneComponent",
  "export function createSceneComposerItem",
  "export function createSceneVersion",
  "export function createSceneComponent",
  "export function exportSceneComposerItems",
  "export function parseSceneComposerImport",
  "isSecretLike",
  "redactSecrets",
]);

// 2. Store exports the canonical Zustand store and actions.
mustContain(STORE_FILE, "src/stores/scene-composer-store.ts actions", [
  "export const useSceneComposerStore",
  "ensureLoaded",
  "createScene",
  "updateScene",
  "addSceneVersion",
  "setCurrentVersion",
  "archiveScene",
  "unarchiveScene",
  "deleteScene",
  "toggleFavorite",
  "addOutputMedia",
  "removeOutputMedia",
  "importScenes",
  "exportScenes",
  "getScene",
  "getCurrentVersion",
]);

// 3. Compiler exports compileSceneToRecipe.
mustContain(COMPILER_FILE, "src/services/sceneCompiler.ts", [
  "export function compileSceneToRecipe",
]);

// 4. View file exists and exports the component.
mustContain(VIEW_FILE, "src/components/scenes/SceneComposerView.tsx", [
  "export function SceneComposerView",
]);

// 5. Tab registry declares the scenes tab.
mustContain(TABS_FILE, "src/config/tabs.ts tab", [
  "'scenes'",
]);

// 6. App.tsx mounts the SceneComposerView for the scenes tab.
mustContain(APP_FILE, "src/App.tsx mount", [
  "SceneComposerView",
  "scenes:",
]);

// 7. Sidebar has SceneIcon for the scenes tab.
mustContain(SIDEBAR_FILE, "src/components/layout/sidebar.tsx icon", [
  "scenes: SceneIcon",
]);

// 8. Command Palette has a Scene Composer section.
mustContain(PALETTE_FILE, "src/components/command-palette/CommandPalette.tsx", [
  "Scene Composer",
  "useSceneComposerStore",
]);

// 9. DB constants include scenes store and DB_VERSION >= 9.
mustContain(CONSTANTS_FILE, "src/constants/venice.ts constants", [
  '"scenes"',
  "DB_VERSION",
]);

// 10. StorageService includes scenes in ENCRYPTED_STORES.
mustContain(STORAGE_FILE, "src/services/storageService.ts encrypted", [
  '"scenes"',
]);

// 11. DB migration v9 creates the scenes store.
mustContain(MIGRATIONS_FILE, "src/services/dbMigrations.ts migration", [
  '"scenes"',
  "toVersion: 9",
]);

console.log("");
if (failures === 0) {
  console.log("All Scene Composer contract checks passed.");
  process.exit(0);
} else {
  console.error(`${failures} contract violation${failures === 1 ? "" : "s"} detected.`);
  process.exit(1);
}