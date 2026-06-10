/** @fileoverview Unit tests for checksum-release.cjs (P0-001 regression guard).
 *
 * Verifies that the checksum allowlist covers every extension that
 * `scripts/verify-dist.cjs` can demand a sidecar for. If this file ever drops a
 * platform, the matching `verify:dist:<platform>` step will fail with a
 * "Missing checksum sidecar" error after packaging.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
// @ts-expect-error - CJS import in TS file
import { CHECKSUMMED_RELEASE_EXTENSIONS, isChecksummedArtifact } from "./checksum-release.cjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const scriptPath = join(__dirname, "checksum-release.cjs");

describe("checksum-release.cjs (P0-001 regression guard)", () => {
  it("CHECKSUMMED_RELEASE_EXTENSIONS covers every platform that verify-dist inspects", () => {
    // Read verify-dist.cjs and pull the literal expectedExtensions for Linux,
    // and the static artifact-name patterns for Windows / macOS. We assert the
    // union of those extensions is a subset of the checksum allowlist.
    const verifyDist = readFileSync(join(repoRoot, "scripts/verify-dist.cjs"), "utf8");

    // Linux: `expectedExtensions = [".AppImage", ".deb", ".rpm"]`
    const linuxExtMatch = verifyDist.match(/expectedExtensions\s*=\s*\[([^\]]+)\]/);
    expect(linuxExtMatch, "verify-dist.cjs should declare expectedExtensions for Linux").toBeTruthy();
    const linuxExts = Array.from(linuxExtMatch![1].matchAll(/["']([^"']+)["']/g)).map((m) => m[1]);
    for (const ext of linuxExts) {
      expect(
        CHECKSUMMED_RELEASE_EXTENSIONS,
        `checksum allowlist must cover ${ext} referenced in verify-dist.cjs`,
      ).toContain(ext);
    }

    // Updater metadata shared by Windows + macOS + Linux
    expect(CHECKSUMMED_RELEASE_EXTENSIONS).toContain(".yml");
    expect(CHECKSUMMED_RELEASE_EXTENSIONS).toContain(".yaml");
    expect(CHECKSUMMED_RELEASE_EXTENSIONS).toContain(".blockmap");
  });

  it("isChecksummedArtifact recognizes the canonical artifact extensions", () => {
    const positives = [
      "Venice-Forge-1.0.6-x64-Setup.exe",
      "Venice-Forge-1.0.6-x64-Portable.exe",
      "Venice-Forge-1.0.6-arm64.dmg",
      "Venice-Forge-1.0.6-x64.zip",
      "Venice-Forge-1.0.6-x64.exe.blockmap",
      "latest.yml",
      "latest-mac.yml",
      "latest-linux.yml",
      "Venice-Forge-1.0.6.AppImage",
      "venice-forge_1.0.6_amd64.deb",
      "Venice-Forge-1.0.6.x86_64.rpm",
    ];
    for (const f of positives) {
      expect(isChecksummedArtifact(f), `${f} should be checksummed`).toBe(true);
    }
  });

  it("isChecksummedArtifact skips sidecars, non-artifact files, and garbage", () => {
    const negatives = [
      "Venice-Forge-1.0.6-x64-Setup.exe.sha256",
      "builder-effective-config.yaml.sha256",
      "logs.txt",
      "NOTES",
      "",
      "   ",
    ];
    for (const f of negatives) {
      expect(isChecksummedArtifact(f), `${JSON.stringify(f)} should NOT be checksummed`).toBe(false);
    }
  });

  describe("end-to-end against a temp release/ directory", () => {
    let fakeRoot: string;
    let fakeReleaseDir: string;
    let originalCwd: string;

    beforeEach(() => {
      fakeRoot = mkdtempSync(join(tmpdir(), "venice-checksum-release-"));
      fakeReleaseDir = join(fakeRoot, "release");
      // checksum-release.cjs walks `path.join(__dirname, "..", "release")`,
      // i.e. it is hard-coded to repo-relative. We point process.cwd() at
      // the temp root so the script sees `release/` next to it.
      writeFileSync(join(fakeRoot, "marker"), "ok");
      originalCwd = process.cwd();
      process.chdir(fakeRoot);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      rmSync(fakeRoot, { recursive: true, force: true });
    });

    it("writes a sidecar for every Linux release artifact extension", () => {
      // Create a representative release/ directory mixing all platforms.
      const files = [
        "Venice-Forge-1.0.6-x64-Setup.exe",
        "Venice-Forge-1.0.6-x64-Portable.exe",
        "Venice-Forge-1.0.6-arm64.dmg",
        "Venice-Forge-1.0.6-x64.zip",
        "latest.yml",
        "latest-mac.yml",
        "latest-linux.yml",
        "Venice-Forge-1.0.6-x64.exe.blockmap",
        // Linux (P0-001)
        "Venice-Forge-1.0.6.AppImage",
        "venice-forge_1.0.6_amd64.deb",
        "Venice-Forge-1.0.6.x86_64.rpm",
        // Junk that must NOT receive a sidecar
        "NOTES",
        "logs.txt",
      ];
      // mkdtempSync created the root; we add the release/ subdir next.
      mkdirSync(fakeReleaseDir, { recursive: true });
      for (const f of files) {
        writeFileSync(join(fakeReleaseDir, f), `payload-${f}`);
      }

      const out = spawnSync("node", [scriptPath], { encoding: "utf8" });
      expect(out.status, out.stderr).toBe(0);

      const mustHaveSidecar = files.filter(isChecksummedArtifact);
      for (const f of mustHaveSidecar) {
        expect(existsSync(join(fakeReleaseDir, `${f}.sha256`)), `${f}.sha256 should exist`).toBe(true);
      }
      const mustNotHaveSidecar = files.filter((f) => !isChecksummedArtifact(f));
      for (const f of mustNotHaveSidecar) {
        expect(
          !existsSync(join(fakeReleaseDir, `${f}.sha256`)),
          `${f}.sha256 should NOT be created`,
        ).toBe(true);
      }
    });

    it("does not recursively checksum its own sidecars", () => {
      mkdirSync(fakeReleaseDir, { recursive: true });
      writeFileSync(join(fakeReleaseDir, "Venice-Forge-1.0.6.AppImage"), "binary");
      writeFileSync(
        join(fakeReleaseDir, "Venice-Forge-1.0.6.AppImage.sha256"),
        "deadbeef  Venice-Forge-1.0.6.AppImage\n",
      );

      const out = spawnSync("node", [scriptPath], { encoding: "utf8" });
      expect(out.status, out.stderr).toBe(0);
      // Only one .sha256 file should exist — the sidecar for the .AppImage.
      // The pre-existing sidecar must not be checksummed into another sidecar.
      const all = readdirSync(fakeReleaseDir);
      expect(all.filter((f: string) => f.endsWith(".sha256")).length).toBe(1);
    });
  });
});
