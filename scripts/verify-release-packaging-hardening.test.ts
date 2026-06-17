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
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const scriptPath = join(__dirname, "verify-release-packaging-hardening.cjs");

/**
 * Build a minimal repo that passes every verifier gate except the one the
 * caller intentionally breaks. Returns the temp root path.
 */
function createMinimalValidRepo(prefix: string, opts: { releaseYml?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  mkdirSync(join(root, "docs/RELEASE"), { recursive: true });
  mkdirSync(join(root, "docs/DEVELOPMENT"), { recursive: true });
  mkdirSync(join(root, "build"), { recursive: true });

  const fullChecksum = [
    "// @ts-nocheck",
    "const fs = require('fs');",
    "const path = require('path');",
    "const CHECKSUMMED_RELEASE_EXTENSIONS = ['.exe', '.dmg', '.zip', '.yml', '.blockmap', '.AppImage', '.deb', '.rpm'];",
    "module.exports = { CHECKSUMMED_RELEASE_EXTENSIONS };",
    "const releaseDir = path.join(process.cwd(), 'release');",
    "if (!fs.existsSync(releaseDir)) process.exit(0);",
    "const files = fs.readdirSync(releaseDir);",
    "const artifacts = files.filter((f) => !f.endsWith('.sha256') && CHECKSUMMED_RELEASE_EXTENSIONS.some((e) => f.endsWith(e)));",
    "(async () => { for (const a of artifacts) { fs.writeFileSync(path.join(releaseDir, a + '.sha256'), 'x'); } })();",
  ].join("\n");
  writeFileSync(join(root, "scripts/checksum-release.cjs"), fullChecksum);

  const realVerifyDist = readFileSync(join(repoRoot, "scripts/verify-dist.cjs"), "utf8");
  writeFileSync(join(root, "scripts/verify-dist.cjs"), realVerifyDist);
  const realVerifyDistTest = readFileSync(join(repoRoot, "scripts/verify-dist.test.ts"), "utf8");
  writeFileSync(join(root, "scripts/verify-dist.test.ts"), realVerifyDistTest);

  // The verifier checks its own script + test files by path.
  const realScript = readFileSync(scriptPath, "utf8");
  writeFileSync(join(root, "scripts/verify-release-packaging-hardening.cjs"), realScript);
  writeFileSync(join(root, "scripts/verify-release-packaging-hardening.test.ts"), "/* dummy */\n");
  writeFileSync(join(root, "scripts/clean-repo-zip.sh"), "#!/bin/bash\necho ok");
  writeFileSync(join(root, "scripts/verify-archive-clean.cjs"), "module.exports = { BAD_PATTERNS: [] };");
  writeFileSync(join(root, "scripts/verify-archive-clean.test.ts"), "/* dummy */\n");
  writeFileSync(join(root, "scripts/verify-icon.cjs"), "process.exit(0);\n");

  const pkg = {
    name: "fake",
    homepage: "https://github.com/spearchucker667/Venice_Forge#readme",
    repository: { type: "git", url: "git+https://github.com/spearchucker667/Venice_Forge.git" },
    bugs: { url: "https://github.com/spearchucker667/Venice_Forge/issues" },
    scripts: {
      "verify:release-packaging-hardening": "node scripts/verify-release-packaging-hardening.cjs",
      "verify:archive-clean": "node scripts/verify-archive-clean.cjs",
      "verify:dist": "node scripts/verify-dist.cjs",
      "verify:research-workspace": "node scripts/verify-research-workspace.cjs",
      "verify:workspace-contracts":
        "vitest run src/services/dbMigrations.test.ts src/types/project.test.ts src/stores/project-store.test.ts src/stores/chat-store.character.test.ts src/stores/media-store.test.ts src/components/layout/sidebar.test.tsx src/components/command-palette/CommandPalette.test.tsx src/components/gallery/gallery-view.test.tsx src/components/image/image-view.test.tsx --fileParallelism=false",
      "checksum:release": "node scripts/checksum-release.cjs",
      "lint:eslint": "eslint src electron server.ts scripts --max-warnings=0",
      typecheck: "tsc --noEmit && tsc --noEmit --project tsconfig.electron.json",
      ci: "npm run verify:release-packaging-hardening && npm run verify:research-workspace && npm test && npm run build && npm run lint:eslint && npm run typecheck",
      "dist:mac": "electron-builder --mac",
      "dist:mac:arm64": "electron-builder --mac --arm64",
      "dist:mac:x64": "electron-builder --mac --x64",
      "dist:win": "electron-builder --win",
      "dist:portable": "electron-builder --win portable",
      "dist:linux": "electron-builder --linux",
      "verify:dist:win": "node scripts/verify-dist.cjs --win",
      "verify:dist:portable": "node scripts/verify-dist.cjs --win --portable",
      "verify:dist:mac": "node scripts/verify-dist.cjs --mac",
      "verify:dist:linux": "node scripts/verify-dist.cjs --linux",
    },
    engines: { node: ">=22.0.0" },
  };
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));

  writeFileSync(
    join(root, "AGENTS.md"),
    "# fake\nVERIFY-052\nverify:release-packaging-hardening\n",
  );

  writeFileSync(
    join(root, ".github/workflows/ci.yml"),
    "node-version: 22\nverify:dist\n",
  );

  const releaseYml =
    opts.releaseYml ??
    [
      "node-version: 22",
      "verify:dist",
      "node scripts/verify-dist.cjs --all --release-artifacts-only",
      "checksum:release",
      "npm run typecheck",
      "npm test",
      "npm run build",
      "Check macOS signing credentials for tag releases",
      "Check Windows signing credentials for tag releases",
      "VENICE_FORGE_REQUIRE_SIGNED_RELEASE",
      "creating unsigned draft artifacts",
      "  build-windows:",
      "    steps:",
      "      - name: Package Windows artifacts (Release)",
      "        run: npm run dist:win",
      "        env:",
      "          CSC_IDENTITY_AUTO_DISCOVERY: \"false\"",
      "          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}",
      "          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}",
      "  build-linux:",
      "    steps:",
      "      - run: npm run dist:linux",
      "verify:dist:win",
      "verify:dist:portable",
      "verify:dist:linux",
    ].join("\n");
  writeFileSync(join(root, ".github/workflows/release.yml"), releaseYml);

  writeFileSync(
    join(root, "electron-builder.config.cjs"),
    "module.exports = { appId: 'x', directories: {}, asar: true, publish: { provider: 'github', owner: 'spearchucker667', repo: 'Venice_Forge' }, files: ['!**/*.map'] };\n",
  );

  for (const ic of ["icon.ico", "icon.icns", "icon.png"]) {
    writeFileSync(join(root, "build", ic), "x");
  }

  for (const doc of [
    "docs/RELEASE/release.md",
    "docs/RELEASE/signing-and-notarization.md",
    "docs/RELEASE/repository-settings.md",
    "docs/DEVELOPMENT/building.md",
    "docs/DEVELOPMENT/platform-support.md",
    "docs/DEVELOPMENT/troubleshooting.md",
  ]) {
    writeFileSync(join(root, doc), "# doc");
  }

  writeFileSync(join(root, "README.md"), "verify:release-packaging-hardening\n");

  writeFileSync(
    join(root, ".gitignore"),
    [
      "node_modules/",
      "/dist/",
      "/dist-electron/",
      "/release/",
      "/coverage/",
      ".env*",
      "!.env.example",
      ".config/*.yaml",
      "!.config/*.example.yaml",
    ].join("\n"),
  );

  return root;
}

describe("verify-release-packaging-hardening (VERIFY-052)", () => {
  it("CLI exits 0 on the real repo (passes on a clean checkout)", () => {
    const hasGit = existsSync(join(repoRoot, ".git"));
    if (!hasGit) {
      const out = spawnSync("node", [scriptPath, "--check-config"], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(out.status).toBe(0);
      return;
    }
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
    const root = createMinimalValidRepo("venice-relpkg-p0001-", {
      releaseYml: [
        "node-version: 22",
        "verify:dist",
        "node scripts/verify-dist.cjs --all --release-artifacts-only",
        "checksum:release",
        "npm run typecheck",
        "npm test",
        "npm run build",
        "  build-windows:",
        "    steps:",
        "      - name: Package Windows artifacts (Release)",
        "        run: npm run dist:win",
        "        env:",
        "          CSC_IDENTITY_AUTO_DISCOVERY: \"false\"",
        "          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}",
        "          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}",
        "  build-linux:",
        "    steps:",
        "      - run: npm run dist:linux",
        "verify:dist:linux",
      ].join("\n"),
    });
    try {
      const brokenChecksum = [
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
      writeFileSync(join(root, "scripts/checksum-release.cjs"), brokenChecksum);

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

  // VERIFY-054 regression guard: the Windows release job must only use
  // Windows-specific signing env vars (WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD).
  // Mapping the generic/mac CSC_LINK / CSC_KEY_PASSWORD into the Windows job
  // is a real bug (T-239).
  it("rejects Windows signing env that maps generic CSC_LINK / CSC_KEY_PASSWORD (VERIFY-054)", () => {
    const root = createMinimalValidRepo("venice-relpkg-verify054-", {
      releaseYml: [
        "node-version: 22",
        "verify:dist",
        "node scripts/verify-dist.cjs --all --release-artifacts-only",
        "checksum:release",
        "npm run typecheck",
        "npm test",
        "npm run build",
        "  build-windows:",
        "    steps:",
        "      - name: Package Windows artifacts (Release)",
        "        run: npm run dist:win",
        "        env:",
        "          CSC_IDENTITY_AUTO_DISCOVERY: \"false\"",
        "          CSC_LINK: ${{ secrets.CSC_LINK }}",
        "          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}",
        "          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}",
        "          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}",
        "  build-linux:",
        "    steps:",
        "      - run: npm run dist:linux",
        "verify:dist:linux",
      ].join("\n"),
    });
    try {
      const out = spawnSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
      expect(out.status, `expected non-zero exit; got ${out.status}\nstdout: ${out.stdout}\nstderr: ${out.stderr}`).not.toBe(0);
      const combined = (out.stderr || "") + (out.stdout || "");
      expect(combined).toMatch(/VERIFY-054/);
      expect(combined).toMatch(/CSC_LINK/);
      expect(combined).toMatch(/CSC_KEY_PASSWORD/);
      expect(combined).toMatch(/WIN_CSC_LINK/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects retired repo slugs in active setup docs (P0-003)", () => {
    const root = createMinimalValidRepo("venice-relpkg-oldslug-");
    try {
      writeFileSync(
        join(root, "README.md"),
        [
          "verify:release-packaging-hardening",
          "git clone https://github.com/spearchucker667/Venice_Forge.git",
          "cd Venice-API-connector",
        ].join("\n"),
      );

      const out = spawnSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
      expect(out.status, `expected non-zero exit; got ${out.status}\nstdout: ${out.stdout}\nstderr: ${out.stderr}`).not.toBe(0);
      const combined = (out.stderr || "") + (out.stdout || "");
      expect(combined).toMatch(/retired active repo slug/);
      expect(combined).toMatch(/README\.md/);
      expect(combined).toMatch(/Venice-API-connector/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
