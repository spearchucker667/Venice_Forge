// VERIFY-091 regression guard: sync folder watcher validates, encrypts, and suppresses local emission.
// VERIFY-109 regression guard: sync roots and watched descendants reject symlinks and path escapes.
// VERIFY-119 regression guard: failed setup rolls back and transient remote files remain retryable.
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
  setRendererSessionAttached,
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
  handleRemoteChange,
} from "./syncFolderWatcher";
import {
  initSyncRetryQueue,
  stopSyncRetryQueue,
  scheduleRetry,
  getPendingRetries,
  clearPendingRetries,
  isSyncRetryQueueRunning,
} from "./syncRetryQueue";
import { promises as fs } from "fs";
import { app } from "electron";
import { createTombstone } from "../../src/shared/syncProtocol";
import { logError } from "./logger";
import { encryptPayload } from "./backupCrypto";
import { ensureSyncIdentity } from "./syncIdentity";
import { getDeviceId } from "./syncConfig";

vi.mock("./syncConfig", () => ({
  getSyncPath: vi.fn().mockResolvedValue(null),
  setSyncPath: vi.fn().mockResolvedValue(undefined),
  getDeviceId: vi.fn().mockResolvedValue("device-1"),
}));

const { testSyncIdentity } = vi.hoisted(() => ({
  testSyncIdentity: { syncSetId: "11111111-1111-4111-8111-111111111111", keyId: "22222222-2222-4222-8222-222222222222" },
}));
vi.mock("./syncIdentity", async (importOriginal) => {
  const original = await importOriginal<typeof import("./syncIdentity")>();
  return { ...original, ensureSyncIdentity: vi.fn().mockResolvedValue(testSyncIdentity) };
});

vi.mock("./logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../src/shared/redaction", () => ({
  redactErrorMessage: (msg: unknown) => String(msg),
}));

import os from "node:os";
import path from "node:path";

let tmpDir = "/tmp/sync-test";

async function writeRemotePacket(
  fileName: string,
  packet: { storeName: string; id: string; operationId: string; data: Record<string, unknown>; syncSetId?: string; keyId?: string; profileId?: string },
): Promise<string> {
  const payload = JSON.stringify({
    _storeName: packet.storeName,
    _id: packet.id,
    _operationId: packet.operationId,
    _sourceDeviceId: "device-2",
    _syncSetId: packet.syncSetId ?? testSyncIdentity.syncSetId,
    _keyId: packet.keyId ?? testSyncIdentity.keyId,
    _profileId: packet.profileId ?? "default",
    data: packet.data,
  });
  const encrypted = await encryptPayload(payload, "password");
  const filePath = path.join(tmpDir, ".vfbackup", "blobs", fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), ...encrypted }));
  return filePath;
}

describe("syncFolderWatcher", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.resetAllMocks();
    vi.mocked(ensureSyncIdentity).mockResolvedValue(testSyncIdentity);
    vi.mocked(getDeviceId).mockResolvedValue("device-1");
    vi.mocked(app.getPath).mockReturnValue("/tmp/userData");
    setSyncEmissionSuppressed(false);
    resetAppliedOperationsJournal();
    __clearInFlightOperationsForTests();
    stopSyncRetryQueue();
    clearPendingRetries();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sync-test-"));
    await fs.rm("/tmp/userData/sync", { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await stopSyncWatcher();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("reports status as stopped when unconfigured", () => {
    const status = getSyncStatus();
    expect(status.mainWatcher).toBe("stopped");
    expect(status.configured).toBe(false);
    expect(status.rendererSessionAttached).toBe(false);
    expect(status.authenticated).toBe(false);
  });

  it("sets the sync folder and creates .vfbackup structure", async () => {
    const result = await setSyncFolder(tmpDir);
    expect(result.ok).toBe(true);
    const stat = await fs.stat(`${tmpDir}/.vfbackup/blobs`);
    expect(stat.isDirectory()).toBe(true);
  });

  it("rejects a symlinked sync root", async () => {
    const realRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-real-"));
    const linkedRoot = `${realRoot}-link`;
    await fs.symlink(realRoot, linkedRoot, "dir");
    try {
      await expect(setSyncFolder(linkedRoot)).resolves.toMatchObject({
        ok: false,
        error: expect.stringMatching(/symbolic link/i),
      });
    } finally {
      await fs.rm(linkedRoot, { force: true });
      await fs.rm(realRoot, { recursive: true, force: true });
    }
  });

  it("rejects symlinked sync custody directories", async () => {
    const external = await fs.mkdtemp(path.join(os.tmpdir(), "sync-external-"));
    await fs.mkdir(path.join(tmpDir, ".vfbackup"), { recursive: true });
    await fs.symlink(external, path.join(tmpDir, ".vfbackup", "blobs"), "dir");
    try {
      await expect(setSyncFolder(tmpDir)).resolves.toMatchObject({
        ok: false,
        error: expect.stringMatching(/symbolic link/i),
      });
    } finally {
      await fs.rm(external, { recursive: true, force: true });
    }
  });

  it("starts the watcher and updates status", async () => {
    await setSyncFolder(tmpDir);
    const startResult = await startSyncWatcher("password");
    expect(startResult.ok).toBe(true);
    const status = getSyncStatus();
    expect(status.mainWatcher).toBe("running");
    expect(status.configured).toBe(true);
    expect(status.authenticated).toBe(true);
  });

  it("refuses to start without a configured folder", async () => {
    // Clear any folder left over from earlier tests in this module.
    await setSyncFolder("");
    await stopSyncWatcher();

    const startResult = await startSyncWatcher("password");
    expect(startResult.ok).toBe(false);
    expect(startResult.error).toMatch(/Sync folder not configured/);
    const status = getSyncStatus();
    expect(status.mainWatcher).toBe("error");
    expect(status.authenticated).toBe(false);
    expect(status.degradedReason).toMatch(/Sync folder not configured/);
    expect(isSyncRetryQueueRunning()).toBe(false);
  });

  it("transitions to error and clears the password when folder setup fails", async () => {
    // Seed a currentSyncPath so startSyncWatcher attempts to set the folder,
    // then force mkdir to fail to simulate a permission/write error.
    await setSyncFolder(tmpDir);
    await stopSyncWatcher();
    const mkdirSpy = vi.spyOn(fs, "mkdir").mockRejectedValueOnce(new Error("permission denied"));

    const startResult = await startSyncWatcher("password");
    expect(startResult.ok).toBe(false);
    expect(startResult.error).toMatch(/permission denied/);
    const status = getSyncStatus();
    expect(status.mainWatcher).toBe("error");
    expect(status.authenticated).toBe(false);
    expect(status.degradedReason).toMatch(/permission denied/);
    expect(isSyncRetryQueueRunning()).toBe(false);
    mkdirSpy.mockRestore();
  });

  it("does not persist a new sync path when authenticated setup fails", async () => {
    const { setSyncPath } = await import("./syncConfig");
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");
    vi.mocked(ensureSyncIdentity).mockRejectedValueOnce(new Error("identity setup failed"));
    vi.mocked(setSyncPath).mockClear();
    const replacement = await fs.mkdtemp(path.join(os.tmpdir(), "sync-replacement-"));
    try {
      const result = await setSyncFolder(replacement);
      expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/identity setup failed/) });
      expect(setSyncPath).not.toHaveBeenCalledWith(replacement);
      expect(getSyncStatus().configured).toBe(true);
    } finally {
      await fs.rm(replacement, { recursive: true, force: true });
    }
  });

  it("queues an incomplete remote manifest for retry instead of treating it as handled", async () => {
    await initSyncFolderWatcher({
      isDestroyed: () => false,
      webContents: { send: sendMock },
    } as unknown as import("electron").BrowserWindow);
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password", "default");
    const filePath = path.join(tmpDir, ".vfbackup", "blobs", "partial.json");
    await fs.writeFile(filePath, "{\"version\":2");

    await expect(handleRemoteChange(filePath, 0)).resolves.toBe(false);
    const retries = Array.from(getPendingRetries().values());
    expect(retries).toHaveLength(1);
    expect(retries[0]).toMatchObject({ filePath, attempts: 1 });
  });

  it("tracks renderer session attachment", async () => {
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");
    setRendererSessionAttached(true);
    expect(getSyncStatus().rendererSessionAttached).toBe(true);
    setRendererSessionAttached(false);
    expect(getSyncStatus().rendererSessionAttached).toBe(false);
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
    expect(result2).toEqual({ ok: true });
    const blobs2 = await fs.readdir(`${tmpDir}/.vfbackup/blobs`);
    expect(blobs2.length).toBe(1);
  });

  it("accepts a tombstone packet whose envelope id equals the tombstone id", async () => {
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");

    const tombstone = createTombstone("conversations", "conv-1");
    const result = await writePacket("tombstones", tombstone.id, JSON.stringify(tombstone));
    expect(result).toEqual({ ok: true });
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

  it("serializes a record and tombstone for the same logical object through acknowledgment", async () => {
    const { BrowserWindow } = await import("electron");
    await initSyncFolderWatcher(new BrowserWindow());
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");

    const recordOperationId = "1".repeat(64);
    const tombstoneOperationId = "2".repeat(64);
    const recordPath = await writeRemotePacket("record.json", {
      storeName: "conversations",
      id: "conv-1",
      operationId: recordOperationId,
      data: { id: "conv-1", title: "Remote" },
    });
    const tombstone = createTombstone("conversations", "conv-1", "device-2");
    const tombstonePath = await writeRemotePacket("tombstone.json", {
      storeName: "tombstones",
      id: tombstone.id,
      operationId: tombstoneOperationId,
      data: tombstone as unknown as Record<string, unknown>,
    });

    const recordApply = handleRemoteChange(recordPath);
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    const tombstoneApply = handleRemoteChange(tombstonePath);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sendMock).toHaveBeenCalledTimes(1);

    await acknowledgeOperation(recordOperationId, true);
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));
    expect(sendMock.mock.calls[1][1]).toMatchObject({
      storeName: "tombstones",
      operationId: tombstoneOperationId,
    });
    await acknowledgeOperation(tombstoneOperationId, true);
    await Promise.all([recordApply, tombstoneApply]);
  });

  it("rejects a decrypted packet from another sync set before renderer delivery", async () => {
    const { BrowserWindow } = await import("electron");
    await initSyncFolderWatcher(new BrowserWindow());
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");
    const packetPath = await writeRemotePacket("foreign-set.json", {
      storeName: "conversations",
      id: "conv-foreign",
      operationId: "3".repeat(64),
      data: { id: "conv-foreign" },
      syncSetId: "33333333-3333-4333-8333-333333333333",
    });

    await expect(handleRemoteChange(packetPath)).resolves.toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      "syncFolderWatcher",
      expect.stringMatching(/outside the active sync set/),
    );
  });

  it("refuses a symlinked watched packet before reading or renderer delivery", async () => {
    const { BrowserWindow } = await import("electron");
    await initSyncFolderWatcher(new BrowserWindow());
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password");
    const packetPath = await writeRemotePacket("real-packet.json", {
      storeName: "conversations",
      id: "conv-symlink",
      operationId: "9".repeat(64),
      data: { id: "conv-symlink" },
    });
    const linkedPath = path.join(tmpDir, ".vfbackup", "blobs", "linked-packet.json");
    await fs.symlink(packetPath, linkedPath);

    await expect(handleRemoteChange(linkedPath)).resolves.toBe(true);

    expect(sendMock).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      "syncFolderWatcher",
      expect.stringMatching(/symbolic link/i),
    );
  });

  it("rejects a decrypted packet from another profile before renderer delivery", async () => {
    const { BrowserWindow } = await import("electron");
    await initSyncFolderWatcher(new BrowserWindow());
    await setSyncFolder(tmpDir);
    await startSyncWatcher("password", "default");
    const packetPath = await writeRemotePacket("foreign-profile.json", {
      storeName: "conversations",
      id: "conv-work",
      operationId: "4".repeat(64),
      data: { id: "conv-work" },
      profileId: "work",
    });

    await expect(handleRemoteChange(packetPath)).resolves.toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      "syncFolderWatcher",
      expect.stringMatching(/outside the active profile/),
    );
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

  it("does not exceed MAX_JOURNAL_ENTRIES when every recent operation is a tombstone", async () => {
    for (let i = 0; i < MAX_JOURNAL_ENTRIES + 100; i++) {
      await recordAppliedOperation(`tombstone-op-${i}`, "tombstones", "applied", undefined, false);
    }
    await flushAppliedOperationsJournal();

    const journal = await loadAppliedOperationsJournal();
    expect(journal.operations).toHaveLength(MAX_JOURNAL_ENTRIES);
    expect(journal.operations[0].operationId).toBe("tombstone-op-100");
    expect(journal.operations.at(-1)?.operationId).toBe(`tombstone-op-${MAX_JOURNAL_ENTRIES + 99}`);
  });
});
