#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const SCAN_ROOTS = ["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "AGENTS.md", "SECURITY.md", ".github", ".config", "docs"];
const EXCLUDED_DIRS = new Set(["node_modules", "dist", "dist-electron", "release", "coverage", ".git"]);
const EXTERNAL_SCHEME_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function collectMarkdownFiles(rootDir, scanRoots = SCAN_ROOTS) {
  const files = [];

  const visit = (absolutePath) => {
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
  const files = options.files || collectMarkdownFiles(rootDir, options.scanRoots);
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

function runCli() {
  const rootDir = path.resolve(__dirname, "..");
  const result = verifyMarkdownLinks(rootDir);
  if (result.errors.length === 0) {
    console.log(`[verify:markdown-links] OK: ${result.filesChecked} Markdown files checked.`);
    return;
  }

  for (const error of result.errors) {
    const relative = path.relative(rootDir, error.sourcePath);
    console.error(`::error file=${relative},line=${error.line}::Broken Markdown link "${error.destination}": ${error.reason}`);
  }
  console.error(`[verify:markdown-links] FAIL: ${result.errors.length} broken link(s) in ${result.filesChecked} Markdown files.`);
  process.exitCode = 1;
}

if (require.main === module) runCli();

module.exports = { collectAnchors, collectMarkdownFiles, extractLinks, githubSlug, verifyMarkdownLinks };
