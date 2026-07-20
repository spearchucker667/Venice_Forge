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

import { registerIpcHandlers } from "./index";
import { clearRegisteredChannelsForTesting } from "./common";

describe("IPC Handler Registration", () => {
  beforeEach(() => {
    clearRegisteredChannelsForTesting();
  });

  it("should register all handlers without duplicate channels", () => {
    // Before replacing chatFolderHandlers.ts, this might throw if there are duplicates.
    // Wait, currently chatFolderHandlers has duplicates so this will throw.
    // Let's assert it throws for now, or just let it fail until we fix it.
    expect(() => {
      registerIpcHandlers();
    }).not.toThrow();
  });
});
