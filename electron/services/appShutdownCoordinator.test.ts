// @vitest-environment node
// VERIFY-140 regression guard: shutdown cleanup is awaited, bounded, failure-tolerant, and exactly once.
// P2 #6 (VF-SCAN-20260717-031029-006): durable cleanup runs in parallel;
// flushLogs is the final ordered phase so shutdown diagnostics are persisted.
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
    // bridge was started, sync + tasks ran to completion in parallel; flushLogs
    // was deliberately NOT awaited because the durable phase did not settle.
    expect(deps.stopBridgeServer).toHaveBeenCalledOnce();
    expect(deps.stopSyncWatcher).toHaveBeenCalledOnce();
    expect(deps.flushBackgroundTasks).toHaveBeenCalledOnce();
    expect(deps.flushLogs).not.toHaveBeenCalled();
  });

  it("flushes logs as the final ordered phase after durable cleanup settles", async () => {
    // Logs must run AFTER durable cleanup, never concurrently, so the final
    // shutdown diagnostics written by bridge/sync/tasks are captured.
    const order: string[] = [];
    const deps = {
      stopBridgeServer: vi.fn(async () => {
        order.push("bridge-start");
        await Promise.resolve();
        order.push("bridge-end");
      }),
      stopSyncWatcher: vi.fn(async () => {
        order.push("sync-end");
      }),
      flushBackgroundTasks: vi.fn(async () => {
        order.push("tasks-end");
      }),
      flushLogs: vi.fn(async () => {
        order.push("logs-end");
      }),
    };

    await createShutdownCoordinator(deps, 1_000)();

    expect(order.indexOf("logs-end")).toBeGreaterThan(order.indexOf("bridge-end"));
    expect(order.indexOf("logs-end")).toBeGreaterThan(order.indexOf("sync-end"));
    expect(order.indexOf("logs-end")).toBeGreaterThan(order.indexOf("tasks-end"));
  });

  it("captures a late-emitted diagnostic from synchronous cleanup before flushing logs", async () => {
    // Regression test for P2 #6: cleanup steps that emit logs after their own
    // async close completes must still see those logs flushed.
    const lateLogs: string[] = [];
    const deps = {
      stopBridgeServer: vi.fn(async () => undefined),
      stopSyncWatcher: vi.fn(async () => {
        // Simulate a cleanup that finishes its own close but writes a final
        // diagnostic just before resolving.
        await Promise.resolve();
        lateLogs.push("sync-final-diagnostic");
      }),
      flushBackgroundTasks: vi.fn(async () => undefined),
      flushLogs: vi.fn(async () => {
        // flushLogs snapshots whatever lateLogs currently holds at the time
        // it runs; the regression guarantee is that this happens AFTER sync has
        // written its final diagnostic.
        expect(lateLogs).toContain("sync-final-diagnostic");
      }),
    };

    await createShutdownCoordinator(deps, 1_000)();

    expect(deps.flushLogs).toHaveBeenCalledOnce();
    expect(lateLogs).toContain("sync-final-diagnostic");
  });
});
