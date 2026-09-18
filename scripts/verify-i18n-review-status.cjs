#!/usr/bin/env node
/**
 * Verifier for the i18n native-language review status (VF-20260918-P3-020).
 *
 * Reads docs/i18n/native-review-status.json and src/i18n/resources/<locale>/
 * for each non-English locale, then checks:
 *
 *   1. Every locale that exists in src/i18n/resources/ is registered in
 *      native-review-status.json. Adding a catalog without registering it
 *      is a verifier failure.
 *   2. Every locale in native-review-status.json has a corresponding
 *      catalog directory.
 *   3. The first-pass-machine / human-reviewed status is consistent with
 *      the actual __MISSING__ placeholders in the catalogs:
 *        - status=human-reviewed => catalogs must have ZERO __MISSING__
 *          placeholders
 *        - status=first-pass-machine => catalogs may have __MISSING__
 *          placeholders
 *   4. human-reviewed entries have non-empty reviewer + reviewedAt.
 *
 * The verifier does NOT promote any locale. Only a qualified translator
 * following docs/i18n/review-pack/PER-LOCALE/<locale>.md may do that, and
 * the resulting status change must be paired with empty catalogs.
 *
 * Exit codes:
 *   0 = status file is consistent with catalogs
 *   1 = one or more inconsistencies
 */

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const RESOURCES_ROOT = path.join(REPO_ROOT, "src/i18n/resources");
const STATUS_FILE = path.join(REPO_ROOT, "docs/i18n/native-review-status.json");
const EN_US = "en-US";

function listLocales() {
  return fs
    .readdirSync(RESOURCES_ROOT)
    .filter((name) => fs.statSync(path.join(RESOURCES_ROOT, name)).isDirectory());
}

function readJsonSafe(filePath) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function findMissing(obj) {
  const out = [];
  function walk(v, path) {
    if (v === null || v === undefined) return;
    if (typeof v === "string") {
      if (v.startsWith("__MISSING__:")) out.push({ path, marker: v });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((vv, i) => walk(vv, `${path}[${i}]`));
      return;
    }
    if (typeof v === "object") {
      for (const [k, vv] of Object.entries(v)) walk(vv, path ? `${path}.${k}` : k);
    }
  }
  walk(obj, "");
  return out;
}

function countPlaceholdersForLocale(locale) {
  const dir = path.join(RESOURCES_ROOT, locale);
  if (!fs.existsSync(dir)) return null;
  let total = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const parsed = readJsonSafe(path.join(dir, file));
    if (!parsed.ok) continue;
    total += findMissing(parsed.value).length;
  }
  return total;
}

function main() {
  if (!fs.existsSync(RESOURCES_ROOT)) {
    console.error(`[verify:i18n-review-status] FAIL — resources root not found: ${RESOURCES_ROOT}`);
    process.exit(1);
  }
  if (!fs.existsSync(STATUS_FILE)) {
    console.error(`[verify:i18n-review-status] FAIL — status file not found: ${STATUS_FILE}`);
    process.exit(1);
  }

  const status = readJsonSafe(STATUS_FILE);
  if (!status.ok) {
    console.error(`[verify:i18n-review-status] FAIL — could not parse status file: ${status.error}`);
    process.exit(1);
  }
  const statusDoc = status.value;

  const errors = [];
  const warnings = [];

  // Cross-check locale sets.
  const onDiskLocales = new Set(listLocales());
  const statusLocales = new Set(Object.keys(statusDoc.locales || {}));

  for (const locale of onDiskLocales) {
    if (locale === EN_US) continue;
    if (!statusLocales.has(locale)) {
      errors.push(`catalog "${locale}" exists in ${RESOURCES_ROOT} but is NOT registered in ${STATUS_FILE}`);
    }
  }
  for (const locale of statusLocales) {
    if (locale === EN_US) continue;
    if (!onDiskLocales.has(locale)) {
      errors.push(`locale "${locale}" is registered in ${STATUS_FILE} but has no catalog in ${RESOURCES_ROOT}`);
    }
  }

  // Per-locale status vs catalog contents.
  let placeholdersTotal = 0;
  let humanReviewed = 0;
  let firstPass = 0;

  for (const locale of [...statusLocales].filter((l) => l !== EN_US)) {
    const statusEntry = statusDoc.locales[locale] || {};
    const placeholders = countPlaceholdersForLocale(locale);
    if (placeholders === null) continue;
    placeholdersTotal += placeholders;

    if (statusEntry.status === "human-reviewed") {
      humanReviewed++;
      if (placeholders !== 0) {
        errors.push(
          `locale "${locale}" is marked human-reviewed but the catalog still contains ${placeholders} __MISSING__ placeholders; a qualified human translation must replace every placeholder before this status is honest`,
        );
      }
      if (!statusEntry.reviewer || !String(statusEntry.reviewer).trim()) {
        errors.push(`locale "${locale}" is marked human-reviewed but reviewer is empty`);
      }
      if (!statusEntry.reviewedAt || Number.isNaN(Date.parse(statusEntry.reviewedAt))) {
        errors.push(`locale "${locale}" is marked human-reviewed but reviewedAt is not ISO-8601`);
      }
    } else if (statusEntry.status === "first-pass-machine") {
      firstPass++;
      if (placeholders === 0 && locale !== EN_US) {
        warnings.push(
          `locale "${locale}" is still marked first-pass-machine but the catalog has zero __MISSING__ placeholders — consider promoting to human-reviewed after a qualified reviewer signs off`,
        );
      }
    } else if (statusEntry.status === undefined) {
      errors.push(`locale "${locale}" has no status field in ${STATUS_FILE}`);
    } else {
      warnings.push(`locale "${locale}" has unrecognized status "${statusEntry.status}"`);
    }
  }

  console.log(`[verify:i18n-review-status] reviewed ${humanReviewed} human-reviewed + ${firstPass} first-pass-machine non-English locale(s)`);
  console.log(`[verify:i18n-review-status] total outstanding __MISSING__ placeholders: ${placeholdersTotal}`);

  if (warnings.length > 0) {
    console.warn(`[verify:i18n-review-status] ${warnings.length} warning(s):`);
    for (const w of warnings.slice(0, 50)) console.warn(`  - ${w}`);
  }

  if (errors.length > 0) {
    console.error(`[verify:i18n-review-status] FAIL — ${errors.length} issue(s):`);
    for (const e of errors.slice(0, 100)) console.error(`  - ${e}`);
    if (errors.length > 100) console.error(`  ... and ${errors.length - 100} more`);
    process.exit(1);
  }

  console.log("[verify:i18n-review-status] OK — status file consistent with catalogs.");
  console.log("Reminder: P3-020 closure requires 11 qualified native-language translators and an empty-catalog status update per locale.");
}

main();
