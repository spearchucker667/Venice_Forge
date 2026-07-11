// VERIFY-090 regression guard: main-process sync bridge emits packets and tombstones.
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitSyncPacket, emitSyncTombstone, SYNC_STORE_NAME_MAP } from "./syncBridge";
import * as syncFolderWatcher from "./syncFolderWatcher";

vi.mock("./syncFolderWatcher", () => ({
  getSyncStatus: vi.fn().mockReturnValue({
    configured: true,
    mainWatcher: "running",
    rendererSessionAttached: true,
    authenticated: true,
  }),
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
    mockGetSyncStatus.mockReturnValue({
      configured: true,
      mainWatcher: "running",
      rendererSessionAttached: true,
      authenticated: true,
    });
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

  it("sanitizes secrets and machine-local paths before main-process emission", async () => {
    await emitSyncPacket("conversations", "conv-1", {
      id: "conv-1",
      apiKey: "venice_secret_value",
      attachment: "/Users/alice/private/chat.txt",
      nested: { authorization: "Bearer secret", title: "Safe" },
    });

    const recordJson = mockWritePacket.mock.calls[0][2];
    expect(recordJson).not.toContain("venice_secret_value");
    expect(recordJson).not.toContain("Bearer secret");
    expect(recordJson).not.toContain("/Users/alice");
    expect(JSON.parse(recordJson)).toEqual({
      id: "conv-1",
      attachment: "[redacted-local-path]",
      nested: { title: "Safe" },
    });
  });

  it("does not emit when sync is stopped", async () => {
    mockGetSyncStatus.mockReturnValue({
      configured: true,
      mainWatcher: "stopped",
      rendererSessionAttached: false,
      authenticated: false,
    });
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

  it("suppresses sync packets for non-local-user origins", async () => {
    await emitSyncPacket("conversations", "conv-1", { id: "conv-1" }, "remote-sync");
    await emitSyncPacket("conversations", "conv-1", { id: "conv-1" }, "manual-import");
    await emitSyncPacket("conversations", "conv-1", { id: "conv-1" }, "migration");
    expect(mockWritePacket).not.toHaveBeenCalled();
  });

  it("emits sync packets for local-user origin", async () => {
    const record = { id: "conv-1", title: "Hello" };
    await emitSyncPacket("conversations", "conv-1", record, "local-user");
    expect(mockWritePacket).toHaveBeenCalledWith("conversations", "conv-1", JSON.stringify(record));
  });

  it("emits sync packets when origin is omitted (back-compat)", async () => {
    const record = { id: "conv-1", title: "Hello" };
    await emitSyncPacket("conversations", "conv-1", record);
    expect(mockWritePacket).toHaveBeenCalledWith("conversations", "conv-1", JSON.stringify(record));
  });

  it("suppresses tombstones for non-local-user origins", async () => {
    await emitSyncTombstone("conversations", "conv-1", "remote-sync");
    await emitSyncTombstone("conversations", "conv-1", "manual-import");
    await emitSyncTombstone("conversations", "conv-1", "migration");
    expect(mockWritePacket).not.toHaveBeenCalled();
  });

  it("emits tombstones for local-user origin", async () => {
    await emitSyncTombstone("conversations", "conv-1", "local-user");
    expect(mockWritePacket).toHaveBeenCalledWith(
      "tombstones",
      "conversations:conv-1",
      expect.stringContaining('"storeName":"conversations"')
    );
  });

  it("emits tombstones when origin is omitted (back-compat)", async () => {
    await emitSyncTombstone("conversations", "conv-1");
    expect(mockWritePacket).toHaveBeenCalledWith(
      "tombstones",
      "conversations:conv-1",
      expect.stringContaining('"storeName":"conversations"')
    );
  });
});
