// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyMarkdownLinks } = require("./verify-markdown-links.cjs") as {
  verifyMarkdownLinks: (root: string, options: { files: string[] }) => {
    filesChecked: number;
    errors: Array<{ destination: string; reason: string }>;
  };
};

const tempDirs: string[] = [];

function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "venice-markdown-links-"));
  tempDirs.push(root);
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return { root, files: Object.keys(files).map((name) => path.join(root, name)) };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("verifyMarkdownLinks", () => {
  // VERIFY-029: repository Markdown links and heading fragments must resolve in CI.
  it("accepts existing files, heading fragments, duplicate headings, and reference links", () => {
    const { root, files } = fixture({
      "README.md": "[Guide](docs/guide.md#setup)\n[Second][duplicate]\n[duplicate]: docs/guide.md#setup-1\n",
      "docs/guide.md": "# Setup\n\n## Setup\n",
    });

    expect(verifyMarkdownLinks(root, { files }).errors).toEqual([]);
  });

  it("matches GitHub heading slugs around punctuation and emoji", () => {
    const { root, files } = fixture({
      "README.md": "[Security](#-security--privacy)\n",
      "docs.md": "# placeholder\n",
    });
    fs.writeFileSync(path.join(root, "README.md"), "# 🔒 Security & Privacy\n\n[Security](#-security--privacy)\n");

    expect(verifyMarkdownLinks(root, { files }).errors).toEqual([]);
  });

  it("reports missing files and missing heading fragments", () => {
    const { root, files } = fixture({
      "README.md": "[Missing](docs/nope.md)\n[Bad heading](docs/guide.md#missing)\n",
      "docs/guide.md": "# Existing\n",
    });

    expect(verifyMarkdownLinks(root, { files }).errors).toEqual([
      expect.objectContaining({ destination: "docs/nope.md", reason: "target does not exist" }),
      expect.objectContaining({ destination: "docs/guide.md#missing", reason: "heading fragment #missing does not exist" }),
    ]);
  });

  it("ignores external links, root-relative GitHub routes, and examples inside code", () => {
    const { root, files } = fixture({
      "README.md": [
        "[Web](https://example.com/missing)",
        "[Advisory](/security/advisories/new)",
        "`[Inline](missing-inline.md)`",
        "```md",
        "[Fence](missing-fence.md)",
        "```",
      ].join("\n"),
    });

    expect(verifyMarkdownLinks(root, { files }).errors).toEqual([]);
  });
});
