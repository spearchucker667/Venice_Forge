import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { importEncryptedBackup, saveStoreRecord, deleteStoreRecord } from "./backupImportService";
import { createEncryptedBackup } from "./backupExportService";
import StorageService from "./storageService";
import * as desktopBridge from "./desktopBridge";
import { TombstoneService } from "./tombstoneService";

describe("Backup Import Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    vi.spyOn(StorageService, "getItem").mockResolvedValue(null);
    vi.spyOn(StorageService, "getItems").mockResolvedValue([]);
    vi.spyOn(StorageService, "saveItem").mockResolvedValue({} as any);
    vi.spyOn(StorageService, "deleteItem").mockResolvedValue(true);
    
    vi.spyOn(TombstoneService, "recordTombstone").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully import a valid backup in Web mode", async () => {
    vi.spyOn(desktopBridge, "isElectron").mockReturnValue(false);

    // Provide some dummy initial data for export to pick up
    vi.spyOn(StorageService, "getItems").mockImplementation(async (storeName: string) => {
      if (storeName === "images") {
        return [{ id: "img1", updatedAt: 1000 }];
      }
      return [];
    });

    const password = "securepassword";
    const manifest = await createEncryptedBackup(password);

    // Now mock getItems again for the import phase, returning nothing, so img1 should be imported
    vi.spyOn(StorageService, "getItems").mockResolvedValue([]);

    const result = await importEncryptedBackup(manifest, password);

    expect(result.ok).toBe(true);
    expect(result.summary?.recordsImported).toBe(1);
    expect(StorageService.saveItem).toHaveBeenCalledWith("images", { id: "img1", updatedAt: 1000 });
  });

  it("should skip records that have an older updatedAt than local", async () => {
    vi.spyOn(desktopBridge, "isElectron").mockReturnValue(false);

    vi.spyOn(StorageService, "getItems").mockImplementation(async (storeName: string) => {
      if (storeName === "settings") {
        return [{ id: "s1", updatedAt: 1000 }];
      }
      return [];
    });

    const password = "testpassword";
    const manifest = await createEncryptedBackup(password);

    // Local data is newer
    vi.spyOn(StorageService, "getItems").mockImplementation(async (storeName: string) => {
      if (storeName === "settings") {
        return [{ id: "s1", updatedAt: 2000 }]; // 2000 > 1000
      }
      return [];
    });

    const result = await importEncryptedBackup(manifest, password);

    expect(result.ok).toBe(true);
    expect(result.summary?.recordsImported).toBe(0);
    expect(result.summary?.recordsSkipped).toBe(1);
    expect(StorageService.saveItem).not.toHaveBeenCalled();
  });

  it("should correctly handle desktop specific stores", async () => {
    vi.spyOn(desktopBridge, "isElectron").mockReturnValue(true);
    
    vi.spyOn(desktopBridge.desktopChat, "list").mockResolvedValue({
      ok: true,
      conversations: [{ id: "c1", updatedAt: 1000 } as any],
      truncated: false,
      totalScanned: 1
    });
    vi.spyOn(desktopBridge.desktopCharacterCards, "list").mockResolvedValue({ ok: true, cards: [] });
    vi.spyOn(desktopBridge.desktopPersonas, "list").mockResolvedValue({ ok: true, personas: [] });
    vi.spyOn(desktopBridge.desktopLorebooks, "list").mockResolvedValue({ ok: true, lorebooks: [] });
    vi.spyOn(desktopBridge.desktopRpChats, "list").mockResolvedValue({ ok: true, chats: [] });
    vi.spyOn(desktopBridge.desktopRpAssets, "list").mockResolvedValue({ ok: true, assets: [] });
    vi.spyOn(desktopBridge.desktopScenarios, "list").mockResolvedValue({ ok: true, scenarios: [] });

    vi.spyOn(desktopBridge.desktopChat, "save").mockResolvedValue(undefined as any);
    
    // Create backup with c1
    const password = "pass";
    const manifest = await createEncryptedBackup(password);
    
    // Now local data is missing c1 (simulate backup onto new device)
    vi.spyOn(desktopBridge.desktopChat, "list").mockResolvedValue({
      ok: true,
      conversations: [],
      truncated: false,
      totalScanned: 0
    });

    const result = await importEncryptedBackup(manifest, password);
    expect(result.ok).toBe(true);
    expect(desktopBridge.desktopChat.save).toHaveBeenCalled();
  });

  it("should fail decryption with incorrect password", async () => {
    vi.spyOn(desktopBridge, "isElectron").mockReturnValue(false);
    
    const manifest = await createEncryptedBackup("correctpass");
    
    const result = await importEncryptedBackup(manifest, "wrongpass");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Decryption failed/i);
  });
});
