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
  DeleteChatFolderInput,
  ChatFolderKind
} from "../../src/shared/chatFolderContracts";
import { logInfo, logError } from "./logger";

export async function listChatFolders(profileId: string = "default") {
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

export async function reorderChatFolders(input: ReorderChatFoldersInput, profileId: string = "default"): Promise<void> {
  const { folders } = await listChatFolders(profileId);
  const folderMap = new Map(folders.filter(f => f.kind === input.kind).map(f => [f.id, f]));
  
  for (let i = 0; i < input.folderIds.length; i++) {
    const f = folderMap.get(input.folderIds[i]);
    if (f) {
      f.sortOrder = i + 1;
      f.updatedAt = new Date().toISOString();
      await saveChatFolder(f, profileId);
    }
  }
}

function getConversationKind(conversation: any): "standard" | "character" {
  return conversation.metadata?.character ? "character" : "standard";
}

export async function moveConversationToFolder(input: MoveConversationToFolderInput, profileId: string = "default"): Promise<void> {
  const conv = await getConversation(input.conversationId, profileId);
  if (!conv) throw new Error("Conversation not found");

  if (input.folderId) {
    const folder = await readChatFolder(input.folderId, profileId);
    if (!folder || folder.deletedAt) throw new Error("Target folder not found");
    if (folder.lockState === "locked") throw new Error("Cannot move into a locked folder");
    
    if (folder.kind !== getConversationKind(conv)) {
      throw new Error("Cannot move a conversation to a folder of a different type");
    }
  }

  // Check if moving out of a locked folder
  if (conv.folderId) {
    const oldFolder = await readChatFolder(conv.folderId, profileId);
    if (oldFolder && oldFolder.lockState === "locked") {
      throw new Error("Cannot move a conversation out of a locked folder");
    }
  }

  conv.folderId = input.folderId || undefined;
  await saveConversation(conv, profileId);
}

export async function deleteChatFolder(input: DeleteChatFolderInput, profileId: string = "default"): Promise<void> {
  const folder = await readChatFolder(input.folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  if (folder.lockState === "locked") throw new Error("Cannot delete a locked folder");

  if (input.deleteConversations) {
    const listRes = await listConversations(undefined, profileId);
    const conversations = Array.isArray(listRes) ? listRes : listRes.conversations;
    const targetChats = conversations.filter(c => c.folderId === input.folderId);
    for (const c of targetChats) {
      await deleteConversation(c.id, profileId);
    }
  } else {
    // Move to unfiled
    const listRes = await listConversations(undefined, profileId);
    const conversations = Array.isArray(listRes) ? listRes : listRes.conversations;
    const targetChats = conversations.filter(c => c.folderId === input.folderId);
    for (const c of targetChats) {
      c.folderId = undefined;
      await saveConversation(c, profileId);
    }
  }

  folder.deletedAt = new Date().toISOString();
  await saveChatFolder(folder, profileId);
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
      await saveChatFolder(migrated, profileId);
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
      await saveChatFolder(migrated, profileId);
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

      await saveChatFolder(standardFolder, profileId);
      await saveChatFolder(characterFolder, profileId);

      for (const c of standardConvs) {
        c.folderId = standardFolder.id;
        await saveConversation(c, profileId);
      }
      for (const c of characterConvs) {
        c.folderId = characterFolder.id;
        await saveConversation(c, profileId);
      }

      // Mark original as deleted
      legacy.deletedAt = new Date().toISOString();
      await saveChatFolder(legacy, profileId);

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
