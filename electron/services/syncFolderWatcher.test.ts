// VERIFY-091 regression guard: sync folder watcher validates, encrypts, and suppresses local emission.
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();
vi.mock("electron", () => ({
  BrowserWindow: class MockBrowserWindow {
    isDestroyed = vi.fn().mockReturnValue(false);
    webContents = { send: sendMock };
  },
  app: {
    getPath: vi.fn(),
  },
}));

vi.mock("chokidar", () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(function () { return this; }),
      close: vi.fn().mockResolvedValue(undefined),
    })),
  },
  watch: vi.fn(() => ({
    on: vi.fn(function () { return this; }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

import {
  setSyncFolder,
  getSyncStatus,
  writePacket,
  setSyncEmissionSuppressed,
  isSyncEmissionSuppressed,
  startSyncWatcher,
  stopSyncWatcher,
  pauseSyncWatcher,
  acknowledgeOperation,
  loadAppliedOperationsJournal,
  isOperationApplied,
  isOperationInFlight,
  recordAppliedOperation,
  resetAppliedOperationsJournal,
  flushAppliedOperationsJournal,
  MAX_JOURNAL_ENTRIES,
  __registerInFlightOperationForTests,
  __clearInFlightOperationsForTests,
  initSyncFolderWatcher,
} from "./syncFolderWatcher";
import {
  initSyncRetryQueue,
  stopSyncRetryQueue,
  scheduleRetry,
  getPendingRetries,
  clearPendingRetries,
} from "./syncRetryQueue";
import { promises as fs } from "fs";
import { app } from "electron";
import { createTombstone } from "../../src/shared/syncProtocol";
import { logError } from "./logger";

vi.mock("./syncConfig", () => ({
  getSyncPath: vi.fn().mockResolvedValue(null),
  setSyncPath: vi.fn().mockResolvedValue(undefined),
  getDeviceId: vi.fn().mockResolvedValue("device-1"),
}));

vi.mock("./logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../src/shared/redaction", () => ({
  redactErrorMessage: (msg: unknown) => String(msg),
}));

const tmpDir = "/tmp/sync-test";

describe("syncFolderWatcher", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.resetAllMocks();
    vi.mocked(app.getPath).mockReturnValue("/tmp/userData");
    setSyncEmissionSuppressed(false);
    resetAppliedOperationsJournal();
    __clearInFlightOperationsForTests();
    stopSyncRetryQueue();
    clearPendingRetries();
    await fs.rm("/tmp/userData/sync", { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await stopSyncWatcher();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("reports status as stopped when unconfigured", () => {
    const status = getSyncStatus();
    expect(status.status).toBe("stopped");
    expect(status.configured).toBe(false);
  });

  it("sets the sync folder and creates .vfbackup structure", async () => {
    const result = await setSyncFolder(tmpDir);
    expect(result.ok).toBe(true);
    const stat = await fs.stat(`${tmpDir}/.vfbackup/blobs`);
    expect(stat.isDirectory()).toBe(true);
  });

  it("starts the watcher and updates status", async () => {
    // Without a configured path, startSyncWatcher just stores the password and marks running.
    const startResult = await startSyncWatcher("password");
    expect(startResult.ok).toBe(true);
    expect(getSyncStatus().status).toBe("running");
  });

  it("refuses to write a packet with an invalid store name", async () => {
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");
    const result = await writePacket("invalid-store", "id-1", '{"id":"id-1"}');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid storeName/);
  });

  it("refuses to write a packet with an invalid id", async () => {
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");
    const result = await writePacket("conversations", "../../etc/passwd", '{"id":"../../etc/passwd"}');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid id/);
  });

  it("refuses to write a packet when the payload id mismatches", async () => {
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");
    const result = await writePacket("conversations", "id-1", '{"id":"id-2"}');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Record ID mismatch/);
  });

  it("writes a valid packet and suppresses emission when requested", async () => {
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");
    setSyncEmissionSuppressed(true);
    expect(isSyncEmissionSuppressed()).toBe(true);

    const result = await writePacket("conversations", "id-1", '{"id":"id-1","title":"Hello"}');
    expect(result.ok).toBe(true);

    const blobs = await fs.readdir(`${tmpDir}/.vfbackup/blobs`);
    expect(blobs.length).toBe(0);

    setSyncEmissionSuppressed(false);
    const result2 = await writePacket("conversations", "id-1", '{"id":"id-1","title":"Hello"}');
    expect(result2.ok).toBe(true);
    const blobs2 = await fs.readdir(`${tmpDir}/.vfbackup/blobs`);
    expect(blobs2.length).toBe(1);
  });

  it("accepts a tombstone packet whose envelope id equals the tombstone id", async () => {
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");

    const tombstone = createTombstone("conversations", "conv-1");
    const result = await writePacket("tombstones", tombstone.id, JSON.stringify(tombstone));
    expect(result.ok).toBe(true);
  });

  it("records acknowledged operations and prevents duplicate processing", async () => {
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");

    const validOpId = "a".repeat(64);
    __registerInFlightOperationForTests(validOpId, "conversations", "device-2");

    const ackResult = await acknowledgeOperation(validOpId, true);
    expect(ackResult).toEqual({ ok: true });

    const journalPath = "/tmp/userData/sync/applied-operations.json";
    const journalData = await fs.readFile(journalPath, "utf8");
    const journal = JSON.parse(journalData);
    expect(journal.operations.some((op: { operationId: string }) => op.operationId === validOpId)).toBe(true);

    await loadAppliedOperationsJournal();
    expect(isOperationApplied(validOpId)).toBe(true);
  });

  it("rejects an acknowledgment with an invalid operation id", async () => {
    const ackResult = await acknowledgeOperation("op-abc", true);
    expect(ackResult).toEqual({
      ok: false,
      error: "operationId must be 64 lowercase hex characters.",
    });
  });

  it("rejects an acknowledgment for an operation that is not in flight", async () => {
    const validOpId = "b".repeat(64);
    const ackResult = await acknowledgeOperation(validOpId, true);
    expect(ackResult).toEqual({ ok: false, error: "No such in-flight operation." });
  });

  it("removes the operation from in-flight when the acknowledgment is negative", async () => {
    const validOpId = "c".repeat(64);
    __registerInFlightOperationForTests(validOpId, "conversations");
    const ackResult = await acknowledgeOperation(validOpId, false);
    expect(ackResult).toEqual({ ok: true });
    expect(isOperationInFlight(validOpId)).toBe(false);
  });

  it("redacts and logs journal-write failures when acknowledging", async () => {
    const validOpId = "d".repeat(64);
    __registerInFlightOperationForTests(validOpId, "conversations");
    const writeFileSpy = vi.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("disk full"));

    const ackResult = await acknowledgeOperation(validOpId, true);

    expect(ackResult).toEqual({ ok: false, error: "disk full" });
    expect(logError).toHaveBeenCalledWith(
      "syncFolderWatcher",
      expect.stringMatching(/Failed to record applied operation [d]{64}: disk full/),
    );
    writeFileSpy.mockRestore();
  });

  it("preserves every acknowledgment under concurrent writes", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `op-${i}`);
    await Promise.all(ids.map((id) => recordAppliedOperation(id, "conversations", "applied")));

    const journalPath = "/tmp/userData/sync/applied-operations.json";
    const journalData = await fs.readFile(journalPath, "utf8");
    const journal = JSON.parse(journalData);

    for (const id of ids) {
      expect(journal.operations.some((op: { operationId: string }) => op.operationId === id)).toBe(true);
    }
  });

  it("requeues an operation after a negative acknowledgment", async () => {
    const validOpId = "e".repeat(64);
    const filePath = `${tmpDir}/negative-ack.json`;
    __registerInFlightOperationForTests(validOpId, "conversations", "device-2", filePath, 0);

    const ackResult = await acknowledgeOperation(validOpId, false);

    expect(ackResult).toEqual({ ok: true });
    expect(isOperationInFlight(validOpId)).toBe(false);
    const pending = getPendingRetries();
    expect(pending.has(validOpId)).toBe(true);
    expect(pending.get(validOpId)).toMatchObject({
      operationId: validOpId,
      filePath,
      attempts: 1,
      lastError: "Negative acknowledgment",
    });
  });

  it("requeues an unacknowledged operation after timeout", async () => {
    vi.useFakeTimers();
    const validOpId = "f".repeat(64);
    const filePath = `${tmpDir}/timeout-ack.json`;
    __registerInFlightOperationForTests(validOpId, "conversations", "device-2", filePath, 0, true);

    vi.advanceTimersByTime(30_000);

    expect(isOperationInFlight(validOpId)).toBe(false);
    const pending = getPendingRetries();
    expect(pending.has(validOpId)).toBe(true);
    expect(pending.get(validOpId)).toMatchObject({
      operationId: validOpId,
      filePath,
      attempts: 1,
      lastError: "Acknowledgment timeout",
    });
  });

  it("requeues in-flight operations when the sync watcher is stopped", async () => {
    const validOpId = "g".repeat(64);
    const filePath = `${tmpDir}/stop-requeue.json`;
    __registerInFlightOperationForTests(validOpId, "conversations", "device-2", filePath, 0);

    await stopSyncWatcher();

    expect(isOperationInFlight(validOpId)).toBe(false);
    const pending = getPendingRetries();
    expect(pending.has(validOpId)).toBe(true);
    expect(pending.get(validOpId)).toMatchObject({
      operationId: validOpId,
      filePath,
      attempts: 1,
      lastError: "Watcher stopped",
    });
  });

  it("requeues in-flight operations when the sync watcher is paused", async () => {
    const validOpId = "h".repeat(64);
    const filePath = `${tmpDir}/pause-requeue.json`;
    __registerInFlightOperationForTests(validOpId, "conversations", "device-2", filePath, 2);

    await pauseSyncWatcher();

    expect(isOperationInFlight(validOpId)).toBe(false);
    const pending = getPendingRetries();
    expect(pending.has(validOpId)).toBe(true);
    expect(pending.get(validOpId)).toMatchObject({
      operationId: validOpId,
      filePath,
      attempts: 3,
      lastError: "Watcher paused",
    });
  });

  it("delivers retries via the scheduler after exponential backoff", async () => {
    vi.useFakeTimers();
    const spy = vi.fn().mockReturnValue(true);
    initSyncRetryQueue(spy);

    const validOpId = "i".repeat(64);
    const filePath = `${tmpDir}/scheduler.json`;
    scheduleRetry(validOpId, filePath, 0);

    const pending = getPendingRetries();
    expect(pending.has(validOpId)).toBe(true);

    vi.advanceTimersByTime(5000);

    expect(spy).toHaveBeenCalledWith(filePath, 1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(getPendingRetries().has(validOpId)).toBe(false);
  });

  it("gives up after the maximum number of retry attempts", async () => {
    const validOpId = "j".repeat(64);
    const filePath = `${tmpDir}/max-attempts.json`;
    scheduleRetry(validOpId, filePath, 10);

    expect(getPendingRetries().has(validOpId)).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      "syncRetryQueue",
      expect.stringMatching(/exceeded max retry attempts/),
    );
  });

  it("increments the attempt count across scheduler redelivery and timeout cycles", async () => {
    vi.useFakeTimers();
    const validOpId = "k".repeat(64);
    const filePath = `${tmpDir}/cycle-attempts.json`;

    // First timeout: attempt 0 in-flight -> pending attempts = 1
    __registerInFlightOperationForTests(validOpId, "conversations", "device-2", filePath, 0, true);
    vi.advanceTimersByTime(30_000);
    expect(getPendingRetries().get(validOpId)?.attempts).toBe(1);

    // Scheduler redelivers with attempts=1; simulate delivery by re-registering in-flight.
    const redeliver = vi.fn((fp: string, attempts: number) => {
      expect(fp).toBe(filePath);
      __registerInFlightOperationForTests(validOpId, "conversations", "device-2", filePath, attempts, true);
      return true;
    });
    initSyncRetryQueue(redeliver);
    vi.advanceTimersByTime(5000);
    expect(redeliver).toHaveBeenCalledWith(filePath, 1);

    // Second timeout: attempt 1 in-flight -> pending attempts = 2
    vi.advanceTimersByTime(30_000);
    expect(getPendingRetries().get(validOpId)?.attempts).toBe(2);

    // Third cycle: scheduler redelivers with attempts=2
    redeliver.mockClear();
    __clearInFlightOperationsForTests();
    initSyncRetryQueue(redeliver);
    vi.advanceTimersByTime(5000);
    expect(redeliver).toHaveBeenCalledWith(filePath, 2);
  });

  it("enforces maximum retry attempts end-to-end", async () => {
    vi.useFakeTimers();
    const validOpId = "l".repeat(64);
    const filePath = `${tmpDir}/end-to-end-max.json`;

    let deliveredAttempts = -1;
    initSyncRetryQueue((fp: string, attempts: number) => {
      deliveredAttempts = attempts;
      __clearInFlightOperationsForTests();
      __registerInFlightOperationForTests(validOpId, "conversations", "device-2", fp, attempts, true);
      return true;
    });

    // Seed initial in-flight operation at attempt 0.
    __registerInFlightOperationForTests(validOpId, "conversations", "device-2", filePath, 0, true);

    // Drive timeout -> scheduler -> redelivery cycles until the operation is abandoned.
    let safety = 0;
    while (safety++ < 50) {
      if (isOperationInFlight(validOpId)) {
        vi.advanceTimersByTime(30_000);
        continue;
      }
      const pending = getPendingRetries().get(validOpId);
      if (!pending) {
        break;
      }
      const wait = pending.nextAttemptAt - Date.now();
      const ticks = Math.ceil(Math.max(wait, 0) / 5000);
      vi.advanceTimersByTime(Math.max(ticks, 1) * 5000);
    }

    expect(deliveredAttempts).toBe(10);
    expect(getPendingRetries().has(validOpId)).toBe(false);
    expect(isOperationInFlight(validOpId)).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      "syncRetryQueue",
      expect.stringMatching(/exceeded max retry attempts/),
    );
  });

  it("increases nextAttemptAt with exponential backoff", () => {
    vi.useRealTimers();
    const validOpId = "m".repeat(64);
    const filePath = `${tmpDir}/backoff.json`;
    const base = Date.now();

    scheduleRetry(validOpId, filePath, 0);
    expect(getPendingRetries().get(validOpId)!.nextAttemptAt).toBeGreaterThanOrEqual(base + 1000);
    expect(getPendingRetries().get(validOpId)!.nextAttemptAt).toBeLessThan(base + 2000);
    clearPendingRetries();

    scheduleRetry(validOpId, filePath, 1);
    expect(getPendingRetries().get(validOpId)!.nextAttemptAt).toBeGreaterThanOrEqual(base + 2000);
    expect(getPendingRetries().get(validOpId)!.nextAttemptAt).toBeLessThan(base + 4000);
    clearPendingRetries();

    scheduleRetry(validOpId, filePath, 4);
    expect(getPendingRetries().get(validOpId)!.nextAttemptAt).toBeGreaterThanOrEqual(base + 16_000);
    expect(getPendingRetries().get(validOpId)!.nextAttemptAt).toBeLessThan(base + 32_000);
  });

  it("does not drop pending retries while the watcher is stopped", async () => {
    vi.useFakeTimers();
    const { BrowserWindow } = await import("electron");
    const mainWindow = new BrowserWindow();
    await initSyncFolderWatcher(mainWindow);

    const validOpId = "n".repeat(64);
    const filePath = `${tmpDir}/stopped-retry.json`;
    scheduleRetry(validOpId, filePath, 0);

    await startSyncWatcher("password");
    await stopSyncWatcher();

    // The scheduler was stopped by stopSyncWatcher, so restart it manually to observe behavior.
    initSyncRetryQueue((fp, attempts) => handleRemoteChange(fp, attempts));
    vi.advanceTimersByTime(5000);

    // Watcher is stopped (currentPassword is null), so handleRemoteChange rejects the delivery
    // and the pending entry must remain intact.
    expect(getPendingRetries().has(validOpId)).toBe(true);
    expect(getPendingRetries().get(validOpId)).toMatchObject({
      operationId: validOpId,
      filePath,
      attempts: 1,
    });
  });

  it("stops the retry scheduler on stopSyncWatcher", async () => {
    vi.useFakeTimers();
    const spy = vi.fn().mockReturnValue(true);
    initSyncRetryQueue(spy);

    const validOpId = "o".repeat(64);
    const filePath = `${tmpDir}/scheduler-stop.json`;
    scheduleRetry(validOpId, filePath, 0);

    await stopSyncWatcher();
    vi.advanceTimersByTime(10_000);

    expect(spy).not.toHaveBeenCalled();
    expect(getPendingRetries().has(validOpId)).toBe(true);
  });

  // Task 13 regression guard: bounded applied-operations journal compaction.
  it("does not exceed MAX_JOURNAL_ENTRIES after many operations", async () => {
    for (let i = 0; i < MAX_JOURNAL_ENTRIES + 100; i++) {
      await recordAppliedOperation(`op-${i}`, "conversations", "applied", undefined, false);
    }
    await flushAppliedOperationsJournal();
    const journal = await loadAppliedOperationsJournal();
    expect(journal.operations.length).toBeLessThanOrEqual(MAX_JOURNAL_ENTRIES);
    expect(journal.lastCompactedAt).toBeDefined();
  });
});
