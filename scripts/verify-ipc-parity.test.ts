// @vitest-environment node
/**
 * Regression test for scripts/verify-ipc-parity.cjs (VF-AUD-20260912-N1).
 *
 * Asserts that the verifier exits with status 0 against the live repository
 * and that the report contains the expected channel counts and a success
 * marker. A failure here means the IPC parity has regressed — i.e. either
 * a preload.invoke/on channel has no main-process counterpart or a
 * handler/emitter has no preload consumer.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

const VERIFIER = "scripts/verify-ipc-parity.cjs";

describe("verify-ipc-parity (VF-AUD-20260912-N1)", () => {
  it("passes on the live repository", () => {
    const result = spawnSync("node", [VERIFIER], { encoding: "utf8" });
    expect(result.status).toBe(0);
    // Sanity-check the report includes our channel counts and the success marker.
    expect(result.stdout).toMatch(/handler-registered channels: \d+/);
    expect(result.stdout).toMatch(/preload\.invoke channels: \s+\d+/);
    expect(result.stdout).toMatch(/preload\.on channels: \s+\d+/);
    expect(result.stdout).toMatch(/✅ IPC parity/);
    // The verifier must NOT report any parity break.
    expect(result.stdout).not.toMatch(/❌/);
  });

  it("verifier reports the expected baseline counts", () => {
    const result = spawnSync("node", [VERIFIER], { encoding: "utf8" });
    expect(result.status).toBe(0);
    // Expected ranges — these can drift upward as new channels are added, but
    // a sudden drop indicates a regression in IPC surface registration.
    expect(result.stdout).toMatch(/handler-registered channels: (19[0-9]|200)/);
    expect(result.stdout).toMatch(/preload\.invoke channels: \s+(19[0-9]|200)/);
    expect(result.stdout).toMatch(/preload\.on channels: \s+(10|1[1-9])/);
  });
});
