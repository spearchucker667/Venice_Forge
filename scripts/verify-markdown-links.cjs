#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const SCAN_ROOTS = ["."];
const EXCLUDED_DIRS = new Set(["node_modules", "dist", "dist-electron", "release", "coverage", ".git"]);
const EXTERNAL_SCHEME_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const RETIRED_MODULE_NAMES = ["SearchScrapeModule", "ChatModule", "ImageModule", "BatchModule"];
const RETIRED_MODULE_RE = new RegExp(`\\b(${RETIRED_MODULE_NAMES.join("|")})\\b`, "g");
const HISTORICAL_CONTEXT_RE = /\b(historical|retired|former|formerly|legacy|deprecated|removed|replaces?|replaced|refactored?|refactor|no longer exists?|no longer tracked|no longer used)\b/i;
const HISTORICAL_PATH_RE = /(CHANGELOG|archive|historical|summary_of_work)/i;

function compileGitignorePattern(rawPattern) {
  // Input is a line from the developer's own checked-in `.gitignore`
  // file, NOT an untrusted user input. The output regex is used to
  // match relative filesystem paths and decide whether to skip a
  // file/link target during the docs link audit. A malicious
  // `.gitignore` can only cause the script to ignore the wrong files
  // during this audit run; it cannot escalate to anything else. The
  // regex compilation is straightforward — single `*` becomes `[^/]*`,
  // `**` becomes `.*`, `?` becomes `[^/]`, character classes / braces
  // are escaped / expanded in a single pass. There is no
  // re-introduction vector: the output is a `RegExp` object, never
  // re-substituted back into a string.
  // nosec:js/incomplete-multi-character-sanitization
  const pattern = rawPattern.trim();
  if (!pattern || pattern.startsWith("#")) return null;

  const negated = pattern.startsWith("!");
  const body = negated ? pattern.slice(1) : pattern;
  const anchored = body.startsWith("/");
  const cleanBody = anchored ? body.slice(1) : body;
  const dirOnly = cleanBody.endsWith("/");
  const glob = dirOnly ? cleanBody.slice(0, -1) : cleanBody;

  if (!glob) return null;

  const regexBody = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLESTAR::/g, ".*")
    .replace(/\?/g, "[^/]")
    .replace(/\{([^}]+)\}/g, (_, group) => `(${group.split(",").join("|")})`);

  const regex = new RegExp(
    `^${anchored ? "" : "(?:.*/)??"}${regexBody}${dirOnly ? "(?:/|$)" : "$"}`,
  );

  return { regex, negated, dirOnly };
}

function loadGitignoreMatcher(rootDir) {
  const gitignorePath = path.join(rootDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return () => false;
  const patterns = fs
    .readFileSync(gitignorePath, "utf8")
    .split(/\r?\n/)
    .map(compileGitignorePattern)
    .filter(Boolean);

  return (absolutePath) => {
    const relative = path.relative(rootDir, absolutePath).split(path.sep).join("/");
    if (!relative || relative.startsWith("..")) return false;
    let ignored = false;
    for (const { regex, negated } of patterns) {
      if (regex.test(relative)) ignored = !negated;
    }
    return ignored;
  };
}

function collectMarkdownFiles(rootDir, scanRoots = SCAN_ROOTS, options = {}) {
  const isIgnored = options.isIgnored || (() => false);
  const files = [];

  const visit = (absolutePath) => {
    if (isIgnored(absolutePath)) return;
    if (!fs.existsSync(absolutePath)) return;
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      if (EXCLUDED_DIRS.has(path.basename(absolutePath))) return;
      for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
        visit(path.join(absolutePath, entry.name));
      }
      return;
    }
    if (absolutePath.toLowerCase().endsWith(".md")) files.push(absolutePath);
  };

  for (const scanRoot of scanRoots) visit(path.resolve(rootDir, scanRoot));
  return files.sort();
}

function stripFencedCode(text) {
  let inFence = false;
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return "";
      }
      if (inFence) return "";
      return line;
    })
    .join("\n");
}

function stripCode(text) {
  return stripFencedCode(text).replace(/`[^`]*`/g, "");
}

function githubSlug(value) {
  // `value` is a heading text from the developer's own checked-in
  // Markdown files, NOT an untrusted user input. The output is a URL
  // slug used to verify in-doc `#fragment` link targets against
  // GitHub's slug rules; it is never injected into a DOM, template,
  // shell, or SQL. The final `replace(/[^\p{L}\p{N}_-]/gu, "")` is a
  // hard character-class whitelist that already drops every non-
  // letter / non-digit / non-underscore / non-dash character, so
  // there is no re-introduction vector that could produce a dangerous
  // substring. The intermediate `<[^>]+>` strip is a no-op for the
  // final output.
  // nosec:js/incomplete-multi-character-sanitization
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/\s/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

function collectAnchors(markdown) {
  const anchors = new Set();
  const counts = new Map();
  const stripped = stripFencedCode(markdown);

  for (const match of stripped.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = githubSlug(match[1]);
    if (!base) continue;
    const count = counts.get(base) || 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    counts.set(base, count + 1);
  }
  for (const match of stripped.matchAll(/<(?:a\s+[^>]*?(?:id|name)|[^>]+\s+id)=["']([^"']+)["'][^>]*>/gi)) {
    anchors.add(match[1]);
  }
  return anchors;
}

function destinationFromRaw(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("<")) {
    const end = trimmed.indexOf(">");
    return end >= 0 ? trimmed.slice(1, end) : trimmed.slice(1);
  }
  return trimmed.split(/\s+["'(]/, 1)[0];
}

function extractLinks(markdown) {
  const stripped = stripCode(markdown);
  const references = new Map();
  const links = [];

  for (const match of stripped.matchAll(/^\s{0,3}\[([^\]]+)\]:\s*(\S+|<[^>]+>)/gm)) {
    references.set(match[1].trim().toLowerCase(), destinationFromRaw(match[2]));
  }
  for (const match of stripped.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    links.push({ destination: destinationFromRaw(match[1]), index: match.index });
  }
  for (const match of stripped.matchAll(/!?\[([^\]]+)\]\[([^\]]*)\]/g)) {
    const key = (match[2] || match[1]).trim().toLowerCase();
    if (references.has(key)) links.push({ destination: references.get(key), index: match.index });
  }
  for (const match of stripped.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    links.push({ destination: match[1], index: match.index });
  }
  return { links, stripped };
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function verifyMarkdownLinks(rootDir, options = {}) {
  const isIgnored = options.isIgnored || (() => false);
  const files = options.files || collectMarkdownFiles(rootDir, options.scanRoots, { isIgnored });
  const errors = [];
  const anchorCache = new Map();

  for (const sourcePath of files) {
    const markdown = fs.readFileSync(sourcePath, "utf8");
    const { links, stripped } = extractLinks(markdown);
    for (const link of links) {
      const destination = link.destination?.trim();
      if (!destination || EXTERNAL_SCHEME_RE.test(destination) || destination.startsWith("/")) continue;

      const hashIndex = destination.indexOf("#");
      const rawTarget = hashIndex >= 0 ? destination.slice(0, hashIndex) : destination;
      const fragment = hashIndex >= 0 ? destination.slice(hashIndex + 1) : "";
      const queryIndex = rawTarget.indexOf("?");
      const cleanTarget = decodePath(queryIndex >= 0 ? rawTarget.slice(0, queryIndex) : rawTarget);
      const targetPath = cleanTarget
        ? path.resolve(path.dirname(sourcePath), cleanTarget)
        : sourcePath;
      const line = lineNumberAt(stripped, link.index);

      if (isIgnored(targetPath)) continue;
      if (!fs.existsSync(targetPath)) {
        errors.push({ sourcePath, line, destination, reason: "target does not exist" });
        continue;
      }
      if (!fragment || !targetPath.toLowerCase().endsWith(".md")) continue;

      let anchors = anchorCache.get(targetPath);
      if (!anchors) {
        anchors = collectAnchors(fs.readFileSync(targetPath, "utf8"));
        anchorCache.set(targetPath, anchors);
      }
      const decodedFragment = decodePath(fragment).toLowerCase();
      if (!anchors.has(decodedFragment)) {
        errors.push({ sourcePath, line, destination, reason: `heading fragment #${decodedFragment} does not exist` });
      }
    }
  }
  return { filesChecked: files.length, errors };
}

function verifyRetiredModuleReferences(files) {
  const errors = [];
  for (const sourcePath of files) {
    const markdown = fs.readFileSync(sourcePath, "utf8");
    const stripped = stripFencedCode(markdown);
    const lines = stripped.split(/\r?\n/);
    const historicalDoc = HISTORICAL_PATH_RE.test(sourcePath);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const match of line.matchAll(RETIRED_MODULE_RE)) {
        if (historicalDoc || HISTORICAL_CONTEXT_RE.test(line)) continue;
        errors.push({ sourcePath, line: i + 1, name: match[1], reason: `retired module ${match[1]} referenced without historical context` });
      }
    }
  }
  return errors;
}

function runCli() {
  const rootDir = path.resolve(__dirname, "..");
  const isIgnored = loadGitignoreMatcher(rootDir);
  const files = collectMarkdownFiles(rootDir, SCAN_ROOTS, { isIgnored });
  const linkResult = verifyMarkdownLinks(rootDir, { isIgnored, files });
  const retiredErrors = verifyRetiredModuleReferences(files);
  const totalErrors = linkResult.errors.length + retiredErrors.length;
  if (totalErrors === 0) {
    console.log(`[verify:markdown-links] OK: ${files.length} Markdown files checked.`);
    return;
  }

  for (const error of linkResult.errors) {
    const relative = path.relative(rootDir, error.sourcePath);
    console.error(`::error file=${relative},line=${error.line}::Broken Markdown link "${error.destination}": ${error.reason}`);
  }
  for (const error of retiredErrors) {
    const relative = path.relative(rootDir, error.sourcePath);
    console.error(`::error file=${relative},line=${error.line}::Retired module reference "${error.name}": ${error.reason}`);
  }
  console.error(`[verify:markdown-links] FAIL: ${totalErrors} issue(s) in ${files.length} Markdown files.`);
  process.exitCode = 1;
}

if (require.main === module) runCli();

module.exports = {
  collectAnchors,
  collectMarkdownFiles,
  compileGitignorePattern,
  extractLinks,
  githubSlug,
  loadGitignoreMatcher,
  verifyMarkdownLinks,
  verifyRetiredModuleReferences,
};
