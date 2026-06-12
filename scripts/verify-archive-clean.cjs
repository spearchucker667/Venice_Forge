#!/usr/bin/env node
/**
 * verify-archive-clean.cjs
 *
 * Archive hygiene guard (P1 — Phase 2J hardening).
 * Fails if the working tree or a provided scan root contains AppleDouble,
 * macOS metadata, build/secret artifacts, local-only configs, or any other
 * contamination that must never end up in uploaded zips, source tarballs,
 * release artifacts, or GPT/shared source archives.
 *
 * Usage:
 *   node scripts/verify-archive-clean.cjs
 *   node scripts/verify-archive-clean.cjs --root /tmp/some-extract
 *   node scripts/verify-archive-clean.cjs --strict
 *   node scripts/verify-archive-clean.cjs --check-config
 *
 * Exit 0 on clean; non-zero + diagnostic list on violations.
 *
 * Patterns (must not appear under the scan root):
 *   __MACOSX/, .DS_Store, ._* (AppleDouble), .AppleDouble/,
 *   Thumbs.db, desktop.ini, ._* (resource fork),
 *   node_modules/, dist/, dist-electron/, release/, coverage/, .integration-src/,
 *   .env (except .env.example), *.db, *.sqlite, *.log, *.tmp,
 *   chat-history/ (local desktop),
 *   .config/*.yaml (except examples), .config/*.local.yaml (explicit),
 *   .design-captures/ (dev-tool scratch), docs/AGENTS/ (agent scratch)
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const BAD_PATTERNS = [
  // macOS / AppleDouble / Windows metadata
  /(^|\/)__MACOSX\//,
  /(^|\/)\.DS_Store$/,
  /(^|\/)\._[^/]+$/,
  /(^|\/)\.AppleDouble\//,
  /(^|\/)Thumbs\.db$/i,
  /(^|\/)desktop\.ini$/i,
  // Generated build / test output (must never be archived)
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)dist-electron\//,
  /(^|\/)release\//,
  /(^|\/)coverage\//,
  /(^|\/)\.integration-src\//,
  /(^|\/)\.vite\//,
  /(^|\/)\.design-captures\//,
  // Secrets & local env (allow .env.example only)
  /(^|\/)\.env(?!\.example$)/,
  /(^|\/)\.env\.(?!example$).+$/i, // .env.local, .env.development, .env.production, etc.
  // Database / cache / log files
  /(^|\/)[^/]+\.(db|sqlite|sqlite3)$/i,
  /(^|\/)[^/]+\.log$/i,
  /(^|\/)[^/]+\.tmp$/i,
  /(^|\/)chat-history\//,
  /(^|\/)target_inventory\.txt$/,
  // Local-only config (designer/operator secrets). Examples are explicit allowlist.
  /(^|\/)\.config\/(?!.*\.example\.(yaml|yml)).*\.(yaml|yml)$/,
  /(^|\/)\.config\/.*\.local\.(yaml|yml)$/,
  // Agent scratch space (gitignored, never archive)
  /(^|\/)docs\/AGENTS\//,
];

const SKIP_DIRS = new Set([".git", "node_modules"]);

function walk(dir, root, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full).split(path.sep).join("/") + (e.isDirectory() ? "/" : "");
    if (BAD_PATTERNS.some((re) => re.test(rel) || re.test("/" + rel))) {
      out.push(rel);
      if (e.isDirectory()) continue; // don't recurse into a forbidden directory
    }
    if (e.isDirectory()) {
      walk(full, root, out);
    }
  }
}

function trackedPaths(root) {
  try {
    return execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch {
    return null;
  }
}

function readText(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function checkGitignore(root, violations) {
  const gitignore = readText(path.join(root, ".gitignore"));
  const required = [
    { pattern: "dist/", label: "dist/" },
    { pattern: "dist-electron/", label: "dist-electron/" },
    { pattern: "release/", label: "release/" },
    { pattern: "coverage/", label: "coverage/" },
    { pattern: ".design-captures/", label: ".design-captures/" },
    { pattern: ".config/*.local.yaml", label: ".config/*.local.yaml" },
    { pattern: ".config/*.local.yml", label: ".config/*.local.yml" },
    { pattern: ".config/*.yaml", label: ".config/*.yaml" },
    { pattern: "!.env.example", label: "!.env.example" },
    { pattern: ".DS_Store", label: ".DS_Store" },
    { pattern: "__MACOSX/", label: "__MACOSX/" },
    { pattern: ".AppleDouble/", label: ".AppleDouble/" },
    { pattern: "._*", label: "._*" },
  ];
  for (const r of required) {
    if (!gitignore.includes(r.pattern)) {
      violations.push(`.gitignore missing exclusion: ${r.label}`);
    }
  }
}

function checkCleanScript(root, violations) {
  const scriptPath = path.join(root, "scripts/clean-repo-zip.sh");
  const script = readText(scriptPath);
  if (!script) {
    violations.push("scripts/clean-repo-zip.sh is missing (required for archive-exclusion config check)");
    return;
  }
  const required = [
    { pattern: "--exclude=dist/", label: "dist/" },
    { pattern: "--exclude=dist-electron/", label: "dist-electron/" },
    { pattern: "--exclude=release/", label: "release/" },
    { pattern: "--exclude=coverage/", label: "coverage/" },
    { pattern: "--exclude=.design-captures/", label: ".design-captures/" },
    { pattern: "--exclude=docs/AGENTS/", label: "docs/AGENTS/" },
    { pattern: "--exclude=docs/HQE_AUDIT_REPORT.md", label: "docs/HQE_AUDIT_REPORT.md" },
    { pattern: "--exclude=todo.md", label: "todo.md" },
    { pattern: "--exclude=scripts/dev-tools/venice-styles.json", label: "scripts/dev-tools/venice-styles.json" },
    { pattern: "--include=build/icon.ico", label: "include build/icon.ico" },
    { pattern: "--include=build/icon.icns", label: "include build/icon.icns" },
    { pattern: "--include=build/icon.png", label: "include build/icon.png" },
    { pattern: "--exclude=build/**", label: "exclude build/**" },
    { pattern: "--exclude=.config/*.local.yaml", label: ".config/*.local.yaml" },
    { pattern: "--exclude=.config/*.local.yml", label: ".config/*.local.yml" },
    { pattern: "--exclude=.config/*.yaml", label: ".config/*.yaml" },
    { pattern: "--exclude=.config/*.yml", label: ".config/*.yml" },
    { pattern: "--exclude=.DS_Store", label: ".DS_Store" },
    { pattern: "--exclude=__MACOSX/", label: "__MACOSX/" },
    { pattern: "--exclude=.AppleDouble/", label: ".AppleDouble/" },
    { pattern: "--exclude=._*", label: "._*" },
    { pattern: "--exclude=.env", label: ".env" },
    { pattern: "--include=.env.example", label: "include .env.example" },
  ];
  for (const r of required) {
    if (!script.includes(r.pattern)) {
      violations.push(`clean-repo-zip.sh missing exclusion: ${r.label}`);
    }
  }
}

function checkMetadata(root, violations) {
  const metadataDir = path.join(root, "_REPO_EXTRACT_METADATA");
  const extractInfoPath = path.join(metadataDir, "EXTRACT_INFO.txt");
  if (!fs.existsSync(extractInfoPath)) return;

  const infoText = fs.readFileSync(extractInfoPath, "utf8");

  // Check for absolute path leaks in default mode (no INCLUDE_PRIVATE_AUDIT_METADATA=1)
  if (process.env.INCLUDE_PRIVATE_AUDIT_METADATA !== "1") {
    const lines = infoText.split(/\r?\n/);
    for (const line of lines) {
      if (
        line.startsWith("script_path=") ||
        line.startsWith("repo_root=") ||
        line.startsWith("output_zip=") ||
        line.startsWith("created_by=") ||
        line.startsWith("hostname=")
      ) {
        const val = line.substring(line.indexOf("=") + 1);
        if (
          (val.includes("/Users/") || val.includes("/home/") || /^[a-zA-Z]:\\/.test(val)) &&
          !val.includes("omitted")
        ) {
          violations.push(`Metadata leak detected in EXTRACT_INFO.txt: ${line}`);
        }
      }
    }
  }

  // Check SHA256 of clean-repo-zip.sh against script_sha256 in EXTRACT_INFO.txt
  const shaMatch = infoText.match(/^script_sha256=([a-f0-9]{64})/m);
  if (shaMatch) {
    const metadataSha = shaMatch[1];
    const scriptPath = path.join(root, "scripts/clean-repo-zip.sh");
    if (fs.existsSync(scriptPath)) {
      const crypto = require("crypto");
      const scriptBytes = fs.readFileSync(scriptPath);
      const expectedSha = crypto.createHash("sha256").update(scriptBytes).digest("hex");
      if (metadataSha !== expectedSha) {
        violations.push(
          `ZIP provenance mismatch: script_sha256 in metadata (${metadataSha}) does not match the SHA256 of the tracked scripts/clean-repo-zip.sh (${expectedSha}). Please use the tracked script to generate the archive.`
        );
      }
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  let root = process.cwd();
  let explicitRoot = false;
  let strict = false;
  let checkConfig = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      root = path.resolve(args[i + 1]);
      explicitRoot = true;
      i++;
    } else if (args[i] === "--strict") {
      strict = true;
    } else if (args[i] === "--check-config") {
      checkConfig = true;
    }
  }

  const violations = [];

  if (explicitRoot) {
    // Extract-only scan: just walk the filesystem tree.
    walk(root, root, violations);
    checkMetadata(root, violations);
  } else if (checkConfig) {
    // Config-only scan: validate .gitignore and the clean ZIP script.
    checkGitignore(root, violations);
    checkCleanScript(root, violations);
  } else {
    // Canonical CI check: ensure archive-exclusion config covers all patterns
    // and no forbidden files are tracked.
    const hasGit = trackedPaths(root) !== null;
    if (hasGit) {
      checkGitignore(root, violations);
      checkCleanScript(root, violations);

      const tracked = trackedPaths(root);
      if (tracked) {
        for (const rel of tracked) {
          if (BAD_PATTERNS.some((re) => re.test(rel) || re.test("/" + rel))) violations.push(rel);
        }
      }
    } else {
      console.log("[verify-archive-clean] No .git checkout detected; running filesystem walk only. Use --check-config for config-only validation or --root <dir> for extracted archive validation.");
    }

    if (strict || !hasGit) {
      walk(root, root, violations);
    }
    checkMetadata(root, violations);
  }

  // Deduplicate while preserving order
  const seen = new Set();
  const unique = [];
  for (const v of violations) {
    if (!seen.has(v)) {
      seen.add(v);
      unique.push(v);
    }
  }

  if (unique.length > 0) {
    console.error("[verify-archive-clean] FAIL — forbidden paths or missing exclusions:");
    for (const v of unique.slice(0, 50)) {
      console.error("  " + v);
    }
    if (unique.length > 50) console.error(`  ... +${unique.length - 50} more`);
    console.error("\nThese must never be committed or included in archives/zips/GPT source drops:");
    console.error("  __MACOSX/  .DS_Store  ._*  .AppleDouble/  Thumbs.db  desktop.ini");
    console.error("  node_modules/  dist/  dist-electron/  release/  coverage/  .integration-src/  .vite/  .design-captures/");
    console.error("  .env*  (non-example),  .env.<name>  (e.g. .env.local, .env.development)");
    console.error("  *.db  *.sqlite*  *.log  *.tmp  chat-history/  target_inventory.txt");
    console.error("  .config/*.yaml  (non-example),  .config/*.local.yaml  .config/*.local.yml");
    console.error("  docs/AGENTS/  (gitignored agent scratch)");
    process.exit(1);
  }

  console.log("[verify:archive-clean] OK — archive exclusion config and tracked files are clean under", root);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { BAD_PATTERNS }; // for test
