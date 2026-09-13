import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let userDataPath = "";
vi.mock("electron", () => ({ app: { getPath: () => userDataPath } }));
vi.mock("./logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import { readChatFolder, saveChatFolder } from "./chatFolderStorage";
import type { ChatFolder } from "../../src/shared/chatFolderContracts";

const UNIQUE_TMP_RE = /\.tmp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeFolder(overrides: Partial<ChatFolder> = {}): ChatFolder {
  return {
    id: "folder-1",
    profileId: "default",
    kind: "standard",
    name: "Inbox",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lockState: "unlocked",
    lockedAt: null,
    lockVersion: 0,
    schemaVersion: 1,
    ...overrides,
  };
}

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

describe("chatFolderStorage unique temp writes [P2-006]", () => {
  it("uses distinct tmp names for concurrent saves and leaves valid JSON", async () => {
    const originalOpen = fs.open;
    const openPaths: string[] = [];
    const openSpy = vi.spyOn(fs, "open").mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      openPaths.push(String(args[0]));
      await new Promise((resolve) => setTimeout(resolve, 15));
      return originalOpen(...args);
    });
    try {
      const first = makeFolder({ name: "Alpha", updatedAt: "2026-01-01T00:00:00.000Z" });
      const second = makeFolder({ name: "Beta", updatedAt: "2026-01-02T00:00:00.000Z" });
      const [a, b] = await Promise.all([saveChatFolder(first), saveChatFolder(second)]);
      expect(a).toEqual({ ok: true });
      expect(b).toEqual({ ok: true });

      const tmpPaths = openPaths.filter((file) => UNIQUE_TMP_RE.test(file));
      expect(tmpPaths).toHaveLength(2);
      expect(tmpPaths[0]).not.toBe(tmpPaths[1]);

      const target = path.join(userDataPath, "chat-folders", "folder-1.json");
      const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as ChatFolder;
      expect(parsed.id).toBe("folder-1");
      expect(["Alpha", "Beta"]).toContain(parsed.name);
    } finally {
      openSpy.mockRestore();
    }
  });
});
