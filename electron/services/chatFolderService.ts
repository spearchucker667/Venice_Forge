/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import crypto from "crypto";
import {
  listChatFolders as listChatFoldersFromStore,
  readChatFolder,
  saveChatFolder,
  deleteChatFolderFile
} from "./chatFolderStorage";
import { getConversation, saveConversation, listConversations, deleteConversation } from "./chatStorage";
import type {
  ChatFolder,
  CreateChatFolderInput,
  RenameChatFolderInput,
  ReorderChatFoldersInput,
  MoveConversationToFolderInput,
  MoveConversationsToFolderInput,
  DeleteChatFolderInput,
  ChatFolderKind,
  ChatFolderMutationResult,
} from "../../src/shared/chatFolderContracts";
import type { Conversation } from "../../src/types/conversation";
import { logInfo } from "./logger";
import {
  createChatFolderOperationJournal,
  recoverChatFolderOperations,
  removeChatFolderOperationJournal,
  rollbackChatFolderOperation,
  updateChatFolderOperationJournal,
} from "./chatFolderOperationJournal";

export async function listChatFolders(profileId: string = "default") {
  await recoverChatFolderOperations(profileId);
  const result = await listChatFoldersFromStore(profileId);
  return { folders: result.folders.filter(f => !f.deletedAt) };
}

export async function createChatFolder(input: CreateChatFolderInput, profileId: string = "default"): Promise<ChatFolder> {
  const { folders } = await listChatFolders(profileId);
  
  // Prevent duplicate names within same profile and kind
  const isDuplicate = folders.some(f => 
    f.kind === input.kind && 
    f.name.normalize("NFC").toLowerCase() === input.name.normalize("NFC").trim().toLowerCase()
  );
  
  if (isDuplicate) {
    throw new Error("A folder with this name already exists.");
  }
  
  const maxSortOrder = folders.filter(f => f.kind === input.kind).reduce((max, f) => Math.max(max, f.sortOrder), 0);
  
  const newFolder: ChatFolder = {
    id: crypto.randomUUID(),
    profileId,
    kind: input.kind,
    name: input.name.normalize("NFC").trim(),
    sortOrder: maxSortOrder + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockState: "unlocked",
    schemaVersion: 1
  };
  
  const saveRes = await saveChatFolder(newFolder, profileId);
  if (!saveRes.ok) throw new Error(saveRes.error);
  return newFolder;
}

export async function renameChatFolder(input: RenameChatFolderInput, profileId: string = "default"): Promise<ChatFolder> {
  const folder = await readChatFolder(input.folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  if (folder.lockState === "locked") throw new Error("Cannot rename a locked folder");
  
  const { folders } = await listChatFolders(profileId);
  const isDuplicate = folders.some(f => 
    f.id !== input.folderId &&
    f.kind === folder.kind && 
    f.name.normalize("NFC").toLowerCase() === input.name.normalize("NFC").trim().toLowerCase()
  );
  
  if (isDuplicate) {
    throw new Error("A folder with this name already exists.");
  }

  folder.name = input.name.normalize("NFC").trim();
  folder.updatedAt = new Date().toISOString();
  
  const saveRes = await saveChatFolder(folder, profileId);
  if (!saveRes.ok) throw new Error(saveRes.error);
  return folder;
}

export async function reorderChatFolders(input: ReorderChatFoldersInput, profileId: string = "default"): Promise<ChatFolderMutationResult> {
  const { folders } = await listChatFolders(profileId);
  const folderMap = new Map(folders.filter(f => f.kind === input.kind).map(f => [f.id, f]));

  if (new Set(input.folderIds).size !== input.folderIds.length || input.folderIds.some((id) => !folderMap.has(id))) {
    throw new Error("Folder order contains unknown or duplicate folder IDs");
  }
  const orderedFolders = input.folderIds.map((id) => folderMap.get(id)!);
  const journal = await createChatFolderOperationJournal({
    profileId,
    operation: "reorder",
    folderPreimages: orderedFolders,
  });
  await updateChatFolderOperationJournal(journal, { phase: "applying" });

  try {
    for (let i = 0; i < orderedFolders.length; i++) {
      const folder = { ...orderedFolders[i], sortOrder: i + 1, updatedAt: new Date().toISOString() };
      const result = await saveChatFolder(folder, profileId);
      if (!result.ok) throw new Error(result.error ?? "Failed to persist folder order");
      journal.committedIds.push(folder.id);
      await updateChatFolderOperationJournal(journal, { committedIds: journal.committedIds });
    }
    await removeChatFolderOperationJournal(journal);
    return { committedIds: [...journal.committedIds], rolledBack: false };
  } catch (error) {
    const rolledBack = await rollbackChatFolderOperation(journal);
    if (!rolledBack) throw new Error("Folder reorder failed and requires recovery");
    throw error;
  }
}

function getConversationKind(conversation: any): "standard" | "character" {
  return conversation.metadata?.character ? "character" : "standard";
}

export async function moveConversationToFolder(input: MoveConversationToFolderInput, profileId: string = "default"): Promise<ChatFolderMutationResult> {
  return moveConversationsToFolder({ conversationIds: [input.conversationId], folderId: input.folderId }, profileId);
}

export async function moveConversationsToFolder(input: MoveConversationsToFolderInput, profileId: string = "default"): Promise<ChatFolderMutationResult> {
  await recoverChatFolderOperations(profileId);
  if (new Set(input.conversationIds).size !== input.conversationIds.length) {
    throw new Error("Conversation list contains duplicate IDs");
  }
  const conversations: Conversation[] = [];
  for (const conversationId of input.conversationIds) {
    const conversation = await getConversation(conversationId, profileId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);
    conversations.push(conversation);
  }

  if (input.folderId) {
    const folder = await readChatFolder(input.folderId, profileId);
    if (!folder || folder.deletedAt) throw new Error("Target folder not found");
    if (folder.lockState === "locked") throw new Error("Cannot move into a locked folder");
    
    for (const conversation of conversations) {
      if (folder.kind !== getConversationKind(conversation)) {
        throw new Error("Cannot move a conversation to a folder of a different type");
      }
    }
  }

  for (const conversation of conversations) {
    if (conversation.folderId) {
      const oldFolder = await readChatFolder(conversation.folderId, profileId);
      if (oldFolder && oldFolder.lockState === "locked") {
        throw new Error("Cannot move a conversation out of a locked folder");
      }
    }
  }

  const journal = await createChatFolderOperationJournal({
    profileId,
    operation: "move",
    conversationPreimages: conversations,
  });
  await updateChatFolderOperationJournal(journal, { phase: "applying" });
  try {
    for (const conversation of conversations) {
      const updated = { ...conversation, folderId: input.folderId || undefined };
      const result = await saveConversation(updated, profileId);
      if (!result.ok) throw new Error(result.error ?? "Failed to persist conversation movement");
      journal.committedIds.push(conversation.id);
      await updateChatFolderOperationJournal(journal, { committedIds: journal.committedIds });
    }
    await removeChatFolderOperationJournal(journal);
    return { committedIds: [...journal.committedIds], rolledBack: false };
  } catch (error) {
    const rolledBack = await rollbackChatFolderOperation(journal);
    if (!rolledBack) throw new Error("Conversation movement failed and requires recovery");
    throw error;
  }
}

export async function deleteChatFolder(input: DeleteChatFolderInput, profileId: string = "default"): Promise<ChatFolderMutationResult> {
  await recoverChatFolderOperations(profileId);
  const folder = await readChatFolder(input.folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  if (folder.lockState === "locked") throw new Error("Cannot delete a locked folder");

  const listRes = await listConversations(undefined, profileId);
  const conversations = Array.isArray(listRes) ? listRes : listRes.conversations;
  const targetChats = conversations.filter(c => c.folderId === input.folderId);
  const journal = await createChatFolderOperationJournal({
    profileId,
    operation: "delete",
    folderPreimages: [folder],
    conversationPreimages: targetChats,
  });
  await updateChatFolderOperationJournal(journal, { phase: "applying" });
  try {
    for (const conversation of targetChats) {
      const result = input.deleteConversations
        ? await deleteConversation(conversation.id, profileId)
        : await saveConversation({ ...conversation, folderId: undefined }, profileId);
      if (!result.ok) throw new Error("Failed to persist folder deletion plan");
      journal.committedIds.push(conversation.id);
      await updateChatFolderOperationJournal(journal, { committedIds: journal.committedIds });
    }

    const folderResult = await saveChatFolder({ ...folder, deletedAt: new Date().toISOString() }, profileId);
    if (!folderResult.ok) throw new Error(folderResult.error ?? "Failed to persist folder deletion");
    journal.committedIds.push(folder.id);
    await updateChatFolderOperationJournal(journal, { committedIds: journal.committedIds });
    await removeChatFolderOperationJournal(journal);
    return { committedIds: [...journal.committedIds], rolledBack: false };
  } catch (error) {
    const rolledBack = await rollbackChatFolderOperation(journal);
    if (!rolledBack) throw new Error("Folder deletion failed and requires recovery");
    throw error;
  }
}

function getConvKind(conversation: any): ChatFolderKind {
  return conversation.metadata?.character ? "character" : "standard";
}

/**
 * Migrates legacy folders (without kind field) by inspecting their conversations.
 * - If all conversations are standard, migrate folder to kind="standard"
 * - If all conversations are character, migrate folder to kind="character"
 * - If mixed, split into two folders: "Folder Name — Chats" (standard) and "Folder Name — Characters" (character)
 * Runs once per profile on startup.
 */
export async function migrateLegacyFolders(profileId: string = "default"): Promise<void> {
  await recoverChatFolderOperations(profileId);
  const { folders, totalScanned } = await listChatFoldersFromStore(profileId);
  if (totalScanned === 0) return;

  const legacyFolders = folders.filter(f => f.kind !== "standard" && f.kind !== "character");
  if (legacyFolders.length === 0) return;

  const listRes = await listConversations(undefined, profileId);
  const conversations = Array.isArray(listRes) ? listRes : listRes.conversations;

  for (const legacy of legacyFolders) {
    const folderConvs = conversations.filter(c => c.folderId === legacy.id);
    if (folderConvs.length === 0) {
      // Empty folder — default to standard
      const migrated: ChatFolder = {
        ...legacy,
        kind: "standard",
        schemaVersion: Math.max(legacy.schemaVersion, 1),
      };
      const result = await saveChatFolder(migrated, profileId);
      if (!result.ok) throw new Error(result.error ?? "Failed to migrate legacy folder");
      logInfo(`Migrated empty legacy folder to standard`, { folderId: legacy.id, name: legacy.name });
      continue;
    }

    const kinds = new Set(folderConvs.map(getConvKind));
    if (kinds.size === 1) {
      // All same kind
      const kind = kinds.values().next().value!;
      const migrated: ChatFolder = {
        ...legacy,
        kind,
        schemaVersion: Math.max(legacy.schemaVersion, 1),
      };
      const result = await saveChatFolder(migrated, profileId);
      if (!result.ok) throw new Error(result.error ?? "Failed to migrate legacy folder");
      logInfo(`Migrated legacy folder to ${kind}`, { folderId: legacy.id, name: legacy.name });
    } else {
      // Mixed — split into two folders
      const standardConvs = folderConvs.filter(c => getConvKind(c) === "standard");
      const characterConvs = folderConvs.filter(c => getConvKind(c) === "character");

      const maxSortOrder = folders.filter(f => f.kind === "standard").reduce((max, f) => Math.max(max, f.sortOrder), 0);

      const standardFolder: ChatFolder = {
        id: crypto.randomUUID(),
        profileId,
        kind: "standard",
        name: `${legacy.name} — Chats`,
        sortOrder: maxSortOrder + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lockState: "unlocked",
        schemaVersion: 1,
      };

      const characterFolder: ChatFolder = {
        id: crypto.randomUUID(),
        profileId,
        kind: "character",
        name: `${legacy.name} — Characters`,
        sortOrder: maxSortOrder + 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lockState: "unlocked",
        schemaVersion: 1,
      };

      const journal = await createChatFolderOperationJournal({
        profileId,
        operation: "legacy-migration",
        folderPreimages: [legacy],
        conversationPreimages: folderConvs,
        createdFolderIds: [standardFolder.id, characterFolder.id],
      });
      await updateChatFolderOperationJournal(journal, { phase: "applying" });
      try {
        for (const createdFolder of [standardFolder, characterFolder]) {
          const result = await saveChatFolder(createdFolder, profileId);
          if (!result.ok) throw new Error(result.error ?? "Failed to create migrated folder");
          journal.committedIds.push(createdFolder.id);
          await updateChatFolderOperationJournal(journal, { committedIds: journal.committedIds });
        }

        for (const conversation of [...standardConvs, ...characterConvs]) {
          const destinationId = getConvKind(conversation) === "standard" ? standardFolder.id : characterFolder.id;
          const result = await saveConversation({ ...conversation, folderId: destinationId }, profileId);
          if (!result.ok) throw new Error(result.error ?? "Failed to migrate conversation");
          journal.committedIds.push(conversation.id);
          await updateChatFolderOperationJournal(journal, { committedIds: journal.committedIds });
        }

        const legacyResult = await saveChatFolder({ ...legacy, deletedAt: new Date().toISOString() }, profileId);
        if (!legacyResult.ok) throw new Error(legacyResult.error ?? "Failed to retire legacy folder");
        journal.committedIds.push(legacy.id);
        await updateChatFolderOperationJournal(journal, { committedIds: journal.committedIds });
        await removeChatFolderOperationJournal(journal);
      } catch (error) {
        const rolledBack = await rollbackChatFolderOperation(journal);
        if (!rolledBack) throw new Error("Legacy folder migration failed and requires recovery");
        throw error;
      }

      logInfo(`Split mixed legacy folder`, {
        originalId: legacy.id,
        originalName: legacy.name,
        standardFolderId: standardFolder.id,
        characterFolderId: characterFolder.id,
        standardCount: standardConvs.length,
        characterCount: characterConvs.length,
      });
    }
  }
}
