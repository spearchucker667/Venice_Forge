// @vitest-environment node
// VERIFY-140 regression guard: shutdown cleanup is awaited, bounded, failure-tolerant, and exactly once.
import { describe, expect, it, vi } from "vitest";
import { createShutdownCoordinator } from "./appShutdownCoordinator";

function dependencies() {
  return {
    stopBridgeServer: vi.fn(async () => undefined),
    stopSyncWatcher: vi.fn(async () => undefined),
    flushBackgroundTasks: vi.fn(async () => undefined),
    flushLogs: vi.fn(async () => undefined),
  };
}

describe("appShutdownCoordinator", () => {
  it("awaits every cleanup step exactly once across repeated calls", async () => {
    const deps = dependencies();
    const shutdown = createShutdownCoordinator(deps, 100);

    const [first, second] = await Promise.all([shutdown(), shutdown()]);

    expect(first).toEqual({ timedOut: false, failures: [] });
    expect(second).toBe(first);
    for (const cleanup of Object.values(deps)) expect(cleanup).toHaveBeenCalledOnce();
  });

  it("continues after a cleanup failure and reports it", async () => {
    const deps = dependencies();
    deps.stopSyncWatcher.mockRejectedValueOnce(new Error("journal write failed"));

    await expect(createShutdownCoordinator(deps, 100)()).resolves.toEqual({
      timedOut: false,
      failures: ["sync cleanup failed"],
    });
    expect(deps.flushLogs).toHaveBeenCalledOnce();
  });

  it("returns a bounded timeout result when cleanup stalls", async () => {
    const deps = dependencies();
    deps.stopBridgeServer.mockImplementationOnce(() => new Promise(() => undefined));

    await expect(createShutdownCoordinator(deps, 10)()).resolves.toEqual({
      timedOut: true,
      failures: ["shutdown cleanup exceeded its time limit"],
    });
    expect(deps.stopSyncWatcher).toHaveBeenCalledOnce();
    expect(deps.flushBackgroundTasks).toHaveBeenCalledOnce();
    expect(deps.flushLogs).toHaveBeenCalledOnce();
  });
});
