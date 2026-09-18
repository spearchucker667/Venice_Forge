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

function runGit(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeTrackedReferences(commitSha, retrievedDate) {
  const swagger = fs.readFileSync(path.join(MIRROR_DIR, "swagger.yaml"), "utf8");
  const versionMatch = swagger.match(/^\s{2}version:\s*"?([^"\r\n]+)"?\s*$/m);
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
  fs.writeFileSync(TRACKED_SWAGGER_PATH, `${provenance}${swagger}`, "utf8");

  const llmInfo = fs.readFileSync(path.join(MIRROR_DIR, "llms.txt"), "utf8");
  const llmProvenance = [
    "---",
    "source: https://docs.venice.ai/llms.txt",
    `upstream_commit: ${commitSha}`,
    `retrieved: "${retrievedDate}"`,
    "content_type: text/markdown",
    "---",
    "",
  ].join("\n");
  fs.writeFileSync(TRACKED_LLM_PATH, `${llmProvenance}${llmInfo}`, "utf8");

  const manifest = `# Venice API Upstream Source Manifest

> **Upstream Repository:** \`${UPSTREAM_URL.slice(0, -4)}\`
> **Upstream Branch:** \`main\`
> **Upstream Commit SHA:** \`${commitSha}\`
> **Retrieval Date:** \`${retrievedDate}\`
> **Schema Version (\`info.version\`):** \`${contentVersion}\`
> **Local Reference Path (Ignored):** \`docs/reference/venice-api-upstream/\`
> **Tracked Canonical Snapshot:** \`docs/reference/Venice_swagger_api.yaml\`

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
npm run docs:venice:sync
\`\`\`

The command refreshes the ignored upstream mirror, validates the mandatory source inventory, and promotes the Swagger and LLM-reference snapshots with provenance into the tracked knowledge base.
`;
  fs.writeFileSync(SOURCE_MANIFEST_PATH, manifest, "utf8");
}

function syncUpstream() {
  if (!fs.existsSync(TRACKED_REFERENCE_DIR)) {
    fs.mkdirSync(TRACKED_REFERENCE_DIR, { recursive: true });
  }

  const isCloned = fs.existsSync(path.join(MIRROR_DIR, ".git"));

  if (!isCloned) {
    console.log(`[sync-venice-api-docs] Cloning ${UPSTREAM_URL} into ${MIRROR_DIR}...`);
    execFileSync("git", ["clone", "--depth", "1", "--branch", "main", UPSTREAM_URL, MIRROR_DIR], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
  } else {
    console.log(`[sync-venice-api-docs] Fetching latest changes in ${MIRROR_DIR}...`);
    runGit(["fetch", "origin", "main"], MIRROR_DIR);
    runGit(["checkout", "main"], MIRROR_DIR);
    runGit(["pull", "--ff-only", "origin", "main"], MIRROR_DIR);
  }

  const commitSha = runGit(["rev-parse", "HEAD"], MIRROR_DIR);
  const commitDate = runGit(["log", "-1", "--format=%ci"], MIRROR_DIR);
  const commitSubject = runGit(["log", "-1", "--format=%s"], MIRROR_DIR);

  console.log(`[sync-venice-api-docs] Upstream HEAD: ${commitSha}`);
  console.log(`[sync-venice-api-docs] Upstream Date: ${commitDate}`);
  console.log(`[sync-venice-api-docs] Upstream Subject: ${commitSubject}`);

  // Validate mandatory files
  const missing = [];
  for (const file of MANDATORY_FILES) {
    const fullPath = path.join(MIRROR_DIR, file);
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
  writeTrackedReferences(commitSha, retrievedDate);
  console.log("[sync-venice-api-docs] Updated tracked Swagger, LLM reference, and source manifest.");
  return { commitSha, commitDate, commitSubject };
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
  writeTrackedReferences,
};
