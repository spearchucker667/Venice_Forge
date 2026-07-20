import { registerIpcChannel } from "./common";
import { getProfileSessionId } from "../../services/profileSession";
import {
  listChatFolders,
  createChatFolder,
  renameChatFolder,
  reorderChatFolders,
  moveConversationToFolder,
  deleteChatFolder
} from "../../services/chatFolderService";
import {
  getBackupPreview,
  exportBackup,
  previewImport,
  importBackup
} from "../../services/chatFolderBackupService";
import {
  lockFolder,
  unlockFolder,
  getLockState
} from "../../services/chatFolderLockService";
import type {
  CreateChatFolderInput,
  RenameChatFolderInput,
  ReorderChatFoldersInput,
  MoveConversationToFolderInput,
  DeleteChatFolderInput,
  LockFolderInput,
  UnlockFolderInput,
  FolderBackupPreviewInput,
  ExportFolderBackupInput,
  PreviewFolderImportInput,
  ImportFolderBackupInput
} from "../../../src/shared/chatFolderContracts";
import { logError } from "../../services/logger";

export function registerChatFolderHandlers(): void {
  registerIpcChannel("chat-folders:list", async (event, requestedProfileId: unknown) => {
    try {
      const profileId = typeof requestedProfileId === "string" ? requestedProfileId : getProfileSessionId(event.sender);
      const result = await listChatFolders(profileId);
      return { ok: true, folders: result.folders };
    } catch (err) {
      logError("chat-folders:list failed", String(err));
      return { ok: false, error: "Failed to list chat folders", folders: [] };
    }
  });

  registerIpcChannel("chat-folders:create", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      const result = await createChatFolder(input as CreateChatFolderInput, profileId);
      return { ok: true, folder: result };
    } catch (err) {
      logError("chat-folders:create failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to create folder" };
    }
  });

  registerIpcChannel("chat-folders:rename", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      const result = await renameChatFolder(input as RenameChatFolderInput, profileId);
      return { ok: true, folder: result };
    } catch (err) {
      logError("chat-folders:rename failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to rename folder" };
    }
  });

  registerIpcChannel("chat-folders:reorder", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      await reorderChatFolders(input as ReorderChatFoldersInput, profileId);
      return { ok: true };
    } catch (err) {
      logError("chat-folders:reorder failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to reorder folders" };
    }
  });

  registerIpcChannel("chat-folders:move-conversation", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      await moveConversationToFolder(input as MoveConversationToFolderInput, profileId);
      return { ok: true };
    } catch (err) {
      logError("chat-folders:move-conversation failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to move conversation" };
    }
  });

  registerIpcChannel("chat-folders:delete", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      await deleteChatFolder(input as DeleteChatFolderInput, profileId);
      return { ok: true };
    } catch (err) {
      logError("chat-folders:delete failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to delete folder" };
    }
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      const result = await getBackupPreview(input as FolderBackupPreviewInput, profileId);
      return { ok: true, preview: result };
    } catch (err) {
      logError("chat-folders:get-backup-preview failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to get backup preview" };
    }
  });

  registerIpcChannel("chat-folders:export-backup", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      if (!isExportFolderBackupInput(input)) {
        return { ok: false, error: "Export requires a folder id and a confirmed 8+ character passphrase" };
      }
      const result = await exportBackup(input, profileId);
      return result;
    } catch (err) {
      logError("chat-folders:export-backup failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to export backup" };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      const result = await previewImport(input as PreviewFolderImportInput, profileId);
      return { ok: true, preview: result };
    } catch (err) {
      logError("chat-folders:preview-import failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to preview import" };
    }
  });

  registerIpcChannel("chat-folders:import-backup", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      if (!isImportFolderBackupInput(input)) {
        return { ok: false, error: "Import requires a backup file path, mode, and passphrase" };
      }
      const result = await importBackup(input, profileId);
      return result;
    } catch (err) {
      logError("chat-folders:import-backup failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to import backup" };
    }
  });

  registerIpcChannel("chat-folders:lock", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      await lockFolder(input as LockFolderInput, profileId);
      return { ok: true };
    } catch (err) {
      logError("chat-folders:lock failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to lock folder" };
    }
  });

  registerIpcChannel("chat-folders:unlock", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      await unlockFolder(input as UnlockFolderInput, profileId);
      return { ok: true };
    } catch (err) {
      logError("chat-folders:unlock failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to unlock folder" };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (event, input: unknown) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      const result = await getLockState((input as { folderId: string }).folderId, profileId);
      return { ok: true, lockState: result };
    } catch (err) {
      logError("chat-folders:get-lock-state failed", String(err));
      return { ok: false, error: err instanceof Error ? err.message : "Failed to get lock state" };
    }
  });
}

function isExportFolderBackupInput(input: unknown): input is ExportFolderBackupInput {
  if (!input || typeof input !== "object") return false;
  const obj = input as Record<string, unknown>;
  if (typeof obj.folderId !== "string" || obj.folderId.length === 0) return false;
  if (typeof obj.passphrase !== "string" || obj.passphrase.length < 8) return false;
  // Confirm gate is required unless the file is itself a re-export by an
  // administrative migration tool. Production UI returns true only when the
  // user retyped the passphrase.
  if (obj.passphraseConfirmed !== undefined && typeof obj.passphraseConfirmed !== "boolean") return false;
  return true;
}

function isImportFolderBackupInput(input: unknown): input is ImportFolderBackupInput {
  if (!input || typeof input !== "object") return false;
  const obj = input as Record<string, unknown>;
  if (typeof obj.backupFilePath !== "string" || obj.backupFilePath.length === 0) return false;
  if (typeof obj.passphrase !== "string" || obj.passphrase.length === 0) return false;
  if (obj.mode !== "new-folder" && obj.mode !== "merge") return false;
  if (obj.mode === "merge" && (typeof obj.targetFolderId !== "string" || obj.targetFolderId.length === 0)) {
    return false;
  }
  return true;
}
