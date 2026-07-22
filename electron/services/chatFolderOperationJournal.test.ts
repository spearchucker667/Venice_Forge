import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatFolder } from "../../src/shared/chatFolderContracts";

let userDataPath = "";
const storage = vi.hoisted(() => ({ saveChatFolder: vi.fn(), deleteChatFolderFile: vi.fn() }));
const chats = vi.hoisted(() => ({ saveConversation: vi.fn(), deleteConversation: vi.fn() }));

vi.mock("electron", () => ({ app: { getPath: () => userDataPath } }));
vi.mock("./chatFolderStorage", () => storage);
vi.mock("./chatStorage", () => chats);
vi.mock("./logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import {
  createChatFolderOperationJournal,
  recoverChatFolderOperations,
  updateChatFolderOperationJournal,
} from "./chatFolderOperationJournal";

const originalFolder: ChatFolder = {
  id: "folder-1",
  profileId: "default",
  kind: "standard",
  name: "Original",
  sortOrder: 1,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
  lockState: "unlocked",
  schemaVersion: 1,
};

beforeEach(async () => {
  vi.clearAllMocks();
  userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "vf-folder-journal-"));
  storage.saveChatFolder.mockResolvedValue({ ok: true });
  storage.deleteChatFolderFile.mockResolvedValue({ ok: true });
  chats.saveConversation.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await fs.rm(userDataPath, { recursive: true, force: true });
});

describe("chatFolderOperationJournal crash recovery", () => {
  it("restores preimages and removes created folders from an interrupted operation", async () => {
    const journal = await createChatFolderOperationJournal({
      profileId: "default",
      operation: "legacy-migration",
      folderPreimages: [originalFolder],
      createdFolderIds: ["new-folder"],
    });
    await updateChatFolderOperationJournal(journal, { phase: "applying", committedIds: ["new-folder"] });

    await recoverChatFolderOperations("default");

    expect(storage.saveChatFolder).toHaveBeenCalledWith(originalFolder, "default");
    expect(storage.deleteChatFolderFile).toHaveBeenCalledWith("new-folder", "default");
    const directory = path.join(userDataPath, "chat-folder-operation-journal");
    expect(await fs.readdir(directory)).toEqual([]);
  });
});
