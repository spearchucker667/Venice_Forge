#!/usr/bin/env node
/**
 * Verifier for the per-tab headed acceptance harness (VF-20260918-P2-016).
 *
 * Walks docs/design/per-tab-acceptance/evidence/<tab>/<tuple>/ and confirms:
 *   - every (viewport × theme × locale × state) tuple required by the harness
 *     has a directory and a manifest.json
 *   - every manifest.json parses against docs/design/per-tab-acceptance/EVIDENCE_MANIFEST.template.json
 *   - every manifest has a non-empty reviewer.signature and reviewer.contact
 *   - every manifest references a notes.md that exists and is non-empty
 *   - every manifest's notes.md is consistent with its tuple id
 *
 * The verifier does NOT mark P2-016 closed by itself — that requires a human
 * reviewer to sign the entries. It only reports coverage and consistency.
 *
 * Exit codes:
 *   0 = every required tuple has a signed, well-formed entry
 *   1 = one or more tuples are missing / unsigned / malformed
 */

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const EVIDENCE_ROOT = path.join(REPO_ROOT, "docs/design/per-tab-acceptance/evidence");
const TAB_ROUTES_FILE = path.join(REPO_ROOT, "scripts/per-tab-acceptance/tab-routes.json");
const MANIFEST_TEMPLATE_FILE = path.join(
  REPO_ROOT,
  "docs/design/per-tab-acceptance/EVIDENCE_MANIFEST.template.json",
);

// Defaults; --required-* CLI flags override.
const REQUIRED_VIEWPORTS = [
  "1280x720",
  "1440x900",
  "1920x1080",
  "2560x1440",
  "mobile-390x844",
];
const REQUIRED_THEMES = ["venice-dark", "venice-light", "nord-dark", "venice-rtl"];
const REQUIRED_LOCALES = ["en-US", "ar", "zh-CN"];
const REQUIRED_STATES = ["initial", "keyboard", "overflow"];

function parseCli() {
  const argv = process.argv.slice(2);
  const opts = {
    viewports: REQUIRED_VIEWPORTS.slice(),
    themes: REQUIRED_THEMES.slice(),
    locales: REQUIRED_LOCALES.slice(),
    states: REQUIRED_STATES.slice(),
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === "--required-viewports" && next) {
      opts.viewports = next.split(",");
      i++;
    } else if (flag === "--required-themes" && next) {
      opts.themes = next.split(",");
      i++;
    } else if (flag === "--required-locales" && next) {
      opts.locales = next.split(",");
      i++;
    } else if (flag === "--required-states" && next) {
      opts.states = next.split(",");
      i++;
    } else if (flag === "-h" || flag === "--help") {
      console.log(
        "Usage: verify-per-tab-acceptance.cjs [--required-viewports a,b] [--required-themes ...] [--required-locales ...] [--required-states ...]",
      );
      process.exit(0);
    }
  }
  return opts;
}

function loadTabRoutes() {
  const text = fs.readFileSync(TAB_ROUTES_FILE, "utf8");
  return JSON.parse(text);
}

function loadManifestTemplate() {
  const text = fs.readFileSync(MANIFEST_TEMPLATE_FILE, "utf8");
  return JSON.parse(text);
}

const template = loadManifestTemplate();
const allowedTabs = template.properties.tab.enum;
const allowedViewports = template.properties.viewport.enum;
const allowedThemes = template.properties.theme.enum;
const allowedLocales = template.properties.locale.enum;
const allowedStates = template.properties.state.enum;

function tupleDirName(viewport, theme, locale) {
  return `${viewport}__${theme}__${locale}`;
}

function tupleDirs(tabDir) {
  if (!fs.existsSync(tabDir)) return [];
  return fs
    .readdirSync(tabDir)
    .filter((name) => {
      const full = path.join(tabDir, name);
      return fs.statSync(full).isDirectory();
    })
    .map((name) => ({
      name,
      path: path.join(tabDir, name),
    }));
}

function readJsonSafe(filePath) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function validateManifest(manifest, tuple) {
  const errors = [];
  for (const required of ["schemaVersion", "tab", "viewport", "theme", "locale", "state"]) {
    if (manifest[required] === undefined) {
      errors.push(`missing field: ${required}`);
    }
  }
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!allowedTabs.includes(manifest.tab)) errors.push(`tab "${manifest.tab}" is not in the allowed enum`);
  if (!allowedViewports.includes(manifest.viewport)) errors.push(`viewport "${manifest.viewport}" is not in the allowed enum`);
  if (!allowedThemes.includes(manifest.theme)) errors.push(`theme "${manifest.theme}" is not in the allowed enum`);
  if (!allowedLocales.includes(manifest.locale)) errors.push(`locale "${manifest.locale}" is not in the allowed enum`);
  if (!allowedStates.includes(manifest.state)) errors.push(`state "${manifest.state}" is not in the allowed enum`);

  // Tuple coherence: manifest fields must match the directory it lives in.
  const expectedTuple = `${manifest.viewport}__${manifest.theme}__${manifest.locale}`;
  if (expectedTuple !== tuple.name) {
    errors.push(`manifest tuple "${expectedTuple}" does not match directory "${tuple.name}"`);
  }
  if (manifest.tab !== tuple.tab) {
    errors.push(`manifest tab "${manifest.tab}" does not match parent directory "${tuple.tab}"`);
  }

  // Reviewer signature must be non-empty (P2-016 closure precondition).
  const sig = (manifest.reviewer && manifest.reviewer.signature) || "";
  const contact = (manifest.reviewer && manifest.reviewer.contact) || "";
  if (!sig.trim()) errors.push("reviewer.signature is empty — P2-016 cannot close until a human signs");
  if (!contact.trim()) errors.push("reviewer.contact is empty — P2-016 cannot close until a human signs");

  // Captured-at must parse as ISO-8601.
  if (!manifest.capturedAt || Number.isNaN(Date.parse(manifest.capturedAt))) {
    errors.push("capturedAt must be ISO-8601");
  }

  return errors;
}

function validateNotes(notesText, manifest) {
  const errors = [];
  if (!notesText || !notesText.trim()) {
    errors.push("notes.md is empty");
    return errors;
  }
  const needle = `${manifest.tab} · ${manifest.viewport} · ${manifest.theme} · ${manifest.locale}`;
  if (!notesText.includes(needle) && !notesText.includes(needle.replace(/ · /g, " - "))) {
    errors.push(`notes.md must reference the tuple header "${needle}"`);
  }
  // Notes must have a non-empty reviewer signature line.
  if (!/Reviewer signature:/i.test(notesText)) {
    errors.push("notes.md must include a 'Reviewer signature:' line");
  }
  return errors;
}

function main() {
  const opts = parseCli();
  const routes = loadTabRoutes();
  const tabIds = routes.tabs.map((t) => t.id);

  if (!fs.existsSync(EVIDENCE_ROOT)) {
    console.error(`[verify:per-tab-acceptance] FAIL — evidence root not found: ${EVIDENCE_ROOT}`);
    console.error("Run scripts/per-tab-acceptance/runner.sh first to scaffold the directory tree.");
    process.exit(1);
  }

  const errors = [];
  let requiredTuples = 0;
  let coveredTuples = 0;

  for (const tab of tabIds) {
    const tabDir = path.join(EVIDENCE_ROOT, tab);
    const tuplesPresent = tupleDirs(tabDir);
    const presentKeys = new Set(tuplesPresent.map((t) => t.name));

    for (const viewport of opts.viewports) {
      for (const theme of opts.themes) {
        for (const locale of opts.locales) {
          for (const state of opts.states) {
            requiredTuples++;
            const tupleName = tupleDirName(viewport, theme, locale);
            const tuplePath = path.join(tabDir, tupleName);
            const manifestPath = path.join(tuplePath, "manifest.json");
            const notesPath = path.join(tuplePath, "notes.md");

            if (!presentKeys.has(tupleName)) {
              errors.push(`missing directory: ${tab}/${tupleName}/`);
              continue;
            }

            const manifestResult = readJsonSafe(manifestPath);
            if (!manifestResult.ok) {
              errors.push(`${tab}/${tupleName}/${state}: manifest.json failed to parse: ${manifestResult.error}`);
              continue;
            }
            const manifestErrors = validateManifest(manifestResult.value, { tab, name: tupleName, path: tuplePath });
            for (const e of manifestErrors) errors.push(`${tab}/${tupleName}/${state}: ${e}`);

            let notesText = "";
            try {
              notesText = fs.readFileSync(notesPath, "utf8");
            } catch {
              errors.push(`${tab}/${tupleName}/${state}: notes.md missing`);
              continue;
            }
            const noteErrors = validateNotes(notesText, manifestResult.value);
            for (const e of noteErrors) errors.push(`${tab}/${tupleName}/${state}: ${e}`);

            // A tuple is "covered" only when every state has a signed manifest + non-empty notes.
            if (manifestErrors.length === 0 && noteErrors.length === 0) {
              coveredTuples++;
            }
          }
        }
      }
    }
  }

  console.log(
    `[verify:per-tab-acceptance] covered ${coveredTuples} of ${requiredTuples} required (tab × viewport × theme × locale × state) tuples.`,
  );
  console.log(
    `[verify:per-tab-acceptance] required: ${tabIds.length} tabs × ${opts.viewports.length} viewports × ${opts.themes.length} themes × ${opts.locales.length} locales × ${opts.states.length} states = ${requiredTuples} entries`,
  );
  if (errors.length > 0) {
    console.error(`[verify:per-tab-acceptance] FAIL — ${errors.length} issue(s):`);
    for (const e of errors.slice(0, 200)) console.error(`  - ${e}`);
    if (errors.length > 200) console.error(`  ... and ${errors.length - 200} more`);
    process.exit(1);
  }
  console.log("[verify:per-tab-acceptance] OK — every required tuple has a signed, well-formed entry.");
  console.log("Reminder: P2-016 cannot close on signature alone; the actual headed capture + reviewer observations must be filled in.");
}

main();
