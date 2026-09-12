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
    expect(() => {
      registerIpcHandlers();
    }).not.toThrow();
  });
});
