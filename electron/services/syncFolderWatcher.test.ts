// VERIFY-091 regression guard: sync folder watcher validates, encrypts, and suppresses local emission.
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setSyncFolder,
  getSyncStatus,
  writePacket,
  setSyncEmissionSuppressed,
  isSyncEmissionSuppressed,
  startSyncWatcher,
  stopSyncWatcher,
} from "./syncFolderWatcher";
import { promises as fs } from "fs";

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

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/userData"),
  },
}));

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
    vi.resetAllMocks();
    setSyncEmissionSuppressed(false);
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
});
