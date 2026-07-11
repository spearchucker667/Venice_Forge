import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// @ts-expect-error — fake-indexeddb ESM exports lack proper typings
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import { deleteSyncableRecord } from "./syncDeleteCoordinator";
import StorageService from "./storageService";
import { TombstoneService } from "./tombstoneService";
import { importDecryptedPacket } from "./backupImportService";
import * as desktopBridge from "./desktopBridge";
import type { SyncStoreName } from "../types/sync";

vi.mock("./desktopBridge", () => ({
  isElectron: vi.fn().mockReturnValue(true),
  desktopSync: {
    getStatus: vi.fn().mockResolvedValue({ ok: true, status: "running" }),
    writePacket: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

function createObjectPacket(storeName: SyncStoreName, id: string, record: Record<string, unknown>) {
  return { storeName, id, recordJson: JSON.stringify(record) };
}

describe("syncDeleteCoordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists local tombstone before deleting target and emits once", async () => {
    const spyDelete = vi.spyOn(StorageService, "deleteItem").mockResolvedValue(true);
    const spySave = vi.spyOn(TombstoneService, "saveTombstone").mockResolvedValue(undefined);
    const spyWritePacket = vi.mocked(desktopBridge.desktopSync.writePacket);

    const result = await deleteSyncableRecord("conversations", "conv-1");

    expect(result.ok).toBe(true);
    expect(spySave).toHaveBeenCalledBefore(spyDelete);
    expect(spySave.mock.calls[0][0].recordId).toBe("conv-1");
    expect(spyDelete).toHaveBeenCalledWith("conversations", "conv-1", { bypassSyncEcho: true });
    expect(spyWritePacket).toHaveBeenCalledWith({
      storeName: "tombstones",
      id: "conversations:conv-1",
      recordJson: expect.stringContaining('"recordId":"conv-1"'),
    });

    spyDelete.mockRestore();
    spySave.mockRestore();
  });
});

describe("syncDeleteCoordinator resurrection guard", () => {
  beforeEach(() => {
    global.indexedDB = new FDBFactory();
    StorageService.db = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a stale object packet cannot resurrect a locally deleted record", async () => {
    await StorageService.saveItem("conversations", { id: "conv-1", title: "x", updatedAt: 1 } as Record<string, unknown>);
    await deleteSyncableRecord("conversations", "conv-1");
    const stalePacket = createObjectPacket("conversations", "conv-1", { id: "conv-1", title: "x", updatedAt: 1 });
    const result = await importDecryptedPacket(stalePacket.storeName, stalePacket.id, stalePacket.recordJson);
    // A newer local tombstone rejects the stale packet so the sync ack reports the record is gone.
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Local tombstone is newer/i);
    expect(await StorageService.getItem("conversations", "conv-1")).toBeNull();
  });
});
