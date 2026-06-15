// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("bootstrap-theme.js", () => {
  it("validates persisted bootstrap and custom-theme object shapes before nested reads", () => {
    const source = readFileSync(join(process.cwd(), "public", "bootstrap-theme.js"), "utf8");
    expect(source).toContain("typeof boot !== 'object' || Array.isArray(boot)");
    expect(source).toContain("typeof boot.customTheme === 'object'");
    expect(source).toContain("typeof customTheme.tokens === 'object'");
    expect(source).toContain("Array.isArray(customTheme.tokens)");
  });
});
