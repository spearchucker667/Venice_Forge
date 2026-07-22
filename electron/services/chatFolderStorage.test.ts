import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let userDataPath = "";
vi.mock("electron", () => ({ app: { getPath: () => userDataPath } }));
vi.mock("./logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import { readChatFolder } from "./chatFolderStorage";

beforeEach(async () => {
  userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "vf-chat-folder-storage-"));
  await fs.mkdir(path.join(userDataPath, "chat-folders"), { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(userDataPath, { recursive: true, force: true });
});

describe("chatFolderStorage failure classification", () => {
  it("quarantines invalid JSON as corrupt content", async () => {
    const original = path.join(userDataPath, "chat-folders", "folder-1.json");
    await fs.writeFile(original, "{not-json", "utf-8");

    await expect(readChatFolder("folder-1")).resolves.toBeNull();
    await expect(fs.access(original)).rejects.toMatchObject({ code: "ENOENT" });
    const names = await fs.readdir(path.dirname(original));
    expect(names.some((name) => name.startsWith("folder-1.json.backup."))).toBe(true);
  });

  it("leaves a valid file in place on transient I/O errors", async () => {
    const original = path.join(userDataPath, "chat-folders", "folder-1.json");
    await fs.writeFile(original, "{}", "utf-8");
    const readSpy = vi.spyOn(fs, "readFile").mockRejectedValueOnce(Object.assign(new Error("busy"), { code: "EBUSY" }));
    const renameSpy = vi.spyOn(fs, "rename");

    await expect(readChatFolder("folder-1")).rejects.toThrow("left in place");
    expect(readSpy).toHaveBeenCalled();
    expect(renameSpy).not.toHaveBeenCalled();
    await expect(fs.access(original)).resolves.toBeUndefined();
  });

  it("preserves unsupported future schema files for migration", async () => {
    const original = path.join(userDataPath, "chat-folders", "folder-1.json");
    await fs.writeFile(original, JSON.stringify({
      id: "folder-1",
      profileId: "default",
      kind: "standard",
      name: "Future",
      sortOrder: 1,
      schemaVersion: 99,
    }), "utf-8");

    await expect(readChatFolder("folder-1")).rejects.toThrow("newer version");
    await expect(fs.access(original)).resolves.toBeUndefined();
  });
});
