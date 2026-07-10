#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CANONICAL_PATH = "/Users/super_user/Projects/Venice_Forge";
const CANONICAL_REPOSITORY = "spearchucker667/Venice_Forge";
const OBSOLETE_PATHS = [
  "/Users/super_user/Projects/Windows-Venice-API-connector",
  "/Users/super_user/Projects/Venice-API-connector",
  "/Users/super_user/Projects/Venice-Forge-Mac",
  "/Users/super_user/Projects/VeniceForgeMac",
];
const ACTIVE_AGENT_DOCS = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
  ".windsurfrules",
  ".github/copilot-instructions.md",
];
const ACTIVE_DOCS = new Set([
  ...ACTIVE_AGENT_DOCS,
  "README.md",
  "CONTRIBUTING.md",
  "SUPPORT.md",
  "SECURITY.md",
  "PRIVACY.md",
  "LEGAL.md",
  "docs/BUG_HUNTING_AGENT_PROMPT.md",
  "docs/DOCS_INDEX.md",
  "docs/ROADMAP.md",
  "docs/summary_of_work.md",
]);
const HISTORICAL_FILES = new Set([
  "docs/audits/cross-check-T001-T030-2026-06-15.yaml",
  "docs/audits/kimi-batch-evidence-2026-06-16.yaml",
  "docs/audits/exhaustive-bug-hunt-2026-06-19.md",
]);
const LOCAL_CACHE_PATTERNS = [
  /^\.impeccable\//,
  /(?:^|\/)hook\.cache\.json$/,
  /(?:^|\/)[^/]+\.cache\.json$/,
];
const TEXT_FILE_RE = /\.(?:cjs|mjs|js|jsx|ts|tsx|md|ya?ml|json|txt|rules)$/i;

function trackedFiles(rootDir) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "git ls-files failed");
  }
  return result.stdout.split("\0").filter(Boolean);
}

function isHistorical(relativePath) {
  return relativePath.startsWith("docs/reports/historical/") || HISTORICAL_FILES.has(relativePath);
}

function hasHistoricalBanner(content) {
  return content.split(/\r?\n/).slice(0, 14).join("\n").includes("Historical snapshot.");
}

function reportLine(errors, relativePath, lineNumber, message) {
  errors.push(`${relativePath}:${lineNumber}: ${message}`);
}

function verifyRepositoryIdentity(rootDir) {
  const errors = [];
  const files = trackedFiles(rootDir);

  for (const relativePath of files) {
    if (!fs.existsSync(path.join(rootDir, relativePath))) continue;
    if (LOCAL_CACHE_PATTERNS.some((pattern) => pattern.test(relativePath))) {
      reportLine(errors, relativePath, 1, "committed local cache is not allowed");
    }
  }

  for (const relativePath of ACTIVE_AGENT_DOCS) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      reportLine(errors, relativePath, 1, "active agent instruction is missing");
      continue;
    }
    const content = fs.readFileSync(absolutePath, "utf8");
    if (!content.includes(CANONICAL_PATH)) {
      reportLine(errors, relativePath, 1, `missing canonical local path ${CANONICAL_PATH}`);
    }
    if (!content.includes(CANONICAL_REPOSITORY)) {
      reportLine(errors, relativePath, 1, `missing canonical GitHub repository ${CANONICAL_REPOSITORY}`);
    }
  }

  for (const relativePath of files) {
    if (!TEXT_FILE_RE.test(relativePath) && !ACTIVE_DOCS.has(relativePath)) continue;
    const absolutePath = path.join(rootDir, relativePath);
    let content;
    try {
      content = fs.readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }

    const historical = isHistorical(relativePath);
    if (historical && !hasHistoricalBanner(content)) {
      reportLine(errors, relativePath, 1, "historical evidence is missing the required Historical snapshot banner");
    }

    const summaryHistoryLine = relativePath === "docs/summary_of_work.md"
      ? content.split(/\r?\n/).findIndex((line) => /^### Session History$/.test(line)) + 1
      : 0;

    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const allowedHistoricalLine = historical || (summaryHistoryLine > 0 && lineNumber > summaryHistoryLine);

      if (/file:\/\/\/Users\//.test(line)) {
        reportLine(errors, relativePath, lineNumber, "committed file:///Users link is not portable");
      }

      if (!allowedHistoricalLine && ACTIVE_DOCS.has(relativePath) && !ACTIVE_AGENT_DOCS.includes(relativePath)) {
        for (const obsoletePath of OBSOLETE_PATHS) {
          if (line.includes(obsoletePath) && !line.includes("Do not use") && !line.includes("historical paths")) {
            reportLine(errors, relativePath, lineNumber, `obsolete active repository path: ${obsoletePath}`);
          }
        }
      }

      if (!allowedHistoricalLine && /\/Users\/super_user\//.test(line)) {
        const isCanonicalAgentLine = line.includes(CANONICAL_PATH);
        const isCanonicalWarning = ACTIVE_AGENT_DOCS.includes(relativePath) && OBSOLETE_PATHS.some((value) => line.includes(value));
        const isVerifierContract = relativePath === "scripts/verify-repository-identity.cjs"
          || relativePath === "scripts/verify-repository-identity.test.ts";
        if (!isCanonicalAgentLine && !isCanonicalWarning && !isVerifierContract) {
          reportLine(errors, relativePath, lineNumber, "private absolute user path is not allowed");
        }
      }
    });
  }

  return { passed: errors.length === 0, errors };
}

function main() {
  const rootDir = path.resolve(__dirname, "..");
  const result = verifyRepositoryIdentity(rootDir);
  if (!result.passed) {
    console.error("[verify:repository-identity] FAIL");
    result.errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log("[verify:repository-identity] OK");
}

module.exports = {
  ACTIVE_AGENT_DOCS,
  CANONICAL_PATH,
  CANONICAL_REPOSITORY,
  verifyRepositoryIdentity,
};

if (require.main === module) main();
