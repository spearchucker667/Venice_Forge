// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("verify:ci-contract required gate coverage", () => {
  it.each([
    "verify:theme-tokens",
    "verify:ci-contract",
    "verify:agent-docs",
  ])("requires %s", (gate) => {
    const source = fs.readFileSync(path.resolve(__dirname, "verify-ci-contract.cjs"), "utf8");
    const requiredGates = source.match(/const requiredGates = \[([\s\S]*?)\];/)?.[1] ?? "";
    expect(requiredGates).toContain(`'${gate}'`);
  });

  it("fails if vitest.config.ts uses the unsupported global threshold key", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "verify-ci-contract.cjs"), "utf8");
    expect(source).toContain("Coverage thresholds must not be nested under 'global'");
  });

  it("requires the canonical Vitest globals and setup file", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "verify-ci-contract.cjs"), "utf8");
    expect(source).toContain("must enable globals for the canonical test harness");
    expect(source).toContain("must load ./tests/setup.ts for canonical test isolation");
  });

  it("requires tracked CodeQL and dependency-review workflows", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "verify-ci-contract.cjs"), "utf8");
    expect(source).toContain(".github/workflows/codeql.yml");
    expect(source).toContain(".github/workflows/dependency-review.yml");
    expect(source).toContain("github/codeql-action");
    expect(source).toContain("dependency-review-action");
  });

  // VERIFY-112 regression guard
  it("requires the segmented CI suite to include all non-smoke contract test roots", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "verify-ci-contract.cjs"), "utf8");
    expect(source).toContain("const requiredContractTestPaths = [");
    expect(source).toContain("'tests/safety'");
    expect(source).toContain("'tests/csp'");
    expect(source).toContain("'tests/electron'");
    expect(source).toContain("'scripts/verify-document-ingestion.test.ts'");
    expect(source).toContain("test:ci must invoke test:contracts");
  });
});

describe("verify:ci-contract external action pinning enforcement", () => {
  const readVerifier = () => fs.readFileSync(path.resolve(__dirname, "verify-ci-contract.cjs"), "utf8");

  it("contains a generalized full-SHA pinning check covering every workflow file", () => {
    const source = readVerifier();
    expect(source).toContain(".github/workflows");
    expect(source).toContain("40-hex commit SHA");
    expect(source).toContain("uses:");
    expect(source).toContain("pinned to full 40-hex SHAs");
    expect(source).toContain("['branches', 59]");
  });

  it("never treats a floating tag or branch as pinned", () => {
    const source = readVerifier();
    // The verifier must reject refs that are not a full 40-hex commit SHA.
    expect(source).toContain("40-hex commit SHA");
    expect(source).not.toMatch(/actions\/upload-artifact@v4\s/);
  });

  it("enforces the coverage threshold floor (no silent lowering)", () => {
    const source = readVerifier();
    expect(source).toContain("the coverage bar cannot be lowered");
    expect(source).toContain("['branches', 59]");
    expect(source).toContain("['functions', 68]");
    expect(source).toContain("['lines', 73]");
    expect(source).toContain("['statements', 70]");
  });

  it("enforces the CI job dependency graph (build gates on coverage, script-coverage, smokes gate on platform)", () => {
    const source = readVerifier();
    expect(source).toContain("'build' job must depend on the 'coverage' job");
    expect(source).toContain("'script-coverage'");
    expect(source).toContain("electron-smoke-macos");
    expect(source).toContain("electron-smoke-windows");
    expect(source).toContain("must depend on both 'build'");
  });

  it("enforces the Linux packaged smoke dependencies", () => {
    const source = readVerifier();
    expect(source).toContain("electron-smoke-linux");
    expect(source).toContain("apt-get install -y xvfb libgbm-dev rpm");
    expect(source).toContain("nonexistent 'libxvfb'");
    expect(source).toContain("xvfb-run --auto-servernum");
  });

  it("enforces the portable packaged-smoke diagnostic collector", () => {
    const source = readVerifier();
    expect(source).toContain("capture-smoke-diagnostics.cjs --platform darwin");
    expect(source).toContain("capture-smoke-diagnostics.cjs --platform win32");
    expect(source).toContain("capture-smoke-diagnostics.cjs --platform linux");
    expect(source).toContain("must not require an uncompiled TypeScript smoke utility");
  });

  it("enforces the CodeQL language matrix (javascript-typescript + actions)", () => {
    const source = readVerifier();
    expect(source).toContain("language: javascript-typescript");
    expect(source).toContain("language: actions");
    expect(source).toContain("languages: ${{ matrix.language }}");
    expect(source).toContain("deterministic per-language category");
  });
});

describe("verify-ci-contract workflow contents", () => {
  const root = path.resolve(__dirname, "..");
  const workflowsDir = path.join(root, ".github/workflows");

  it("has no unpinned external action references in any workflow", () => {
    for (const file of fs.readdirSync(workflowsDir)) {
      if (!/\.ya?ml$/i.test(file)) continue;
      const content = fs.readFileSync(path.join(workflowsDir, file), "utf8");
      const refs = content.match(/(^|\s)uses:\s*([^\s#]+)/g) ?? [];
      for (const raw of refs) {
        const value = raw.replace(/^\s*uses:\s*/, "").trim();
        if (value.startsWith("./")) continue;
        if (value.startsWith("docker://")) continue;
        expect(value, `${file}: ${value}`).toMatch(/^[^.][^\s]*@[0-9a-fA-F]{40}$/);
      }
    }
  });

  it("passes against the real repository without treating script thresholds as aggregate floors", () => {
    const root = path.resolve(__dirname, "..");
    const result = spawnSync("node", [path.join(root, "scripts", "verify-ci-contract.cjs")], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("vitest.config.ts test isolation and coverage schema are valid");
  });
});

describe("verify-ci-contract documentation and ruleset contract invariants (Section 16)", () => {
  const root = path.resolve(__dirname, "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  it("ensures every npm run script referenced in AGENTS.md and README.md exists in package.json", () => {
    const scripts = Object.keys(pkg.scripts);
    for (const doc of ["AGENTS.md", "README.md"]) {
      const content = fs.readFileSync(path.join(root, doc), "utf8");
      const matches = [...content.matchAll(/npm\s+run\s+([a-zA-Z0-9:-]+)/g)].map((m) => m[1]);
      const missing = matches.filter((s) => !scripts.includes(s));
      expect(missing, `Nonexistent scripts found in ${doc}`).toEqual([]);
    }
  });

  it("ensures every file tested in AGENTS.md bootstrap script exists in repository", () => {
    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    const testPaths = [...agents.matchAll(/test\s+-[fd]\s+([^\n\r]+)/g)].map((m) => m[1].trim());
    expect(testPaths.length).toBeGreaterThan(0);
    for (const relPath of testPaths) {
      expect(fs.existsSync(path.join(root, relPath)), `Bootstrap path missing: ${relPath}`).toBe(true);
    }
  });

  it("ensures ci.yml contains no global job-skipping if-condition", () => {
    const ciYaml = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    // Ensure no top-level job has `if: false` or invalid skip expression
    expect(ciYaml).not.toMatch(/^\s*if:\s*false\s*$/m);
    expect(ciYaml).not.toMatch(/^\s*if:\s*!\s*always\(\)\s*$/m);
  });

  it("ensures SECURITY.md designates only Advanced Setup as authoritative and documents Default Setup as deconfigured", () => {
    const securityMd = fs.readFileSync(path.join(root, "SECURITY.md"), "utf8");
    expect(securityMd).toContain("Advanced Setup");
    expect(securityMd).toMatch(/Default Setup.*(?:not-configured|not configured|deconfigured)/is);
  });

  it("ensures all required branch protection checks correspond to real jobs in ci.yml and codeql.yml", () => {
    const ciYaml = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    const codeqlYaml = fs.readFileSync(path.join(root, ".github/workflows/codeql.yml"), "utf8");

    const requiredCiJobs = [
      "lint-and-typecheck",
      "unit-and-integration-tests",
      "coverage",
      "script-coverage",
      "contracts",
      "build",
      "windows-sensitive-tests",
      "macos-sensitive-tests",
      "electron-smoke-macos",
      "electron-smoke-windows",
      "electron-smoke-linux",
    ];

    for (const job of requiredCiJobs) {
      const jobRegex = new RegExp(`^  ${job}:`, "m");
      expect(jobRegex.test(ciYaml), `Required job '${job}' missing from ci.yml`).toBe(true);
    }

    expect(codeqlYaml).toMatch(/^ {2}analyze:/m);
    expect(codeqlYaml).toContain("javascript-typescript");
    expect(codeqlYaml).toContain("actions");
  });
});
