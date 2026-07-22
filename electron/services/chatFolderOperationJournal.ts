import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { app } from "electron";
import type { ChatFolder } from "../../src/shared/chatFolderContracts";
import type { Conversation } from "../../src/types/conversation";
import { isValidProfileStorageId } from "../../src/utils/profileIdValidation";
import { saveConversation } from "./chatStorage";
import { deleteChatFolderFile, saveChatFolder } from "./chatFolderStorage";
import { logError, logInfo } from "./logger";

export type ChatFolderJournalOperation = "reorder" | "move" | "delete" | "legacy-migration";
export type ChatFolderJournalPhase = "prepared" | "applying" | "rolling-back" | "recovery-required";

export interface ChatFolderOperationJournal {
  operationId: string;
  profileId: string;
  operation: ChatFolderJournalOperation;
  phase: ChatFolderJournalPhase;
  folderPreimages: ChatFolder[];
  conversationPreimages: Conversation[];
  createdFolderIds: string[];
  committedIds: string[];
  createdAt: string;
  updatedAt: string;
}

function journalDirectory(profileId: string): string {
  if (!isValidProfileStorageId(profileId)) throw new Error("Invalid profile id.");
  const root = path.join(app.getPath("userData"), "chat-folder-operation-journal");
  return profileId === "default" ? root : path.join(root, "profiles", profileId);
}

function journalPath(journal: Pick<ChatFolderOperationJournal, "profileId" | "operationId">): string {
  return path.join(journalDirectory(journal.profileId), `${journal.operationId}.json`);
}

async function atomicWrite(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2), "utf-8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function createChatFolderOperationJournal(input: {
  profileId: string;
  operation: ChatFolderJournalOperation;
  folderPreimages?: ChatFolder[];
  conversationPreimages?: Conversation[];
  createdFolderIds?: string[];
}): Promise<ChatFolderOperationJournal> {
  const now = new Date().toISOString();
  const journal: ChatFolderOperationJournal = {
    operationId: crypto.randomUUID(),
    profileId: input.profileId,
    operation: input.operation,
    phase: "prepared",
    folderPreimages: structuredClone(input.folderPreimages ?? []),
    conversationPreimages: structuredClone(input.conversationPreimages ?? []),
    createdFolderIds: [...(input.createdFolderIds ?? [])],
    committedIds: [],
    createdAt: now,
    updatedAt: now,
  };
  await atomicWrite(journalPath(journal), journal);
  return journal;
}

export async function updateChatFolderOperationJournal(
  journal: ChatFolderOperationJournal,
  updates: Partial<Pick<ChatFolderOperationJournal, "phase" | "committedIds" | "createdFolderIds">>,
): Promise<void> {
  Object.assign(journal, updates, { updatedAt: new Date().toISOString() });
  await atomicWrite(journalPath(journal), journal);
}

export async function removeChatFolderOperationJournal(journal: ChatFolderOperationJournal): Promise<void> {
  await fs.unlink(journalPath(journal)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function rollbackChatFolderOperation(journal: ChatFolderOperationJournal): Promise<boolean> {
  await updateChatFolderOperationJournal(journal, { phase: "rolling-back" });
  let ok = true;

  for (const folder of journal.folderPreimages) {
    const result = await saveChatFolder(folder, journal.profileId);
    ok = result.ok && ok;
  }
  for (const conversation of journal.conversationPreimages) {
    const result = await saveConversation(conversation, journal.profileId);
    ok = result.ok && ok;
  }
  for (const folderId of journal.createdFolderIds) {
    const result = await deleteChatFolderFile(folderId, journal.profileId);
    ok = result.ok && ok;
  }

  if (ok) {
    await removeChatFolderOperationJournal(journal);
    return true;
  }
  await updateChatFolderOperationJournal(journal, { phase: "recovery-required" });
  return false;
}

function isJournal(value: unknown, profileId: string): value is ChatFolderOperationJournal {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ChatFolderOperationJournal>;
  return record.profileId === profileId
    && typeof record.operationId === "string"
    && Array.isArray(record.folderPreimages)
    && Array.isArray(record.conversationPreimages)
    && Array.isArray(record.createdFolderIds);
}

/** Restores every unfinished operation before the profile is listed or mutated. */
export async function recoverChatFolderOperations(profileId: string): Promise<void> {
  const directory = journalDirectory(profileId);
  let names: string[];
  try {
    names = (await fs.readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  for (const name of names) {
    const filePath = path.join(directory, name);
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf-8"));
      if (!isJournal(parsed, profileId)) {
        logError("Invalid chat-folder operation journal retained for recovery", { fileName: name });
        continue;
      }
      const restored = await rollbackChatFolderOperation(parsed);
      if (!restored) throw new Error("Rollback did not restore every preimage");
      logInfo("Recovered interrupted chat-folder operation", {
        operationId: parsed.operationId,
        operation: parsed.operation,
      });
    } catch (error) {
      logError("Failed to recover chat-folder operation", {
        fileName: name,
        error: error instanceof Error ? error.message : "Unknown recovery error",
      });
      throw new Error("Chat-folder recovery is required before further mutations.");
    }
  }
}
