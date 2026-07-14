// VERIFY-087..VERIFY-091 regression guard: backup/sync contract verifier.
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import path from "path";

const SCRIPT = path.resolve(__dirname, "verify-backup-sync.cjs");

describe("verify-backup-sync contract", () => {
  it("passes for the current repository", () => {
    const output = execFileSync(process.execPath, [SCRIPT], { encoding: "utf8", cwd: path.resolve(__dirname, "..") });
    expect(output).toContain("All backup/sync contract invariants passed.");
  });
});
