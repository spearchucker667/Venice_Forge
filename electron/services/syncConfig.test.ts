// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

let userDataPath = "";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => userDataPath) },
}));

vi.mock("./logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

import { saveSyncConfig } from "./syncConfig";
import type { SyncConfig } from "./syncConfig";

describe("syncConfig unique temp writes [P2-006]", () => {
  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "vf-sync-config-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  it("uses distinct tmp names for concurrent saves and leaves valid JSON", async () => {
    const uniqueTmpRe = /sync-config\.json\.tmp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const originalWrite = fs.writeFile;
    const writePaths: string[] = [];
    const writeSpy = vi.spyOn(fs, "writeFile").mockImplementation(async (...args: Parameters<typeof fs.writeFile>) => {
      writePaths.push(String(args[0]));
      await new Promise((resolve) => setTimeout(resolve, 15));
      return originalWrite(...args);
    });
    try {
      const first: SyncConfig = { syncPath: "/alpha", deviceId: "device-alpha" };
      const second: SyncConfig = { syncPath: "/beta", deviceId: "device-beta" };
      await Promise.all([saveSyncConfig(first), saveSyncConfig(second)]);

      const tmpPaths = writePaths.filter((file) => uniqueTmpRe.test(file));
      expect(tmpPaths).toHaveLength(2);
      expect(tmpPaths[0]).not.toBe(tmpPaths[1]);

      const target = path.join(userDataPath, "sync-config.json");
      const parsed = JSON.parse(await fs.readFile(target, "utf8")) as SyncConfig;
      expect(["/alpha", "/beta"]).toContain(parsed.syncPath);
      expect(["device-alpha", "device-beta"]).toContain(parsed.deviceId);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("rejects when the atomic write fails so callers do not treat persist as success", async () => {
    vi.spyOn(fs, "writeFile").mockRejectedValueOnce(Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }));
    await expect(
      saveSyncConfig({ syncPath: "/gamma", deviceId: "device-gamma" }),
    ).rejects.toMatchObject({ code: "ENOSPC" });
  });
});
