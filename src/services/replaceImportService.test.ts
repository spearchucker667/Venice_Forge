// VERIFY-123 regression guard: replace import stages first, persists a verified
// recovery artifact, clears both storage runtimes, and rolls back on apply failure.

import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareBackupImport = vi.hoisted(() => vi.fn());
const applyPreparedBackup = vi.hoisted(() => vi.fn());
const fetchStoreRecords = vi.hoisted(() => vi.fn());
const deleteStoreRecord = vi.hoisted(() => vi.fn());
const createEncryptedBackup = vi.hoisted(() => vi.fn());
const clearStore = vi.hoisted(() => vi.fn());
const isElectron = vi.hoisted(() => vi.fn(() => true));
const createRecovery = vi.hoisted(() => vi.fn());
const loadRecovery = vi.hoisted(() => vi.fn());
const getLatestRecovery = vi.hoisted(() => vi.fn());

vi.mock("./backupImportService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./backupImportService")>();
  return {
    ...actual,
    prepareBackupImport,
    applyPreparedBackup,
    fetchStoreRecords,
    deleteStoreRecord,
  };
});
vi.mock("./backupExportService", () => ({ createEncryptedBackup }));
vi.mock("./storageService", () => ({ default: { clearStore } }));
vi.mock("./desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./desktopBridge")>();
  return {
    ...actual,
    isElectron,
    desktopSync: {
      createReplaceImportRecovery: createRecovery,
      loadReplaceImportRecovery: loadRecovery,
      getLatestReplaceImportRecovery: getLatestRecovery,
    },
  };
});

import {
  ReplaceImportError,
  clearCurrentProfileForReplace,
  replaceBackupWithRecovery,
} from "./replaceImportService";

const incomingManifest = { version: 2, exportedAt: "2026-07-15T00:00:00.000Z", salt: "in", iv: "in", ciphertext: "in" };
const recoveryManifest = { version: 2, exportedAt: "2026-07-15T00:01:00.000Z", salt: "recovery", iv: "recovery", ciphertext: "recovery" };
const incomingPrepared = { data: { conversations: [{ id: "incoming" }] }, plan: { totalRecords: 1, stores: [] }, skippedRecords: 0 };
const recoveryPrepared = { data: { conversations: [{ id: "original" }] }, plan: { totalRecords: 1, stores: [] }, skippedRecords: 0 };

describe("replaceImportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isElectron.mockReturnValue(true);
    prepareBackupImport.mockImplementation(async (manifest) => manifest === incomingManifest ? incomingPrepared : recoveryPrepared);
    createEncryptedBackup.mockResolvedValue(recoveryManifest);
    createRecovery.mockResolvedValue({ ok: true, recovery: { id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-07-15T00:01:00.000Z" } });
    fetchStoreRecords.mockResolvedValue([]);
    deleteStoreRecord.mockResolvedValue(undefined);
    clearStore.mockResolvedValue(true);
    applyPreparedBackup.mockResolvedValue({ recordsImported: 1, recordsSkipped: 0, tombstonesApplied: 0 });
  });

  it("stages incoming data before creating recovery or clearing stores", async () => {
    prepareBackupImport.mockRejectedValueOnce(new Error("malformed incoming backup"));

    await expect(replaceBackupWithRecovery(incomingManifest, "password"))
      .rejects.toThrow(/malformed incoming/i);
    expect(createEncryptedBackup).not.toHaveBeenCalled();
    expect(clearStore).not.toHaveBeenCalled();
  });

  it("does not clear data when durable recovery persistence fails", async () => {
    createRecovery.mockResolvedValueOnce({ ok: false, error: "disk full" });

    await expect(replaceBackupWithRecovery(incomingManifest, "password"))
      .rejects.toThrow(/disk full/i);
    expect(clearStore).not.toHaveBeenCalled();
  });

  it("automatically restores the verified recovery payload when apply fails", async () => {
    applyPreparedBackup
      .mockRejectedValueOnce(new Error("incoming apply failed"))
      .mockResolvedValueOnce({ recordsImported: 1, recordsSkipped: 0, tombstonesApplied: 0 });

    const error = await replaceBackupWithRecovery(incomingManifest, "password").catch((cause) => cause);

    expect(error).toBeInstanceOf(ReplaceImportError);
    expect(error).toMatchObject({ rolledBack: true, recoveryId: "11111111-1111-4111-8111-111111111111" });
    expect(applyPreparedBackup).toHaveBeenNthCalledWith(1, incomingPrepared);
    expect(applyPreparedBackup).toHaveBeenNthCalledWith(2, recoveryPrepared);
    expect(clearStore.mock.calls.length).toBeGreaterThan(1);
  });

  it("clears main-managed records with manual-import authority and skips diagnostics", async () => {
    fetchStoreRecords.mockImplementation(async (storeName) => storeName === "conversations" ? [{ id: "conversation-1" }] : []);

    await clearCurrentProfileForReplace();

    expect(deleteStoreRecord).toHaveBeenCalledWith("conversations", "conversation-1", "manual-import");
    expect(clearStore).not.toHaveBeenCalledWith("diagnostics");
    expect(clearStore).toHaveBeenCalledWith("images");
  });

  it("refuses destructive replace in browser mode", async () => {
    isElectron.mockReturnValue(false);

    await expect(replaceBackupWithRecovery(incomingManifest, "password"))
      .rejects.toThrow(/desktop app/i);
    expect(prepareBackupImport).not.toHaveBeenCalled();
  });
});
