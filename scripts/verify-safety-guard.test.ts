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
        content: "function a() { maybeRunLocalFamilyGuard(); } function b() { maybeRunLocalFamilyGuard(); }",
      },
      "handlers.ts": {
        subdir: "electron/ipc",
        content: '"venice:request" handler { maybeRunLocalFamilyGuard(); } }); "venice:streamChat" handler { maybeRunLocalFamilyGuard(); } });',
      },
      "server.ts": {
        subdir: "",
        content: "app.use(() => { maybeRunLocalFamilyGuard(); isLocalFamilySafeModeEnabled(); });",
      },
      "SearchScrapeView.tsx": {
        subdir: "src/components/search",
        content:
          "function runSearch() { maybeRunLocalFamilyGuard(); } " +
          "function runAiResearch() { maybeRunLocalFamilyGuard(); } " +
          "function runProfileDiscovery() { maybeRunLocalFamilyGuard(); }",
      },
      "researchRunner.ts": {
        subdir: "src/research/agent",
        content:
          "export async function runResearchJob(input) { " +
          "const results = await provider.search({ query }); " +
          "const scrape = await provider.scrape({ url }); " +
          "return { ok: true }; " +
          "}",
      },
      "veniceResearchProvider.ts": {
        subdir: "src/research/providers",
        content:
          "import { veniceFetch } from '../../services/veniceClient'; " +
          "export const veniceResearchProvider = { " +
          "async search() { return veniceFetch('/augment/search'); }, " +
          "async scrape() { return veniceFetch('/augment/scrape'); } " +
          "};",
      },
      "jinaResearchProvider.ts": {
        subdir: "src/research/providers",
        content:
          "import { desktopJina } from '../../services/desktopBridge'; " +
          "export function createJinaProvider() { " +
          "return { async search() { return desktopJina.request({ url }); } }; " +
          "}",
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
        "veniceClient.ts": "function a() { maybeRunLocalFamilyGuard(); }",
      });
      const result = runEnforcementChecks(tmpDir);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain("Renderer Transport");
    });

    it("fails when IPC handlers are missing guards", () => {
      createPassingMocks(tmpDir, {
        "handlers.ts": '"venice:request" { /* no guard */ } }); "venice:streamChat" { maybeRunLocalFamilyGuard(); } });',
      });
      const result = runEnforcementChecks(tmpDir);
      expect(result.some((r: string) => r.includes("IPC handlers"))).toBe(true);
    });

    it("fails when server.ts is missing the mode resolver", () => {
      createPassingMocks(tmpDir, {
        "server.ts": "maybeRunLocalFamilyGuard();",
      });
      const result = runEnforcementChecks(tmpDir);
      expect(result.some((r: string) => r.includes("Web Proxy Server"))).toBe(true);
    });

    it("fails when the research UI prompt dispatch lacks guard calls", () => {
      createPassingMocks(tmpDir, {
        "SearchScrapeView.tsx": "function runSearch() { /* no guard */ }",
      });
      const result = runEnforcementChecks(tmpDir);
      expect(result.some((r: string) => r.includes("Research UI Dispatch"))).toBe(true);
    });

    it("fails when the research runner calls fetch directly", () => {
      createPassingMocks(tmpDir, {
        "researchRunner.ts":
          "export async function runResearchJob(input) { " +
          "const res = await fetch('https://example.com'); " +
          "return { ok: true }; " +
          "}",
      });
      const result = runEnforcementChecks(tmpDir);
      expect(result.some((r: string) => r.includes("Research Runner Orchestration"))).toBe(true);
    });

    it("fails when the Jina provider bypasses the guarded bridge", () => {
      createPassingMocks(tmpDir, {
        "jinaResearchProvider.ts":
          "export function createJinaProvider() { " +
          "return { async search() { return fetch('https://s.jina.ai/q'); } }; " +
          "}",
      });
      const result = runEnforcementChecks(tmpDir);
      expect(result.some((r: string) => r.includes("Jina Provider Dispatch"))).toBe(true);
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
