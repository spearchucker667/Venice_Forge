import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TombstoneService } from "./tombstoneService";
import StorageService from "./storageService";
import type { Tombstone } from "../types/sync";

describe("TombstoneService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(StorageService, "saveItem").mockResolvedValue({ id: "mock", timestamp: Date.now() });
    vi.spyOn(StorageService, "deleteItem").mockResolvedValue(true);
    vi.spyOn(StorageService, "getItems").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves an exact tombstone including original deletedAt", async () => {
    vi.restoreAllMocks();
    const tombstone: Tombstone = {
      id: "conversations:conv-1",
      storeName: "conversations",
      recordId: "conv-1",
      deletedAt: 1_000_000,
      deviceId: "device-a",
    };
    await TombstoneService.saveTombstone(tombstone);
    const stored = await StorageService.getItem("tombstones", tombstone.id);
    expect(stored).toEqual(tombstone);
  });

  it("should record a tombstone", async () => {
    await TombstoneService.recordTombstone("chats", "chat-123", "device-a");
    expect(StorageService.saveItem).toHaveBeenCalledWith(
      "tombstones",
      expect.objectContaining({
        id: "chats:chat-123",
        storeName: "chats",
        recordId: "chat-123",
        deviceId: "device-a",
        deletedAt: expect.any(Number),
      }),
      { bypassSyncEcho: true },
    );
  });

  it("should retrieve tombstones", async () => {
    const mockTombstones = [
      { id: "chats:c1", storeName: "chats", recordId: "c1", deletedAt: 123 },
    ];
    vi.spyOn(StorageService, "getItems").mockResolvedValueOnce(mockTombstones);

    const result = await TombstoneService.getTombstones();
    expect(result).toEqual(mockTombstones);
  });

  it("should filter tombstones by store", async () => {
    const mockTombstones = [
      { id: "chats:c1", storeName: "chats", recordId: "c1", deletedAt: 123 },
      { id: "images:i1", storeName: "images", recordId: "i1", deletedAt: 123 },
    ];
    vi.spyOn(StorageService, "getItems").mockResolvedValueOnce(mockTombstones);

    const result = await TombstoneService.getTombstonesForStore("images");
    expect(result).toHaveLength(1);
    expect(result[0].storeName).toBe("images");
  });

  it("should remove a tombstone", async () => {
    await TombstoneService.removeTombstone("chats:c1");
    expect(StorageService.deleteItem).toHaveBeenCalledWith("tombstones", "chats:c1");
  });
});
