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
});
