/** @fileoverview Basic coverage for the archive-clean hygiene guard (P1). */

import { describe, expect, it } from "vitest";
// Dynamic import for .cjs to satisfy no-require-imports while still exercising
// the guard's exported BAD_PATTERNS (no types for the .cjs).
// @ts-expect-error — .cjs has no declaration; any is acceptable inside this guard test.
const { BAD_PATTERNS } = await import("./verify-archive-clean.cjs");
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

function shellQuote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function commandExists(command: string): boolean {
  try {
    const probe = process.platform === "win32" ? `where ${command}` : `command -v ${command}`;
    execSync(probe, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const archiveToolingAvailable = commandExists("zip") && commandExists("unzip");
const archiveIt = archiveToolingAvailable ? it : it.skip;

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
      "records.json",
      "records-20260618.json",
      "work done 2026-06-18.md",
      "agent_session.md",
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
      const cleanOut = execSync(`node ${shellQuote(join(__dirname, "verify-archive-clean.cjs"))} --root ${shellQuote(root)}`, { encoding: "utf8" });
      expect(cleanOut).toMatch(/OK/);

      // Plant a forbidden item
      writeFileSync(join(root, ".DS_Store"), "");
      const badRoot = mkdtempSync(join(tmpdir(), "venice-archive-clean-bad-"));
      try {
        writeFileSync(join(badRoot, "._evil"), "x");
        let failed = false;
        try {
          execSync(`node ${shellQuote(join(__dirname, "verify-archive-clean.cjs"))} --root ${shellQuote(badRoot)}`, { stdio: "pipe" });
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
    const out = execSync(`node ${shellQuote(join(__dirname, "verify-archive-clean.cjs"))} --check-config`, { encoding: "utf8" });
    expect(out).toMatch(/OK/);
  });

  it("--root mode works on an extracted archive without requiring the clean script", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-archive-clean-extract-"));
    try {
      // Simulate an extracted clean archive that lacks the tracked clean script
      const out = execSync(`node ${shellQuote(join(__dirname, "verify-archive-clean.cjs"))} --root ${shellQuote(root)}`, { encoding: "utf8" });
      expect(out).toMatch(/OK/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  archiveIt("clean-repo-zip.sh fails on high-risk source secret-like values without emitting raw values", () => {
    const repo = mkdtempSync(join(tmpdir(), "venice-clean-zip-repo-"));
    const outDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-out-"));
    const rawToken = ["sk", "abc12345678901234567890xyz"].join("-");
    try {
      // Create a minimal fake repo that passes the root sanity check.
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake-repo" }));
      writeFileSync(join(repo, "README.md"), "# fake");
      mkdirSync(join(repo, "src"), { recursive: true });
      writeFileSync(join(repo, "src", "secret-like.ts"), `export const key = "${rawToken}";\n`);

      let failed = false;
      let output = "";
      try {
        execSync(`bash ${shellQuote(join(__dirname, "clean-repo-zip.sh"))} ${shellQuote(repo)} ${shellQuote(outDir)}`, {
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (e: any) {
        failed = e.status !== 0;
        output = String(e.stderr || "") + String(e.stdout || "");
      }
      expect(failed).toBe(true);
      expect(output).toMatch(/high-risk source secret-like strings found \(1\)/);
      expect(output).toMatch(/POSSIBLE_SECRET_WARNINGS\.tsv/);
      expect(output).not.toContain(rawToken);
      expect(output).not.toMatch(/sk-abc123/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("verify-archive-clean rejects transcript artifacts and high-risk secret scan metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-archive-transcript-"));
    const metaDir = join(root, "_REPO_EXTRACT_METADATA");
    try {
      mkdirSync(metaDir, { recursive: true });
      writeFileSync(join(root, "records.json"), "{}\n");
      writeFileSync(join(metaDir, "SECRET_SCAN_SUMMARY.txt"), [
        "high_risk_hits=2",
        "example_hits=0",
        "raw_line_content_emitted=false",
        "",
      ].join("\n"));

      let output = "";
      let failed = false;
      try {
        execSync(`node ${shellQuote(join(__dirname, "verify-archive-clean.cjs"))} --root ${shellQuote(root)}`, {
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (e: any) {
        failed = e.status !== 0;
        output = String(e.stderr || "") + String(e.stdout || "");
      }

      expect(failed).toBe(true);
      expect(output).toMatch(/records\.json/);
      expect(output).toMatch(/high_risk_hits=2/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  archiveIt("clean-repo-zip.sh reports test secret fixtures without blocking archives", () => {
    const repo = mkdtempSync(join(tmpdir(), "venice-clean-zip-test-fixture-repo-"));
    const outDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-test-fixture-out-"));
    const extractDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-test-fixture-extract-"));
    const rawToken = ["v", "n-test-fixture-12345678"].join("");
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake-repo" }));
      writeFileSync(join(repo, "README.md"), "# fake");
      mkdirSync(join(repo, "src"), { recursive: true });
      writeFileSync(join(repo, "src", "redaction.test.ts"), `expect("${rawToken}").toContain("vn-");\n`);

      execSync(`bash ${shellQuote(join(__dirname, "clean-repo-zip.sh"))} ${shellQuote(repo)} ${shellQuote(outDir)}`, {
        encoding: "utf8",
        stdio: "pipe",
      });

      const zipPath = findZip(outDir);
      expect(zipPath).not.toBeNull();
      execSync(`unzip -q ${shellQuote(zipPath!)} -d ${shellQuote(extractDir)}`, { stdio: "pipe" });

      const extractedName = readdirSync(extractDir)[0];
      const metaDir = join(extractDir, extractedName, "_REPO_EXTRACT_METADATA");
      const warnings = readFileSync(join(metaDir, "POSSIBLE_SECRET_WARNINGS.tsv"), "utf8");
      const summary = readFileSync(join(metaDir, "SECRET_SCAN_SUMMARY.txt"), "utf8");

      expect(warnings).toMatch(/src\/redaction\.test\.ts\t1\tvenice-vn-token\ttest-fixture/);
      expect(warnings).not.toContain(rawToken);
      expect(summary).toMatch(/high_risk_hits=0/);
      expect(summary).toMatch(/raw_line_content_emitted=false/);
      expect(summary.split("\n").filter((line) => line === "0")).toHaveLength(0);
      expect(summary).toMatch(/^high_risk_hits=0\nexample_hits=0\nraw_line_content_emitted=false\n?$/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rmSync(extractDir, { recursive: true, force: true });
    }
  });

  archiveIt("clean-repo-zip.sh does not block derived secret-presence metadata booleans", () => {
    const repo = mkdtempSync(join(tmpdir(), "venice-clean-zip-secret-metadata-repo-"));
    const outDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-secret-metadata-out-"));
    const extractDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-secret-metadata-extract-"));
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake-repo" }));
      writeFileSync(join(repo, "README.md"), "# fake");
      mkdirSync(join(repo, "src"), { recursive: true });
      writeFileSync(
        join(repo, "src", "config.ts"),
        [
          "export const metadata = {",
          "  has_venice_api_key: config.secrets.venice_api_key.length > 0,",
          "  has_jina_api_key: config.secrets.jina_api_key.length > 0,",
          "};",
          "export const ACTIVE_PROFILE_STORAGE_KEY = \"venice-active-profile-id\";",
          "export const CACHE_KEY = \"venice-forge-models-cache\";",
          "export const FIRST_RUN_ACK_KEY = \"vf.legal.firstRunAcknowledged\";",
          "",
        ].join("\n"),
      );

      execSync(`bash ${shellQuote(join(__dirname, "clean-repo-zip.sh"))} ${shellQuote(repo)} ${shellQuote(outDir)}`, {
        encoding: "utf8",
        stdio: "pipe",
      });

      const zipPath = findZip(outDir);
      expect(zipPath).not.toBeNull();
      execSync(`unzip -q ${shellQuote(zipPath!)} -d ${shellQuote(extractDir)}`, { stdio: "pipe" });

      const extractedName = readdirSync(extractDir)[0];
      const metaDir = join(extractDir, extractedName, "_REPO_EXTRACT_METADATA");
      const summary = readFileSync(join(metaDir, "SECRET_SCAN_SUMMARY.txt"), "utf8");

      expect(summary).toMatch(/^high_risk_hits=0\nexample_hits=0\nraw_line_content_emitted=false\n?$/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rmSync(extractDir, { recursive: true, force: true });
    }
  });

  it("clean-repo-zip.sh scans flexible sk/vn keys and omits absolute paths by default", () => {
    const script = readFileSync(join(__dirname, "clean-repo-zip.sh"), "utf8");
    expect(script).toContain('"sk-[A-Za-z0-9._~+/=-]{8,}"');
    expect(script).toContain('"vn-[A-Za-z0-9._~+/=-]{8,}"');
    expect(script).toContain('echo "==> Output: private path omitted"');
    expect(script).toContain('echo "ZIP:     $(basename "$ZIP_PATH") (output path omitted)"');
  });

  archiveIt("clean-repo-zip.sh records script provenance metadata", () => {
    const repo = mkdtempSync(join(tmpdir(), "venice-clean-zip-prov-repo-"));
    const outDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-prov-out-"));
    const extractDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-prov-extract-"));
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake-repo" }));
      writeFileSync(join(repo, "README.md"), "# fake");
      mkdirSync(join(repo, "src"), { recursive: true });
      writeFileSync(join(repo, "src", "x.ts"), "export const ok = 1;\n");

      execSync(`bash ${shellQuote(join(__dirname, "clean-repo-zip.sh"))} ${shellQuote(repo)} ${shellQuote(outDir)}`, {
        encoding: "utf8",
        stdio: "pipe",
      });

      const zipPath = findZip(outDir);
      expect(zipPath).not.toBeNull();

      execSync(`unzip -q ${shellQuote(zipPath!)} -d ${shellQuote(extractDir)}`, { stdio: "pipe" });

      const extractedName = readdirSync(extractDir)[0];
      const metaDir = join(extractDir, extractedName, "_REPO_EXTRACT_METADATA");
      const extractInfoPath = join(metaDir, "EXTRACT_INFO.txt");
      const checksumPath = join(metaDir, "SHA256SUMS.txt");

      expect(existsSync(extractInfoPath)).toBe(true);
      const extractInfo = readFileSync(extractInfoPath, "utf8");
      expect(extractInfo).toMatch(/Script provenance/);
      expect(extractInfo).toMatch(/script_version=clean-repo-zip-v4/);
      expect(extractInfo).toMatch(/script_sha256=[0-9a-f]{64}/);

      expect(existsSync(checksumPath)).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rmSync(extractDir, { recursive: true, force: true });
    }
  });

  // P1-003: gate script_path in clean-repo-zip.sh metadata so the default
  // extract does not leak the absolute filesystem path of the build machine.
  // script_name (basename) is safe to share and is sufficient to identify
  // the producing script.
  archiveIt("clean-repo-zip.sh omits script_path by default but still emits script_name (P1-003)", () => {
    const repo = mkdtempSync(join(tmpdir(), "venice-clean-zip-p1-003-repo-"));
    const outDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-p1-003-out-"));
    const extractDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-p1-003-extract-"));
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake-repo" }));
      writeFileSync(join(repo, "README.md"), "# fake");
      mkdirSync(join(repo, "src"), { recursive: true });
      writeFileSync(join(repo, "src", "x.ts"), "export const ok = 1;\n");

      // Default invocation — no opt-in env var.
      execSync(`bash ${shellQuote(join(__dirname, "clean-repo-zip.sh"))} ${shellQuote(repo)} ${shellQuote(outDir)}`, {
        encoding: "utf8",
        stdio: "pipe",
      });

      const zipPath = findZip(outDir);
      expect(zipPath).not.toBeNull();

      execSync(`unzip -q ${shellQuote(zipPath!)} -d ${shellQuote(extractDir)}`, { stdio: "pipe" });

      const extractedName = readdirSync(extractDir)[0];
      const metaDir = join(extractDir, extractedName, "_REPO_EXTRACT_METADATA");
      const extractInfoPath = join(metaDir, "EXTRACT_INFO.txt");
      expect(existsSync(extractInfoPath)).toBe(true);
      const extractInfo = readFileSync(extractInfoPath, "utf8");

      // Safe basename must always be present.
      expect(extractInfo).toMatch(/script_name=clean-repo-zip\.sh/);
      // script_path must NOT leak the absolute build-machine path.
      expect(extractInfo).not.toMatch(/script_path=\//);
      // Omission must be documented for reviewers.
      expect(extractInfo).toMatch(/script_path=omitted/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rmSync(extractDir, { recursive: true, force: true });
    }
  });

  archiveIt("clean-repo-zip.sh emits script_path when INCLUDE_PRIVATE_AUDIT_METADATA=1 (P1-003 opt-in)", () => {
    const repo = mkdtempSync(join(tmpdir(), "venice-clean-zip-p1-003-optin-repo-"));
    const outDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-p1-003-optin-out-"));
    const extractDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-p1-003-optin-extract-"));
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake-repo" }));
      writeFileSync(join(repo, "README.md"), "# fake");
      mkdirSync(join(repo, "src"), { recursive: true });
      writeFileSync(join(repo, "src", "x.ts"), "export const ok = 1;\n");

      // Opt-in invocation: the full absolute path is included for internal
      // audit use, gated behind INCLUDE_PRIVATE_AUDIT_METADATA=1.
      execSync(
        `bash ${shellQuote(join(__dirname, "clean-repo-zip.sh"))} ${shellQuote(repo)} ${shellQuote(outDir)}`,
        { encoding: "utf8", stdio: "pipe", env: { ...process.env, INCLUDE_PRIVATE_AUDIT_METADATA: "1" } },
      );

      const zipPath = findZip(outDir);
      expect(zipPath).not.toBeNull();

      execSync(`unzip -q ${shellQuote(zipPath!)} -d ${shellQuote(extractDir)}`, { stdio: "pipe" });

      const extractedName = readdirSync(extractDir)[0];
      const metaDir = join(extractDir, extractedName, "_REPO_EXTRACT_METADATA");
      const extractInfoPath = join(metaDir, "EXTRACT_INFO.txt");
      const extractInfo = readFileSync(extractInfoPath, "utf8");

      // Opt-in path: script_path is an absolute path ending in the canonical
      // script filename.
      expect(extractInfo).toMatch(/script_path=\/.*clean-repo-zip\.sh/);
      // Omission marker must NOT appear when the opt-in is set.
      expect(extractInfo).not.toMatch(/script_path=omitted/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rmSync(extractDir, { recursive: true, force: true });
    }
  });

  archiveIt("clean-repo-zip.sh fails on dirty repo by default but succeeds and tags filename when ALLOW_DIRTY_REPO_EXTRACT=1", () => {
    const repo = mkdtempSync(join(tmpdir(), "venice-clean-zip-dirty-repo-"));
    const outDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-dirty-out-"));
    const extractDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-dirty-extract-"));
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake-repo" }));
      writeFileSync(join(repo, "README.md"), "# fake");
      mkdirSync(join(repo, "src"), { recursive: true });
      writeFileSync(join(repo, "src", "x.ts"), "export const ok = 1;\n");

      // Initialize git and make a dirty change
      execSync("git init", { cwd: repo, stdio: "ignore" });
      execSync("git config user.email 'test@test.com'", { cwd: repo, stdio: "ignore" });
      execSync("git config user.name 'Test'", { cwd: repo, stdio: "ignore" });
      execSync("git add .", { cwd: repo, stdio: "ignore" });
      execSync("git commit -m 'initial'", { cwd: repo, stdio: "ignore" });

      // Make a dirty change
      writeFileSync(join(repo, "src", "x.ts"), "export const ok = 2;\n");

      // Running without ALLOW_DIRTY_REPO_EXTRACT should fail
      let failed = false;
      try {
        execSync(`bash ${shellQuote(join(__dirname, "clean-repo-zip.sh"))} ${shellQuote(repo)} ${shellQuote(outDir)}`, {
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);

      // Running with ALLOW_DIRTY_REPO_EXTRACT=1 should succeed
      execSync(`bash ${shellQuote(join(__dirname, "clean-repo-zip.sh"))} ${shellQuote(repo)} ${shellQuote(outDir)}`, {
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, ALLOW_DIRTY_REPO_EXTRACT: "1" },
      });

      const zipPath = findZip(outDir);
      expect(zipPath).not.toBeNull();
      expect(zipPath).toMatch(/-dirty\.zip$/);

      execSync(`unzip -q ${shellQuote(zipPath!)} -d ${shellQuote(extractDir)}`, { stdio: "pipe" });

      const extractedName = readdirSync(extractDir)[0];
      const metaDir = join(extractDir, extractedName, "_REPO_EXTRACT_METADATA");
      const extractInfoPath = join(metaDir, "EXTRACT_INFO.txt");
      expect(existsSync(extractInfoPath)).toBe(true);

      const extractInfo = readFileSync(extractInfoPath, "utf8");
      expect(extractInfo).toMatch(/git_worktree_clean=false/);
      expect(extractInfo).toMatch(/dirty_file_count=1/);
      expect(extractInfo).toMatch(/dirty_extract_allowed_by=ALLOW_DIRTY_REPO_EXTRACT/);
      expect(extractInfo).toMatch(/script_source=external/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rmSync(extractDir, { recursive: true, force: true });
    }
  });

  archiveIt("clean-repo-zip.sh records script_source=repo when run from repo root", () => {
    const repo = mkdtempSync(join(tmpdir(), "venice-clean-zip-source-repo-"));
    const outDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-source-out-"));
    const extractDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-source-extract-"));
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake-repo" }));
      writeFileSync(join(repo, "README.md"), "# fake");
      mkdirSync(join(repo, "src"), { recursive: true });
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(join(repo, "src", "x.ts"), "export const ok = 1;\n");
      
      // Copy the script into the mock repo
      const scriptDest = join(repo, "scripts", "clean-repo-zip.sh");
      writeFileSync(scriptDest, readFileSync(join(__dirname, "clean-repo-zip.sh")));

      execSync(`bash ${shellQuote(scriptDest)} ${shellQuote(repo)} ${shellQuote(outDir)}`, {
        encoding: "utf8",
        stdio: "pipe",
      });

      const zipPath = findZip(outDir);
      expect(zipPath).not.toBeNull();

      execSync(`unzip -q ${shellQuote(zipPath!)} -d ${shellQuote(extractDir)}`, { stdio: "pipe" });

      const extractedName = readdirSync(extractDir)[0];
      const metaDir = join(extractDir, extractedName, "_REPO_EXTRACT_METADATA");
      const extractInfoPath = join(metaDir, "EXTRACT_INFO.txt");
      expect(existsSync(extractInfoPath)).toBe(true);

      const extractInfo = readFileSync(extractInfoPath, "utf8");
      expect(extractInfo).toMatch(/script_source=repo/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rmSync(extractDir, { recursive: true, force: true });
    }
  });

  it("verify-archive-clean fails if EXTRACT_INFO.txt has path leaks when INCLUDE_PRIVATE_AUDIT_METADATA is not 1", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-archive-check-metadata-"));
    const metaDir = join(root, "_REPO_EXTRACT_METADATA");
    mkdirSync(metaDir, { recursive: true });
    
    // Create an EXTRACT_INFO.txt that has a leak
    writeFileSync(
      join(metaDir, "EXTRACT_INFO.txt"),
      "script_path=/Users/someone/scripts/clean-repo-zip.sh\n"
    );

    try {
      let failed = false;
      try {
        execSync(`node ${shellQuote(join(__dirname, "verify-archive-clean.cjs"))} --root ${shellQuote(root)}`, { stdio: "pipe" });
      } catch (e: any) {
        failed = e.status !== 0;
      }
      expect(failed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("verify-archive-clean passes if EXTRACT_INFO.txt has path leaks but INCLUDE_PRIVATE_AUDIT_METADATA=1 is set", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-archive-check-metadata-ok-"));
    const metaDir = join(root, "_REPO_EXTRACT_METADATA");
    mkdirSync(metaDir, { recursive: true });
    
    // Create an EXTRACT_INFO.txt that has a leak
    writeFileSync(
      join(metaDir, "EXTRACT_INFO.txt"),
      "script_path=/Users/someone/scripts/clean-repo-zip.sh\n"
    );

    try {
      const out = execSync(`node ${shellQuote(join(__dirname, "verify-archive-clean.cjs"))} --root ${shellQuote(root)}`, { encoding: "utf8", env: { ...process.env, INCLUDE_PRIVATE_AUDIT_METADATA: "1" } });
      expect(out).toMatch(/OK/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("verify-archive-clean fails if EXTRACT_INFO.txt script_sha256 mismatches the actual script", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-archive-check-sha-"));
    const metaDir = join(root, "_REPO_EXTRACT_METADATA");
    mkdirSync(metaDir, { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    
    // Create fake clean-repo-zip.sh
    writeFileSync(join(root, "scripts", "clean-repo-zip.sh"), "some content");
    
    // Create EXTRACT_INFO.txt with mismatching sha
    writeFileSync(
      join(metaDir, "EXTRACT_INFO.txt"),
      "script_sha256=1111111111111111111111111111111111111111111111111111111111111111\n"
    );

    try {
      let failed = false;
      try {
        execSync(`node ${shellQuote(join(__dirname, "verify-archive-clean.cjs"))} --root ${shellQuote(root)}`, { stdio: "pipe" });
      } catch (e: any) {
        failed = e.status !== 0;
      }
      expect(failed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  archiveIt("tar fallback works when rsync is unavailable", () => {
    const repo = mkdtempSync(join(tmpdir(), "venice-clean-zip-tar-repo-"));
    const outDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-tar-out-"));
    const extractDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-tar-extract-"));
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake-repo" }));
      writeFileSync(join(repo, "README.md"), "# fake");
      mkdirSync(join(repo, "src"), { recursive: true });
      writeFileSync(join(repo, "src", "x.ts"), "export const ok = 1;\n");
      
      // Contaminants
      mkdirSync(join(repo, "node_modules"), { recursive: true });
      writeFileSync(join(repo, "node_modules", "y.ts"), "ignored\n");
      mkdirSync(join(repo, ".config"), { recursive: true });
      writeFileSync(join(repo, ".config", "config.local.yaml"), "secret: true\n");
      writeFileSync(join(repo, ".config", "config.example.yaml"), "example: true\n");

      // To force the tar fallback, we create a modified copy of clean-repo-zip.sh
      // where the `command -v rsync` check evaluates to false.
      const binDir = mkdtempSync(join(tmpdir(), "venice-clean-zip-bin-"));
      const scriptContent = readFileSync(join(__dirname, "clean-repo-zip.sh"), "utf8");
      const patchedScript = scriptContent.replace(/command -v rsync/g, "false");
      const patchedScriptPath = join(binDir, "clean-repo-zip.sh");
      writeFileSync(patchedScriptPath, patchedScript);
      execSync(`chmod +x ${shellQuote(patchedScriptPath)}`);

      execSync(`bash ${shellQuote(patchedScriptPath)} ${shellQuote(repo)} ${shellQuote(outDir)}`, {
        encoding: "utf8",
        stdio: "pipe"
      });

      const zipPath = findZip(outDir);
      expect(zipPath).not.toBeNull();

      execSync(`unzip -q ${shellQuote(zipPath!)} -d ${shellQuote(extractDir)}`, { stdio: "pipe" });

      const extractedName = readdirSync(extractDir)[0];
      const extractedRoot = join(extractDir, extractedName);
      
      expect(existsSync(join(extractedRoot, "src", "x.ts"))).toBe(true);
      expect(existsSync(join(extractedRoot, "node_modules"))).toBe(false);
      expect(existsSync(join(extractedRoot, ".config", "config.local.yaml"))).toBe(false);
      expect(existsSync(join(extractedRoot, ".config", "config.example.yaml"))).toBe(true);

      rmSync(binDir, { recursive: true, force: true });
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rmSync(extractDir, { recursive: true, force: true });
    }
  });
});
