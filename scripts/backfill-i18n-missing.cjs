#!/usr/bin/env node
/**
 * @fileoverview Backfill missing i18n markers with the corresponding en-US string.
 *
 * For every non-en-US locale catalog, walk the JSON tree and replace any
 * string value matching `__MISSING__:<key>` with the corresponding value
 * from en-US. This is a deterministic, dependency-free operation that does
 * not require a translation API.
 *
 * The runtime already falls back to en-US when the value is empty (`''`) or
 * missing, so this script makes the dev-mode missing-marker noise stop
 * without changing user-visible behavior. The non-en-US catalogs remain
 * `isProductionComplete: false` per repository policy until a qualified
 * native reviewer signs off (see `docs/i18n/native-review-status.json`).
 *
 * Idempotent — running repeatedly is a no-op once the catalogs are filled.
 *
 * Usage:
 *   node scripts/backfill-i18n-missing.cjs [--dry-run]
 *
 * Exit code:
 *   0 — clean (no missing markers, or all backfilled successfully)
 *   1 — at least one catalog still has missing markers after the run
 *   2 — usage / setup error (no en-US catalog found, etc.)
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RESOURCES_DIR = path.join(ROOT, "src", "i18n", "resources");
const SOURCE_LOCALE = "en-US";

const TARGET_LOCALES = [
  "ar",
  "de",
  "es",
  "fr",
  "hi",
  "ja",
  "ko",
  "pt-BR",
  "ru",
  "sv-SE",
  "zh-CN",
];

// Capture the entire key part even when it contains spaces, slashes, or
// other characters that aren't valid dotted-path components. The capture is
// intentionally permissive because some call-sites pass rendered labels
// (e.g. theme editor category / contrast names) into the i18n key path.
const MISSING_PATTERN = /^__MISSING__:(.+?)(\s+\{\{[^}]+\}\}.*)?$/;
const MISSING_PATTERN_LOOSE = /__MISSING__:/;
const INTERPOLATION_PATTERN = /(\s+\{\{[^}]+\}\}.*)$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

/**
 * Recursively set missing-key values to the en-US source. Returns the count
 * of replacements made.
 *
 * The placeholder strings (e.g. `__MISSING__:wallet.acceptedRails`) use
 * dotted paths that are rooted at the **catalog root**, not at the current
 * subtree. We therefore pass the full en-US catalog as the source-of-truth
 * for placeholder resolution while still walking the target subtree-by-
 * subtree for diagnostics.
 *
 * @param {unknown} target      - the non-en-US catalog (mutated in place)
 * @param {unknown} fullSource  - the en-US catalog (read-only, used as the
 *                                resolution root for placeholder paths)
 * @param {string}  keyPath     - dotted key path used for diagnostics
 * @returns {number}
 */
function backfill(target, fullSource, keyPath) {
  if (target == null || typeof target !== "object") return 0;
  let replaced = 0;

  for (const key of Object.keys(target)) {
    const childPath = keyPath ? `${keyPath}.${key}` : key;
    const targetVal = target[key];

    if (typeof targetVal === "string") {
      const match = targetVal.match(MISSING_PATTERN);
      if (match) {
        const dotted = (match[1] ?? "").trim();
        const trailingTemplate = (match[2] ?? "").trim();
        const enVal = resolveByDottedPath(fullSource, dotted);
        if (typeof enVal === "string") {
          // Two cases:
          //   1. en-US already contains its own interpolation template —
          //      prefer that and discard the placeholder's trailing template
          //      to avoid duplicating variables.
          //   2. en-US is a static string but the placeholder has its own
          //      template (rare) — preserve the template so the rendered
          //      string is still meaningful.
          if (trailingTemplate.length > 0 && !/\{\{[^}]+\}\}/.test(enVal)) {
            target[key] = `${enVal} ${trailingTemplate}`.trim();
          } else {
            target[key] = enVal;
          }
          replaced += 1;
        } else if (/[\s/&]/.test(dotted)) {
          // Some call-sites pass an already-resolved display label into the
          // i18n key path (e.g., `themeEditor.categories.Surfaces &
          // Backgrounds`). The "key" is a label, not a lookup. Substitute the
          // final component as the value so the rendered UI shows the
          // intended label instead of a `__MISSING__:` placeholder.
          const label = dotted.split(".").pop() ?? dotted;
          if (trailingTemplate.length > 0) {
            target[key] = `${label} ${trailingTemplate}`.trim();
          } else {
            target[key] = label;
          }
          replaced += 1;
        } else {
          process.stderr.write(`WARN: no en-US value for ${dotted} (at ${childPath})\n`);
        }
        continue;
      }
      if (MISSING_PATTERN_LOOSE.test(targetVal)) {
        process.stderr.write(`WARN: non-canonical __MISSING__ placeholder at ${childPath}\n`);
      }
      continue;
    }

    if (Array.isArray(targetVal)) {
      for (let i = 0; i < targetVal.length; i += 1) {
        if (typeof targetVal[i] === "string") {
          const m = targetVal[i].match(MISSING_PATTERN);
          if (m) {
            const enVal = resolveByDottedPath(fullSource, m[1]);
            if (typeof enVal === "string") {
              targetVal[i] = enVal;
              replaced += 1;
            }
          }
        } else if (targetVal[i] && typeof targetVal[i] === "object") {
          replaced += backfill(targetVal[i], fullSource, `${childPath}[${i}]`);
        }
      }
      continue;
    }

    if (targetVal && typeof targetVal === "object") {
      replaced += backfill(targetVal, fullSource, childPath);
    }
  }

  return replaced;
}

function resolveByDottedPath(root, dotted) {
  if (!root) return undefined;
  let cur = root;
  for (const part of dotted.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");

  const sourceDir = path.join(RESOURCES_DIR, SOURCE_LOCALE);
  if (!fs.existsSync(sourceDir)) {
    process.stderr.write(`ERROR: source locale directory not found: ${sourceDir}\n`);
    process.exit(2);
  }
  const sourceFiles = fs.readdirSync(sourceDir).filter((f) => f.endsWith(".json"));
  if (sourceFiles.length === 0) {
    process.stderr.write(`ERROR: no .json catalogs in ${sourceDir}\n`);
    process.exit(2);
  }

  const sources = {};
  for (const file of sourceFiles) {
    sources[file] = readJson(path.join(sourceDir, file));
  }

  let totalReplaced = 0;
  let totalMissing = 0;

  for (const locale of TARGET_LOCALES) {
    const localeDir = path.join(RESOURCES_DIR, locale);
    if (!fs.existsSync(localeDir)) continue;
    const files = fs.readdirSync(localeDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const targetPath = path.join(localeDir, file);
      const source = sources[file];
      if (!source) {
        process.stderr.write(`WARN: ${locale}/${file} has no en-US counterpart\n`);
        continue;
      }
      const target = readJson(targetPath);
      const replaced = backfill(target, source, `${locale}/${file}`);
      if (replaced > 0) {
        totalReplaced += replaced;
        if (!dryRun) {
          writeJson(targetPath, target);
        }
        process.stdout.write(`${locale}/${file}: replaced ${replaced} placeholder(s)\n`);
      }
      // Count remaining missing markers as a sanity check.
      totalMissing += countMissing(target);
    }
  }

  process.stdout.write(
    `\nDone. ${dryRun ? "DRY-RUN: no files written. " : ""}Replaced ${totalReplaced} placeholders. Remaining missing markers: ${totalMissing}\n`,
  );
  process.exit(totalMissing > 0 ? 1 : 0);
}

function countMissing(value) {
  if (value == null) return 0;
  if (typeof value === "string") return MISSING_PATTERN_LOOSE.test(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((acc, v) => acc + countMissing(v), 0);
  if (typeof value === "object") {
    return Object.values(value).reduce((acc, v) => acc + countMissing(v), 0);
  }
  return 0;
}

main();
