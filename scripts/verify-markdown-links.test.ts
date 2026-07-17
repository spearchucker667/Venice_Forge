// VERIFY-034 regression guard
// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const {
  collectMarkdownFiles,
  compileGitignorePattern,
  loadGitignoreMatcher,
  verifyMarkdownLinks,
  verifyRetiredModuleReferences,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("./verify-markdown-links.cjs") as {
  collectMarkdownFiles: (
    root: string,
    scanRoots?: string[],
    options?: { isIgnored?: (absolutePath: string) => boolean },
  ) => string[];
  compileGitignorePattern: (raw: string) => { regex: RegExp; negated: boolean; dirOnly: boolean } | null;
  loadGitignoreMatcher: (root: string) => (absolutePath: string) => boolean;
  verifyMarkdownLinks: (
    root: string,
    options: { files: string[]; isIgnored?: (absolutePath: string) => boolean; scanRoots?: string[] },
  ) => {
    filesChecked: number;
    errors: Array<{ destination: string; reason: string }>;
  };
  verifyRetiredModuleReferences: (
    files: string[],
  ) => Array<{ sourcePath: string; line: number; name: string; reason: string }>;
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

function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("verifyMarkdownLinks", () => {
  it("passes against the actual repository", () => {
    const repoRoot = path.resolve(__dirname, "..");
    const isIgnored = loadGitignoreMatcher(repoRoot);
    const files = collectMarkdownFiles(repoRoot, ["."], { isIgnored });

    expect(verifyMarkdownLinks(repoRoot, { files, isIgnored }).errors).toEqual([]);
  });

  it("discovers every repository-root Markdown document", () => {
    const { root } = fixture({
      "README.md": "# Readme\n",
      "LEGAL.md": "# Legal\n",
      "PRIVACY.md": "# Privacy\n",
      "docs/guide.md": "# Guide\n",
      "node_modules/ignored.md": "# Ignored\n",
    });

    const files = collectMarkdownFiles(root, ["."]);

    expect(files.map((file) => path.relative(root, file).replace(/\\/g, "/"))).toEqual([
      "LEGAL.md",
      "PRIVACY.md",
      "README.md",
      "docs/guide.md",
    ]);
  });

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

  // VERIFY-029 (extension): gitignored paths must be skipped, both as scan roots
  // and as link targets. The repo gitignores `docs/AGENTS/` and the
  // `docs/HQE_AUDIT_REPORT.md` scratch audit; links into those paths in
  // `AGENTS.md` and elsewhere must not be reported as broken.
  it("skips link targets matched by .gitignore patterns", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "venice-markdown-links-"));
    tempDirs.push(root);
    fs.writeFileSync(
      path.join(root, ".gitignore"),
      "docs/AGENTS/\nnode_modules/\nbuild/secret.md\n!docs/AGENTS/keep.md\n",
    );
    fs.mkdirSync(path.join(root, "docs/AGENTS"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs/AGENTS/AGENTS.md"), "# Local agent handoff\n");
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Agent Guide\n\n[Sibling](docs/AGENTS/AGENTS.md)\n");
    fs.mkdirSync(path.join(root, "build"), { recursive: true });
    fs.writeFileSync(path.join(root, "build/secret.md"), "# secret\n");
    fs.writeFileSync(path.join(root, "README.md"), "[Secret](build/secret.md)\n");

    const isIgnored = loadGitignoreMatcher(root);
    const result = verifyMarkdownLinks(root, {
      files: [path.join(root, "AGENTS.md"), path.join(root, "README.md")],
      isIgnored,
    });

    expect(result.errors).toEqual([]);
  });

  it("compileGitignorePattern handles anchoring, negation, and globs", () => {
    expect(compileGitignorePattern("docs/AGENTS/")?.regex.test("docs/AGENTS/file.md")).toBe(true);
    expect(compileGitignorePattern("docs/AGENTS/")?.regex.test("docs/AGENTS/sub/nested.md")).toBe(true);
    expect(compileGitignorePattern("docs/AGENTS/")?.regex.test("docs/other.md")).toBe(false);
    expect(compileGitignorePattern("/build/icon.png")?.regex.test("build/icon.png")).toBe(true);
    expect(compileGitignorePattern("/build/icon.png")?.regex.test("src/build/icon.png")).toBe(false);
    expect(compileGitignorePattern("*.log")?.regex.test("server.log")).toBe(true);
    expect(compileGitignorePattern("*.log")?.regex.test("logs/2026/server.log")).toBe(true);
    expect(compileGitignorePattern("")?.negated).toBeUndefined();
    expect(compileGitignorePattern("   ")?.negated).toBeUndefined();
    expect(compileGitignorePattern("# comment")?.negated).toBeUndefined();
  });

  it("reports retired src/modules names without historical context", () => {
    const { files } = fixture({
      "docs/RESEARCH_PROVIDERS.md": "All providers are consumed through `SearchScrapeModule`.\n",
      "SECURITY.md": "The guard wraps `ChatModule`, `ImageModule`, `BatchModule`, and `SearchScrapeModule`.\n",
    });
    const errors = verifyRetiredModuleReferences(files);
    expect(errors.map((error) => ({ ...error, sourcePath: toPosixPath(error.sourcePath) }))).toEqual([
      expect.objectContaining({ sourcePath: expect.stringContaining("docs/RESEARCH_PROVIDERS.md"), line: 1, name: "SearchScrapeModule" }),
      expect.objectContaining({ sourcePath: expect.stringContaining("SECURITY.md"), line: 1, name: "ChatModule" }),
      expect.objectContaining({ sourcePath: expect.stringContaining("SECURITY.md"), line: 1, name: "ImageModule" }),
      expect.objectContaining({ sourcePath: expect.stringContaining("SECURITY.md"), line: 1, name: "BatchModule" }),
      expect.objectContaining({ sourcePath: expect.stringContaining("SECURITY.md"), line: 1, name: "SearchScrapeModule" }),
    ]);
  });

  it("allows retired module names in historical context or changelog files", () => {
    const { files } = fixture({
      "docs/design/THEME_SYSTEM.md": "`src/components/SearchScrapeView.tsx` reskinned research UI (replaces historical `src/modules/SearchScrapeModule.tsx`).\n",
      "docs/audits/CHANGELOG.md": "Refactored `ChatModule` with left sidebar.\n",
    });
    expect(verifyRetiredModuleReferences(files)).toEqual([]);
  });
});
