// VERIFY-087 regression guard: manual encrypted backup export round-trip.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEncryptedBackup, downloadEncryptedBackup } from "./backupExportService";
import * as desktopBridge from "./desktopBridge";
import StorageService from "./storageService";

vi.mock("./desktopBridge", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./desktopBridge")>();
  return {
    ...mod,
    isElectron: vi.fn(),
    desktopSync: {
      beginBackupExport: vi.fn(),
      encryptBackup: vi.fn(),
      decryptBackup: vi.fn(),
    },
    desktopFiles: {
      exportJson: vi.fn(),
    },
  };
});

vi.mock("./storageService", () => ({
  default: {
    getItems: vi.fn(),
  },
}));

const mockIsElectron = vi.mocked(desktopBridge.isElectron);
const mockBeginBackupExport = vi.mocked(desktopBridge.desktopSync.beginBackupExport);
const mockEncryptBackup = vi.mocked(desktopBridge.desktopSync.encryptBackup);
const mockExportJson = vi.mocked(desktopBridge.desktopFiles.exportJson);
const mockGetItems = vi.mocked(StorageService.getItems);

describe("backupExportService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsElectron.mockReturnValue(false);
    mockGetItems.mockResolvedValue([]);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a web-mode encrypted backup using Web Crypto", async () => {
    const password = "test-password";
    // Web mode uses crypto.subtle; stub it.
    vi.stubGlobal("crypto", {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = i;
        return arr;
      },
      subtle: {
        importKey: vi.fn().mockResolvedValue("key-material"),
        deriveKey: vi.fn().mockResolvedValue({} as CryptoKey),
        digest: vi.fn().mockImplementation(async (_algorithm, input: Uint8Array) => {
          const { createHash } = await import("node:crypto");
          return createHash("sha256").update(input).digest().buffer;
        }),
        encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      },
    });

    const manifest = await createEncryptedBackup(password);
    expect(manifest.version).toBe(3);
    expect(manifest.metadata).toMatchObject({
      format: "venice-forge-manual-backup",
      formatVersion: 3,
      appVersion: "2.1.2",
      source: { runtime: "web" },
      crypto: { algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", keyVersion: 1 },
    });
    expect(manifest.salt).toBeTruthy();
    expect(manifest.iv).toBeTruthy();
    expect(manifest.ciphertext).toBeTruthy();
  });

  it("delegates encryption to the desktop bridge in Electron mode", async () => {
    mockIsElectron.mockReturnValue(true);
    localStorage.setItem("venice-active-profile-id", "work");
    mockBeginBackupExport.mockResolvedValue({ ok: true, profileId: "work", deviceId: "device-work", token: "lease-token" });
    mockEncryptBackup.mockResolvedValue({
      ok: true,
      data: { salt: "salt", iv: "iv", ciphertext: "cipher" },
    });

    const manifest = await createEncryptedBackup("password");
    expect(mockBeginBackupExport).toHaveBeenCalledTimes(1);
    expect(mockEncryptBackup).toHaveBeenCalledWith(expect.any(String), "password", "lease-token");
    const payload = JSON.parse(mockEncryptBackup.mock.calls[0][0]);
    expect(payload._veniceForgeBackup).toEqual({
      profileId: "work",
      manifestMetadata: manifest.metadata,
    });
    expect(manifest).toEqual({
      version: 3,
      exportedAt: expect.any(String),
      metadata: expect.objectContaining({
        source: expect.objectContaining({ runtime: "electron", deviceRef: "device-work" }),
        crypto: { algorithm: "XChaCha20-Poly1305", kdf: "Argon2id", keyVersion: 1 },
      }),
      salt: "salt",
      iv: "iv",
      ciphertext: "cipher",
    });
  });

  it("throws when desktop encryption fails", async () => {
    mockIsElectron.mockReturnValue(true);
    mockBeginBackupExport.mockResolvedValue({ ok: true, profileId: "default", deviceId: "device-default", token: "lease-token" });
    mockEncryptBackup.mockResolvedValue({ ok: false, error: "Encryption failed" });

    await expect(createEncryptedBackup("password")).rejects.toThrow("Encryption failed");
  });

  it("rejects export when the renderer profile does not match the main-process lease", async () => {
    mockIsElectron.mockReturnValue(true);
    localStorage.setItem("venice-active-profile-id", "work");
    mockBeginBackupExport.mockResolvedValue({ ok: true, profileId: "default", deviceId: "device-default", token: "lease-token" });

    await expect(createEncryptedBackup("password")).rejects.toThrow(/profile session changed/i);
    expect(mockEncryptBackup).not.toHaveBeenCalled();
  });

  it("downloads a backup via desktop file dialog", async () => {
    mockIsElectron.mockReturnValue(true);
    mockExportJson.mockResolvedValue(true);

    const manifest = {
      version: 2,
      exportedAt: new Date().toISOString(),
      salt: "salt",
      iv: "iv",
      ciphertext: "cipher",
    };
    const ok = await downloadEncryptedBackup(manifest);

    expect(ok).toBe(true);
    expect(mockExportJson).toHaveBeenCalledWith(manifest, expect.stringMatching(/\.vfbackup$/));
  });
});
