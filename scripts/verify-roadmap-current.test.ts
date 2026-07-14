// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import YAML from "yaml";

const require = createRequire(import.meta.url);
const { AUDIT_PATH, ROADMAP_PATH, verifyCurrentRoadmap } = require("./verify-roadmap-current.cjs") as {
  AUDIT_PATH: string;
  ROADMAP_PATH: string;
  verifyCurrentRoadmap: (rootDir: string) => string[];
};

// VERIFY-107: the canonical roadmap contains current work only and never mirrors authoritative audit statuses.
describe("VERIFY-107 current-only roadmap governance", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-roadmap-current-"));
    fs.mkdirSync(path.join(rootDir, "docs/audits"), { recursive: true });
  });

  afterEach(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  function write(relativePath: string, content: string): void {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }

  function writeAudit(status: "open" | "closed" = "open"): void {
    write(
      AUDIT_PATH,
      YAML.stringify({
        audit: {
          findings: [{
            id: "AUDIT-001",
            status,
            ...(status === "closed" ? { closure_evidence: ["Focused test passes."] } : {}),
          }],
        },
      }),
    );
  }

  function validRoadmap(): string {
    return `# Roadmap\n\nThis ledger contains current unfinished work only.\n\n### [ ] Active audit\n- Source: ${AUDIT_PATH}\n- [x] \`VF-AUDIT-20260714-T006\` closed tranche\n- [ ] \`VF-AUDIT-20260714-T007\` next tranche\n`;
  }

  it("accepts current work while audit finding status remains YAML-authoritative", () => {
    writeAudit();
    write(ROADMAP_PATH, validRoadmap());
    expect(verifyCurrentRoadmap(rootDir)).toEqual([]);
  });

  it("rejects historical closed sections and status fields", () => {
    writeAudit();
    write(ROADMAP_PATH, `${validRoadmap()}\n## Recently Closed\n\n### [x] Old task\n- **Status:** Closed\n`);
    const failures = verifyCurrentRoadmap(rootDir);
    expect(failures).toContain("Roadmap must not contain a Recently Closed history section.");
    expect(failures).toContain("Roadmap must not retain closed top-level task sections.");
    expect(failures).toContain("Roadmap must not retain historical closed status fields.");
  });

  it("rejects duplicated per-finding audit statuses in the roadmap", () => {
    writeAudit();
    write(ROADMAP_PATH, `${validRoadmap()}\n- [x] \`AUDIT-001\`: incorrectly mirrored as closed\n`);
    expect(verifyCurrentRoadmap(rootDir)).toContain(
      "Roadmap must not mirror per-finding audit statuses: AUDIT-001.",
    );
  });

  it("requires closure evidence for closed authoritative findings", () => {
    writeAudit("closed");
    const audit = YAML.parse(fs.readFileSync(path.join(rootDir, AUDIT_PATH), "utf8"));
    delete audit.audit.findings[0].closure_evidence;
    write(AUDIT_PATH, YAML.stringify(audit));
    write(ROADMAP_PATH, validRoadmap());
    expect(verifyCurrentRoadmap(rootDir)).toContain(
      "Closed authoritative audit finding AUDIT-001 must include closure_evidence.",
    );
  });

  it("fails clearly when the authoritative audit source is missing", () => {
    write(ROADMAP_PATH, validRoadmap());
    expect(verifyCurrentRoadmap(rootDir)).toEqual([
      `Missing authoritative audit status source: ${AUDIT_PATH}`,
    ]);
  });
});
