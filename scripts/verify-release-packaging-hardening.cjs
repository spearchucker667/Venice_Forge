#!/usr/bin/env node
/**
 * verify-release-packaging-hardening.cjs (VERIFY-052 — Phase 2J)
 *
 * Single-source-of-truth audit for release/packaging hygiene. Runs in CI and
 * locally. Fails if:
 *   - the canonical package.json scripts are missing or wrong
 *   - the `ci` chain does not include the Phase 2J verify gate
 *   - the GitHub CI / release workflows are not pinned to Node 22
 *   - the GitHub release workflow does not run the full verify matrix
 *   - the release workflow does not run dist + archive verification
 *   - electron-builder config is missing or unpacked is unsafe
 *   - release docs or signing/notarization docs are missing
 *   - forbidden archive paths are tracked in git
 *   - .gitignore is missing the canonical exclusion tokens
 *   - icon assets are not tracked
 *
 * Run:
 *   node scripts/verify-release-packaging-hardening.cjs
 *
 * Exit 0 on pass; non-zero + diagnostic message on any failure.
 */

const { existsSync, readFileSync, statSync, readdirSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

// Resolve the root from process.cwd() so the script can run in a
// fresh clone (CI) or in a temporary directory (tests).
const root = process.cwd();
const failures = [];
const passes = [];

function fail(message) {
  failures.push(message);
}

function pass(message) {
  passes.push(message);
}

function readText(rel) {
  const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
  return readFileSync(abs, "utf8");
}

function checkFile(rel, opts = {}) {
  if (!existsSync(path.join(root, rel))) {
    fail(`Missing required file: ${rel}`);
    return false;
  }
  if (opts.minSize) {
    const stat = statSync(path.join(root, rel));
    if (stat.size < opts.minSize) {
      fail(`${rel} is too small (${stat.size} < ${opts.minSize} bytes)`);
      return false;
    }
  }
  pass(`Found ${rel}`);
  return true;
}

function checkIncludes(haystack, needle, label) {
  if (typeof haystack === "string" && haystack.includes(needle)) {
    pass(`Found token: ${label}`);
    return true;
  }
  fail(`Missing token: ${label}  (expected: ${JSON.stringify(needle)})`);
  return false;
}

function hasGitDirectory(rootDir) {
  return existsSync(path.join(rootDir, ".git"));
}

function tryGit(args) {
  if (!hasGitDirectory(root)) return null;
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

const isGitWorktree = tryGit(["rev-parse", "--is-inside-work-tree"])?.trim() === "true";

// 1. Required files
const requiredFiles = [
  "package.json",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  "electron-builder.config.cjs",
  "scripts/verify-dist.cjs",
  "scripts/verify-dist.test.ts",
  "scripts/verify-archive-clean.cjs",
  "scripts/verify-archive-clean.test.ts",
  "scripts/checksum-release.cjs",
  "scripts/verify-icon.cjs",
  "scripts/verify-release-packaging-hardening.cjs",
  "scripts/verify-release-packaging-hardening.test.ts",
  "docs/RELEASE/release.md",
  "docs/RELEASE/signing-and-notarization.md",
  "docs/DEVELOPMENT/building.md",
  "docs/DEVELOPMENT/platform-support.md",
  "docs/DEVELOPMENT/troubleshooting.md",
  "AGENTS.md",
];
for (const f of requiredFiles) checkFile(f);

// 2. Build icon assets must be tracked
for (const icon of ["build/icon.ico", "build/icon.icns", "build/icon.png"]) {
  checkFile(icon);
}

// 3. package.json scripts
let pkg = null;
try {
  pkg = JSON.parse(readText("package.json"));
} catch (err) {
  fail(`Failed to parse package.json: ${err.message}`);
}

if (pkg) {
  const expectedScripts = {
    "verify:release-packaging-hardening": "node scripts/verify-release-packaging-hardening.cjs",
    "verify:archive-clean": "node scripts/verify-archive-clean.cjs",
    "verify:dist": "node scripts/verify-dist.cjs",
    "verify:research-workspace": "node scripts/verify-research-workspace.cjs",
    "verify:workspace-contracts": "vitest run src/services/dbMigrations.test.ts src/types/project.test.ts src/stores/project-store.test.ts src/stores/chat-store.character.test.ts src/stores/media-store.test.ts src/components/layout/sidebar.test.tsx src/components/command-palette/CommandPalette.test.tsx src/components/gallery/gallery-view.test.tsx src/components/image/image-view.test.tsx --fileParallelism=false",
    "checksum:release": "node scripts/checksum-release.cjs",
    "lint:eslint": "eslint src electron server.ts scripts --max-warnings=0",
    typecheck: "tsc --noEmit && tsc --noEmit --project tsconfig.electron.json",
  };
  for (const [k, v] of Object.entries(expectedScripts)) {
    if (pkg.scripts?.[k] !== v) {
      fail(`package.json script "${k}" must equal ${JSON.stringify(v)}`);
    } else {
      pass(`package.json script "${k}" is correct`);
    }
  }

  // 4. ci chain must include verify:release-packaging-hardening
  const ci = pkg.scripts?.ci || "";
  if (!ci.includes("verify:release-packaging-hardening")) {
    fail("`ci` script does not include `verify:release-packaging-hardening`");
  } else {
    pass("`ci` script includes verify:release-packaging-hardening");
  }
  if (!ci.includes("verify:research-workspace")) {
    fail("`ci` script is missing the Phase 2I gate `verify:research-workspace`");
  } else {
    pass("`ci` script includes verify:research-workspace");
  }
  if (!ci.includes("npm test")) {
    fail("`ci` script is missing `npm test`");
  } else {
    pass("`ci` script includes npm test");
  }
  if (!ci.includes("npm run build")) {
    fail("`ci` script is missing `npm run build`");
  } else {
    pass("`ci` script includes npm run build");
  }
  if (!ci.includes("lint:eslint") || !ci.includes("typecheck")) {
    fail("`ci` script is missing lint:eslint and/or typecheck");
  } else {
    pass("`ci` script includes lint:eslint and typecheck");
  }

  // 5. Engine pin (Node 22)
  const engines = pkg.engines || {};
  const nodeRange = engines.node || "";
  if (!nodeRange.includes("22")) {
    fail(`package.json engines.node does not pin Node 22: "${nodeRange}"`);
  } else {
    pass(`package.json engines.node pins Node 22 (${nodeRange})`);
  }

  // 4b. Canonical dist:<platform> scripts (P2-002 — release hygiene).
  //
  // The release workflow calls `npm run dist:<platform>`. If a future refactor
  // drops one of these scripts, the release job will fail with a confusing
  // "Missing script: dist:linux" error. The verifier must catch that here.
  const expectedDistScripts = ["dist:mac", "dist:win", "dist:linux"];
  for (const s of expectedDistScripts) {
    if (typeof pkg.scripts?.[s] !== "string" || pkg.scripts[s].length === 0) {
      fail(`package.json is missing the canonical "${s}" packaging script (P2-002)`);
    } else {
      pass(`package.json has canonical "${s}" packaging script`);
    }
  }
}

// 6. AGENTS.md has VERIFY-052
{
  const agentsPath = path.join(root, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    fail("AGENTS.md is missing (required to document VERIFY-052)");
  } else {
    const agents = readFileSync(agentsPath, "utf8");
    checkIncludes(agents, "VERIFY-052", "AGENTS.md mentions VERIFY-052");
    checkIncludes(agents, "verify:release-packaging-hardening", "AGENTS.md mentions verify:release-packaging-hardening");
  }
}

// 7. CI workflow uses Node 22
{
  const ciPath = path.join(root, ".github/workflows/ci.yml");
  if (!existsSync(ciPath)) {
    fail(".github/workflows/ci.yml is missing");
  } else {
    const ci = readFileSync(ciPath, "utf8");
    checkIncludes(ci, "node-version: 22", ".github/workflows/ci.yml pins Node 22");
    // CI workflow should also run verify:dist
    if (!ci.includes("verify:dist")) {
      fail(".github/workflows/ci.yml is missing verify:dist");
    } else {
      pass(".github/workflows/ci.yml runs verify:dist");
    }
  }
}

// 8. Release workflow uses Node 22 + dist verification + archive verification
{
  const releasePath = path.join(root, ".github/workflows/release.yml");
  if (!existsSync(releasePath)) {
    fail(".github/workflows/release.yml is missing");
  } else {
    const release = readFileSync(releasePath, "utf8");
    checkIncludes(release, "node-version: 22", ".github/workflows/release.yml pins Node 22");
    if (!release.includes("verify:dist")) {
      fail(".github/workflows/release.yml is missing verify:dist");
    } else {
      pass(".github/workflows/release.yml runs verify:dist");
    }
    // The release workflow should also include checksum generation
    if (!release.includes("checksum:release")) {
      fail(".github/workflows/release.yml is missing checksum:release");
    } else {
      pass(".github/workflows/release.yml runs checksum:release");
    }
    // The release workflow must call typecheck / tests / build before packaging
    if (!release.includes("npm run typecheck") || !release.includes("npm test") || !release.includes("npm run build")) {
      fail(".github/workflows/release.yml must run typecheck, test, and build before packaging");
    } else {
      pass(".github/workflows/release.yml runs typecheck, test, and build");
    }
    // Linux job must not run Windows packaging scripts
    if (release.includes("dist:win || true")) {
      fail(".github/workflows/release.yml Linux job must not run 'npm run dist:win || true'");
    } else {
      pass(".github/workflows/release.yml Linux job does not run Windows packaging scripts");
    }
  }
}

// 8b. Clean ZIP script must be tracked (not ignored)
{
  const cleanScriptPath = path.join(root, "scripts/clean-repo-zip.sh");
  if (!existsSync(cleanScriptPath)) {
    fail("scripts/clean-repo-zip.sh is missing");
  } else {
    pass("scripts/clean-repo-zip.sh exists");
  }
  if (isGitWorktree) {
    const ignored = tryGit(["check-ignore", "scripts/clean-repo-zip.sh"]);
    if (ignored && ignored.trim().length > 0) {
      fail("scripts/clean-repo-zip.sh is gitignored — move it to a tracked path or update .gitignore");
    } else {
      pass("scripts/clean-repo-zip.sh is not gitignored");
    }
    const tracked = tryGit(["ls-files", "scripts/clean-repo-zip.sh"]);
    if (!tracked || tracked.trim().length === 0) {
      fail("scripts/clean-repo-zip.sh is not tracked by git");
    } else {
      pass("scripts/clean-repo-zip.sh is tracked by git");
    }
  } else {
    pass("archive mode: scripts/clean-repo-zip.sh presence checked (git index unavailable)");
  }
}

// 9. electron-builder config
{
  const ebPath = path.join(root, "electron-builder.config.cjs");
  if (!existsSync(ebPath)) {
    fail("electron-builder.config.cjs is missing");
  } else {
    const eb = readFileSync(ebPath, "utf8");
    checkIncludes(eb, "appId", "electron-builder.config.cjs declares appId");
    checkIncludes(eb, "directories", "electron-builder.config.cjs declares directories");
    checkIncludes(eb, "asar: true", "electron-builder.config.cjs enables asar");
    if (!eb.includes("!dist/**/*.map") && !eb.includes("!**/*.map")) {
      fail("electron-builder.config.cjs does not exclude .map files from the packaged app");
    } else {
      pass("electron-builder.config.cjs excludes .map source maps from the packaged app");
    }
  }
}

// 10. .gitignore exclusions
{
  const giPath = path.join(root, ".gitignore");
  if (!existsSync(giPath)) {
    fail(".gitignore is missing");
  } else {
    const gi = readFileSync(giPath, "utf8");
    const tokens = [
      "node_modules/",
      "/dist/",
      "/dist-electron/",
      "/release/",
      "/coverage/",
      ".env*",
      "!.env.example",
      ".config/*.yaml",
      "!.config/*.example.yaml",
    ];
    for (const t of tokens) {
      if (!gi.includes(t)) {
        fail(`.gitignore missing exclusion: ${t}`);
      } else {
        pass(`.gitignore contains: ${t}`);
      }
    }
  }
}

// 11. No forbidden archive paths are present under root (git-tracked when available,
//     filesystem walk in archive mode)
const archiveClean = require(path.join(__dirname, "verify-archive-clean.cjs"));

function walkForBadPaths(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full).split(path.sep).join("/") + (e.isDirectory() ? "/" : "");
    if (archiveClean.BAD_PATTERNS.some((re) => re.test(rel) || re.test("/" + rel))) {
      out.push(rel);
      if (e.isDirectory()) continue;
    }
    if (e.isDirectory() && e.name !== ".git" && e.name !== "node_modules") {
      walkForBadPaths(full, out);
    }
  }
}

if (isGitWorktree) {
  const tracked = tryGit(["ls-files", "-z"]);
  if (tracked === null) {
    pass("git not available — skipping tracked-contaminant scan (CI must run inside a checkout)");
  } else {
    const trackedList = tracked.split("\0").filter(Boolean);
    // We use the same BAD_PATTERNS as verify-archive-clean.cjs by requiring
    // the file. That way there is exactly one source of truth.
    const bad = trackedList.filter((rel) =>
      archiveClean.BAD_PATTERNS.some((re) => re.test(rel) || re.test("/" + rel)),
    );
    if (bad.length > 0) {
      fail(`Forbidden archive contaminants are tracked in git (${bad.length}):\n  ${bad.slice(0, 20).join("\n  ")}`);
    } else {
      pass(`No forbidden archive contaminants are tracked (${trackedList.length} tracked paths scanned)`);
    }
  }
} else {
  const bad = [];
  walkForBadPaths(root, bad);
  // Deduplicate
  const unique = Array.from(new Set(bad));
  if (unique.length > 0) {
    fail(`archive mode: forbidden archive contaminants found under extract root (${unique.length}):\n  ${unique.slice(0, 20).join("\n  ")}`);
  } else {
    pass("archive mode: no forbidden archive contaminants found under root (filesystem walk)");
  }
}

// 12. README mentions Phase 2J verification
{
  const readmePath = path.join(root, "README.md");
  if (!existsSync(readmePath)) {
    fail("README.md is missing");
  } else {
    const readme = readFileSync(readmePath, "utf8");
    // README is allowed to omit VERIFY-052 by id, but it must mention the
    // verify:release-packaging-hardening entry-point or release readiness.
    const ok =
      readme.includes("verify:release-packaging-hardening") ||
      readme.includes("release readiness") ||
      readme.includes("verify:dist") ||
      readme.includes("Phase 2J");
    if (!ok) {
      fail("README.md does not reference any Phase 2J / release-readiness surface");
    } else {
      pass("README.md references release-readiness / verify:dist / verify:release-packaging-hardening");
    }
  }
}

// 13. Cross-script checksum/verifier contract (P0-001 / P2-001 regression guard).
//
// This catches the exact failure mode that slipped past 2026-06-09: the
// release workflow packaged Linux artifacts, ran `checksum:release` (which
// did not cover `.AppImage` / `.deb` / `.rpm`), then failed at
// `verify:dist:linux` with "Missing checksum sidecar". The fix is to require
// every artifact extension `verify-dist.cjs` demands a sidecar for to be
// present in the `CHECKSUMMED_RELEASE_EXTENSIONS` allowlist exported by
// `scripts/checksum-release.cjs`.
{
  const checksumPath = path.join(root, "scripts/checksum-release.cjs");
  const verifyDistPath = path.join(root, "scripts/verify-dist.cjs");
  const releaseYmlPath = path.join(root, ".github/workflows/release.yml");

  if (!existsSync(checksumPath)) {
    fail("scripts/checksum-release.cjs is missing (required for P0-001 contract check)");
  } else if (!existsSync(verifyDistPath)) {
    fail("scripts/verify-dist.cjs is missing (required for P0-001 contract check)");
  } else {
    const checksumSrc = readFileSync(checksumPath, "utf8");
    const verifyDistSrc = readFileSync(verifyDistPath, "utf8");

    // Extract the literal allowlist literal from checksum-release.cjs.
    // The list is declared as a JS array literal beginning with `const
    // CHECKSUMMED_RELEASE_EXTENSIONS = [` or equivalent.
    const checksumListMatch = checksumSrc.match(
      /CHECKSUMMED_RELEASE_EXTENSIONS\s*=\s*\[([\s\S]*?)\]/,
    );
    if (!checksumListMatch) {
      fail(
        "scripts/checksum-release.cjs must export a CHECKSUMMED_RELEASE_EXTENSIONS array literal " +
          "so this verifier can read it (P0-001 contract check).",
      );
    } else {
      const checksumExts = Array.from(
        checksumListMatch[1].matchAll(/["']([^"']+)["']/g),
      ).map((m) => m[1]);

      // Every Linux extension in verify-dist's `expectedExtensions = [...]`
      // must be in the checksum allowlist.
      const linuxExtMatch = verifyDistSrc.match(/expectedExtensions\s*=\s*\[([^\]]+)\]/);
      if (linuxExtMatch) {
        const linuxExts = Array.from(linuxExtMatch[1].matchAll(/["']([^"']+)["']/g)).map((m) => m[1]);
        for (const ext of linuxExts) {
          if (!checksumExts.includes(ext)) {
            fail(
              `P0-001 contract: scripts/verify-dist.cjs expects ${ext} artifacts in release/ but ` +
                `scripts/checksum-release.cjs does not include ${ext} in CHECKSUMMED_RELEASE_EXTENSIONS. ` +
                `The release workflow will fail at \`verify:dist:linux\` with "Missing checksum sidecar".`,
            );
          } else {
            pass(`P0-001 contract: checksum-release.cjs covers verify-dist Linux extension ${ext}`);
          }
        }
      } else {
        pass(
          "scripts/verify-dist.cjs has no explicit Linux expectedExtensions literal (skipping P0-001 Linux check)",
        );
      }

      // If the release workflow runs Linux packaging or verify:dist:linux,
      // the checksum script must at minimum cover the canonical Linux triple.
      if (existsSync(releaseYmlPath)) {
        const release = readFileSync(releaseYmlPath, "utf8");
        const workflowRunsLinux = /--linux\b/.test(release) || /verify:dist:linux/.test(release);
        if (workflowRunsLinux) {
          for (const required of [".AppImage", ".deb", ".rpm"]) {
            if (!checksumExts.includes(required)) {
              fail(
                `P0-001 contract: .github/workflows/release.yml runs Linux packaging or ` +
                  `verify:dist:linux, but scripts/checksum-release.cjs is missing ${required} ` +
                  `in CHECKSUMMED_RELEASE_EXTENSIONS.`,
              );
            } else {
              pass(
                `P0-001 contract: .github/workflows/release.yml Linux path is checksummed for ${required}`,
              );
            }
          }
        } else {
          pass(
            ".github/workflows/release.yml does not run --linux / verify:dist:linux (P0-001 Linux contract not required)",
          );
        }
      }
    }
  }
}

// Summary
if (failures.length > 0) {
  console.error("\n[verify:release-packaging-hardening] FAIL");
  for (const f of failures) console.error("  ✗ " + f);
  console.error(`\n  ${failures.length} failure(s), ${passes.length} pass(es)`);
  process.exit(1);
}

console.log("[verify:release-packaging-hardening] PASS");
for (const p of passes) console.log("  ✓ " + p);
console.log(`  ${passes.length} pass(es)`);
process.exit(0);
