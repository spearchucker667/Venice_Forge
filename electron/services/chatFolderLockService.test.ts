import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatFolder } from "../../src/shared/chatFolderContracts";

const storage = vi.hoisted(() => ({ readChatFolder: vi.fn(), saveChatFolder: vi.fn() }));
const credentials = vi.hoisted(() => new Map<string, string>());

vi.mock("./chatFolderStorage", () => storage);
vi.mock("./secureStore", () => ({
  getCredential: vi.fn((key: string) => credentials.get(key) ?? null),
  setCredential: vi.fn((key: string, value: string) => { credentials.set(key, value); }),
  deleteCredential: vi.fn((key: string) => { credentials.delete(key); }),
}));
vi.mock("./logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import { FolderUnlockBackoffError, getLockState, lockFolder, unlockFolder } from "./chatFolderLockService";

function folder(overrides: Partial<ChatFolder> = {}): ChatFolder {
  return {
    id: "folder-1",
    profileId: "default",
    kind: "standard",
    name: "Secrets",
    sortOrder: 1,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    lockState: "unlocked",
    schemaVersion: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  credentials.clear();
  storage.readChatFolder.mockResolvedValue(folder());
  storage.saveChatFolder.mockResolvedValue({ ok: true });
});

describe("chatFolderLockService", () => {
  it("rejects weak passphrases before writing secure metadata", async () => {
    await expect(lockFolder({ folderId: "folder-1", passphrase: "short" }, "work"))
      .rejects.toThrow("at least 8");
    expect(credentials.size).toBe(0);
    expect(storage.saveChatFolder).not.toHaveBeenCalled();
  });

  it("scopes lock and remembered-device credentials by profile", async () => {
    await lockFolder({ folderId: "folder-1", passphrase: "correct horse", rememberOnDevice: true }, "work");
    expect(credentials.has("chat-folder-lock:work:folder-1")).toBe(true);
    expect(credentials.has("chat-folder-lock:work:folder-1:device")).toBe(true);
    expect(credentials.has("chat-folder-lock:folder-1")).toBe(false);
  });

  it("rolls secure credentials back when folder-state persistence fails", async () => {
    credentials.set("chat-folder-lock:work:folder-1", "previous-lock");
    credentials.set("chat-folder-lock:work:folder-1:device", "previous-device");
    storage.saveChatFolder.mockResolvedValue({ ok: false, error: "disk full" });

    await expect(lockFolder({ folderId: "folder-1", passphrase: "correct horse", rememberOnDevice: true }, "work"))
      .rejects.toThrow("disk full");
    expect(credentials.get("chat-folder-lock:work:folder-1")).toBe("previous-lock");
    expect(credentials.get("chat-folder-lock:work:folder-1:device")).toBe("previous-device");
  });

  it("enforces retryAfter before another Argon2 attempt", async () => {
    await lockFolder({ folderId: "folder-1", passphrase: "correct horse" }, "work");
    storage.readChatFolder.mockResolvedValue(folder({ profileId: "work", lockState: "locked" }));

    await expect(unlockFolder({ folderId: "folder-1", passphrase: "wrong passphrase" }, "work"))
      .rejects.toBeInstanceOf(FolderUnlockBackoffError);
    await expect(unlockFolder({ folderId: "folder-1", passphrase: "correct horse" }, "work"))
      .rejects.toBeInstanceOf(FolderUnlockBackoffError);

    const state = await getLockState("folder-1", "work");
    expect(state.failedAttempts).toBe(1);
    expect(Date.parse(state.retryAfter ?? "")).toBeGreaterThan(Date.now());
  });

  it("keeps the folder locked and retains credentials when unlock persistence fails", async () => {
    await lockFolder({ folderId: "folder-1", passphrase: "correct horse" }, "work");
    storage.readChatFolder.mockResolvedValue(folder({ profileId: "work", lockState: "locked" }));
    storage.saveChatFolder.mockResolvedValue({ ok: false, error: "read-only filesystem" });

    await expect(unlockFolder({ folderId: "folder-1", passphrase: "correct horse" }, "work"))
      .rejects.toThrow("read-only filesystem");
    expect(credentials.has("chat-folder-lock:work:folder-1")).toBe(true);
  });
});
