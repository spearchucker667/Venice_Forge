import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createEncryptedBackup,
  deriveBackupKey,
  fetchStoreRecords,
  toBase64,
  BACKUP_SCHEMA_VERSION,
  PBKDF2_ITERATIONS,
  SALT_BYTE_LENGTH,
  IV_BYTE_LENGTH
} from "./backupExportService";
import StorageService from "./storageService";
import * as desktopBridge from "./desktopBridge";

describe("Backup Export Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(StorageService, "getItems").mockResolvedValue([{ id: "mock", value: "data" }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should convert to base64 correctly", () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const b64 = toBase64(arr);
    // btoa("Hello") = "SGVsbG8="
    expect(b64).toBe("SGVsbG8=");
  });

  it("should derive a backup key using PBKDF2", async () => {
    const salt = new Uint8Array(16);
    salt.fill(1); // dummy salt
    const key = await deriveBackupKey("password123", salt);
    expect(key.algorithm.name).toBe("AES-GCM");
    // The key should be extractable=false by default, but let's just ensure we got a CryptoKey
    expect(key).toBeInstanceOf(CryptoKey);
  });

  it("should fetch records from StorageService in Web mode", async () => {
    vi.spyOn(desktopBridge, "isElectron").mockReturnValue(false);
    const records = await fetchStoreRecords("images");
    expect(records).toEqual([{ id: "mock", value: "data" }]);
    expect(StorageService.getItems).toHaveBeenCalledWith("images");
  });

  it("should fetch records via IPC in Desktop mode for dual stores", async () => {
    vi.spyOn(desktopBridge, "isElectron").mockReturnValue(true);
    vi.spyOn(desktopBridge.desktopChat, "list").mockResolvedValue({
      ok: true,
      conversations: [{ id: "c1", title: "Test" } as any],
      truncated: false,
      totalScanned: 1
    });

    const records = await fetchStoreRecords("conversations");
    expect(records).toEqual([{ id: "c1", title: "Test" }]);
    expect(desktopBridge.desktopChat.list).toHaveBeenCalled();
  });

  it("should create an encrypted backup manifest", async () => {
    vi.spyOn(desktopBridge, "isElectron").mockReturnValue(false);
    
    // We expect the resulting object to contain standard fields
    const manifest = await createEncryptedBackup("mypassword");

    expect(manifest.version).toBe(BACKUP_SCHEMA_VERSION);
    expect(typeof manifest.exportedAt).toBe("string");
    expect(typeof manifest.salt).toBe("string");
    expect(typeof manifest.iv).toBe("string");
    expect(typeof manifest.ciphertext).toBe("string");

    // Decoding base64 salt and iv to check lengths
    const decodedSalt = atob(manifest.salt);
    const decodedIv = atob(manifest.iv);
    expect(decodedSalt.length).toBe(SALT_BYTE_LENGTH);
    expect(decodedIv.length).toBe(IV_BYTE_LENGTH);
  });
});
