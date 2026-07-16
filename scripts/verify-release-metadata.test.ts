// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { verifyReleaseMetadata } = require("./verify-release-metadata.cjs") as {
  verifyReleaseMetadata(rootDir: string): string[];
};
const roots: string[] = [];

function fixture(overrides: Record<string, string> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vf-release-metadata-"));
  roots.push(root);
  const files = {
    "package.json": JSON.stringify({ version: "3.0.0-beta.1" }),
    "AGENTS.md": "**Version:** 3.0.0-beta.1",
    "README.md": "release-v3.0.0--beta.1-blue",
    "docs/ABOUT.md": "Venice Forge is currently a 3.0 beta.",
    "LEGAL.md": "Version comes from package.json.",
    "src/components/settings/AboutPanel.tsx": 'import { version } from "../../../package.json";',
    ...overrides,
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("release metadata contract", () => {
  it("accepts one package-sourced beta version", () => {
    expect(verifyReleaseMetadata(fixture())).toEqual([]);
  });

  it("rejects stale literals and stabilized beta claims", () => {
    const failures = verifyReleaseMetadata(fixture({
      "AGENTS.md": "**Version:** 2.1.2",
      "docs/ABOUT.md": "Venice Forge is fully stabilized.",
      "LEGAL.md": "currently v2.1.1",
    }));
    expect(failures).toEqual(expect.arrayContaining([
      "AGENTS.md version must match package.json.",
      "Prerelease ABOUT.md must identify the beta status.",
      "ABOUT.md must not claim the beta is fully stabilized.",
      "LEGAL.md must source release version from package.json, not a stale literal.",
    ]));
  });
});
