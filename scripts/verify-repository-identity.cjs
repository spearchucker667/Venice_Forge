#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CANONICAL_PATH = "/Users/super_user/Projects/Venice_Forge";
const CANONICAL_REPOSITORY = "spearchucker667/Venice_Forge";
const OBSOLETE_PATHS = [
  "/Users/super_user/Projects/Venice_Forge/",
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
const README_REQUIRED_TAB_LABELS = [
  "Chat",
  "Character Chats",
  "History",
  "Image Studio",
  "Media Studio",
  "Prompts",
  "Scene Composer",
  "Audio Studio",
  "Music Studio",
  "Video Studio",
  "Embeddings",
  "Research",
  "Characters",
  "RP Studio",
  "Workflows",
  "Playground",
  "Privacy",
  "Config",
  "Status",
];
const README_REQUIRED_CUSTODY_MARKERS = [
  "Electron `safeStorage`",
  "`secure-prefs.json`",
  "Keychain-backed encryption",
  "DPAPI",
  "password-verifier records",
  "it does not store API keys",
];

const EXCLUDED_ARCHIVE_DIRS = new Set([
  "_REPO_EXTRACT_METADATA",
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  "release",
  "coverage",
  ".vite",
  ".turbo",
  ".cache",
]);

function isExcludedArchiveDir(relativePath) {
  return EXCLUDED_ARCHIVE_DIRS.has(relativePath.split("/")[0]);
}

function trackedFilesFromGit(rootDir) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "git ls-files failed");
  }
  return result.stdout.split("\0").filter(Boolean);
}

function readArchiveFileList(rootDir) {
  const listPath = path.join(rootDir, "_REPO_EXTRACT_METADATA", "final-file-list.txt");
  if (!fs.existsSync(listPath)) return null;
  return fs
    .readFileSync(listPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.replace(/^\.\//, ""))
    .filter((relativePath) => !relativePath.startsWith("_REPO_EXTRACT_METADATA/"));
}

function parseArchiveMetadata(rootDir) {
  const infoPath = path.join(rootDir, "_REPO_EXTRACT_METADATA", "EXTRACT_INFO.txt");
  if (!fs.existsSync(infoPath)) return null;
  const content = fs.readFileSync(infoPath, "utf8");
  const metadata = {};
  for (const line of content.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      metadata[line.slice(0, idx)] = line.slice(idx + 1);
    }
  }
  return metadata;
}

function trackedFiles(rootDir) {
  if (fs.existsSync(path.join(rootDir, ".git"))) {
    return { mode: "git", files: trackedFilesFromGit(rootDir) };
  }

  const archiveFiles = readArchiveFileList(rootDir);
  if (archiveFiles) {
    return { mode: "archive", files: archiveFiles };
  }

  return { mode: "unknown", files: [] };
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

function verifyReadmeClaims(rootDir, errors) {
  const relativePath = "README.md";
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) return;

  const content = fs.readFileSync(absolutePath, "utf8");
  const workspaceMap = content.match(/## Current Workspace Map\s+([\s\S]*?)\n---/)?.[1] ?? "";
  const custodyClaim = content
    .split(/\r?\n/)
    .find((line) => line.startsWith("- **Secure Key Storage:**")) ?? "";
  const lineNumberFor = (needle) => {
    const index = content.split(/\r?\n/).findIndex((line) => line.includes(needle));
    return index >= 0 ? index + 1 : 1;
  };

  if (content.includes("assets/preview.png")) {
    reportLine(
      errors,
      relativePath,
      lineNumberFor("assets/preview.png"),
      "stale promotional preview must not replace the canonical workspace map",
    );
  }

  for (const label of README_REQUIRED_TAB_LABELS) {
    if (!workspaceMap.includes(label)) {
      reportLine(errors, relativePath, 1, `workspace map is missing canonical tab label: ${label}`);
    }
  }

  for (const marker of README_REQUIRED_CUSTODY_MARKERS) {
    if (!custodyClaim.includes(marker)) {
      reportLine(errors, relativePath, 1, `secure-storage claim is missing implementation marker: ${marker}`);
    }
  }
}

function verifyRepositoryIdentity(rootDir) {
  const errors = [];
  const { mode, files } = trackedFiles(rootDir);

  if (mode === "unknown") {
    errors.push("repository-identity: unable to determine discovery mode (no .git or archive metadata)");
    return { passed: false, errors };
  }

  if (mode === "archive") {
    const metadata = parseArchiveMetadata(rootDir);
    if (!metadata || metadata.repo_name !== "Venice_Forge") {
      errors.push("archive metadata missing or repo_name is not Venice_Forge");
    }
    if (!metadata || !metadata.commit) {
      errors.push("archive metadata missing commit");
    }
  }

  for (const relativePath of files) {
    if (!fs.existsSync(path.join(rootDir, relativePath))) continue;
    if (mode === "archive" && isExcludedArchiveDir(relativePath)) continue;
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

  verifyReadmeClaims(rootDir, errors);

  for (const relativePath of files) {
    if (mode === "archive" && isExcludedArchiveDir(relativePath)) continue;
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
  const { mode } = trackedFiles(rootDir);
  console.log(`[verify:repository-identity] OK (${mode} mode)`);
}

module.exports = {
  ACTIVE_AGENT_DOCS,
  CANONICAL_PATH,
  CANONICAL_REPOSITORY,
  README_REQUIRED_CUSTODY_MARKERS,
  README_REQUIRED_TAB_LABELS,
  verifyRepositoryIdentity,
};

if (require.main === module) main();
