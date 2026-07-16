// VERIFY-118 and VERIFY-123 regression guards
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const startSyncWatcher = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const getProfileSessionId = vi.hoisted(() => vi.fn(() => "work"));
const persistReplaceImportRecovery = vi.hoisted(() => vi.fn(async () => ({ id: "recovery-1", createdAt: "2026-07-15T00:00:00.000Z" })));
const getLatestReplaceImportRecovery = vi.hoisted(() => vi.fn(async () => null));
const loadReplaceImportRecovery = vi.hoisted(() => vi.fn(async () => ({ version: 2, exportedAt: "2026-07-15T00:00:00.000Z", salt: "salt", iv: "iv", ciphertext: "ciphertext" })));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/user-data") },
  ipcMain: { handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)) },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
}));
vi.mock("../../services/syncFolderWatcher", () => ({
  setSyncFolder: vi.fn(), getSyncFolder: vi.fn(), getSyncStatus: vi.fn(() => ({})),
  setSyncEmissionSuppressed: vi.fn(), setRendererSessionAttached: vi.fn(), startSyncWatcher,
  stopSyncWatcher: vi.fn(), pauseSyncWatcher: vi.fn(), acknowledgeOperation: vi.fn(),
}));
vi.mock("../../services/profileSession", () => ({ getProfileSessionId }));
vi.mock("../../services/replaceImportRecovery", () => ({
  persistReplaceImportRecovery,
  getLatestReplaceImportRecovery,
  loadReplaceImportRecovery,
}));
vi.mock("../../services/remoteApplyAuthority", () => ({ validateMutationAuthority: vi.fn() }));
vi.mock("../../../src/shared/redaction", () => ({ redactErrorMessage: String }));

import { registerSyncHandlers } from "./syncHandlers";

describe("syncHandlers profile authority", () => {
  it("ignores a forged renderer profile when starting sync", async () => {
    registerSyncHandlers();
    const sender = {} as Electron.WebContents;
    await handlers.get("sync:startSync")!({ sender }, { password: "passphrase", profileId: "forged" });

    expect(getProfileSessionId).toHaveBeenCalledWith(sender);
    expect(startSyncWatcher).toHaveBeenCalledWith("passphrase", "work", false);
  });

  it("derives replace-recovery profile authority from the sender", async () => {
    registerSyncHandlers();
    const sender = {} as Electron.WebContents;
    const manifest = { version: 2, exportedAt: "2026-07-15T00:00:00.000Z", salt: "salt", iv: "iv", ciphertext: "ciphertext" };

    await handlers.get("sync:createReplaceImportRecovery")!(
      { sender },
      { manifest, password: "passphrase", profileId: "forged" },
    );
    await handlers.get("sync:getLatestReplaceImportRecovery")!({ sender });
    await handlers.get("sync:loadReplaceImportRecovery")!(
      { sender },
      { id: "recovery-1", password: "passphrase", profileId: "forged" },
    );

    expect(persistReplaceImportRecovery).toHaveBeenCalledWith("/user-data", "work", manifest, "passphrase");
    expect(getLatestReplaceImportRecovery).toHaveBeenCalledWith("/user-data", "work");
    expect(loadReplaceImportRecovery).toHaveBeenCalledWith("/user-data", "work", "recovery-1", "passphrase");
  });
});
