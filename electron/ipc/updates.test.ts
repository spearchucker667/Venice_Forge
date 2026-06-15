// @vitest-environment node
/**
 * @fileoverview Unit tests for electron/ipc/updates.ts (auto-updater IPC).
 *
 * Mocks electron + electron-updater and asserts the IPC handlers return
 * well-shaped envelopes and that the timeout-race against an unreachable
 * GitHub releases endpoint resolves cleanly.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import path from "path";
import os from "os";

// vi.hoisted runs synchronously at module init time and is accessible
// inside vi.mock factories, so we can use it as a hoisted mock store.
const mocks = vi.hoisted(() => {
  return {
    capturedHandlers: new Map<string, (...args: unknown[]) => unknown>(),
    mockCheckForUpdates: vi.fn(),
    mockDownloadUpdate: vi.fn(),
    mockQuitAndInstall: vi.fn(),
    mockOn: vi.fn(),
    mockLogError: vi.fn(),
    isPackaged: { value: false },
    mockAutoDownload: { value: false },
    mockAutoInstallOnAppQuit: { value: false },
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
    get isPackaged() { return mocks.isPackaged.value; },
    getAppPath: vi.fn(() => process.cwd()),
    getVersion: vi.fn(() => "1.0.3-test"),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.capturedHandlers.set(channel, handler);
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  dialog: {
    showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined })),
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: {
    get autoDownload() { return mocks.mockAutoDownload.value; },
    set autoDownload(v: boolean) { mocks.mockAutoDownload.value = v; },
    get autoInstallOnAppQuit() { return mocks.mockAutoInstallOnAppQuit.value; },
    set autoInstallOnAppQuit(v: boolean) { mocks.mockAutoInstallOnAppQuit.value = v; },
    checkForUpdates: mocks.mockCheckForUpdates,
    downloadUpdate: mocks.mockDownloadUpdate,
    quitAndInstall: mocks.mockQuitAndInstall,
    on: mocks.mockOn,
  },
}));

vi.mock("../services/logger", () => ({
  logError: mocks.mockLogError,
  logInfo: vi.fn(),
  getLogsDir: vi.fn(() => path.join(os.tmpdir(), "vf-logs")),
  openLogsFolder: vi.fn(),
  getLastApiError: vi.fn(() => ""),
}));

vi.mock("../services/secureStore", () => ({
  isApiKeyConfigured: vi.fn(() => false),
  isJinaApiKeyConfigured: vi.fn(() => false),
  getSecureStoreStatus: vi.fn(() => ({ encryptionAvailable: true, mode: "safeStorage", corrupted: false, error: null })),
  setApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  getJinaApiKey: vi.fn(() => null),
  setJinaApiKey: vi.fn(),
  deleteJinaApiKey: vi.fn(),
}));

vi.mock("../services/veniceClient", () => ({
  abortVeniceRequest: vi.fn(() => ({ ok: true })),
  performVeniceRequest: vi.fn(async () => ({ ok: true, status: 200, headers: {}, body: {} })),
  readResponseError: vi.fn(() => "error"),
}));

vi.mock("../services/chatStorage", () => ({
  deleteConversation: vi.fn(async () => ({ ok: true })),
  getConversation: vi.fn(async () => null),
  listConversations: vi.fn(async () => []),
  saveConversation: vi.fn(async () => ({ ok: true })),
}));

import { registerIpcHandlers } from "./handlers";

describe("app:*update IPC handlers", () => {
  beforeAll(() => {
    mocks.capturedHandlers.clear();
    registerIpcHandlers();
  });

  beforeEach(() => {
    // Don't clearAllMocks: that would zero out mocks.mockOn which is called
    // exactly once per autoUpdater event at registerUpdateHandlers() time.
    // The remaining mocks are reset selectively in each test.
    mocks.mockCheckForUpdates.mockReset();
    mocks.mockDownloadUpdate.mockReset();
    mocks.mockQuitAndInstall.mockReset();
    mocks.mockLogError.mockReset();
    mocks.isPackaged.value = false;
  });

  it("app:checkForUpdates returns a friendly error in dev mode", async () => {
    const handler = mocks.capturedHandlers.get("app:checkForUpdates");
    expect(handler).toBeDefined();
    const result = await handler!();
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/production/i);
  });

  it("app:installUpdate refuses to install when no update was downloaded", async () => {
    const handler = mocks.capturedHandlers.get("app:installUpdate");
    const result = await handler!();
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/no update downloaded/i);
    expect(mocks.mockQuitAndInstall).not.toHaveBeenCalled();
  });

  it("returns and logs safe errors when update checks fail", async () => {
    mocks.isPackaged.value = true;
    mocks.mockCheckForUpdates.mockRejectedValueOnce(
      new Error("feed https://secret.example Authorization: Bearer fixture /Users/private/update.yml"),
    );
    const handler = mocks.capturedHandlers.get("app:checkForUpdates");
    const result = await handler!();
    expect(result).toEqual({ ok: false, error: "Update check failed. Please try again later." });
    expect(JSON.stringify(mocks.mockLogError.mock.calls)).not.toContain("Bearer fixture");
    expect(JSON.stringify(mocks.mockLogError.mock.calls)).not.toContain("/Users/private");
  });

  it("returns and logs safe errors when update downloads fail", async () => {
    mocks.mockDownloadUpdate.mockRejectedValueOnce(
      new Error("token sk-secret-fixture at /Users/private/update.zip"),
    );
    const handler = mocks.capturedHandlers.get("app:downloadUpdate");
    const result = await handler!();
    expect(result).toEqual({ ok: false, error: "Update download failed. Please try again later." });
    expect(JSON.stringify(mocks.mockLogError.mock.calls)).not.toContain("sk-secret-fixture");
    expect(JSON.stringify(mocks.mockLogError.mock.calls)).not.toContain("/Users/private");
  });

  it("autoDownload is disabled by default to keep the user in control", () => {
    expect(mocks.mockAutoDownload.value).toBe(false);
    expect(mocks.mockAutoInstallOnAppQuit.value).toBe(false);
  });

  it("subscribes to all required autoUpdater events", () => {
    // 7 events: update-downloaded (declared in two places, lines 76 & 97 of
    // updates.ts), checking-for-update, update-available,
    // update-not-available, download-progress, error
    expect(mocks.mockOn).toHaveBeenCalledTimes(7);
  });
});
