#!/usr/bin/env node
/**
 * @fileoverview Hardcoded visible-text inventory and no-regression verifier.
 *
 * The scanner uses the TypeScript compiler API to find app-authored visible
 * text in production source. Advisory mode writes the human/machine inventory. The
 * baseline mode compares exact candidate identities (file, node kind, and
 * normalized text) plus occurrence counts so a stable total cannot hide churn.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT_DIR = path.join(__dirname, "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const ARTIFACTS_DIR = path.join(ROOT_DIR, "artifacts", "i18n");
const DEFAULT_BASELINE_PATH = path.join(
  ROOT_DIR,
  "config",
  "i18n-hardcoded-baseline.json",
);
const EXTRACTOR = "typescript-compiler-api-runtime-visible-text-v2";
const BASELINE_SCHEMA_VERSION = 2;

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  "release",
  "__tests__",
  "__mocks__",
]);

const SCAN_EXTS = new Set([".ts", ".tsx"]);
const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const EDGE_PUNCTUATION = new Set([
  "…",
  ".",
  "!",
  "?",
  ",",
  ":",
  ";",
  "-",
  "—",
  '"',
  "'",
  "`",
]);

const VISIBLE_JSX_ATTRIBUTES = new Set([
  "placeholder",
  "title",
  "aria-label",
  "aria-valuetext",
  "alt",
  "label",
  "description",
  "hint",
  "emptyText",
]);

const VISIBLE_OBJECT_PROPERTIES = new Set([
  "label",
  "title",
  "subtitle",
  "description",
  "placeholder",
  "prompt",
  "tooltip",
  "message",
  "emptyText",
  "hint",
]);

const USER_FACING_CALL_METHODS = new Set([
  "success",
  "warn",
  "error",
  "fromError",
]);
const USER_FACING_CALL_HELPERS = new Set([
  "askText",
  "askDecision",
  "makeItem",
]);

/** Language-neutral values that are allowed to remain literal. */
const HARD_CODED_ALLOWLIST = new Set([
  "Venice Forge",
  "Venice",
  "Venice.ai",
  "API",
  "JSON",
  "PNG",
  "JPEG",
  "WebP",
  "WEBP",
  "MP4",
  "TTS",
  "ST",
  "OS",
  "IDB",
  "SHA-256",
  "Argon2id",
  "XChaCha20-Poly1305",
  "LTR",
  "RTL",
  "GLM 5.2",
  "zai-org-glm-5-2",
  "Markdown",
  "YAML",
  "TOML",
  "UTF-8",
  "UTF-16",
  "CSV",
  "URI",
  "URL",
  "UUID",
  "OAuth",
  "OpenID",
  "WebCrypto",
  "did:key",
  "base64",
  "utf-8",
  "1K",
  "2K",
  "4K",
]);

function normalizeCandidate(raw) {
  const characters = [...raw.replace(/\s+/g, " ").trim()];
  while (characters.length > 0 && EDGE_PUNCTUATION.has(characters[0]))
    characters.shift();
  while (characters.length > 0 && EDGE_PUNCTUATION.has(characters.at(-1)))
    characters.pop();
  return characters.join("").trim();
}

function looksLikeVisibleText(text) {
  if (typeof text !== "string") return false;
  const stripped = text.trim();
  if (stripped.length < 3) return false;
  if (!/\p{L}/u.test(stripped)) {
    return false;
  }
  if (/^(TODO|FIXME|XXX|HACK|NOTE)/i.test(stripped)) return false;
  if (/^\/\//.test(stripped)) return false;
  if (/[\\/]/.test(stripped) && !/\s[\\/]\s/.test(stripped)) return false;
  if (/^[a-z][a-z0-9_.:-]*$/.test(stripped)) return false;
  if (/^(?:https?:|data:|blob:|venice-)/i.test(stripped)) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(stripped)) return false;
  // Match MIME-type strings like "text/html" or "image/png,image/jpeg".
  // Avoid ReDoS by bounding input length and keeping the comma outside
  // the inner character class so it acts as a single unambiguous delimiter.
  if (stripped.length > 256) return true;
  if (
    /^(?:image|audio|video|text|application)\/[a-z0-9.+-]+(?:,(?:image|audio|video|text|application)\/[a-z0-9.+-]+)*$/i.test(
      stripped,
    )
  )
    return false;
  return true;
}

function propertyNameText(name) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return null;
}

function callName(expression) {
  if (ts.isIdentifier(expression))
    return { object: null, method: expression.text };
  if (ts.isPropertyAccessExpression(expression)) {
    return {
      object: ts.isIdentifier(expression.expression)
        ? expression.expression.text
        : null,
      method: expression.name.text,
    };
  }
  return { object: null, method: null };
}

function findFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(full, out);
    } else if (
      SCAN_EXTS.has(path.extname(entry.name)) &&
      !TEST_FILE_PATTERN.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function parseAllowDirective(line, directive) {
  const escaped = directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(
    new RegExp(`//\\s*${escaped}(?:\\s*:\\s*(.+?))?\\s*$`, "i"),
  );
  if (!match) return null;
  return { reason: (match[1] || "").trim() };
}

function findAllowDirective(lines, lineIndex) {
  const sameLine = parseAllowDirective(lines[lineIndex] || "", "i18n-allow");
  if (sameLine) return sameLine;
  if (lineIndex > 0) {
    return parseAllowDirective(
      lines[lineIndex - 1] || "",
      "i18n-allow-next-line",
    );
  }
  return null;
}

function scanAllowDirectiveIssues(source, relPath) {
  const issues = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(
      /\/\/\s*i18n-allow(?:-next-line)?(?:\s*:\s*(.*?))?\s*$/i,
    );
    if (match && !(match[1] || "").trim()) {
      issues.push({
        file: relPath,
        line: index + 1,
        message:
          "i18n allow directives require a non-empty reason after a colon.",
      });
    }
  }
  return issues;
}

function scanFile(filePath, { rootDir = ROOT_DIR } = {}) {
  const source = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");
  const sourceLines = source.split(/\r?\n/);
  const findings = [];
  const recordedPositions = new Set();

  function record(node, nodeKind, rawValue) {
    const text = normalizeCandidate(rawValue);
    if (!looksLikeVisibleText(text) || HARD_CODED_ALLOWLIST.has(text)) return;
    const start = node.getStart(sf);
    const identity = `${start}:${nodeKind}:${text}`;
    if (recordedPositions.has(identity)) return;
    const { line } = sf.getLineAndCharacterOfPosition(start);
    const directive = findAllowDirective(sourceLines, line);
    if (directive) return;
    recordedPositions.add(identity);
    findings.push({
      file: relPath,
      line: line + 1,
      nodeKind,
      text,
      raw: rawValue,
      start,
      end: node.getEnd(),
    });
  }

  function recordVisibleExpression(node, nodeKind) {
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      record(node, nodeKind, node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const raw = node.getText(sf);
      record(node, nodeKind, raw.slice(1, -1));
      return;
    }
    if (ts.isParenthesizedExpression(node)) {
      recordVisibleExpression(node.expression, nodeKind);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      recordVisibleExpression(node.whenTrue, `${nodeKind}:ConditionalBranch`);
      recordVisibleExpression(node.whenFalse, `${nodeKind}:ConditionalBranch`);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      recordVisibleExpression(node.left, `${nodeKind}:LogicalBranch`);
      recordVisibleExpression(node.right, `${nodeKind}:LogicalBranch`);
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements)
        recordVisibleExpression(element, `${nodeKind}:ArrayElement`);
    }
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      record(node, "JsxText", node.getText(sf));
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      if (VISIBLE_JSX_ATTRIBUTES.has(name) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          record(
            node.initializer,
            `JsxAttribute:${name}`,
            node.initializer.text,
          );
        } else if (ts.isJsxExpression(node.initializer)) {
          recordVisibleExpression(
            node.initializer.expression,
            `JsxAttribute:${name}`,
          );
        }
      }
    } else if (
      ts.isJsxExpression(node) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      recordVisibleExpression(node.expression, "JsxExpression");
    } else if (ts.isPropertyAssignment(node)) {
      const name = propertyNameText(node.name);
      if (name && VISIBLE_OBJECT_PROPERTIES.has(name)) {
        recordVisibleExpression(node.initializer, `ObjectProperty:${name}`);
      }
    } else if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      const isToastCall =
        name.object === "toast" && USER_FACING_CALL_METHODS.has(name.method);
      const isDialogCall =
        name.object === null && USER_FACING_CALL_HELPERS.has(name.method);
      if (isToastCall || isDialogCall) {
        const argumentsToScan =
          name.method === "makeItem" ? node.arguments.slice(1) : node.arguments;
        for (const argument of argumentsToScan) {
          recordVisibleExpression(
            argument,
            `CallArgument:${name.object ? `${name.object}.` : ""}${name.method}`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return {
    findings,
    allowDirectiveIssues: scanAllowDirectiveIssues(source, relPath),
  };
}

function scanProject({ srcDir = SRC_DIR, rootDir = ROOT_DIR } = {}) {
  const files = findFiles(srcDir).sort();
  const findings = [];
  const allowDirectiveIssues = [];
  for (const filePath of files) {
    try {
      const result = scanFile(filePath, { rootDir });
      findings.push(...result.findings);
      allowDirectiveIssues.push(...result.allowDirectiveIssues);
    } catch (error) {
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");
      findings.push({
        file: relPath,
        line: 0,
        nodeKind: "ScanError",
        text: `<scan-error: ${error.message}>`,
        raw: "",
        error: true,
      });
    }
  }
  return { files, findings, allowDirectiveIssues };
}

function candidateKey(candidate) {
  return JSON.stringify([candidate.file, candidate.nodeKind, candidate.text]);
}

function aggregateCandidates(findings) {
  const entries = new Map();
  for (const finding of findings) {
    const key = candidateKey(finding);
    const current = entries.get(key);
    if (current) {
      current.count += 1;
    } else {
      entries.set(key, {
        file: finding.file,
        nodeKind: finding.nodeKind,
        text: finding.text,
        count: 1,
      });
    }
  }
  return [...entries.values()].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.nodeKind.localeCompare(b.nodeKind) ||
      a.text.localeCompare(b.text),
  );
}

function createBaseline(findings) {
  const entries = aggregateCandidates(findings);
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    extractor: EXTRACTOR,
    candidateCount: findings.length,
    entryCount: entries.length,
    entries,
  };
}

function validateBaseline(baseline) {
  if (!baseline || baseline.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported hardcoded-string baseline schema; expected version ${BASELINE_SCHEMA_VERSION}.`,
    );
  }
  if (baseline.extractor !== EXTRACTOR || !Array.isArray(baseline.entries)) {
    throw new Error(
      "Hardcoded-string baseline does not match the active extractor.",
    );
  }
  for (const entry of baseline.entries) {
    if (
      !entry ||
      typeof entry.file !== "string" ||
      typeof entry.nodeKind !== "string" ||
      typeof entry.text !== "string" ||
      !Number.isInteger(entry.count) ||
      entry.count < 1
    ) {
      throw new Error("Hardcoded-string baseline contains an invalid entry.");
    }
  }
}

function compareToBaseline(findings, baseline) {
  validateBaseline(baseline);
  const current = aggregateCandidates(findings);
  const baselineByKey = new Map(
    baseline.entries.map((entry) => [candidateKey(entry), entry]),
  );
  const currentByKey = new Map(
    current.map((entry) => [candidateKey(entry), entry]),
  );
  const regressions = [];
  const decreases = [];

  for (const entry of current) {
    const allowed = baselineByKey.get(candidateKey(entry));
    const allowedCount = allowed ? allowed.count : 0;
    if (entry.count > allowedCount) {
      regressions.push({
        ...entry,
        baselineCount: allowedCount,
        addedCount: entry.count - allowedCount,
      });
    } else if (entry.count < allowedCount) {
      decreases.push({
        ...entry,
        baselineCount: allowedCount,
        removedCount: allowedCount - entry.count,
      });
    }
  }
  for (const entry of baseline.entries) {
    if (!currentByKey.has(candidateKey(entry))) {
      decreases.push({
        ...entry,
        baselineCount: entry.count,
        count: 0,
        removedCount: entry.count,
      });
    }
  }

  return { regressions, decreases };
}

function writeReports(report, artifactsDir = ARTIFACTS_DIR) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactsDir, "hardcoded-strings.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );

  let markdown = "# Hardcoded Visible-String Report\n\n";
  markdown += `**Generated At:** ${report.timestamp}\n`;
  markdown += `**Extractor:** \`${report.extractor}\` (TS Compiler API; runtime-visible JSX, metadata, and notification text).\n`;
  markdown += `**Files Scanned:** ${report.fileCount}\n`;
  markdown += `**Hardcoded Candidates:** ${report.findingsCount}\n`;
  markdown += `**Files With Candidates:** ${report.filesWithHardcoded}\n`;
  markdown += `**Allow Directive Issues:** ${report.allowDirectiveIssues.length}\n\n`;
  if (report.findings.length > 0) {
    markdown += "## Candidates by File\n\n";
    markdown += "| File | Line | Node | Text |\n| --- | ---: | --- | --- |\n";
    for (const finding of report.findings.slice(0, 200)) {
      const safeText = finding.text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
      markdown += `| \`${finding.file}\` | ${finding.line} | ${finding.nodeKind} | ${safeText} |\n`;
    }
    if (report.findings.length > 200) {
      markdown += `\n_…and ${report.findings.length - 200} more in the JSON report._\n`;
    }
  } else {
    markdown += "No hardcoded visible text candidates detected.\n";
  }
  fs.writeFileSync(
    path.join(artifactsDir, "hardcoded-strings.md"),
    markdown,
    "utf8",
  );
}

function runVerification({
  strict = false,
  noRegressions = false,
  baselinePath = DEFAULT_BASELINE_PATH,
  srcDir = SRC_DIR,
  rootDir = ROOT_DIR,
  artifactsDir = ARTIFACTS_DIR,
  writeArtifacts = true,
} = {}) {
  const { files, findings, allowDirectiveIssues } = scanProject({
    srcDir,
    rootDir,
  });
  const byFile = {};
  for (const finding of findings) {
    byFile[finding.file] = (byFile[finding.file] || 0) + 1;
  }

  let baselineComparison = null;
  if (noRegressions) {
    if (!fs.existsSync(baselinePath)) {
      throw new Error(`Hardcoded-string baseline not found: ${baselinePath}`);
    }
    baselineComparison = compareToBaseline(
      findings,
      JSON.parse(fs.readFileSync(baselinePath, "utf8")),
    );
  }

  const report = {
    timestamp: new Date().toISOString(),
    schemaVersion: 2,
    extractor: EXTRACTOR,
    strict,
    noRegressions,
    baselinePath: noRegressions
      ? path.relative(rootDir, baselinePath).replace(/\\/g, "/")
      : null,
    fileCount: files.length,
    findingsCount: findings.length,
    filesWithHardcoded: Object.keys(byFile).length,
    byFile,
    findings,
    allowDirectiveIssues,
    baselineComparison,
  };
  if (writeArtifacts) writeReports(report, artifactsDir);

  const strictFailure = strict && findings.length > 0;
  const regressionFailure =
    noRegressions && baselineComparison.regressions.length > 0;
  const ok =
    !strictFailure && !regressionFailure && allowDirectiveIssues.length === 0;
  return { ok, report };
}

function readOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${name} requires a path.`);
  return path.resolve(ROOT_DIR, value);
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const noRegressions = args.includes("--no-regressions");
  const updateBaseline = args.includes("--update-baseline");
  const baselinePath = readOption(args, "--baseline", DEFAULT_BASELINE_PATH);
  const { files, findings, allowDirectiveIssues } = scanProject();

  if (updateBaseline) {
    if (allowDirectiveIssues.length > 0) {
      for (const issue of allowDirectiveIssues) {
        process.stderr.write(
          `[verify:hardcoded-strings] ${issue.file}:${issue.line} ${issue.message}\n`,
        );
      }
      process.exitCode = 1;
      return;
    }
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    const baseline = createBaseline(findings);
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(baseline, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(
      `[verify:hardcoded-strings] wrote ${baseline.candidateCount} candidate(s) in ${baseline.entryCount} exact baseline entries to ${path.relative(ROOT_DIR, baselinePath)}.\n`,
    );
    return;
  }

  const result = runVerification({ strict, noRegressions, baselinePath });
  if (allowDirectiveIssues.length > 0) {
    for (const issue of allowDirectiveIssues) {
      process.stderr.write(
        `[verify:hardcoded-strings] ${issue.file}:${issue.line} ${issue.message}\n`,
      );
    }
  }
  if (result.report.baselineComparison) {
    for (const regression of result.report.baselineComparison.regressions) {
      process.stderr.write(
        `[verify:hardcoded-strings] regression ${regression.file} ${regression.nodeKind} ${JSON.stringify(regression.text)}: ${regression.count} current, ${regression.baselineCount} baseline.\n`,
      );
    }
    process.stdout.write(
      `[verify:hardcoded-strings] baseline comparison: ${result.report.baselineComparison.regressions.length} regression(s), ${result.report.baselineComparison.decreases.length} decrease(s).\n`,
    );
  }
  process.stdout.write(
    `[verify:hardcoded-strings] ${findings.length} candidate(s) across ${Object.keys(result.report.byFile).length} file(s) (${files.length} scanned; strict=${strict}; noRegressions=${noRegressions}).\n`,
  );
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[verify:hardcoded-strings] ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  BASELINE_SCHEMA_VERSION,
  DEFAULT_BASELINE_PATH,
  EXTRACTOR,
  HARD_CODED_ALLOWLIST,
  aggregateCandidates,
  compareToBaseline,
  createBaseline,
  normalizeCandidate,
  runVerification,
  scanFile,
  scanProject,
};
