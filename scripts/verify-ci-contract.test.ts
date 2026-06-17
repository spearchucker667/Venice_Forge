// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
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

  it("requires tracked CodeQL and dependency-review workflows", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "verify-ci-contract.cjs"), "utf8");
    expect(source).toContain(".github/workflows/codeql.yml");
    expect(source).toContain(".github/workflows/dependency-review.yml");
    expect(source).toContain("github/codeql-action");
    expect(source).toContain("dependency-review-action");
  });
});
