import { setCredential, getCredential, deleteCredential } from "../../services/secureStore";
import { registerIpcChannel } from "./common";
import { getProfileSessionId } from "../../services/profileSession";
import {
  listChatFolders,
  saveChatFolder,
  readChatFolder,
  deleteChatFolderFile
} from "../../services/chatFolderStorage";
import type { ChatFolder } from "../../../src/types/chatFolder";
import { logError } from "../../services/logger";
import { listConversations, saveConversation } from "../../services/chatStorage";
import crypto from "crypto";

export function registerChatFolderHandlers(): void {
  registerIpcChannel("chat-folders:list", async (event, requestedProfileId: unknown) => {
    try {
      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(event.sender);
      const result = await listChatFolders(profileId);
      return { ok: true, folders: result.folders };
    } catch (_err) {
      logError("chat-folders:list failed", String(_err));
      return { ok: false, error: "Failed to list chat folders", folders: [] };
    
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:create", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { name, profileId: requestedProfileId } = _input as { name?: string; profileId?: string };
      if (!name || typeof name !== "string") return { ok: false, error: "Invalid name" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const { folders } = await listChatFolders(profileId);
      const maxSortOrder = folders.reduce((max, f) => Math.max(max, f.sortOrder), 0);
      
      const newFolder: ChatFolder = {
        id: crypto.randomUUID(),
        name,
        sortOrder: maxSortOrder + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lockState: "unlocked",
        schemaVersion: 1
      };
      
      const saveRes = await saveChatFolder(newFolder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      return { ok: true, folder: newFolder };
    } catch (_err) {
      logError("chat-folders:create failed", String(_err));
      return { ok: false, error: "Failed to create folder" };
    
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:rename", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { id, name, profileId: requestedProfileId } = _input as { id?: string; name?: string; profileId?: string };
      if (!id || typeof id !== "string") return { ok: false, error: "Invalid id" };
      if (!name || typeof name !== "string") return { ok: false, error: "Invalid name" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(id, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };
      
      folder.name = name;
      folder.updatedAt = new Date().toISOString();
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:rename failed", String(_err));
      return { ok: false, error: "Failed to rename folder" };
    
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:reorder", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderIds, profileId: requestedProfileId } = _input as { folderIds?: string[]; profileId?: string };
      if (!Array.isArray(folderIds)) return { ok: false, error: "Invalid folderIds array" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const { folders } = await listChatFolders(profileId);
      const folderMap = new Map(folders.map(f => [f.id, f]));
      
      for (let i = 0; i < folderIds.length; i++) {
        const f = folderMap.get(folderIds[i]);
        if (f) {
          f.sortOrder = i + 1;
          f.updatedAt = new Date().toISOString();
          await saveChatFolder(f, profileId);
        
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
      
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:reorder failed", String(_err));
      return { ok: false, error: "Failed to reorder folders" };
    
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:delete", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { id, deleteChats, profileId: requestedProfileId } = _input as { id?: string; deleteChats?: boolean; profileId?: string };
      if (!id || typeof id !== "string") return { ok: false, error: "Invalid id" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const res = await deleteChatFolderFile(id, profileId);
      if (!res.ok) return { ok: false, error: res.error };
      
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === id);

      if (deleteChats) {
        for (const chat of targetChats) {
          const { deleteConversation } = await import("../../services/chatStorage");
          await deleteConversation(chat.id, profileId);
        
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
      } else {
        for (const chat of targetChats) {
          chat.folderId = null;
          chat.updatedAt = new Date().getTime();
          await saveConversation(chat, profileId);
        
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
      
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:delete failed", String(_err));
      return { ok: false, error: "Failed to delete folder" };
    
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:move-conversation", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { conversationId, destinationFolderId, profileId: requestedProfileId } = _input as { conversationId?: string; destinationFolderId?: string | null; profileId?: string };
      if (!conversationId || typeof conversationId !== "string") return { ok: false, error: "Invalid conversationId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const { getConversation, saveConversation } = await import("../../services/chatStorage");
      const chat = await getConversation(conversationId, profileId);
      if (!chat) return { ok: false, error: "Conversation not found" };

      chat.folderId = destinationFolderId || null;
      chat.updatedAt = new Date().getTime();
      const saveRes = await saveConversation(chat, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };

      return { ok: true };
    } catch (_err) {
      logError("chat-folders:move-conversation failed", String(_err));
      return { ok: false, error: "Failed to move conversation" };
    
  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  
  registerIpcChannel("chat-folders:lock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };
      if (!password || typeof password !== "string") return { ok: false, error: "Password required" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      setCredential(`chat-folder:${folderId}`, password);

      folder.lockState = "locked";
      folder.lockedAt = new Date().toISOString();
      folder.lockVersion = (folder.lockVersion || 0) + 1;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:lock failed", String(_err));
      return { ok: false, error: "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, password, profileId: requestedProfileId } = _input as { folderId?: string; password?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const storedPassword = getCredential(`chat-folder:${folderId}`);
      if (storedPassword && storedPassword !== password) {
        return { ok: false, error: "Incorrect password" };
      }

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      deleteCredential(`chat-folder:${folderId}`);

      folder.lockState = "unlocked";
      folder.lockedAt = null;
      
      const saveRes = await saveChatFolder(folder, profileId);
      if (!saveRes.ok) return { ok: false, error: saveRes.error };
      
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:unlock failed", String(_err));
      return { ok: false, error: "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      return { ok: true, lockState: folder.lockState };
    } catch (_err) {
      logError("chat-folders:get-lock-state failed", String(_err));
      return { ok: false, error: "Failed to get lock state" };
    
  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // Preview: how many conversations?
      const { conversations } = await listConversations(undefined, profileId) as { conversations: import("../../../src/types/conversation").Conversation[] };
      const targetChats = conversations.filter(c => c.folderId === folderId);

      return { ok: true, preview: { folderName: folder.name, chatCount: targetChats.length } };
    } catch (_err) {
      logError("chat-folders:get-backup-preview failed", String(_err));
      return { ok: false, error: "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (_event, _input: unknown) => {
    try {
      if (!_input || typeof _input !== "object") return { ok: false, error: "Invalid _input" };
      const { folderId, profileId: requestedProfileId } = _input as { folderId?: string; includeMedia?: boolean; profileId?: string };
      if (!folderId || typeof folderId !== "string") return { ok: false, error: "Invalid folderId" };

      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(_event.sender);
      
      const folder = await readChatFolder(folderId, profileId);
      if (!folder) return { ok: false, error: "Folder not found" };

      // In real implementation, this would trigger a save dialog and export
      // For now, return ok as a stub
      return { ok: true };
    } catch (_err) {
      logError("chat-folders:export-backup failed", String(_err));
      return { ok: false, error: "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true, preview: {} };
    } catch {
      return { ok: false, error: "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (_event, _input: unknown) => {
    try {
      // Stub
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to import backup" };
    }
  });
}
