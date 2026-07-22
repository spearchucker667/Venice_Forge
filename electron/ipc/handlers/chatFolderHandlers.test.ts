import fs from "fs/promises";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>());
const profileSession = vi.hoisted(() => ({ requireProfileSessionId: vi.fn(() => "work") }));
const services = vi.hoisted(() => ({
  listChatFolders: vi.fn(), createChatFolder: vi.fn(), renameChatFolder: vi.fn(), reorderChatFolders: vi.fn(),
  moveConversationToFolder: vi.fn(), moveConversationsToFolder: vi.fn(), deleteChatFolder: vi.fn(),
}));
const backups = vi.hoisted(() => ({ getBackupPreview: vi.fn(), exportBackup: vi.fn(), previewImport: vi.fn(), importBackup: vi.fn() }));
const locks = vi.hoisted(() => ({
  lockFolder: vi.fn(), unlockFolder: vi.fn(), getLockState: vi.fn(),
  FolderUnlockBackoffError: class FolderUnlockBackoffError extends Error {
    constructor(public retryAfter: string) { super("Wait before trying again."); }
  },
}));
const dialog = vi.hoisted(() => ({ showOpenDialog: vi.fn(), showSaveDialog: vi.fn() }));

vi.mock("./common", () => ({ registerIpcChannel: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler) }));
vi.mock("../../services/profileSession", () => profileSession);
vi.mock("../../services/chatFolderService", () => services);
vi.mock("../../services/chatFolderStorage", () => ({ isValidId: (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value) }));
vi.mock("../../services/chatFolderBackupService", () => backups);
vi.mock("../../services/chatFolderLockService", () => locks);
vi.mock("../../services/logger", () => ({ logError: vi.fn() }));
vi.mock("electron", () => ({ dialog }));

import { registerChatFolderHandlers } from "./chatFolderHandlers";

const sender = { id: 42 };
const event = { sender };

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  registerChatFolderHandlers();
  services.listChatFolders.mockResolvedValue({ folders: [] });
  services.moveConversationsToFolder.mockResolvedValue({ committedIds: ["chat-1"], rolledBack: false });
});

describe("chatFolderHandlers trust boundary", () => {
  it("always lists the sender-bound profile and ignores renderer-supplied profile data", async () => {
    const result = await handlers.get("chat-folders:list")!(event, "other-profile");
    expect(result.ok).toBe(true);
    expect(profileSession.requireProfileSessionId).toHaveBeenCalledWith(sender);
    expect(services.listChatFolders).toHaveBeenCalledWith("work");
  });

  it("rejects malformed and oversized inputs before calling services", async () => {
    const createResult = await handlers.get("chat-folders:create")!(event, { name: "x".repeat(121), kind: "standard" });
    const moveResult = await handlers.get("chat-folders:move-conversations")!(event, {
      conversationIds: Array.from({ length: 501 }, (_, index) => `chat-${index}`),
      folderId: null,
    });
    expect(createResult.ok).toBe(false);
    expect(moveResult.ok).toBe(false);
    expect(services.createChatFolder).not.toHaveBeenCalled();
    expect(services.moveConversationsToFolder).not.toHaveBeenCalled();
  });

  it("routes bulk movement through one main-process service call", async () => {
    const result = await handlers.get("chat-folders:move-conversations")!(event, {
      conversationIds: ["chat-1", "chat-2"],
      folderId: "folder-1",
    });
    expect(result.ok).toBe(true);
    expect(services.moveConversationsToFolder).toHaveBeenCalledWith({
      conversationIds: ["chat-1", "chat-2"], folderId: "folder-1",
    }, "work");
  });

  it("returns structured retryAfter from authoritative unlock backoff", async () => {
    locks.unlockFolder.mockRejectedValue(new locks.FolderUnlockBackoffError("2026-07-22T12:00:00.000Z"));
    const result = await handlers.get("chat-folders:unlock")!(event, {
      folderId: "folder-1",
      passphrase: "valid passphrase",
    });
    expect(result).toMatchObject({ ok: false, retryAfter: "2026-07-22T12:00:00.000Z" });
  });

  it("issues a sender/profile-bound file capability and rejects raw paths", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vf-handler-cap-"));
    const filePath = path.join(directory, "backup.vfbackup");
    await fs.writeFile(filePath, "{}", "utf-8");
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] });
    backups.previewImport.mockResolvedValue({ newConversations: 0 });
    try {
      const picked = await handlers.get("chat-folders:pick-import-file")!(event);
      expect(picked).toMatchObject({ ok: true, fileName: "backup.vfbackup" });

      const rawPathResult = await handlers.get("chat-folders:preview-import")!(event, { backupFilePath: filePath });
      expect(rawPathResult.ok).toBe(false);

      const previewResult = await handlers.get("chat-folders:preview-import")!(event, { fileCapability: picked.fileCapability });
      expect(previewResult.ok).toBe(true);
      expect(backups.previewImport).toHaveBeenCalledWith({ backupFilePath: await fs.realpath(filePath) }, "work");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
