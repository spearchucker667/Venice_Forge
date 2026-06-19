// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
}));

vi.mock("../services/configService", () => ({
  exportConfigTemplate: vi.fn(),
  getPaths: vi.fn(),
  getSanitizedConfig: vi.fn(),
  getStatus: vi.fn(),
  initializeConfig: vi.fn(),
  loadMergedThemes: vi.fn(),
  openConfigFolder: vi.fn(),
  reloadConfig: vi.fn(),
  resetSecureStoreKeys: vi.fn(),
  writeSanitizedConfig: vi.fn(),
}));

import { redactConfigPaths } from "./configHandlers";

describe("configHandlers", () => {
  it("redacts absolute config paths before returning status to the renderer", () => {
    const paths = redactConfigPaths({
      configPath: "/Users/example/.config/venice-forge/config.yaml",
      themesPath: "/Users/example/.config/venice-forge/themes.yaml",
      source: "userdata",
    });

    expect(paths).toEqual({
      configPath: "config.yaml",
      themesPath: "themes.yaml",
      source: "userdata",
      configDirLabel: "user config directory",
    });
    expect(JSON.stringify(paths)).not.toContain("/Users/example");
  });
});
