// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue("/tmp"),
    getVersion: vi.fn().mockReturnValue("1.0.0"),
    on: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  }
}));

vi.mock("electron-updater", () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: vi.fn(),
  }
}));

import { ipcMain } from "electron";
import { registerIpcHandlers } from "./index";
import { clearRegisteredChannelsForTesting } from "./common";

const FORBIDDEN_PRIVILEGED_CHANNELS = [
  "credential:set",
  "credential:get",
  "credential:delete",
  "documentAgent:workspace:proposeChangeset",
  "documentAgent:workspace:proposeMove",
  "documentAgent:workspace:proposeTrash",
] as const;

describe("IPC Handler Registration", () => {
  beforeEach(() => {
    clearRegisteredChannelsForTesting();
    vi.mocked(ipcMain.handle).mockClear();
  });

  it("should register all handlers without duplicate channels", () => {
    expect(() => {
      registerIpcHandlers();
    }).not.toThrow();
  });

  it("does not register removed generic-credential or workspace-propose channels", () => {
    registerIpcHandlers();
    const channels = vi.mocked(ipcMain.handle).mock.calls.map((call) => call[0]);
    for (const channel of FORBIDDEN_PRIVILEGED_CHANNELS) {
      expect(channels).not.toContain(channel);
    }
  });
});
