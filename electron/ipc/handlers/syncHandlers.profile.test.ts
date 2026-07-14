// VERIFY-118 regression guard
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const startSyncWatcher = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const getProfileSessionId = vi.hoisted(() => vi.fn(() => "work"));

vi.mock("electron", () => ({
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
vi.mock("../../services/remoteApplyAuthority", () => ({ validateMutationAuthority: vi.fn() }));
vi.mock("../../../src/shared/redaction", () => ({ redactErrorMessage: String }));

import { registerSyncHandlers } from "./syncHandlers";

describe("syncHandlers profile authority", () => {
  it("ignores a forged renderer profile when starting sync", async () => {
    registerSyncHandlers();
    const sender = {} as Electron.WebContents;
    await handlers.get("sync:startSync")!({ sender }, { password: "passphrase", profileId: "forged" });

    expect(getProfileSessionId).toHaveBeenCalledWith(sender);
    expect(startSyncWatcher).toHaveBeenCalledWith("passphrase", "work");
  });
});
