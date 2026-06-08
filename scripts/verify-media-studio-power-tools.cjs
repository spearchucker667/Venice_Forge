#!/usr/bin/env node
/**
 * verify-media-studio-power-tools.cjs
 *
 * Phase 2B Media Studio Power Tools guard (VERIFY-044).
 * Static audit of the source tree to make sure the Phase 2B power
 * tools surface area is intact:
 *
 *  1. selection store
 *  2. bulk action helpers
 *  3. compare / lineage components
 *  4. send-to + export modules
 *  5. extended filters / sorts in the media store
 *  6. selection-aware Command Palette
 *
 * Companion to the runtime test files. Failures are reported with
 * file:fragment so a future regression can be traced in one step.
 *
 * Usage:
 *   node scripts/verify-media-studio-power-tools.cjs
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
  // 1. Selection store + visibility snapshot.
  mustContain(
    "src/stores/media-selection-store.ts",
    [
      "export const useMediaSelectionStore",
      "selectMedia",
      "toggleMedia",
      "selectRange",
      "selectAllVisible",
      "clearSelection",
      "reconcileWithVisible",
      "isCompareReady",
      "MEDIA_SELECTION_MAX",
      "setVisibleMediaIds",
    ],
    "selection store API",
  );

  // 2. Bulk action helpers.
  mustContain(
    "src/stores/media-bulk-actions.ts",
    [
      "BulkMediaActionResult",
      "bulkSetFavorite",
      "bulkAddTags",
      "bulkRemoveTag",
      "bulkAssignProject",
      "bulkDelete",
      "listAssignableProjects",
      "confirm: true",
    ],
    "bulk action helper",
  );

  // 3. Compare / lineage.
  mustContain(
    "src/components/gallery/compare-view.tsx",
    [
      "CompareView",
      "buildCompareRowsForTest",
      "compare-row-",
      "data-same",
    ],
    "compare-view surface",
  );
  mustContain(
    "src/components/gallery/lineage-viewer.tsx",
    [
      "LineageViewer",
      "buildLineageChain",
      "buildAncestorChain",
      "buildDescendantTree",
      "lineage-cycle-warning",
      "lineage-missing-warning",
    ],
    "lineage-viewer surface",
  );

  // 4. Send-to + export.
  mustContain(
    "src/stores/media-send-to.ts",
    [
      "sendToImageStudio",
      "sendToImageTools",
      "sendToChat",
      "sendToVideo",
      "availableDestinations",
      "copyPrompt",
      "copyNegativePrompt",
      "copySeed",
      "copyModelId",
    ],
    "send-to surface",
  );
  mustContain(
    "src/stores/media-export-bundle.ts",
    [
      "buildExportBundle",
      "buildSidecar",
      "buildMediaFilename",
      "validateSidecar",
      "EXPORT_BUNDLE_VERSION",
      "EXPORT_BUNDLE_APP",
      "apiKey",
      "exportedPathToken",
    ],
    "export-bundle surface",
  );

  // 5. Filters / sorts in the media store.
  mustContain(
    "src/stores/media-store.ts",
    [
      '"no-seed"',
      '"no-project"',
      '"project"',
      '"has-recipe"',
      '"has-seed"',
      "applyDynamicFilter",
    ],
    "media-store extended filters/sorts",
  );

  // 6. Selection-aware command palette.
  mustContain(
    "src/stores/media-command-handlers.ts",
    [
      "registerMediaCommandHandlers",
      "getMediaCommandHandlers",
      "hasMediaCommandHandlers",
      "subscribeMediaCommandHandlers",
    ],
    "media command handler registry",
  );
  mustContain(
    "src/components/command-palette/CommandPalette.tsx",
    [
      "command-palette-media-section",
      "command-palette-select-all",
      "command-palette-compare",
      "command-palette-export",
      "command-palette-favorite",
      "command-palette-add-tag",
      "command-palette-send-image",
      "command-palette-copy-recipe",
      "subscribeMediaCommandHandlers",
    ],
    "command palette media section",
  );

  if (violations.length > 0) {
    console.error("[verify:media-studio-power-tools] FAIL — Phase 2B surface drift:");
    for (const v of violations) {
      console.error("  " + v);
    }
    process.exit(1);
  }

  console.log("[verify:media-studio-power-tools] OK — Phase 2B surface is intact.");
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
