// VERIFY-090 regression guard: main-process sync bridge emits packets and tombstones.
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitSyncPacket, emitSyncTombstone, SYNC_STORE_NAME_MAP } from "./syncBridge";
import * as syncFolderWatcher from "./syncFolderWatcher";

vi.mock("./syncFolderWatcher", () => ({
  getSyncStatus: vi.fn().mockReturnValue({ status: "running", configured: true }),
  writePacket: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("./logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const mockWritePacket = vi.mocked(syncFolderWatcher.writePacket);
const mockGetSyncStatus = vi.mocked(syncFolderWatcher.getSyncStatus);

describe("syncBridge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSyncStatus.mockReturnValue({ status: "running", configured: true });
  });

  it("maps IPC store names to portable sync store names", () => {
    expect(SYNC_STORE_NAME_MAP["character_cards"]).toBe("character_cards");
    expect(SYNC_STORE_NAME_MAP["rpScenarios"]).toBe("rpScenarios");
  });

  it("emits a sync packet when sync is running", async () => {
    const record = { id: "conv-1", title: "Hello" };
    await emitSyncPacket("conversations", "conv-1", record);
    expect(mockWritePacket).toHaveBeenCalledWith("conversations", "conv-1", JSON.stringify(record));
  });

  it("does not emit when sync is stopped", async () => {
    mockGetSyncStatus.mockReturnValue({ status: "stopped", configured: true });
    await emitSyncPacket("conversations", "conv-1", { id: "conv-1" });
    expect(mockWritePacket).not.toHaveBeenCalled();
  });

  it("emits a tombstone packet for deletions", async () => {
    await emitSyncTombstone("conversations", "conv-1");
    expect(mockWritePacket).toHaveBeenCalledWith(
      "tombstones",
      "conversations:conv-1",
      expect.stringContaining('"storeName":"conversations"')
    );
  });

  it("swallows write errors without throwing", async () => {
    mockWritePacket.mockResolvedValue({ ok: false, error: "disk full" });
    await expect(emitSyncPacket("conversations", "conv-1", { id: "conv-1" })).resolves.toBeUndefined();
  });

  it("ignores non-syncable stores", async () => {
    await emitSyncPacket("diagnostics", "diag-1", { id: "diag-1" });
    await emitSyncTombstone("diagnostics", "diag-1");
    expect(mockWritePacket).not.toHaveBeenCalled();
  });
});
