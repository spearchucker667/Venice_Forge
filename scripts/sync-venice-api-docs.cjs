#!/usr/bin/env node

/**
 * @fileoverview Synchronizes the local authoritative Venice API documentation mirror
 * from the upstream repository (https://github.com/veniceai/api-docs).
 *
 * Requirements:
 * - Mirror destination: docs/reference/venice-api-upstream/ (ignored by Git)
 * - Read-only mirror; never modifies upstream checkout or commits it.
 * - Validates presence of mandatory authoritative files:
 *   swagger.yaml, llms.txt, skill.md, agents.md, api-reference/, models/, guides/media/
 *
 * Usage:
 *   node scripts/sync-venice-api-docs.cjs
 *   node scripts/sync-venice-api-docs.cjs --source <path-to-local-api-docs-checkout>
 *   VENICE_API_DOCS_SOURCE=<path> node scripts/sync-venice-api-docs.cjs
 *
 * The `--source` flag (or VENICE_API_DOCS_SOURCE env var) lets a developer
 * reuse a pre-existing api-docs checkout instead of cloning into the
 * gitignored mirror directory. The path may be absolute or relative to the
 * repository root. The path is never written to tracked repository files.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const MIRROR_DIR = path.join(REPO_ROOT, "docs", "reference", "venice-api-upstream");
const UPSTREAM_URL = "https://github.com/veniceai/api-docs.git";
const TRACKED_REFERENCE_DIR = path.join(REPO_ROOT, "docs", "reference");
const TRACKED_SWAGGER_PATH = path.join(TRACKED_REFERENCE_DIR, "Venice_swagger_api.yaml");
const TRACKED_LLM_PATH = path.join(TRACKED_REFERENCE_DIR, "Venice_api_LLM_info.md");
const SOURCE_MANIFEST_PATH = path.join(TRACKED_REFERENCE_DIR, "VENICE_API_SOURCE_MANIFEST.md");

/**
 * Test seam: allow tests to redirect the tracked reference paths to a
 * scratch directory. Production callers should leave `paths` undefined.
 * The shape mirrors the constants above so writes only hit the scratch dir.
 */
function resolveTrackedPaths(overrideRoot) {
  const root = overrideRoot ?? REPO_ROOT;
  const trackedDir = path.join(root, "docs", "reference");
  return {
    REPO_ROOT: root,
    MIRROR_DIR: path.join(root, "docs", "reference", "venice-api-upstream"),
    TRACKED_REFERENCE_DIR: trackedDir,
    TRACKED_SWAGGER_PATH: path.join(trackedDir, "Venice_swagger_api.yaml"),
    TRACKED_LLM_PATH: path.join(trackedDir, "Venice_api_LLM_info.md"),
    SOURCE_MANIFEST_PATH: path.join(trackedDir, "VENICE_API_SOURCE_MANIFEST.md"),
  };
}

const MANDATORY_FILES = [
  "swagger.yaml",
  "llms.txt",
  "skill.md",
  "agents.md",
  "README.md",
  "docs.json",
  path.join("api-reference", "api-spec.mdx"),
  path.join("guides", "media", "image-generation.mdx"),
  path.join("guides", "media", "image-editing.mdx"),
  path.join("guides", "media", "image-upscaling.mdx"),
  path.join("guides", "media", "video-generation.mdx"),
  path.join("guides", "media", "seedance-face-consent.mdx"),
  path.join("guides", "media", "music-and-sound-effects.mdx"),
  path.join("guides", "media", "text-to-speech.mdx"),
  path.join("guides", "media", "voice-changer.mdx"),
  path.join("models", "image.mdx"),
  path.join("models", "video.mdx"),
  path.join("models", "music.mdx"),
];

/**
 * Parse argv for --source <path>. Returns the resolved absolute path or null.
 * Resolution: absolute paths are kept as-is; relative paths are resolved
 * against the current working directory (matching user expectation for a
 * relative flag value), not the repo root. The returned path is never
 * persisted to tracked files.
 */
function parseSourceFlag(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source" || arg === "--source=") {
      const value = arg === "--source" ? argv[i + 1] : "";
      if (typeof value !== "string" || value.length === 0) {
        throw new Error("--source flag requires a non-empty path argument.");
      }
      return path.resolve(value);
    }
    if (arg.startsWith("--source=")) {
      const value = arg.slice("--source=".length);
      if (value.length === 0) {
        throw new Error("--source= flag requires a non-empty path argument.");
      }
      return path.resolve(value);
    }
  }
  return null;
}

function resolveSourceDir() {
  const argvSource = parseSourceFlag(process.argv.slice(2));
  const envSource = process.env.VENICE_API_DOCS_SOURCE;
  const raw = argvSource ?? (typeof envSource === "string" && envSource.length > 0 ? envSource : null);
  if (!raw) return null;
  return path.resolve(raw);
}

function validateLocalSource(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Local source directory does not exist: ${sourceDir}`);
  }
  const stat = fs.statSync(sourceDir);
  if (!stat.isDirectory()) {
    throw new Error(`Local source is not a directory: ${sourceDir}`);
  }
  // Either a git working tree (has .git) or a plain checkout. Both are valid
  // so long as the mandatory file inventory is present.
  const missing = [];
  for (const file of MANDATORY_FILES) {
    const fullPath = path.join(sourceDir, file);
    if (!fs.existsSync(fullPath)) {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Local source ${sourceDir} is missing mandatory files: ${missing.join(", ")}`,
    );
  }
  return true;
}

function runGit(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeTrackedReferences(commitSha, retrievedDate, sourceDir, options = {}) {
  const paths = resolveTrackedPaths(options.repoRoot);
  const sourceSwagger = fs.readFileSync(path.join(sourceDir, "swagger.yaml"), "utf8");
  const versionMatch = sourceSwagger.match(/^\s{2}version:\s*"?([^"\r\n]+)"?\s*$/m);
  if (!versionMatch) {
    throw new Error("Upstream Swagger does not declare info.version.");
  }
  const contentVersion = versionMatch[1].trim();
  const provenance = [
    "x-venice-forge-provenance:",
    "  source: https://api.venice.ai/doc/api/swagger.yaml",
    `  upstream_commit: ${commitSha}`,
    `  retrieved: "${retrievedDate}"`,
    `  content_version: "${contentVersion}"`,
    "",
  ].join("\n");
  fs.writeFileSync(paths.TRACKED_SWAGGER_PATH, `${provenance}${sourceSwagger}`, "utf8");

  const llmInfo = fs.readFileSync(path.join(sourceDir, "llms.txt"), "utf8");
  const llmProvenance = [
    "---",
    "source: https://docs.venice.ai/llms.txt",
    `upstream_commit: ${commitSha}`,
    `retrieved: "${retrievedDate}"`,
    "content_type: text/markdown",
    "---",
    "",
  ].join("\n");
  fs.writeFileSync(paths.TRACKED_LLM_PATH, `${llmProvenance}${llmInfo}`, "utf8");

  const localSourceNote = options.localSource
    ? `\n> **Local Source Used:** This snapshot was promoted from a pre-existing checkout of \`${UPSTREAM_URL.slice(0, -4)}\` passed via \`--source\` / \`VENICE_API_DOCS_SOURCE\`. The checkout itself was not modified; only its committed content was promoted into the tracked knowledge base. The path itself is intentionally not persisted.`
    : "";

  const manifest = `# Venice API Upstream Source Manifest

> **Upstream Repository:** \`${UPSTREAM_URL.slice(0, -4)}\`
> **Upstream Branch:** \`main\`
> **Upstream Commit SHA:** \`${commitSha}\`
> **Retrieval Date:** \`${retrievedDate}\`
> **Schema Version (\`info.version\`):** \`${contentVersion}\`
> **Local Reference Path (Ignored):** \`docs/reference/venice-api-upstream/\`
> **Tracked Canonical Snapshot:** \`docs/reference/Venice_swagger_api.yaml\`${localSourceNote}

---

## 1. Upstream Precedence and Source Authority

1. **Tier 1 — Wire Contract:** \`docs/reference/venice-api-upstream/swagger.yaml\` (OpenAPI 3.0.0, version \`${contentVersion}\`). Defines endpoint paths, methods, request/response schemas, parameter enums, and content types.
2. **Tier 2 — Endpoint Documentation:** \`docs/reference/venice-api-upstream/api-reference/**\`. Defines endpoint-specific operational semantics.
3. **Tier 3 — Media Guides:** \`docs/reference/venice-api-upstream/guides/media/**\`. Defines multi-step media workflows.
4. **Tier 4 — Runtime Model Metadata:** Live \`/models\`, \`/models/traits\`, and \`/models/compatibility_mapping\` APIs. Authoritative for active models, dynamic constraints, pricing, and capabilities.

## 2. Mandatory Source File Inventory

| Category | File Path (Upstream) | Purpose |
|---|---|---|
| Root Spec | \`swagger.yaml\` | Primary OpenAPI 3.0.0 wire specification |
| Root Overview | \`llms.txt\` | Machine-readable API index and guidance |
| Root Skill | \`skill.md\` | Skill definition and operational overview |
| Root Agents | \`agents.md\` | Agent guidelines |
| Image Endpoints | \`api-reference/endpoint/image/*\` | Generate, edit, multi-edit, upscale, background removal, and styles |
| Video Endpoints | \`api-reference/endpoint/video/*\` | Quote, queue, retrieve, complete, and transcriptions |
| Audio Endpoints | \`api-reference/endpoint/audio/*\` | Music, text-to-speech, voice cloning, speech-to-speech conversion, and transcription |
| Model Endpoints | \`api-reference/endpoint/models/*\` | List, traits, and compatibility mapping |
| Media Guides | \`guides/media/*.mdx\` | Image, video, audio, voice-changer, and consent workflows |

## 3. Refreshing Upstream Documentation

\`\`\`bash
# Default: clone or refresh the gitignored mirror from the upstream URL.
npm run docs:venice:sync

# Use a pre-existing local checkout (path is never persisted).
npm run docs:venice:sync -- --source ../api-docs
VENICE_API_DOCS_SOURCE=../api-docs npm run docs:venice:sync
\`\`\`

The command refreshes the upstream mirror (or reads from the supplied local source), validates the mandatory source inventory, and promotes the Swagger and LLM-reference snapshots with provenance into the tracked knowledge base. The local source path is used at runtime only and is intentionally not written to any tracked repository file.
`;
  fs.writeFileSync(paths.SOURCE_MANIFEST_PATH, manifest, "utf8");
  return {
    TRACKED_SWAGGER_PATH: paths.TRACKED_SWAGGER_PATH,
    TRACKED_LLM_PATH: paths.TRACKED_LLM_PATH,
    SOURCE_MANIFEST_PATH: paths.SOURCE_MANIFEST_PATH,
  };
}

function syncUpstream(options = {}) {
  const paths = resolveTrackedPaths(options.repoRoot);
  if (!fs.existsSync(paths.TRACKED_REFERENCE_DIR)) {
    fs.mkdirSync(paths.TRACKED_REFERENCE_DIR, { recursive: true });
  }

  const localSource = options.localSource ?? resolveSourceDir();
  let sourceDir;
  let commitSha;
  let commitDate;
  let commitSubject;
  let usedLocalSource = false;

  if (localSource) {
    console.log(`[sync-venice-api-docs] Using local source: ${localSource}`);
    validateLocalSource(localSource);
    sourceDir = localSource;
    usedLocalSource = true;

    if (fs.existsSync(path.join(sourceDir, ".git"))) {
      commitSha = runGit(["rev-parse", "HEAD"], sourceDir);
      commitDate = runGit(["log", "-1", "--format=%ci"], sourceDir);
      commitSubject = runGit(["log", "-1", "--format=%s"], sourceDir);
    } else {
      commitSha = "<unknown-local-checkout>";
      commitDate = "<unknown>";
      commitSubject = "<local checkout is not a git working tree>";
    }
  } else {
    const isCloned = fs.existsSync(path.join(paths.MIRROR_DIR, ".git"));

    if (!isCloned) {
      console.log(`[sync-venice-api-docs] Cloning ${UPSTREAM_URL} into ${paths.MIRROR_DIR}...`);
      execFileSync("git", ["clone", "--depth", "1", "--branch", "main", UPSTREAM_URL, paths.MIRROR_DIR], {
        cwd: paths.REPO_ROOT,
        stdio: "inherit",
      });
    } else {
      console.log(`[sync-venice-api-docs] Fetching latest changes in ${paths.MIRROR_DIR}...`);
      runGit(["fetch", "origin", "main"], paths.MIRROR_DIR);
      runGit(["checkout", "main"], paths.MIRROR_DIR);
      runGit(["pull", "--ff-only", "origin", "main"], paths.MIRROR_DIR);
    }

    sourceDir = paths.MIRROR_DIR;
    commitSha = runGit(["rev-parse", "HEAD"], paths.MIRROR_DIR);
    commitDate = runGit(["log", "-1", "--format=%ci"], paths.MIRROR_DIR);
    commitSubject = runGit(["log", "-1", "--format=%s"], paths.MIRROR_DIR);
  }

  console.log(`[sync-venice-api-docs] Upstream HEAD: ${commitSha}`);
  console.log(`[sync-venice-api-docs] Upstream Date: ${commitDate}`);
  console.log(`[sync-venice-api-docs] Upstream Subject: ${commitSubject}`);

  // Validate mandatory files (already done for local source; re-checked for mirror path)
  const missing = [];
  for (const file of MANDATORY_FILES) {
    const fullPath = path.join(sourceDir, file);
    if (!fs.existsSync(fullPath)) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    console.error("[sync-venice-api-docs] ERROR: Missing mandatory upstream files:");
    for (const m of missing) {
      console.error(` - ${m}`);
    }
    process.exit(1);
  }

  console.log(`[sync-venice-api-docs] All ${MANDATORY_FILES.length} mandatory files verified.`);
  const retrievedDate = new Date().toISOString().slice(0, 10);
  writeTrackedReferences(commitSha, retrievedDate, sourceDir, {
    localSource: usedLocalSource,
    repoRoot: options.repoRoot,
  });
  console.log("[sync-venice-api-docs] Updated tracked Swagger, LLM reference, and source manifest.");
  return { commitSha, commitDate, commitSubject, sourceDir, usedLocalSource };
}

if (require.main === module) {
  try {
    syncUpstream();
  } catch (err) {
    console.error("[sync-venice-api-docs] Failed:", err.message || err);
    process.exit(1);
  }
}

module.exports = {
  syncUpstream,
  MIRROR_DIR,
  MANDATORY_FILES,
  TRACKED_LLM_PATH,
  TRACKED_SWAGGER_PATH,
  SOURCE_MANIFEST_PATH,
  UPSTREAM_URL,
  parseSourceFlag,
  resolveSourceDir,
  validateLocalSource,
  writeTrackedReferences,
};
