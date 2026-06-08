#!/usr/bin/env node
/**
 * verify-model-aware-recipes.cjs
 *
 * Model-aware recipe contract guard (VERIFY-043).
 * Fails if any of the following invariants are violated in the Phase 2A
 * surface area:
 *
 *  1. The image model capability registry exports the Phase 2A helpers
 *     (`getRecipeCapabilityList`, `isDimensionSupported`,
 *     `normalizeDimensionsForModel`, `getUnsupportedRecipeFields`).
 *  2. `src/types/project.ts` exports `getRecipeCompatibilityReport` and
 *     `RecipeCompatibilityReport` and consumes the same sanitizer.
 *  3. `image-view.tsx` imports `getRecipeCapabilityList` AND gates the
 *     negative-prompt / seed / style / steps controls on the per-field
 *     capability flags. It must also pass `supports*` flags into the
 *     `buildImagePayload` call.
 *  4. `media-inspector.tsx` imports `RecipeCompatibilityCard` and wires
 *     the `currentModel` prop through to the card.
 *  5. `gallery-view.tsx` forwards `currentModel` to the inspector.
 *  6. `media-store.ts` `filterMedia` recognises the new recipe filters
 *     (`has-recipe`, `no-recipe`, `has-seed`).
 *  7. `media-toolbar.tsx` exposes the new recipe filters in
 *     `FILTER_OPTIONS`.
 *  8. `payloadBuilders.ts` honours `supportsNegativePrompt`,
 *     `supportsSeed`, `supportsStyle`, `supportsSteps`, and
 *     `supportsCfgScale` (each is `false` → drop the field).
 *  9. `RecipeCompatibilityCard` is reachable from the inspector with the
 *     required `recipe` + `currentModel` props.
 *
 * Usage:
 *   node scripts/verify-model-aware-recipes.cjs
 *
 * Exit 0 on success; non-zero on any violation.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const violations = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mustContain(rel, fragments, label) {
  const text = read(rel);
  for (const f of fragments) {
    if (!text.includes(f)) {
      violations.push(`${rel}: missing ${label || "fragment"} ${JSON.stringify(f)}`);
    }
  }
}

function main() {
  // 1. Capability registry exposes the Phase 2A helpers.
  mustContain(
    "src/config/image-model-capabilities.ts",
    [
      "export function getRecipeCapabilityList",
      "export function isDimensionSupported",
      "export function normalizeDimensionsForModel",
      "export function getUnsupportedRecipeFields",
    ],
    "capability helper export",
  );

  // 2. Recipe compatibility report + types.
  mustContain(
    "src/types/project.ts",
    [
      "export function getRecipeCompatibilityReport",
      "export interface RecipeCompatibilityReport",
      "export interface RecipeCompatIssue",
    ],
    "recipe compatibility helper",
  );

  // 3. Image Studio wires model-aware UI + sanitizes the payload.
  mustContain(
    "src/components/image/image-view.tsx",
    [
      "getRecipeCapabilityList",
      "caps.supportsNegativePrompt",
      "caps.supportsSeed",
      "caps.supportsStyle",
      "caps.supportsSteps",
      "supportsNegativePrompt: caps.supportsNegativePrompt",
      "supportsSeed: caps.supportsSeed",
    ],
    "image-view model-aware contract",
  );

  // 4. Media Inspector renders the compatibility card.
  mustContain(
    "src/components/gallery/media-inspector.tsx",
    [
      "RecipeCompatibilityCard",
      "currentModel",
      "data-testid=\"inspector-recipe-compatibility\"",
      "Export recipe",
    ],
    "media-inspector recipe compatibility wiring",
  );

  // 5. Gallery view forwards currentModel to the inspector.
  mustContain(
    "src/components/gallery/gallery-view.tsx",
    [
      "currentImageModel",
      "currentModel={currentImageModel}",
    ],
    "gallery-view currentModel forwarding",
  );

  // 6. Media filter handles the new recipe filters.
  mustContain(
    "src/stores/media-store.ts",
    [
      '"has-recipe"',
      '"no-recipe"',
      '"has-seed"',
    ],
    "media-store new recipe filter values",
  );

  // 7. Media toolbar exposes the new recipe filters.
  mustContain(
    "src/components/gallery/media-toolbar.tsx",
    [
      "has-recipe",
      "no-recipe",
      "has-seed",
    ],
    "media-toolbar new recipe filter options",
  );

  // 8. Payload builder honours the per-capability flags.
  mustContain(
    "src/utils/payloadBuilders.ts",
    [
      "supportsNegativePrompt?: boolean",
      "supportsSeed?: boolean",
      "supportsStyle?: boolean",
      "supportsSteps?: boolean",
      "supportsCfgScale?: boolean",
      "draft.supportsSteps === false",
      "draft.supportsCfgScale === false",
      "draft.supportsNegativePrompt !== false",
      "draft.supportsStyle !== false",
      "draft.supportsSeed !== false",
    ],
    "payload-builder capability stripping",
  );

  // 9. RecipeComparison + RecipeCompatibilityCard components exist.
  mustContain(
    "src/components/gallery/recipe-compatibility-card.tsx",
    [
      "export function RecipeCompatibilityCard",
      "data-testid=\"recipe-compatibility-card\"",
      "data-testid=\"recipe-compatibility-status\"",
    ],
    "recipe-compatibility-card public surface",
  );
  mustContain(
    "src/components/gallery/recipe-comparison.tsx",
    [
      "export function RecipeComparison",
      "export function buildRecipeComparison",
      "data-testid=\"recipe-comparison\"",
    ],
    "recipe-comparison public surface",
  );

  if (violations.length > 0) {
    console.error("[verify:model-aware-recipes] FAIL — Phase 2A model/recipe contract drift:");
    for (const v of violations) {
      console.error("  " + v);
    }
    process.exit(1);
  }

  console.log("[verify:model-aware-recipes] OK — Phase 2A model/recipe contract is intact.");
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main }; // for test
