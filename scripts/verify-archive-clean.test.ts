/** @fileoverview Basic coverage for the archive-clean hygiene guard (P1). */

import { describe, expect, it } from "vitest";
// Dynamic import for .cjs to satisfy no-require-imports while still exercising
// the guard's exported BAD_PATTERNS (no types for the .cjs).
// @ts-expect-error — .cjs has no declaration; any is acceptable inside this guard test.
const { BAD_PATTERNS } = await import("./verify-archive-clean.cjs");
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

function findZip(outDir: string): string | null {
  try {
    const entries = readdirSync(outDir);
    const zip = entries.find((e) => e.endsWith(".zip"));
    return zip ? join(outDir, zip) : null;
  } catch {
    return null;
  }
}

describe("verify-archive-clean (P1 hygiene guard)", () => {
  it("exports BAD_PATTERNS that match the documented contaminants", () => {
    expect(BAD_PATTERNS.length).toBeGreaterThan(10);
    const sample = [
      "__MACOSX/foo/",
      "bar/.DS_Store",
      "x/._private",
      "y/.AppleDouble/z",
      "win/Thumbs.db",
      "win/desktop.ini",
      "node_modules/pkg",
      "dist/bundle.js",
      "dist-electron/electron/main.js",
      "release/app.dmg",
      "coverage/lcov.info",
      ".integration-src/foo.ts",
      ".vite/foo.js",
      ".design-captures/x.png",
      ".env",
      ".env.local",
      ".env.development",
      "chat-history/conv.json",
      ".config/my-secret.yaml",
      ".config/themes.local.yaml",
      "foo.db",
      "dir/data.sqlite3",
      "logs/run.log",
      "scratch.tmp",
      "target_inventory.txt",
      "docs/AGENTS/AGENTS.md",
    ];
    for (const s of sample) {
      const hit = BAD_PATTERNS.some((re: RegExp) => re.test(s) || re.test("/" + s) || re.test(s + "/"));
      expect(hit).toBe(true);
    }
    // Allowed examples must not match the non-example yaml/env rules
    expect(BAD_PATTERNS.some((re: RegExp) => re.test(".config/config.example.yaml"))).toBe(false);
    expect(BAD_PATTERNS.some((re: RegExp) => re.test(".config/themes.example.yml"))).toBe(false);
    expect(BAD_PATTERNS.some((re: RegExp) => re.test(".env.example"))).toBe(false);
    // Real source files must remain allowed
    expect(BAD_PATTERNS.some((re: RegExp) => re.test("src/main.ts"))).toBe(false);
    expect(BAD_PATTERNS.some((re: RegExp) => re.test("docs/RELEASE/release.md"))).toBe(false);
    expect(BAD_PATTERNS.some((re: RegExp) => re.test("scripts/verify-archive-clean.cjs"))).toBe(false);
  });

  it("CLI exits 0 on a clean temp tree and non-zero when contaminants are present", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-archive-clean-"));
    try {
      // Clean tree should pass
      const cleanOut = execSync(`node ${join(__dirname, "verify-archive-clean.cjs")} --root ${root}`, { encoding: "utf8" });
      expect(cleanOut).toMatch(/OK/);

      // Plant a forbidden item
      writeFileSync(join(root, ".DS_Store"), "");
      const badRoot = mkdtempSync(join(tmpdir(), "venice-archive-clean-bad-"));
      try {
        writeFileSync(join(badRoot, "._evil"), "x");
        let failed = false;
        try {
          execSync(`node ${join(__dirname, "verify-archive-clean.cjs")} --root ${badRoot}`, { stdio: "pipe" });
        } catch (e: any) {
          failed = e.status !== 0;
        }
        expect(failed).toBe(true);
      } finally {
        rmSync(badRoot, { recursive: true, force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("--check-config validates .gitignore and clean ZIP script on a real checkout", () => {
    const out = execSync(`node ${join(__dirname, "verify-archive-clean.cjs")} --check-config`, { encoding: "utf8" });
    expect(out).toMatch(/OK/);
  });

  it("--root mode works on an extracted archive without requiring the clean script", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-archive-clean-extract-"));
    try {
      // Simulate an extracted clean archive that lacks the tracked clean script
      const out = execSync(`node ${join(__dirname, "verify-archive-clean.cjs")} --root ${root}`, { encoding: "utf8" });
      expect(out).toMatch(/OK/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("clean-repo-zip.sh redacts raw secret-like values in POSSIBLE_SECRET_WARNINGS.txt", () => {
    const repo = mkdtempSync(join(tmpdir(), "venice-clean-zip-repo-"));
    const outDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-out-"));
    const extractDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-extract-"));
    const rawToken = "sk-abc12345678901234567890xyz";
    try {
      // Create a minimal fake repo that passes the root sanity check.
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake-repo" }));
      writeFileSync(join(repo, "README.md"), "# fake");
      mkdirSync(join(repo, "src"), { recursive: true });
      writeFileSync(join(repo, "src", "secret-like.ts"), `export const key = "${rawToken}";\n`);

      execSync(`bash ${join(__dirname, "clean-repo-zip.sh")} ${repo} ${outDir}`, {
        encoding: "utf8",
        stdio: "pipe",
      });

      const zipPath = findZip(outDir);
      expect(zipPath).not.toBeNull();

      execSync(`unzip -q "${zipPath!}" -d ${extractDir}`, { stdio: "pipe" });

      const extractedName = readdirSync(extractDir)[0];
      const warningsPath = join(
        extractDir,
        extractedName,
        "_REPO_EXTRACT_METADATA",
        "POSSIBLE_SECRET_WARNINGS.txt",
      );
      const warnings = readFileSync(warningsPath, "utf8");

      // The report must reference the pattern that matched.
      expect(warnings).toMatch(/sk-token/);
      // The raw secret-like value must NOT appear in the report.
      expect(warnings).not.toMatch(new RegExp(rawToken));
      expect(warnings).not.toMatch(/sk-abc123/);
      // Only path:line:pattern-name lines are expected after the header.
      const bodyLines = warnings
        .split("\n")
        .filter((line) => line.trim().length > 0 && !line.startsWith("=") && !line.startsWith("This") && !line.startsWith("Real") && !line.startsWith("Only") && !line.startsWith("Possible"));
      for (const line of bodyLines) {
        expect(line).toMatch(/^[^:]+:[0-9]+:[a-z0-9-]+$/);
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rmSync(extractDir, { recursive: true, force: true });
    }
  });
});
