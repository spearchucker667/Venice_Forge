import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatFolder } from "../../src/shared/chatFolderContracts";
import type { Conversation } from "../../src/types/conversation";

const storage = vi.hoisted(() => ({
  listChatFolders: vi.fn(),
  readChatFolder: vi.fn(),
  saveChatFolder: vi.fn(),
  deleteChatFolderFile: vi.fn(),
}));
const chats = vi.hoisted(() => ({
  getConversation: vi.fn(),
  saveConversation: vi.fn(),
  listConversations: vi.fn(),
  deleteConversation: vi.fn(),
}));
const journals = vi.hoisted(() => ({
  createChatFolderOperationJournal: vi.fn(),
  recoverChatFolderOperations: vi.fn(),
  removeChatFolderOperationJournal: vi.fn(),
  rollbackChatFolderOperation: vi.fn(),
  updateChatFolderOperationJournal: vi.fn(),
}));

vi.mock("./chatFolderStorage", () => storage);
vi.mock("./chatStorage", () => chats);
vi.mock("./chatFolderOperationJournal", () => journals);
vi.mock("./logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import {
  deleteChatFolder,
  moveConversationsToFolder,
  reorderChatFolders,
} from "./chatFolderService";

function folder(overrides: Partial<ChatFolder> = {}): ChatFolder {
  return {
    id: "folder-1",
    profileId: "default",
    kind: "standard",
    name: "Folder",
    sortOrder: 1,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    lockState: "unlocked",
    schemaVersion: 1,
    ...overrides,
  };
}

function conversation(id: string, folderId = "folder-1"): Conversation {
  return {
    id,
    title: id,
    model: "test-model",
    messages: [],
    folderId,
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.listChatFolders.mockResolvedValue({ folders: [], truncated: false, totalScanned: 0 });
  storage.saveChatFolder.mockResolvedValue({ ok: true });
  chats.saveConversation.mockResolvedValue({ ok: true });
  chats.deleteConversation.mockResolvedValue({ ok: true });
  chats.listConversations.mockResolvedValue([]);
  journals.createChatFolderOperationJournal.mockImplementation(async (input) => ({
    operationId: "op-1",
    phase: "prepared",
    committedIds: [],
    createdAt: "now",
    updatedAt: "now",
    ...input,
    folderPreimages: input.folderPreimages ?? [],
    conversationPreimages: input.conversationPreimages ?? [],
    createdFolderIds: input.createdFolderIds ?? [],
  }));
  journals.rollbackChatFolderOperation.mockResolvedValue(true);
});

describe("chatFolderService durable mutations", () => {
  it("rolls back reorder when a middle folder write returns ok:false", async () => {
    storage.listChatFolders.mockResolvedValue({
      folders: [folder({ id: "folder-1" }), folder({ id: "folder-2", sortOrder: 2 })],
      truncated: false,
      totalScanned: 2,
    });
    storage.saveChatFolder
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "disk full" });

    await expect(reorderChatFolders({ folderIds: ["folder-2", "folder-1"], kind: "standard" }))
      .rejects.toThrow("disk full");
    expect(journals.rollbackChatFolderOperation).toHaveBeenCalledTimes(1);
    expect(journals.removeChatFolderOperationJournal).not.toHaveBeenCalled();
  });

  it("validates every conversation before bulk movement and performs no writes on a missing record", async () => {
    chats.getConversation
      .mockResolvedValueOnce(conversation("chat-1"))
      .mockResolvedValueOnce(null);

    await expect(moveConversationsToFolder({ conversationIds: ["chat-1", "chat-2"], folderId: null }))
      .rejects.toThrow("chat-2");
    expect(chats.saveConversation).not.toHaveBeenCalled();
    expect(journals.createChatFolderOperationJournal).not.toHaveBeenCalled();
  });

  it("rolls back the whole bulk move when a structured save failure occurs", async () => {
    chats.getConversation
      .mockResolvedValueOnce(conversation("chat-1"))
      .mockResolvedValueOnce(conversation("chat-2"));
    chats.saveConversation
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "write rejected" });

    await expect(moveConversationsToFolder({ conversationIds: ["chat-1", "chat-2"], folderId: null }))
      .rejects.toThrow("write rejected");
    expect(journals.rollbackChatFolderOperation).toHaveBeenCalledTimes(1);
  });

  it("preflights a locked destination before starting the bulk journal", async () => {
    chats.getConversation.mockResolvedValue(conversation("chat-1", "source"));
    storage.readChatFolder.mockResolvedValue(folder({ id: "locked", lockState: "locked" }));

    await expect(moveConversationsToFolder({ conversationIds: ["chat-1"], folderId: "locked" }))
      .rejects.toThrow("locked");
    expect(chats.saveConversation).not.toHaveBeenCalled();
  });

  it("moves a legacy local-character conversation into a character folder", async () => {
    chats.getConversation.mockResolvedValue({
      ...conversation("chat-1"),
      metadata: { source: "localCharacter" },
    });
    storage.readChatFolder.mockResolvedValue(folder({ id: "characters", kind: "character" }));

    await expect(moveConversationsToFolder({ conversationIds: ["chat-1"], folderId: "characters" }))
      .resolves.toEqual({ committedIds: ["chat-1"], rolledBack: false });
    expect(chats.saveConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-1", folderId: "characters" }),
      "default",
    );
  });

  it("restores deleted conversations when a later delete fails", async () => {
    storage.readChatFolder.mockResolvedValue(folder());
    chats.listConversations.mockResolvedValue([conversation("chat-1"), conversation("chat-2")]);
    chats.deleteConversation
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });

    await expect(deleteChatFolder({ folderId: "folder-1", deleteConversations: true }))
      .rejects.toThrow("deletion plan");
    expect(journals.rollbackChatFolderOperation).toHaveBeenCalledTimes(1);
    expect(storage.saveChatFolder).not.toHaveBeenCalled();
  });

  it("reports recovery-required instead of false success when rollback fails", async () => {
    storage.listChatFolders.mockResolvedValue({
      folders: [folder({ id: "folder-1" })],
      truncated: false,
      totalScanned: 1,
    });
    storage.saveChatFolder.mockResolvedValue({ ok: false, error: "disk full" });
    journals.rollbackChatFolderOperation.mockResolvedValue(false);

    await expect(reorderChatFolders({ folderIds: ["folder-1"], kind: "standard" }))
      .rejects.toThrow("requires recovery");
  });
});
