/** @fileoverview Unit tests for the safety guard verification script. */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
// @ts-expect-error - CJS import in TS file
import { runEnforcementChecks, scanForViolations, verifySafetyGuard } from "./verify-safety-guard.cjs";

describe("verify-safety-guard", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vfg-safety-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Creates all required enforcement files in tmpDir with passing content. */
  function createPassingMocks(dir: string, overrides: Record<string, string> = {}) {
    const defaults: Record<string, { subdir: string; content: string }> = {
      "veniceClient.ts": {
        subdir: "src/services",
        content: "function a() { assessChildExploitationSafety(); } function b() { assessChildExploitationSafety(); }",
      },
      "handlers.ts": {
        subdir: "electron/ipc",
        content: '"venice:request" handler { assessChildExploitationSafety(); } }); "venice:streamChat" handler { assessChildExploitationSafety(); } });',
      },
      "server.ts": {
        subdir: "",
        content: "app.use(() => { assessChildExploitationSafety(); recordDecision(); });",
      },
      "SearchScrapeModule.tsx": {
        subdir: "src/modules",
        content: "function r1() { assessChildExploitationSafety(); } function r2() { assessChildExploitationSafety(); } function r3() { assessChildExploitationSafety(); }",
      },
    };

    for (const [file, { subdir, content }] of Object.entries(defaults)) {
      const fileDir = subdir ? path.join(dir, subdir) : dir;
      fs.mkdirSync(fileDir, { recursive: true });
      fs.writeFileSync(path.join(fileDir, file), overrides[file] ?? content);
    }
  }

  describe("runEnforcementChecks", () => {
    it("passes when all enforcement files contain required guards", () => {
      createPassingMocks(tmpDir);
      const result = runEnforcementChecks(tmpDir);
      expect(result).toEqual([]);
    });

    it("fails when veniceClient.ts has fewer than 2 guard calls", () => {
      createPassingMocks(tmpDir, {
        "veniceClient.ts": "function a() { assessChildExploitationSafety(); }",
      });
      const result = runEnforcementChecks(tmpDir);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain("Renderer Transport");
    });

    it("fails when IPC handlers are missing guards", () => {
      createPassingMocks(tmpDir, {
        "handlers.ts": '"venice:request" { /* no guard */ } }); "venice:streamChat" { assessChildExploitationSafety(); } });',
      });
      const result = runEnforcementChecks(tmpDir);
      expect(result.some((r: string) => r.includes("IPC handlers"))).toBe(true);
    });

    it("fails when server.ts is missing recordDecision", () => {
      createPassingMocks(tmpDir, {
        "server.ts": "assessChildExploitationSafety();",
      });
      const result = runEnforcementChecks(tmpDir);
      expect(result.some((r: string) => r.includes("Web Proxy Server"))).toBe(true);
    });
  });

  describe("scanForViolations", () => {
    it("flags raw prompt logging via console.log", () => {
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "bad.ts"), "console.log('user said', userPrompt);");

      const result = scanForViolations(tmpDir);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain("bad.ts");
    });

    it("flags safety bypass toggles", () => {
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "evil.ts"), "const bypass = true; // disable safety");

      const result = scanForViolations(tmpDir);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain("evil.ts");
    });

    it("ignores childExploitationGuard files", () => {
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "childExploitationGuard.ts"), "console.log('scanning prompt');");

      const result = scanForViolations(tmpDir);
      expect(result).toEqual([]);
    });

    it("allows files with both promptHash safe pattern AND other code (VERIFY-003 regression)", () => {
      // VERIFY-003 fix: a file that mentions promptHash in one place but also has
      // a safe audit log (e.g. logging promptHash directly, not user prompt) must pass.
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "safeAudit.ts"),
        "console.log('audit', promptHash); const x = promptHash; doSomething();"
      );

      const result = scanForViolations(tmpDir);
      expect(result).toEqual([]);
    });

    it("flags file that has both a real prompt log AND safe pattern (VERIFY-003 per-match check)", () => {
      // A file with a real prompt log should still fail even if it also mentions promptHash
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "mixed.ts"),
        "console.log('hash', promptHash);\nconsole.log('the actual prompt is', userPrompt);\nconst x = 1;"
      );

      const result = scanForViolations(tmpDir);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain("mixed.ts");
    });

    it("ignores node_modules and dist directories", () => {
      const nodeDir = path.join(tmpDir, "node_modules", "evil");
      fs.mkdirSync(nodeDir, { recursive: true });
      fs.writeFileSync(path.join(nodeDir, "bad.ts"), "console.log('user said', prompt);");

      const result = scanForViolations(tmpDir);
      expect(result).toEqual([]);
    });
  });

  describe("verifySafetyGuard", () => {
    it("returns ok=true when everything passes", () => {
      createPassingMocks(tmpDir);
      const result = verifySafetyGuard(tmpDir);
      expect(result.ok).toBe(true);
    });

    it("returns ok=false when violations exist", () => {
      fs.writeFileSync(path.join(tmpDir, "server.ts"), "recordDecision();");

      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "bad.ts"), "console.log('user said', prompt);");

      const result = verifySafetyGuard(tmpDir);
      expect(result.ok).toBe(false);
      expect(result.enforcementFailures.length).toBeGreaterThan(0);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });
});
