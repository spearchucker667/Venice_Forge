/** @fileoverview Unit + CLI coverage for verify-release-packaging-hardening
 *  (VERIFY-052 — Phase 2J).
 *
 *  The test exercises:
 *    - The CLI exits 0 in the current repo (passes on a real checkout).
 *    - The CLI exits non-zero with diagnostic output when a required file is
 *      removed.
 */

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const scriptPath = join(__dirname, "verify-release-packaging-hardening.cjs");

describe("verify-release-packaging-hardening (VERIFY-052)", () => {
  it("CLI exits 0 on the real repo (passes on a clean checkout)", () => {
    const out = spawnSync("node", [scriptPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/PASS/);
    expect(out.stderr || "").toBe("");
  });

  it("CLI exits non-zero when a required release doc is missing", () => {
    // Create a fresh root with only AGENTS.md (everything else required will be missing).
    const root = mkdtempSync(join(tmpdir(), "venice-relpkg-bad-"));
    try {
      // The script requires the package.json to exist and have a ci script that includes the gate.
      // We can't trivially fake the full repo, but we can verify the script returns non-zero
      // and emits a clear diagnostic when run in an empty dir.
      const out = spawnSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
      expect(out.status).not.toBe(0);
      // The error should mention at least one missing required file
      const combined = (out.stderr || "") + (out.stdout || "");
      expect(combined).toMatch(/Missing required file/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("archive mode falls back to filesystem walk when .git is absent", () => {
    // Create a minimal fake repo (no .git) that is missing required docs but
    // contains a forbidden archive contaminant. The filesystem walk should
    // catch the contaminant even without git.
    const root = mkdtempSync(join(tmpdir(), "venice-relpkg-archive-"));
    try {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fake" }));
      writeFileSync(join(root, "scripts", "clean-repo-zip.sh"), "#!/bin/bash\necho ok");
      writeFileSync(join(root, ".DS_Store"), "x");

      const out = spawnSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
      expect(out.status).not.toBe(0);
      const combined = (out.stderr || "") + (out.stdout || "");
      // Must fall back to filesystem walk and report the contaminant.
      expect(combined).toMatch(/archive mode/);
      expect(combined).toMatch(/.DS_Store/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not emit git fatal stderr in archive mode", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-relpkg-no-git-"));
    try {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fake" }));
      writeFileSync(join(root, "scripts", "clean-repo-zip.sh"), "#!/bin/bash\necho ok");

      const out = spawnSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
      // The script will fail because many required files are missing, but
      // stderr must not contain git fatal messages.
      expect(out.stderr || "").not.toMatch(/fatal: not a git repository/i);
      expect(out.stderr || "").not.toMatch(/fatal:/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // P2-001 / P0-001 regression guard: if the release workflow runs Linux
  // packaging + `verify:dist:linux`, the checksum script must cover
  // `.AppImage`, `.deb`, and `.rpm`. We mutate a temp copy of the repo to
  // simulate the original bug and assert the verifier rejects it.
  it("rejects a checksum script that omits Linux extensions (P0-001 contract)", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-relpkg-p0001-"));
    try {
      // Build a minimal repo that satisfies the verifier's required-files
      // check AND has a real release workflow + a broken checksum script.
      mkdirSync(join(root, "scripts"), { recursive: true });
      mkdirSync(join(root, ".github/workflows"), { recursive: true });
      mkdirSync(join(root, "docs/RELEASE"), { recursive: true });
      mkdirSync(join(root, "docs/DEVELOPMENT"), { recursive: true });
      mkdirSync(join(root, "build"), { recursive: true });

      const fakeChecksum = [
        "// @ts-nocheck",
        "const fs = require('fs');",
        "const path = require('path');",
        "const CHECKSUMMED_RELEASE_EXTENSIONS = ['.exe', '.dmg', '.zip', '.yml', '.blockmap'];",
        "module.exports = { CHECKSUMMED_RELEASE_EXTENSIONS };",
        "const releaseDir = path.join(process.cwd(), 'release');",
        "if (!fs.existsSync(releaseDir)) process.exit(0);",
        "const files = fs.readdirSync(releaseDir);",
        "const artifacts = files.filter((f) => !f.endsWith('.sha256') && CHECKSUMMED_RELEASE_EXTENSIONS.some((e) => f.endsWith(e)));",
        "(async () => { for (const a of artifacts) { fs.writeFileSync(path.join(releaseDir, a + '.sha256'), 'x'); } })();",
      ].join("\n");
      writeFileSync(join(root, "scripts/checksum-release.cjs"), fakeChecksum);

      // Copy the real verify-dist.cjs so it still declares Linux expectedExtensions.
      const realVerifyDist = readFileSync(join(repoRoot, "scripts/verify-dist.cjs"), "utf8");
      writeFileSync(join(root, "scripts/verify-dist.cjs"), realVerifyDist);
      // The real test file (to satisfy requiredFiles check)
      const realVerifyDistTest = readFileSync(join(repoRoot, "scripts/verify-dist.test.ts"), "utf8");
      writeFileSync(join(root, "scripts/verify-dist.test.ts"), realVerifyDistTest);

      writeFileSync(join(root, "scripts/clean-repo-zip.sh"), "#!/bin/bash\necho ok");
      writeFileSync(join(root, "scripts/verify-archive-clean.cjs"), "module.exports = { BAD_PATTERNS: [] };");
      writeFileSync(join(root, "scripts/verify-archive-clean.test.ts"), "/* dummy */\n");
      writeFileSync(join(root, "scripts/verify-icon.cjs"), "process.exit(0);\n");
      writeFileSync(join(root, "scripts/verify-release-packaging-hardening.test.ts"), "/* dummy */\n");

      // package.json with all the expected scripts (the verifier checks them).
      const pkg = {
        name: "fake",
        scripts: {
          "verify:release-packaging-hardening": "node scripts/verify-release-packaging-hardening.cjs",
          "verify:archive-clean": "node scripts/verify-archive-clean.cjs",
          "verify:dist": "node scripts/verify-dist.cjs",
          "verify:research-workspace": "echo skipped",
          "verify:workspace-contracts": "echo skipped",
          "checksum:release": "node scripts/checksum-release.cjs",
          "lint:eslint": "eslint .",
          typecheck: "tsc --noEmit",
          ci: "npm run verify:release-packaging-hardening && npm run verify:research-workspace && npm test && npm run build && npm run lint:eslint && npm run typecheck",
        },
        engines: { node: ">=22.0.0" },
      };
      writeFileSync(join(root, "package.json"), JSON.stringify(pkg));

      // AGENTS.md with VERIFY-052 mention.
      writeFileSync(
        join(root, "AGENTS.md"),
        "# fake\nVERIFY-052\nverify:release-packaging-hardening\n",
      );

      // Workflows
      writeFileSync(
        join(root, ".github/workflows/ci.yml"),
        "node-version: 22\nverify:dist\n",
      );
      writeFileSync(
        join(root, ".github/workflows/release.yml"),
        "node-version: 22\nverify:dist\nchecksum:release\nnpm run typecheck\nnpm test\nnpm run build\n--linux\nverify:dist:linux\n",
      );

      // electron-builder config
      writeFileSync(
        join(root, "electron-builder.config.cjs"),
        "module.exports = { appId: 'x', directories: {}, asar: true, files: ['!**/*.map'] };\n",
      );

      // Build icons
      for (const ic of ["icon.ico", "icon.icns", "icon.png"]) {
        writeFileSync(join(root, "build", ic), "x");
      }

      // Docs
      for (const doc of [
        "docs/RELEASE/release.md",
        "docs/RELEASE/signing-and-notarization.md",
        "docs/DEVELOPMENT/building.md",
        "docs/DEVELOPMENT/platform-support.md",
        "docs/DEVELOPMENT/troubleshooting.md",
      ]) {
        writeFileSync(join(root, doc), "# doc");
      }

      // README must mention the release surface
      writeFileSync(join(root, "README.md"), "verify:release-packaging-hardening\n");

      const out = spawnSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
      expect(out.status, `expected non-zero exit; got ${out.status}\nstdout: ${out.stdout}\nstderr: ${out.stderr}`).not.toBe(0);
      const combined = (out.stderr || "") + (out.stdout || "");
      // Must specifically report the P0-001 contract failure.
      expect(combined).toMatch(/P0-001 contract/);
      expect(combined).toMatch(/\.AppImage|\.deb|\.rpm/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
