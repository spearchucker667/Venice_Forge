// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { EVIDENCE_PATH, ROADMAP_PATH, verifyCurrentRoadmap } = require("./verify-roadmap-current.cjs") as {
  EVIDENCE_PATH: string;
  ROADMAP_PATH: string;
  verifyCurrentRoadmap: (rootDir: string) => string[];
};

// VERIFY-107: the canonical roadmap contains current work only and treats retained scan evidence as input.
describe("VERIFY-107 current-only roadmap governance", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-roadmap-current-"));
    write(EVIDENCE_PATH, "# Retained scan evidence\n");
  });

  afterEach(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  function write(relativePath: string, content: string): void {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }

  function validRoadmap(): string {
    return `# Roadmap\n\nThis ledger contains current unfinished work only.\n\n### [ ] Active audit\n- Source: ${EVIDENCE_PATH}\n- [ ] \`VF-SCAN-20260715-001\` next tranche\n`;
  }

  it("accepts current work while scan evidence remains input rather than status authority", () => {
    write(ROADMAP_PATH, validRoadmap());
    expect(verifyCurrentRoadmap(rootDir)).toEqual([]);
  });

  it("rejects historical closed sections and status fields", () => {
    write(ROADMAP_PATH, `${validRoadmap()}\n## Recently Closed\n\n### [x] Old task\n- **Status:** Closed\n`);
    const failures = verifyCurrentRoadmap(rootDir);
    expect(failures).toContain("Roadmap must not contain a Recently Closed history section.");
    expect(failures).toContain("Roadmap must not retain closed top-level task sections.");
    expect(failures).toContain("Roadmap must not retain historical closed status fields.");
  });

  it("rejects duplicated per-finding audit statuses in the roadmap", () => {
    write(ROADMAP_PATH, `${validRoadmap()}\n- [x] \`AUDIT-001\`: incorrectly mirrored as closed\n`);
    expect(verifyCurrentRoadmap(rootDir)).toContain(
      "Roadmap must not mirror per-finding audit statuses: AUDIT-001.",
    );
  });

  it("requires the retained scan evidence", () => {
    fs.rmSync(path.join(rootDir, EVIDENCE_PATH));
    write(ROADMAP_PATH, validRoadmap());
    expect(verifyCurrentRoadmap(rootDir)).toEqual([
      `Missing retained scan evidence: ${EVIDENCE_PATH}`,
    ]);
  });

  it("requires the roadmap to cite its audit input", () => {
    write(ROADMAP_PATH, "# Roadmap\n\nThis ledger contains current unfinished work only.\n");
    expect(verifyCurrentRoadmap(rootDir)).toContain(
      `Roadmap must cite ${EVIDENCE_PATH} as audit input.`,
    );
  });
});
