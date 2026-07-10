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
  verifyRepositoryIdentity,
} = require("./verify-repository-identity.cjs") as {
  ACTIVE_AGENT_DOCS: readonly string[];
  CANONICAL_PATH: string;
  CANONICAL_REPOSITORY: string;
  verifyRepositoryIdentity: (rootDir: string) => { passed: boolean; errors: string[] };
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
  }

  it("passes a canonical tracked fixture", () => {
    writeAgentDocs();
    expect(verifyRepositoryIdentity(rootDir)).toEqual({ passed: true, errors: [] });
  });

  it("reports obsolete active paths with file and line", () => {
    writeAgentDocs();
    write("README.md", "ok\n/Users/super_user/Projects/Windows-Venice-API-connector\n");
    const result = verifyRepositoryIdentity(rootDir);
    expect(result.passed).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("README.md:2:"));
  });

  it("requires a banner before allowing historical paths", () => {
    writeAgentDocs();
    write("docs/reports/historical/old.md", "/Users/super_user/Projects/Windows-Venice-API-connector\n");
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
});
