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
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
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
});
