// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  ACTIVE_AGENT_DOCS,
  CANONICAL_PATH,
  CANONICAL_REPOSITORY,
  README_REQUIRED_CUSTODY_MARKERS,
  README_REQUIRED_TAB_LABELS,
  verifyRepositoryIdentity,
} = require("./verify-repository-identity.cjs") as {
  ACTIVE_AGENT_DOCS: readonly string[];
  AGENT_POINTER_FILES?: readonly string[];
  CANONICAL_PATH: string;
  CANONICAL_REPOSITORY: string;
  README_REQUIRED_CUSTODY_MARKERS: readonly string[];
  README_REQUIRED_TAB_LABELS: readonly string[];
  verifyRepositoryIdentity: (rootDir: string) => { passed: boolean; errors: string[] };
};
// AGENT_POINTER_FILES was added in the 2026-08-22 hygiene pass —
// not present in the exported contract, derive from the module itself.
const { AGENT_POINTER_FILES = [] } = require("./verify-repository-identity.cjs") as {
  AGENT_POINTER_FILES?: readonly string[];
};

describe("VERIFY-069 repository identity", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-repository-identity-"));
    execFileSync("git", ["init", "-q"], { cwd: rootDir });
  });

  afterEach(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  function write(relativePath: string, content: string): void {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
    execFileSync("git", ["add", relativePath], { cwd: rootDir });
  }

  function writeAgentDocs(): void {
    for (const relativePath of ACTIVE_AGENT_DOCS as string[]) {
      write(relativePath, `${CANONICAL_PATH}\n${CANONICAL_REPOSITORY}\ndocs/summary_of_work.md\n`);
    }
    // Agent pointer files only need to reference AGENTS.md (not full canonical paths).
    for (const relativePath of AGENT_POINTER_FILES as string[]) {
      write(relativePath, "# Venice Forge\n# See AGENTS.md for canonical instructions.\n");
    }
  }

  it("passes a canonical tracked fixture", () => {
    writeAgentDocs();
    expect(verifyRepositoryIdentity(rootDir)).toEqual({ passed: true, errors: [] });
  });

  it("reports obsolete active paths with file and line", () => {
    writeAgentDocs();
    write("README.md", "ok\n/Users/super_user/Projects/Venice_Forge/\n");
    const result = verifyRepositoryIdentity(rootDir);
    expect(result.passed).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("README.md:2:"));
  });

  it("requires a banner before allowing historical paths", () => {
    writeAgentDocs();
    write("docs/reports/historical/old.md", "/Users/super_user/Projects/Venice_Forge/\n");
    expect(verifyRepositoryIdentity(rootDir).errors).toContainEqual(expect.stringContaining("Historical snapshot banner"));
  });

  it("rejects portable-link and local-cache violations", () => {
    writeAgentDocs();
    // Construct the URL at runtime so the committed test source never contains
    // the literal private file-scheme link that the verifier scans for.
    const privateLink = "file://" + "/Users/example/private.md";
    const privateProto = "file://" + "/Users";
    write("PRIVACY.md", `[local](${privateLink})\n`);
    write(".impeccable/hook.cache.json", "{}\n");
    const result = verifyRepositoryIdentity(rootDir);
    expect(result.errors).toContainEqual(expect.stringContaining(privateProto));
    expect(result.errors).toContainEqual(expect.stringContaining("committed local cache"));
  });

  it("rejects the stale preview and an API-key custody overclaim", () => {
    writeAgentDocs();
    write(
      "README.md",
      [
        "## Current Workspace Map",
        README_REQUIRED_TAB_LABELS.join(" · "),
        "---",
        "![Old preview](./assets/preview.png)",
        "- **Secure Key Storage:** API credentials use the native Keychain and Windows Credential Manager.",
      ].join("\n"),
    );

    const result = verifyRepositoryIdentity(rootDir);
    expect(result.errors).toContainEqual(expect.stringContaining("stale promotional preview"));
    expect(result.errors).toContainEqual(expect.stringContaining("secure-storage claim is missing"));
  });

  it("accepts the source-aligned workspace map and credential custody markers", () => {
    writeAgentDocs();
    write(
      "README.md",
      [
        "## Current Workspace Map",
        README_REQUIRED_TAB_LABELS.join(" · "),
        "---",
        `- **Secure Key Storage:** ${README_REQUIRED_CUSTODY_MARKERS.join(" · ")}`,
      ].join("\n"),
    );

    expect(verifyRepositoryIdentity(rootDir)).toEqual({ passed: true, errors: [] });
  });

  it("supports archive mode using _REPO_EXTRACT_METADATA", () => {
    writeAgentDocs();
    // Remove the Git worktree to force archive-mode discovery.
    fs.rmSync(path.join(rootDir, ".git"), { recursive: true, force: true });

    const metaDir = path.join(rootDir, "_REPO_EXTRACT_METADATA");
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, "EXTRACT_INFO.txt"),
      "repo_name=Venice_Forge\ncommit=deadbeef\nbranch=main\n",
    );
    fs.writeFileSync(
      path.join(metaDir, "final-file-list.txt"),
      "./AGENTS.md\n./README.md\n",
    );

    expect(verifyRepositoryIdentity(rootDir)).toEqual({ passed: true, errors: [] });
  });

  it("archive mode fails without valid metadata", () => {
    writeAgentDocs();
    fs.rmSync(path.join(rootDir, ".git"), { recursive: true, force: true });

    const metaDir = path.join(rootDir, "_REPO_EXTRACT_METADATA");
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, "EXTRACT_INFO.txt"),
      "repo_name=WrongRepo\ncommit=\n",
    );
    fs.writeFileSync(
      path.join(metaDir, "final-file-list.txt"),
      "./AGENTS.md\n",
    );

    const result = verifyRepositoryIdentity(rootDir);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes("repo_name"))).toBe(true);
    expect(result.errors.some((e) => e.includes("commit"))).toBe(true);
  });

  // Regression: docs/summary_of_work.md must allow Session History entries to
  // contain historical absolute paths while still rejecting leaks in the active
  // summary. The previous heading matcher required `### Session History`, but
  // the canonical document uses `## Session History`, which silently disabled
  // the carve-out and caused CI to fail on legitimate historical references.
  it("exempts lines below `## Session History` in docs/summary_of_work.md", () => {
    writeAgentDocs();
    // Construct the path at runtime so the committed test source never
    // contains the literal private absolute path that the verifier scans for.
    const privateRoot = "/Users" + "/super_user";
    const privatePath = privateRoot + "/example/secret";
    write(
      "docs/summary_of_work.md",
      [
        "## Latest Session Summary",
        "- An active entry that leaks " + privatePath,
        "",
        "## Session History",
        "",
        "### 2026-09-26 — Historical session entry",
        "- A historical entry that still references " + privatePath,
        "",
      ].join("\n"),
    );
    const result = verifyRepositoryIdentity(rootDir);
    expect(result.passed).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("summary_of_work.md:2:"));
    expect(result.errors).not.toContainEqual(expect.stringContaining("summary_of_work.md:6:"));
  });

  it("also exempts lines below the legacy `### Session History` sub-heading form", () => {
    writeAgentDocs();
    const privateRoot = "/Users" + "/super_user";
    const privatePath = privateRoot + "/example/secret";
    write(
      "docs/summary_of_work.md",
      [
        "## Latest Session Summary",
        "",
        "### Session History",
        "",
        "- A historical entry that references " + privatePath,
        "",
      ].join("\n"),
    );
    const result = verifyRepositoryIdentity(rootDir);
    expect(result.passed).toBe(true);
    expect(result.errors).not.toContainEqual(expect.stringContaining("summary_of_work.md:5:"));
  });

  it("does not exempt summary_of_work.md lines when the heading is missing", () => {
    writeAgentDocs();
    const privateRoot = "/Users" + "/super_user";
    const privatePath = privateRoot + "/example/secret";
    write(
      "docs/summary_of_work.md",
      [
        "## Latest Session Summary",
        "- A leak " + privatePath,
        "",
        "## Some Other Section",
        "- Another leak " + privatePath,
        "",
      ].join("\n"),
    );
    const result = verifyRepositoryIdentity(rootDir);
    expect(result.passed).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("summary_of_work.md:2:"));
    expect(result.errors).toContainEqual(expect.stringContaining("summary_of_work.md:5:"));
  });

  it("does not match a heading whose text is not exactly `Session History`", () => {
    writeAgentDocs();
    const privateRoot = "/Users" + "/super_user";
    const privatePath = privateRoot + "/example/secret";
    write(
      "docs/summary_of_work.md",
      [
        "## Session History Index",
        "- A line that should still be flagged " + privatePath,
        "",
      ].join("\n"),
    );
    const result = verifyRepositoryIdentity(rootDir);
    expect(result.passed).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("summary_of_work.md:2:"));
  });
});
