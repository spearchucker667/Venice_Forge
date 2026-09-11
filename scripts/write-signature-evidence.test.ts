/** @fileoverview Unit tests for scripts/write-signature-evidence.cjs. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
// @ts-expect-error - CJS import in TS test
import { parseArgs, buildEvidence } from "./write-signature-evidence.cjs";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("write-signature-evidence.cjs", () => {
  describe("parseArgs", () => {
    it("parses platform, tag, and unsigned flag", () => {
      expect(parseArgs(["--platform", "macos", "--tag", "v1.2.3"])).toMatchObject({
        platform: "macos",
        tag: "v1.2.3",
        unsigned: false,
      });
      expect(parseArgs(["--platform", "windows", "--tag", "v1.2.3", "--unsigned"])).toMatchObject({
        platform: "windows",
        tag: "v1.2.3",
        unsigned: true,
      });
    });

    it("returns undefined for missing arguments", () => {
      expect(parseArgs([])).toMatchObject({ platform: undefined, tag: undefined, unsigned: false });
    });
  });

  describe("buildEvidence", () => {
    it("builds macOS signed-and-notarized evidence from verifier output", () => {
      const evidence = buildEvidence("macos", "v1.2.3", false, {
        codesignSummary: "Venice Forge.app: valid on disk\nVenice Forge.app: satisfies its Designated Requirement",
        staplerSummary: "The validate action worked!",
      });
      expect(evidence.platform).toBe("macos");
      expect(evidence.status).toBe("signed-and-notarized");
      expect(evidence.signed).toBe(true);
      expect(evidence.notarized).toBe(true);
      expect(evidence.tag).toBe("v1.2.3");
      expect(evidence.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(evidence.note).toBeUndefined();
      expect(evidence).toMatchObject({
        codesign: { verified: true },
        stapler: { validated: true },
      });
    });

    it("refuses macOS signed-and-notarized evidence without verifier output", () => {
      expect(() => buildEvidence("macos", "v1.2.3", false)).toThrow(/codesign/);
    });

    it("builds macOS unsigned-exception evidence", () => {
      const evidence = buildEvidence("macos", "v1.2.3", true);
      expect(evidence.status).toBe("unsigned-exception");
      expect(evidence.signed).toBe(false);
      expect(evidence.notarized).toBe(false);
      expect(evidence.note).toBe("RELEASE_ALLOW_UNSIGNED=true; deliberately unsigned draft");
    });

    it("builds Windows signed evidence from Authenticode status", () => {
      const evidence = buildEvidence("windows", "v1.2.3", false, { authenticodeStatus: "Valid" });
      expect(evidence.platform).toBe("windows");
      expect(evidence.status).toBe("signed");
      expect(evidence.signed).toBe(true);
      expect(evidence.signatureStatus).toBe("Valid");
    });

    it("refuses Windows signed evidence without Authenticode Valid", () => {
      expect(() => buildEvidence("windows", "v1.2.3", false)).toThrow(/Authenticode/);
    });

    it("builds Windows unsigned-exception evidence", () => {
      const evidence = buildEvidence("windows", "v1.2.3", true);
      expect(evidence.status).toBe("unsigned-exception");
      expect(evidence.signed).toBe(false);
      expect(evidence.signatureStatus).toBe("N/A");
    });

    it("builds Linux no-code-signing evidence", () => {
      const evidence = buildEvidence("linux", "v1.2.3", false);
      expect(evidence.platform).toBe("linux");
      expect(evidence.status).toBe("no-code-signing");
      expect(evidence.signed).toBe(false);
      expect(evidence.note).toBe("Linux packages are not code-signed");
    });

    it("rejects unknown platforms", () => {
      expect(() => buildEvidence("freebsd", "v1.2.3", false)).toThrow("Unknown platform: freebsd");
    });
  });

  describe("CLI", () => {
    let root: string;
    let originalCwd: string;
    const scriptPath = join(__dirname, "write-signature-evidence.cjs");

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "venice-sig-evidence-"));
      originalCwd = process.cwd();
      process.chdir(root);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    });

    it("writes a platform signature evidence file", () => {
      const out = spawnSync("node", [scriptPath, "--platform", "linux", "--tag", "v1.2.3"], {
        encoding: "utf8",
      });
      expect(out.status, out.stderr).toBe(0);
      const filePath = join(root, "release-evidence", "signatures-linux.json");
      expect(existsSync(filePath)).toBe(true);
      const evidence = JSON.parse(readFileSync(filePath, "utf8"));
      expect(evidence.platform).toBe("linux");
    });

    it("exits non-zero for missing arguments", () => {
      const out = spawnSync("node", [scriptPath], { encoding: "utf8" });
      expect(out.status).not.toBe(0);
    });
  });
});
