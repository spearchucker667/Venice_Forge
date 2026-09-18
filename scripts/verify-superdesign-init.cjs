#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const INIT_DIR = ".superdesign/init";
const REQUIRED_FILES = [
  "components.md",
  "layouts.md",
  "routes.md",
  "theme.md",
  "pages.md",
  "extractable-components.md",
];
const REQUIRED_SOURCE_PATHS = [
  "src/App.tsx",
  "src/components/layout/sidebar.tsx",
  "src/components/layout/header.tsx",
  "src/config/tabs.ts",
  "src/theme/themeTypes.ts",
  "src/theme/builtins/venice.ts",
];
// VF-AUD-20260916-P2-001: every component documented in components.md /
// extractable-components.md must be fingerprinted against its source file so
// a represented-component signature change fails this verifier until the init
// bundle is regenerated. See REQUIRED_COMPONENT_SOURCES below.
const REQUIRED_COMPONENT_SOURCES = [
  "src/components/ui/primitives.tsx",
  "src/components/ui/AccessibleDialog.tsx",
  "src/components/ui/select.tsx",
  "src/components/ui/ContextMenu.tsx",
  "src/components/ui/Meteocon.tsx",
];
const KEY_PAGE_PATHS = [
  "Chat",
  "Image Studio",
  "Media Studio",
  "Workflows",
  "Documents",
  "Settings",
  "Theme Maker",
  "Status",
  "RP Studio",
  "Playground",
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/**
 * Parse the components.md table into rows. Each row is:
 *   [name, sourcePath, description, obviousProps]
 * Returns rows whose first cell is backticked (a code-formatted component
 * name) AND whose second cell is a `.ts` / `.tsx` source path. The second
 * filter naturally discards markdown-table headers, schema-description
 * tables (e.g. extractable-components.md's "Required extraction record
 * schema" rows), and prose paragraphs.
 */
function parseComponentsTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (trimmed.startsWith("|---") || trimmed.startsWith("|:---")) continue;
    const cells = trimmed
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 2) continue;
    // First cell should be a backticked component name like `AccessibleDialog`
    const nameMatch = cells[0].match(/^`([A-Za-z][A-Za-z0-9_]*)`$/);
    if (!nameMatch) continue;
    // Second cell MUST be a source path (`.ts` / `.tsx`). Reject headers,
    // schema rows, prose, and the markdown table separator noise.
    const sourceMatch = cells[1].match(/^`?([^\s`]+\.(?:ts|tsx))`?$/);
    if (!sourceMatch) continue;
    const name = nameMatch[1];
    const sourcePath = sourceMatch[1];
    // Find the props column: the cell after [name, source] that contains
    // backticked identifiers (e.g. `\`icon\`, \`ariaLabel\``). Different
    // init tables use different column counts, so probe cells 3 and 4.
    let props = [];
    for (let i = 3; i < Math.min(cells.length, 6); i++) {
      const cell = cells[i];
      const candidates = cell
        .split(",")
        .map((prop) => prop.trim().replace(/^`|`$/g, ""))
        .filter((prop) => prop.length > 0 && /^[a-zA-Z_$][\w$]*$/.test(prop));
      if (candidates.length >= 1 && cell.includes("`")) {
        props = candidates;
        break;
      }
    }
    rows.push({ name, sourcePath, props });
  }
  return rows;
}

/**
 * Extract the props of the matching exported `<Name>Props` interface from a
 * component source file. When the file contains multiple `*Props` interfaces
 * (e.g. primitives.tsx), pass the component name so we return the right one.
 * Returns a sorted unique array of identifier names, or null when no
 * matching interface can be found (so the verifier emits a soft error
 * rather than silently approving a mismatched signature).
 */
function findInterfaceBody(source, ifaceName) {
  // Walk the source linearly. Each time we see `interface <ifaceName>`
  // (or `interface <Name> extends ...`), capture the body by tracking
  // brace depth from the opening `{` to its matching `}`. This handles
  // nested types like `options: Array<{ value: string; label: string }>`.
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?interface\\s+${ifaceName}\\b(?:\\s+extends\\s+[^\\{]*)?\\s*\\{`,
    "g",
  );
  let m;
  while ((m = re.exec(source)) !== null) {
    const openIdx = m.index + m[0].length; // index right after `{`
    let depth = 1;
    let i = openIdx;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    if (depth === 0) {
      return source.slice(openIdx, i - 1);
    }
  }
  return null;
}

function findDestructuredFnBody(source, fnName) {
  // Find an exported `function <fnName>({...}: <Props>)` and capture the
  // parameter destructure body. Track brace depth from the opening `{` of
  // the destructure to its matching `}`.
  const re = new RegExp(
    `(?:^|\\n)\\s*export\\s+function\\s+${fnName}\\s*\\(\\s*\\{`,
    "g",
  );
  let m;
  while ((m = re.exec(source)) !== null) {
    const openIdx = m.index + m[0].length;
    let depth = 1;
    let i = openIdx;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    if (depth === 0) {
      // Verify the close is followed by `: Props` so we only match typed
      // destructure (not an untyped function param bag).
      const after = source.slice(i, i + 80);
      if (/^\s*:\s*[A-Z]\w*Props\b/.test(after)) {
        return source.slice(openIdx, i - 1);
      }
    }
  }
  return null;
}

function extractComponentPropsFromSource(source, componentName) {
  if (componentName) {
    const ifaceBody = findInterfaceBody(source, `${componentName}Props`);
    if (ifaceBody !== null) return extractMemberNames(ifaceBody);
    const fnBody = findDestructuredFnBody(source, componentName);
    if (fnBody !== null) return extractMemberNames(fnBody);
    return null;
  }
  // No target: return the first interface found (any `*Props` interface).
  const anyRe = /(?:^|\n)\s*(?:export\s+)?interface\s+([A-Z]\w*Props)\b[^{}]*\{/g;
  const m = anyRe.exec(source);
  if (m) {
    const ifaceBody = findInterfaceBody(source, m[1]);
    if (ifaceBody !== null) return extractMemberNames(ifaceBody);
  }
  return null;
}

function extractMemberNames(body) {
  // Walk the body character by character and extract top-level property
  // declarations (`name?: type;` or `name: type;`). Skip tokens that appear
  // inside nested `{...}` blocks (e.g. `options: Array<{ value: string; ... }>`
  // — the inner `value`, `label`, `element` are NOT top-level props). Also
  // skip tokens that appear inside `<...>` generics (which never contain
  // top-level prop declarations, only type references).
  const names = new Set();
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "/" && body[i + 1] === "/") {
      // Line comment — skip to end of line
      const nl = body.indexOf("\n", i);
      i = nl === -1 ? body.length : nl + 1;
      continue;
    }
    if (ch === "/" && body[i + 1] === "*") {
      // Block comment — skip to */
      const end = body.indexOf("*/", i + 2);
      i = end === -1 ? body.length : end + 2;
      continue;
    }
    if (ch === "{" || ch === "<" || ch === "(") {
      // Skip nested block / generic / paren group entirely. This is the
      // critical part: nested object-literal types and generic arguments
      // never declare top-level props.
      const open = ch;
      const close = ch === "{" ? "}" : ch === "<" ? ">" : ")";
      let depth = 1;
      i++;
      while (i < body.length && depth > 0) {
        const c = body[i];
        if (c === open) depth++;
        else if (c === close) depth--;
        else if (c === '"' || c === "'" || c === "`") {
          // Skip over string literals (no nested braces inside simple strings,
          // but template literals can contain `${...}` — handle that too).
          const quote = c;
          i++;
          while (i < body.length && body[i] !== quote) {
            if (body[i] === "\\") { i += 2; continue; }
            if (quote === "`" && body[i] === "$" && body[i + 1] === "{") {
              i += 2;
              let tDepth = 1;
              while (i < body.length && tDepth > 0) {
                const tc = body[i];
                if (tc === "{") tDepth++;
                else if (tc === "}") tDepth--;
                i++;
              }
              continue;
            }
            i++;
          }
          i++;
          continue;
        }
        else if (c === "/" && body[i + 1] === "/") {
          const nl = body.indexOf("\n", i);
          i = nl === -1 ? body.length : nl + 1;
          continue;
        }
        else if (c === "/" && body[i + 1] === "*") {
          const end = body.indexOf("*/", i + 2);
          i = end === -1 ? body.length : end + 2;
          continue;
        }
        i++;
      }
      continue;
    }
    // Look for top-level property: identifier followed by optional `?`
    // then `:`. Allow `readonly` modifier.
    const rest = body.slice(i);
    const propMatch = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*(\?)?\s*:/m.exec(rest);
    if (propMatch) {
      const name = propMatch[1];
      if (
        name !== "interface" &&
        name !== "type" &&
        name !== "extends" &&
        name !== "readonly"
      ) {
        names.add(name);
      }
      // Skip past the prop name + optional ? + : and resume scanning AFTER
      // the colon so the value type is parsed by the next iteration.
      i += propMatch[0].length;
      continue;
    }
    i++;
  }
  return [...names].sort();
}

function verifySuperdesignInit(repoRoot) {
  const errors = [];
  const initRoot = path.join(repoRoot, INIT_DIR);
  const contents = new Map();

  for (const file of REQUIRED_FILES) {
    const target = path.join(initRoot, file);
    if (!fs.existsSync(target)) {
      errors.push(`${INIT_DIR}/${file} is missing.`);
      continue;
    }
    const content = fs.readFileSync(target, "utf8");
    contents.set(file, content);
    if (!content.trim()) errors.push(`${INIT_DIR}/${file} is empty.`);
  }

  const components = contents.get("components.md") || "";
  const layouts = contents.get("layouts.md") || "";
  const routes = contents.get("routes.md") || "";
  const theme = contents.get("theme.md") || "";
  const pages = contents.get("pages.md") || "";
  const extractable = contents.get("extractable-components.md") || "";

  for (const sourcePath of REQUIRED_SOURCE_PATHS) {
    if (!routes.includes(sourcePath) && !components.includes(sourcePath) && !layouts.includes(sourcePath) && !theme.includes(sourcePath)) {
      errors.push(`Init bundle does not reference required source path ${sourcePath}.`);
    }
  }

  if (!components.includes("```tsx") && !components.includes("```typescript")) {
    errors.push("components.md must include fenced actual TypeScript/TSX source.");
  }
  if (!layouts.includes("```tsx") && !layouts.includes("```typescript")) {
    errors.push("layouts.md must include fenced actual TypeScript/TSX layout source.");
  }
  if (!routes.includes("src/config/tabs.ts") || !routes.includes("CANONICAL_TAB_ORDER")) {
    errors.push("routes.md must identify src/config/tabs.ts and CANONICAL_TAB_ORDER as authority.");
  }
  for (const page of KEY_PAGE_PATHS) {
    if (!pages.includes(`**${page}**`) && !pages.includes(`## ${page}`) && !pages.includes(`### ${page}`) && !pages.includes(`**${page}:`)) {
      errors.push(`pages.md is missing key page entry ${page}.`);
    }
  }
  for (const field of ["name", "source path", "category", "description", "state/navigation props", "hardcoded elements"]) {
    if (!extractable.toLowerCase().includes(field.toLowerCase())) {
      errors.push(`extractable-components.md is missing schema field ${field}.`);
    }
  }
  if (!theme.includes("#050505") || !theme.includes("#ef555f") || !theme.includes("src/theme/builtins/venice.ts")) {
    errors.push("theme.md does not contain current Venice near-black/crimson fingerprints and source authority.");
  }
  if (!theme.includes("```css")) {
    errors.push("theme.md must include a fenced raw CSS/token source section.");
  }

  // VF-AUD-20260916-P2-001 — represented-component prop signatures must match
  // current source. A documented prop that does not exist in source (e.g.
  // AccessibleDialog.open when the real interface has no `open`) is an error;
  // a real prop that is missing from the doc is also an error.
  const componentRows = parseComponentsTable(components);
  const extractableRows = parseComponentsTable(extractable);
  const allRows = [...componentRows, ...extractableRows];
  // Cache per-source-path file content so a multi-component source like
  // primitives.tsx is read once but checked against every row.
  const sourceCache = new Map();
  for (const row of allRows) {
    let source = sourceCache.get(row.sourcePath);
    if (source === undefined) {
      try {
        source = read(repoRoot, row.sourcePath);
      } catch (err) {
        source = `__read_error__: ${err.message}`;
      }
      sourceCache.set(row.sourcePath, source);
    }
    if (typeof source === "string" && source.startsWith("__read_error__:")) {
      errors.push(`components.md / extractable-components.md documents \`${row.name}\` at ${row.sourcePath}, but that source file cannot be read (${source.slice("__read_error__:".length)}).`);
      continue;
    }
    const sourceProps = extractComponentPropsFromSource(source, row.name);
    if (sourceProps === null) {
      errors.push(`Verifier could not extract props from ${row.sourcePath} for component \`${row.name}\`; no matching Props interface or destructured parameter signature was found. Update REQUIRED_COMPONENT_SOURCES or refresh the init bundle.`);
      continue;
    }
    const sourceSet = new Set(sourceProps);
    const docSet = new Set(row.props);
    const notInSource = [...docSet].filter((p) => !sourceSet.has(p));
    const notInDoc = [...sourceSet].filter((p) => !docSet.has(p));
    if (notInSource.length > 0) {
      errors.push(`${row.sourcePath} (documented as \`${row.name}\`) lists prop(s) [${notInSource.join(", ")}] in the init bundle that do not exist in the current source. Regenerate .superdesign/init.`);
    }
    if (notInDoc.length > 0) {
      errors.push(`${row.sourcePath} (documented as \`${row.name}\`) is missing prop(s) [${notInDoc.join(", ")}] from the init bundle. Regenerate .superdesign/init.`);
    }
  }
  // Every REQUIRED_COMPONENT_SOURCES path must appear in at least one of the
  // two component tables so it has a documented representation. Otherwise
  // we have no fingerprint check for that source file.
  const documentedSourcePaths = new Set(allRows.map((row) => row.sourcePath));
  for (const requiredPath of REQUIRED_COMPONENT_SOURCES) {
    if (!documentedSourcePaths.has(requiredPath)) {
      errors.push(`${requiredPath} is in REQUIRED_COMPONENT_SOURCES but not represented in components.md or extractable-components.md; add it to the init bundle to enable source-fingerprint verification.`);
    }
  }

  const fingerprintSource = [
    ...REQUIRED_SOURCE_PATHS,
    ...REQUIRED_COMPONENT_SOURCES,
  ].map((sourcePath) => `${sourcePath}\n${read(repoRoot, sourcePath)}`).join("\n");
  const fingerprint = sha256(fingerprintSource).slice(0, 16);
  if (!contents.get("routes.md")?.includes(fingerprint)) {
    errors.push(`routes.md source fingerprint is stale or missing (expected ${fingerprint}).`);
  }

  return { passed: errors.length === 0, errors, fingerprint };
}

function main() {
  const result = verifySuperdesignInit(path.resolve(__dirname, ".."));
  if (!result.passed) {
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  console.log(`[verify:superdesign-init] passed (source fingerprint ${result.fingerprint}).`);
}

module.exports = { verifySuperdesignInit, REQUIRED_FILES, REQUIRED_SOURCE_PATHS, REQUIRED_COMPONENT_SOURCES, parseComponentsTable, extractComponentPropsFromSource };
if (require.main === module) main();
