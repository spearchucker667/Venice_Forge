#!/usr/bin/env node
/**
 * verify-theme-tokens.cjs
 *
 * Static theme-token verifier for themeable UI components.
 * Enforces semantic theme tokens over hardcoded light/dark Tailwind colors.
 *
 * Forbidden patterns:
 *   - text-white, text-black
 *   - bg-white, bg-black
 *   - border-white, border-black
 *   - divide-white
 *   - placeholder:text-white
 *   - ring-white, shadow-white
 *   - hardcoded near-black panels: bg-[#000], bg-[#050505], bg-neutral-950,
 *     bg-zinc-950, bg-slate-950
 *
 * Intentional fixed colors can be allowlisted per-line with:
 *   // THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR
 *
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ALLOW_COMMENT = "THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR";

const SCAN_ROOTS = ["src/App.tsx", "src/components"];
const INVALID_BROWSER_TOKEN_SCAN_ROOTS = [
  "src/components/research",
  "src/components/search",
  "src/styles",
  "assets",
];
const SYNTAX_COLOR_SCAN_ROOTS = ["src/components/chat", "src/styles"];

const FORBIDDEN = [
  { pattern: /\btext-white(?:\/|\b)/, name: "text-white" },
  { pattern: /\btext-black(?:\/|\b)/, name: "text-black" },
  { pattern: /\bbg-white(?:\/|\b)/, name: "bg-white" },
  { pattern: /\bbg-black(?:\/|\b)/, name: "bg-black" },
  { pattern: /\bborder-white(?:\/|\b)/, name: "border-white" },
  { pattern: /\bborder-black(?:\/|\b)/, name: "border-black" },
  { pattern: /\bdivide-white(?:\/|\b)/, name: "divide-white" },
  { pattern: /\bdivide-black(?:\/|\b)/, name: "divide-black" },
  { pattern: /\bplaceholder:text-white(?:\/|\b)/, name: "placeholder:text-white" },
  { pattern: /\bplaceholder:text-black(?:\/|\b)/, name: "placeholder:text-black" },
  { pattern: /\bring-white(?:\/|\b)/, name: "ring-white" },
  { pattern: /\bring-black(?:\/|\b)/, name: "ring-black" },
  { pattern: /\bshadow-white(?:\/|\b)/, name: "shadow-white" },
  { pattern: /\bshadow-black(?:\/|\b)/, name: "shadow-black" },
  { pattern: /\bbg-\[#0{3,6}\]/, name: "hardcoded bg-[#000]" },
  { pattern: /\bbg-\[#050505\]/, name: "hardcoded bg-[#050505]" },
  { pattern: /\bbg-neutral-950\b/, name: "bg-neutral-950" },
  { pattern: /\bbg-zinc-950\b/, name: "bg-zinc-950" },
  { pattern: /\bbg-slate-950\b/, name: "bg-slate-950" },
  // Static dark surface scale in theme.css is not theme-aware.
  { pattern: /\bbg-bg-base\b/, name: "hardcoded bg-bg-base" },
  { pattern: /\bbg-bg-raised\b/, name: "hardcoded bg-bg-raised" },
  { pattern: /\bbg-bg-overlay\b/, name: "hardcoded bg-bg-overlay" },
];

const SYNTAX_COLOR_PATTERNS = [
  // Hex colors (3, 4, 6, or 8 digit). Allows an optional quote so TS/JS
  // string literals are caught alongside CSS declarations.
  { pattern: /:\s*['"]?#[0-9a-fA-F]{3,8}\b/, name: "hardcoded hex color" },
  // rgb()/rgba()
  { pattern: /:\s*['"]?rgba?\s*\(/, name: "hardcoded rgb color" },
  // hsl()/hsla()
  { pattern: /:\s*['"]?hsla?\s*\(/, name: "hardcoded hsl color" },
  // Common named colors used as CSS values.
  {
    pattern: /:\s*['"]?(red|green|blue|white|black|yellow|orange|purple|pink|cyan|magenta|gray|grey|brown|lime|indigo|violet|teal|navy|maroon|olive)\b/,
    name: "hardcoded named color",
  },
];

const INVALID_BROWSER_TOKENS = [
  "--surface-sunken",
  "--surface-base",
  "--surface-raised",
  "--surface-hover",
  "--border-subtle",
  "--brand-primary",
  "--brand-primary-hover",
  "--brand-primary-fg",
  "--tone-error",
  "--tone-warning",
  "--tone-success",
  "--tone-info",
  "--glow-primary",
  // Removed in 2026-07: text tier uses --text-primary / --text-muted /
  // --foreground-subtle only.
  "--text-subtle",
];

function isSourceFile(entry) {
  return (
    (entry.endsWith(".tsx") || entry.endsWith(".ts")) &&
    !entry.endsWith(".test.ts") &&
    !entry.endsWith(".test.tsx")
  );
}

function isThemeScanFile(entry) {
  return (
    entry.endsWith(".tsx") ||
    entry.endsWith(".ts") ||
    entry.endsWith(".css") ||
    entry.endsWith(".html")
  );
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function collectScanFiles(root, scanRoots) {
  const files = new Set();
  for (const target of scanRoots) {
    const abs = path.resolve(root, target);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      files.add(toPosixPath(path.relative(root, abs)));
      continue;
    }
    function walk(dir) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const s = fs.statSync(full);
        if (s.isDirectory()) {
          walk(full);
        } else if (s.isFile() && isSourceFile(entry)) {
          files.add(toPosixPath(path.relative(root, full)));
        }
      }
    }
    walk(abs);
  }
  return files;
}

function collectTokenScanFiles(root, scanRoots) {
  const files = new Set();
  for (const target of scanRoots) {
    const abs = path.resolve(root, target);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      files.add(toPosixPath(path.relative(root, abs)));
      continue;
    }
    function walk(dir) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const s = fs.statSync(full);
        if (s.isDirectory()) {
          walk(full);
        } else if (s.isFile() && isThemeScanFile(entry)) {
          files.add(toPosixPath(path.relative(root, full)));
        }
      }
    }
    walk(abs);
  }
  return files;
}

function scanFile(root, relPath, forbidden, allowComment) {
  const abs = path.resolve(root, relPath);
  const content = fs.readFileSync(abs, "utf8");
  const lines = content.split(/\r?\n/);
  const violations = [];
  lines.forEach((line, idx) => {
    if (line.includes(allowComment)) return;
    for (const { pattern, name } of forbidden) {
      if (pattern.test(line)) {
        violations.push(`${relPath}:${idx + 1}: ${name}: ${line.trim()}`);
      }
    }
  });
  return violations;
}

function verifySyntaxColorTokens(root, options = {}) {
  const scanRoots = options.syntaxColorScanRoots ?? SYNTAX_COLOR_SCAN_ROOTS;
  const patterns = options.syntaxColorPatterns ?? SYNTAX_COLOR_PATTERNS;
  const allowComment = options.allowComment ?? ALLOW_COMMENT;

  const files = collectTokenScanFiles(root, scanRoots);
  const violations = [];

  for (const file of files) {
    const abs = path.resolve(root, file);
    const content = fs.readFileSync(abs, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (line.includes(allowComment)) return;
      for (const { pattern, name } of patterns) {
        if (pattern.test(line)) {
          violations.push(`${file}:${idx + 1}: ${name}: ${line.trim()}`);
        }
      }
    });
  }

  return violations;
}

function verifyThemeTokens(root, options = {}) {
  const scanRoots = options.scanRoots ?? SCAN_ROOTS;
  const forbidden = options.forbidden ?? FORBIDDEN;
  const allowComment = options.allowComment ?? ALLOW_COMMENT;

  const files = collectScanFiles(root, scanRoots);
  const allViolations = [];

  for (const file of files) {
    const fileViolations = scanFile(root, file, forbidden, allowComment);
    allViolations.push(...fileViolations);
  }

  const invalidBrowserTokenFiles = collectTokenScanFiles(root, options.invalidTokenScanRoots ?? INVALID_BROWSER_TOKEN_SCAN_ROOTS);
  for (const file of invalidBrowserTokenFiles) {
    const content = fs.readFileSync(path.resolve(root, file), "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (line.includes(allowComment)) return;
      for (const token of INVALID_BROWSER_TOKENS) {
        if (line.includes(token)) {
          allViolations.push(`${file}:${idx + 1}: invalid browser theme token ${token}: ${line.trim()}`);
        }
      }
    });
  }

  const syntaxColorFiles = collectTokenScanFiles(root, options.syntaxColorScanRoots ?? SYNTAX_COLOR_SCAN_ROOTS);
  const syntaxColorViolations = verifySyntaxColorTokens(root, options);
  allViolations.push(...syntaxColorViolations);

  return {
    ok: allViolations.length === 0,
    filesScanned: files.size + invalidBrowserTokenFiles.size + syntaxColorFiles.size,
    violations: allViolations,
  };
}

function verifyBuiltinFamilies(root) {
  const builtinsDir = path.resolve(root, "src/theme/builtins");
  const violations = [];
  if (!fs.existsSync(builtinsDir)) {
    violations.push(`missing ${path.relative(root, builtinsDir)}`);
    return violations;
  }
  const files = fs.readdirSync(builtinsDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
  for (const file of files) {
    const abs = path.join(builtinsDir, file);
    const content = fs.readFileSync(abs, "utf8");
    if (!/schemaVersion:\s*2/.test(content)) {
      violations.push(`${path.relative(root, abs)}: missing schemaVersion: 2`);
    }
    if (!/variants:\s*\{/.test(content)) {
      violations.push(`${path.relative(root, abs)}: missing variants block`);
    }
    if (!/light:\s*\{/.test(content)) {
      violations.push(`${path.relative(root, abs)}: missing light variant`);
    }
    if (!/dark:\s*\{/.test(content)) {
      violations.push(`${path.relative(root, abs)}: missing dark variant`);
    }
  }
  return violations;
}

/* === Theme token resolvability audit (THEME-P2-015) =====================
   Tailwind v4 emits NO CSS for an unresolved utility (silent no-op), and an
   arbitrary value like bg-[var(--token)] silently falls back to nothing when
   the token is never defined. This audit fails the build when a utility or
   var() reference points at a theme token outside the DEFINED set:

     DEFINED = --* keys declared in src/styles/theme.css (the @theme block is
               what Tailwind resolves utilities from; :root keys are valid
               var() targets) + the runtime map keys written by
               src/theme/applyTheme.ts + an explicit RUNTIME_WRITERS allowlist
               (setProperty writers outside the applyTheme map).
   ===================================================================== */

// setProperty() writers outside applyTheme's canonical map (enumerated via
// rg "setProperty\\(\\s*['\"]--"). applyTheme map keys are parsed separately.
const RUNTIME_WRITERS = [
  "--app-font-family",
  "--app-font-scale",
  "--app-font-size",
  "--font-sans",
  "--generation-progress",
  "--prefers-reduced-motion",
  "--sidebar-width",
  "--vf-progress-pct",
];

// ThemePreview writes a scoped --preview-* family; treat the prefix as defined.
const RUNTIME_WRITER_PREFIXES = ["--preview-", "--theme-"];

const RESOLVABILITY_SCAN_ROOTS = ["src"];

// Utility prefixes audited for theme-token resolvability (per THEME-P2-015).
const UTILITY_PREFIX_RE = /(?<![-\w])(bg|text|border|max-w)-([A-Za-z][A-Za-z0-9-]*)/g;

// Arbitrary value referencing a CSS custom property, e.g. bg-[var(--token)].
const ARBITRARY_VAR_RE = /-\[var\(\s*(--[A-Za-z0-9-]+)\s*\)\]/g;

// Tailwind default palette hues; <hue>-<shade> always resolves from the
// default theme, so it is not theme-token-shaped and must not be flagged.
const DEFAULT_PALETTE_HUES = new Set([
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink",
  "rose", "slate", "gray", "grey", "zinc", "neutral", "stone",
]);

// Utility names that never reference a --color-*/--container-* token.
const NON_THEME_UTILITY_NAMES = new Set([
  "inherit", "current", "transparent", "black", "white", "none",
  // background geometry / repeat / attachment
  "fixed", "local", "scroll", "clip", "cover", "contain", "center", "top",
  "bottom", "left", "right", "auto", "repeat", "repeat-x", "repeat-y", "no-repeat",
  // font-size scale (Tailwind + this repo's vf type scale)
  "xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl",
  "8xl", "9xl", "display", "h1", "h2", "body", "meta", "tag",
  // text alignment / transform / overflow / decoration
  "justify", "start", "end", "uppercase", "lowercase", "capitalize", "truncate",
  "ellipsis", "wrap", "nowrap", "balance", "pretty", "underline", "overline",
  "line-through", "no-underline",
  // border sides / style / width
  "t", "r", "b", "l", "x", "y", "s", "e", "solid", "dashed", "dotted", "double",
  "hidden", "collapse", "separate", "0", "2", "4", "8",
  // max-w sizing keywords + default container scale
  "full", "min", "max", "fit", "prose", "screen",
]);

// Every element.style.setProperty("--token", ...) writer in src is a runtime
// definition (e.g. --theme-* swatch previews, --sidebar-width, --preview-*),
// so var(--token) against it resolves. Enumerate them dynamically rather than
// maintaining a brittle hand list.
function collectSetPropertyWriters(root) {
  const writers = new Set();
  for (const file of collectTokenScanFiles(root, RESOLVABILITY_SCAN_ROOTS)) {
    const content = fs.readFileSync(path.resolve(root, file), "utf8");
    for (const m of content.matchAll(/setProperty\(\s*['"](--[A-Za-z0-9-]+)['"]/g)) {
      writers.add(m[1]);
    }
  }
  return writers;
}

function loadDefinedTokens(root) {
  const defined = new Set();
  const themeCssPath = path.join(root, "src/styles/theme.css");
  if (fs.existsSync(themeCssPath)) {
    const css = fs.readFileSync(themeCssPath, "utf8");
    for (const m of css.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) defined.add(m[1]);
  }
  const applyThemePath = path.join(root, "src/theme/applyTheme.ts");
  if (fs.existsSync(applyThemePath)) {
    const src = fs.readFileSync(applyThemePath, "utf8");
    for (const m of src.matchAll(/'(--[A-Za-z0-9-]+)'\s*:/g)) defined.add(m[1]);
  }
  for (const token of RUNTIME_WRITERS) defined.add(token);
  for (const token of collectSetPropertyWriters(root)) defined.add(token);
  return defined;
}

function isDefinedToken(definedTokens, token) {
  if (definedTokens.has(token)) return true;
  return RUNTIME_WRITER_PREFIXES.some((prefix) => token.startsWith(prefix));
}

// Tokens Tailwind resolves color/container utilities from: the @theme block.
function loadThemeNamespaceTokens(root) {
  const empty = { color: new Set(), container: new Set() };
  const cssPath = path.join(root, "src/styles/theme.css");
  if (!fs.existsSync(cssPath)) return empty;
  const css = fs.readFileSync(cssPath, "utf8");
  const start = css.indexOf("@theme");
  if (start === -1) return empty;
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  if (open === -1 || close === -1) return empty;
  const block = css.slice(open, close);
  for (const m of block.matchAll(/^\s*(--color-[A-Za-z0-9-]+)\s*:/gm)) {
    empty.color.add(m[1]);
  }
  for (const m of block.matchAll(/^\s*(--container-[A-Za-z0-9-]+)\s*:/gm)) {
    empty.container.add(m[1]);
  }
  return empty;
}

// Non-test source/stylesheet files audited for token resolvability.
function collectResolvabilityFiles(root, scanRoots) {
  const files = new Set();
  for (const file of collectTokenScanFiles(root, scanRoots)) {
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
    files.add(file);
  }
  return files;
}

// (a) bg-[var(--X)] / text-[var(--X)] / border-[var(--X)] (any prefix) and any
//     stylesheet var(--token) reference must name a defined token.
function verifyArbitraryVarRefs(root, definedTokens, scanRoots = RESOLVABILITY_SCAN_ROOTS) {
  const files = collectResolvabilityFiles(root, scanRoots);
  const violations = [];
  for (const file of files) {
    const content = fs.readFileSync(path.resolve(root, file), "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (line.includes(ALLOW_COMMENT)) return;
      ARBITRARY_VAR_RE.lastIndex = 0;
      let m;
      while ((m = ARBITRARY_VAR_RE.exec(line)) !== null) {
        const token = m[1];
        if (!isDefinedToken(definedTokens, token)) {
          violations.push(
            `${file}:${idx + 1}: unresolved var() reference ${token}: ${line.trim()}`,
          );
        }
      }
    });
  }
  return { filesScanned: files.size, violations };
}

function isDefaultPaletteName(name) {
  const parts = name.split("-");
  if (parts.length < 2) return false;
  const shade = parts[parts.length - 1];
  return DEFAULT_PALETTE_HUES.has(parts[0]) && /^\d{2,3}$/.test(shade);
}

// border-<side>-<width|color> (e.g. border-b-0, border-l-4, border-l-accent)
// is a per-side utility, not a whole-border color. Return the color part to
// check, or null when the remainder is a border width / non-theme keyword.
function borderSideColorName(name) {
  const side = /^([trblxyse])-(.+)$/.exec(name);
  if (!side) return name; // whole-border color, e.g. border-vf-panel-border
  const rest = side[2];
  if (/^(0|2|4|8|default)$/.test(rest)) return null; // border width
  return rest; // per-side color name (accent, transparent, vf-panel-border, ...)
}

// (b) theme-token-shaped bg-/text-/border-/max-w-<name> utilities must resolve
//     from a --color-<name> / --container-<name> token declared in @theme.
//     Utilities only exist in ts/tsx sources (stylesheets use raw CSS, where
//     border-color:/border-radius: would be false positives), so .css/.html
//     are excluded here. bg/border/max-w have no English-word collision, so
//     they are checked on every line — this catches class strings built in
//     const maps (e.g. ToastItem SEVERITY_STYLES), not just inline className
//     attributes. text-* collides with prose ("text-only", model types like
//     "text-to-image"), so it stays scoped to class-bearing lines.
function verifyUtilityResolvability(root, namespace, scanRoots = RESOLVABILITY_SCAN_ROOTS) {
  const files = [...collectResolvabilityFiles(root, scanRoots)].filter(
    (file) => file.endsWith(".ts") || file.endsWith(".tsx"),
  );
  const violations = [];
  for (const file of files) {
    const content = fs.readFileSync(path.resolve(root, file), "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (line.includes(ALLOW_COMMENT)) return;
      // text-* collides with ordinary prose ("text-only", model types like
      // "text-to-image"), so it is only honoured on class-bearing lines.
      // bg/border/max-w have no such collision and are checked on every line,
      // which also catches class strings built in const maps.
      const classBearingLine = /className|class\s*=|cn\(|classList/.test(line);
      UTILITY_PREFIX_RE.lastIndex = 0;
      let m;
      while ((m = UTILITY_PREFIX_RE.exec(line)) !== null) {
        const prefix = m[1];
        let name = m[2];
        if (prefix === "text" && !classBearingLine) continue;
        if (NON_THEME_UTILITY_NAMES.has(name)) continue;
        if (isDefaultPaletteName(name)) continue;
        if (prefix === "max-w") {
          const token = `--container-${name}`;
          if (!namespace.container.has(token)) {
            violations.push(
              `${file}:${idx + 1}: unresolved utility max-w-${name} (${token} missing from @theme): ${line.trim()}`,
            );
          }
          continue;
        }
        if (prefix === "border") {
          name = borderSideColorName(name);
          if (name === null || NON_THEME_UTILITY_NAMES.has(name) || isDefaultPaletteName(name)) {
            continue;
          }
        }
        const token = `--color-${name}`;
        if (!namespace.color.has(token)) {
          violations.push(
            `${file}:${idx + 1}: unresolved utility ${prefix}-${name} (${token} missing from @theme): ${line.trim()}`,
          );
        }
      }
    });
  }
  return { filesScanned: files.size, violations };
}

function verifyTokenResolvability(root) {
  const definedTokens = loadDefinedTokens(root);
  const namespace = loadThemeNamespaceTokens(root);
  const arb = verifyArbitraryVarRefs(root, definedTokens);
  const util = verifyUtilityResolvability(root, namespace);
  return {
    ok: arb.violations.length === 0 && util.violations.length === 0,
    filesScanned: new Set([...collectResolvabilityFiles(root, RESOLVABILITY_SCAN_ROOTS)]).size,
    violations: [...arb.violations, ...util.violations],
  };
}

function main() {
  const result = verifyThemeTokens(ROOT);
  const familyViolations = verifyBuiltinFamilies(ROOT);
  const resolvability = verifyTokenResolvability(ROOT);
  const allViolations = [...result.violations, ...familyViolations, ...resolvability.violations];

  if (allViolations.length === 0) {
    console.log(
      `[verify:theme-tokens] OK: no forbidden hardcoded color classes in themeable UI (${result.filesScanned} files scanned).`,
    );
    console.log(
      `[verify:theme-tokens] OK: all theme tokens resolve (${resolvability.filesScanned} files scanned).`,
    );
    process.exit(0);
  }

  console.error(`[verify:theme-tokens] FAILED: ${allViolations.length} violation(s)`);
  for (const v of allViolations) {
    console.error(`  ${v}`);
  }
  console.error(`\nUse \`// ${ALLOW_COMMENT}\` sparingly to document intentional fixed colors.`);

  process.exit(1);
}

module.exports = {
  ALLOW_COMMENT,
  ARBITRARY_VAR_RE,
  DEFAULT_PALETTE_HUES,
  FORBIDDEN,
  INVALID_BROWSER_TOKENS,
  INVALID_BROWSER_TOKEN_SCAN_ROOTS,
  NON_THEME_UTILITY_NAMES,
  RESOLVABILITY_SCAN_ROOTS,
  RUNTIME_WRITERS,
  RUNTIME_WRITER_PREFIXES,
  SCAN_ROOTS,
  SYNTAX_COLOR_PATTERNS,
  SYNTAX_COLOR_SCAN_ROOTS,
  UTILITY_PREFIX_RE,
  collectResolvabilityFiles,
  collectScanFiles,
  collectTokenScanFiles,
  isDefinedToken,
  isSourceFile,
  isThemeScanFile,
  loadDefinedTokens,
  loadThemeNamespaceTokens,
  scanFile,
  toPosixPath,
  verifyArbitraryVarRefs,
  verifyBuiltinFamilies,
  verifySyntaxColorTokens,
  verifyThemeTokens,
  verifyTokenResolvability,
  verifyUtilityResolvability,
};

if (require.main === module) {
  main();
}
