import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TombstoneService } from "./tombstoneService";
import StorageService from "./storageService";

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
      })
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
