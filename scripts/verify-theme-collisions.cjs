#!/usr/bin/env node
/**
 * verify-theme-collisions.cjs
 *
 * Static verifier for config/themes/*.yaml: a shipped document may only shadow
 * a built-in theme family id from src/theme/builtins/ when it is an
 * intentional, dual-variant (Theme Engine V2) override.
 *
 * Background (THEME-P2-009): legacy V1 `themes:`-block YAML files carry a
 * single mode. The theme registry merge gives YAML precedence over built-ins,
 * and the V1 load path copies the single-mode tokens into BOTH variants —
 * silently flattening the built-in family's companion appearance (e.g. the
 * authored dark tokens render in light mode). config/themes/copper.yaml was
 * deleted for this defect; 24 starter templates that shared the same flaw were
 * converted to dual-variant V2 documents on 2026-09-25.
 *
 * Policy — any of the following fails the build (GitHub ::error annotations,
 * non-zero exit):
 *   1. v1-single-mode-shadow: a legacy V1 `themes:`-block file whose id
 *      collides with a built-in family id. Single-mode shadows are banned
 *      outright; no allowlist entry can excuse them.
 *   2. unregistered-builtin-id-collision: any registry-relevant document (V1
 *      or V2) whose id collides with a built-in family id and is NOT listed in
 *      INTENTIONAL_V2_OVERRIDES. The list documents exactly the 24 starter
 *      templates converted to dual-variant V2 documents (THEME-P2-009
 *      remediation). They are intentional overrides: both variants are
 *      complete, and the companion variant matches the built-in. Never add new
 *      entries without a dual-variant document and a note in docs/ROADMAP.md.
 *   3. banned-theme-reintroduced: config/themes/copper must not reappear in
 *      any form — neither as a file named copper.yaml/copper.yml nor as any
 *      document contributing the id `copper` (the dual-mode JS built-in owns
 *      that id).
 *
 * Scanner semantics mirror electron/services/themeService.ts readThemeFile:
 *   - V2 documents (top-level `schemaVersion: 2`) contribute their `id:`.
 *   - V1 documents (top-level `themes:` block) contribute the first key under
 *     `themes:`.
 *   - Flat terminal-color files (no `themes:` block, no schemaVersion) are
 *     intentionally skipped — they never enter the merged registry.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const THEMES_DIR = path.join(ROOT, "config", "themes");
const BUILTINS_INDEX = path.join(ROOT, "src", "theme", "builtins", "index.ts");
const BUILTINS_DIR = path.join(ROOT, "src", "theme", "builtins");

/**
 * Built-in family ids that config/themes/*.yaml may intentionally override.
 * These are the 24 starter templates converted from flattening V1
 * `themes:`-block files to dual-variant Theme Engine V2 documents during the
 * THEME-P2-009 remediation (2026-09-25). Both variants are complete and the
 * companion variant matches the built-in, so the override no longer flattens
 * the family. `copper` is deliberately NOT listed: config/themes/copper.yaml
 * was removed instead of converted. Never add new entries without a matching
 * dual-variant V2 document and a note in docs/ROADMAP.md.
 */
const INTENTIONAL_V2_OVERRIDES = new Set([
  "amber-archive",
  "arctic-glass",
  "aurora-boreal",
  "basalt-noir",
  "circuit-mint",
  "cotton-candy-console",
  "cyber-orchid",
  "desert-copperfield",
  "dual-persona",
  "ember-monastery",
  "glacial-ink",
  "harbor-fog",
  "midnight-velvet",
  "moss-circuit",
  "neon-dusk",
  "obsidian-bloom",
  "polaroid-board",
  "porcelain-daybreak",
  "sakura-terminal",
  "solar-ash",
  "sweet-nightmare",
  "synthwave-harbor",
  "toxic-limewire",
  "ultraviolet-rain",
]);

/** Filenames that must never reappear under config/themes/ (THEME-P2-009). */
const BANNED_RETURNING_FILENAMES = new Set(["copper.yaml", "copper.yml"]);

/** Ids whose config/themes shadow was deleted and must not return. */
const BANNED_RETURNING_IDS = new Set(["copper"]);

/** Extract built-in family ids from the BUILTIN_THEME_FAMILIES list. */
function collectBuiltinFamilyIds(builtinsIndex = BUILTINS_INDEX, builtinsDir = BUILTINS_DIR) {
  const content = fs.readFileSync(builtinsIndex, "utf8");
  const listMatch = /export const BUILTIN_THEME_FAMILIES = \[([\s\S]*?)\];/.exec(content);
  if (!listMatch) {
    throw new Error("Could not locate BUILTIN_THEME_FAMILIES in src/theme/builtins/index.ts");
  }
  const ids = new Set();
  // Members are exported constants like BUILTIN_VENICE; resolve each to the
  // `id: "..."` literal in its source file under builtins/.
  const memberRe = /\bBUILTIN_([A-Z0-9_]+)\b/g;
  const members = new Set();
  let m;
  while ((m = memberRe.exec(listMatch[1])) !== null) {
    members.add(m[1]);
  }
  for (const member of members) {
    const fileRe = new RegExp(`BUILTIN_${member}\\b[\\s\\S]*?id:\\s*["']([^"']+)["']`);
    const fileNameRe = new RegExp(`export const BUILTIN_${member}\\b`);
    let found = null;
    for (const file of fs.readdirSync(builtinsDir)) {
      if (!file.endsWith(".ts") || file === "index.ts") continue;
      const fileContent = fs.readFileSync(path.join(builtinsDir, file), "utf8");
      if (!fileNameRe.test(fileContent)) continue;
      const idMatch = fileRe.exec(fileContent);
      if (idMatch) {
        found = idMatch[1];
        break;
      }
    }
    if (!found) {
      throw new Error(`Could not resolve BUILTIN_${member} to a family id in src/theme/builtins/`);
    }
    ids.add(found);
  }
  return ids;
}

/**
 * Extract the registry-relevant theme ids from a config/themes YAML document
 * using minimal line parsing (no YAML dependency).
 *
 * Returns { ids: [{ id, line }], skipped: boolean, reason?: string }.
 */
function extractThemeIds(filePath, content) {
  const lines = content.split(/\r?\n/);
  let sawSchemaVersion = false;
  let themesLine = -1;
  let idLine = -1;
  let idValue = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*schemaVersion:\s*2\s*(?:#.*)?$/.test(line)) {
      sawSchemaVersion = true;
      continue;
    }
    if (idValue === null) {
      const idMatch = /^(\s*)id:\s*["']?([A-Za-z0-9_-]+)["']?\s*(?:#.*)?$/.exec(line);
      if (idMatch && idMatch[1].length === 0) {
        idValue = idMatch[2];
        idLine = i + 1;
      }
    }
    if (/^themes:\s*(?:#.*)?$/.test(line)) {
      themesLine = i;
      break;
    }
  }

  if (sawSchemaVersion) {
    if (idValue === null) return { ids: [], skipped: false, reason: "V2 document without a parseable top-level id" };
    return { ids: [{ id: idValue, line: idLine }], skipped: false, v2: true };
  }

  if (themesLine >= 0) {
    // V1: first mapping key indented under `themes:`.
    for (let i = themesLine + 1; i < lines.length; i++) {
      const keyMatch = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/.exec(lines[i]);
      if (keyMatch) {
        return { ids: [{ id: keyMatch[1], line: i + 1 }], skipped: false, v2: false };
      }
      if (/^\S/.test(lines[i])) break; // left the themes block
    }
    return { ids: [], skipped: false, reason: "V1 themes: block without entries" };
  }

  // Flat terminal-color template: the loader intentionally skips these.
  return { ids: [], skipped: true, reason: "flat terminal-color file (skipped by loader)" };
}

/**
 * Scan a themes directory against a set of built-in family ids.
 *
 * Returns { scanned, skippedFlat, intentional, failures } where failures is a
 * list of { file, line, id, reason } with reason one of:
 *   - v1-single-mode-shadow              (policy 1)
 *   - unregistered-builtin-id-collision  (policy 2)
 *   - banned-theme-reintroduced          (policy 3)
 * Pure with respect to the filesystem root: `file` is the absolute path of the
 * offending document.
 */
function scanThemesDir(themesDir, builtinIds) {
  const failures = [];
  const intentional = [];
  const files = fs.readdirSync(themesDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  let scanned = 0;
  let skippedFlat = 0;

  for (const file of files) {
    const filePath = path.join(themesDir, file);
    const content = fs.readFileSync(filePath, "utf8");
    const { ids, skipped, v2, reason } = extractThemeIds(filePath, content);
    if (skipped) {
      skippedFlat += 1;
    } else if (ids.length === 0) {
      console.warn(`[verify-theme-collisions] WARN ${filePath}: ${reason}`);
    } else {
      scanned += 1;
    }

    // Policy 3: the deleted config/themes/copper document must not return in
    // any form — not as a resurrected file, not as any document id.
    if (BANNED_RETURNING_FILENAMES.has(file.toLowerCase())) {
      failures.push({ file: filePath, line: 1, id: path.basename(file, path.extname(file)), reason: "banned-theme-reintroduced" });
      continue;
    }
    for (const { id, line } of ids) {
      if (BANNED_RETURNING_IDS.has(id)) {
        failures.push({ file: filePath, line, id, reason: "banned-theme-reintroduced" });
        continue;
      }
      if (!builtinIds.has(id)) continue;
      // Policy 1: V1 single-mode shadows are banned outright.
      if (v2 === false) {
        failures.push({ file: filePath, line, id, reason: "v1-single-mode-shadow" });
        continue;
      }
      // Policy 2: any other built-in id collision must be a registered,
      // dual-variant V2 override.
      if (!INTENTIONAL_V2_OVERRIDES.has(id)) {
        failures.push({ file: filePath, line, id, reason: "unregistered-builtin-id-collision" });
        continue;
      }
      intentional.push({ id, file: filePath, line });
    }
  }

  return { scanned, skippedFlat, intentional, failures };
}

function main() {
  let builtinIds;
  try {
    builtinIds = collectBuiltinFamilyIds();
  } catch (err) {
    console.error(`::error::verify-theme-collisions: ${err.message}`);
    process.exit(1);
  }

  const { scanned, skippedFlat, intentional, failures } = scanThemesDir(THEMES_DIR, builtinIds);

  if (intentional.length > 0) {
    console.warn(
      `[verify-theme-collisions] INFO: ${intentional.length} intentional dual-variant V2 override(s) of a built-in family id (THEME-P2-009 remediation): ${intentional.map((c) => c.id).join(", ")}`,
    );
  }

  if (failures.length > 0) {
    console.error("[verify-theme-collisions] FAILED: config/themes built-in theme id violation(s):");
    for (const f of failures) {
      const messages = {
        "v1-single-mode-shadow": `config/themes id "${f.id}" is a legacy V1 single-mode \`themes:\` document colliding with the built-in theme family id; the YAML precedence flattens both variants to the YAML mode. Convert it to a dual-variant schemaVersion: 2 document (see THEME-P2-009)`,
        "unregistered-builtin-id-collision": `config/themes id "${f.id}" collides with the built-in theme family id and is not registered in INTENTIONAL_V2_OVERRIDES; ship it under a unique id or register it as a dual-variant V2 override with a docs/ROADMAP.md note`,
        "banned-theme-reintroduced": `config/themes document/file for id "${f.id}" reintroduces the deleted copper theme shadow; the dual-mode built-in owns this id (THEME-P2-009). Remove the file`,
      };
      console.error(`  ::error file=${path.relative(ROOT, f.file)},line=${f.line}::${messages[f.reason]}`);
    }
    process.exit(1);
  }

  console.log(
    `[verify-theme-collisions] OK: ${scanned} registry-relevant theme document(s) checked against ${builtinIds.size} built-in family ids (${skippedFlat} flat terminal-color file(s) skipped by design, ${intentional.length} intentional dual-variant override(s)).`,
  );
  process.exit(0);
}

module.exports = {
  BANNED_RETURNING_FILENAMES,
  BANNED_RETURNING_IDS,
  INTENTIONAL_V2_OVERRIDES,
  collectBuiltinFamilyIds,
  extractThemeIds,
  scanThemesDir,
};

if (require.main === module) {
  main();
}
