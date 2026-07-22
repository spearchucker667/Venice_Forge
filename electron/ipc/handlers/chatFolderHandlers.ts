import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { dialog } from "electron";
import { registerIpcChannel } from "./common";
import { requireProfileSessionId as getProfileSessionId } from "../../services/profileSession";
import {
  listChatFolders,
  createChatFolder,
  renameChatFolder,
  reorderChatFolders,
  moveConversationToFolder,
  moveConversationsToFolder,
  deleteChatFolder,
} from "../../services/chatFolderService";
import { isValidId } from "../../services/chatFolderStorage";
import { getBackupPreview, exportBackup, previewImport, importBackup } from "../../services/chatFolderBackupService";
import { FolderUnlockBackoffError, lockFolder, unlockFolder, getLockState } from "../../services/chatFolderLockService";
import type {
  CreateChatFolderInput,
  RenameChatFolderInput,
  ReorderChatFoldersInput,
  MoveConversationToFolderInput,
  MoveConversationsToFolderInput,
  DeleteChatFolderInput,
  LockFolderInput,
  UnlockFolderInput,
  FolderBackupPreviewInput,
  ExportFolderBackupInput,
  PreviewFolderImportInput,
  ImportFolderBackupInput,
} from "../../../src/shared/chatFolderContracts";
import { logError } from "../../services/logger";

const MAX_FOLDER_NAME_LENGTH = 120;
const MAX_FOLDER_IDS = 500;
const MIN_PASSPHRASE_LENGTH = 8;
const MAX_PASSPHRASE_LENGTH = 1024;
const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const FILE_CAPABILITY_TTL_MS = 10 * 60 * 1000;

interface BackupFileCapability {
  senderId: number;
  profileId: string;
  filePath: string;
  realPath: string;
  size: number;
  mtimeMs: number;
  dev: number;
  ino: number;
  expiresAt: number;
}

const backupFileCapabilities = new Map<string, BackupFileCapability>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_FOLDER_NAME_LENGTH && value.trim().length > 0;
}

function validPassphrase(value: unknown): value is string {
  return typeof value === "string" && value.length >= MIN_PASSPHRASE_LENGTH && value.length <= MAX_PASSPHRASE_LENGTH;
}

function validOptionalPassphrase(value: unknown): value is string | undefined {
  return value === undefined || validPassphrase(value);
}

function validKind(value: unknown): value is "standard" | "character" {
  return value === "standard" || value === "character";
}

function validIdArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= MAX_FOLDER_IDS
    && new Set(value).size === value.length
    && value.every(isValidId);
}

function isCreateInput(value: unknown): value is CreateChatFolderInput {
  return isRecord(value) && validName(value.name) && validKind(value.kind);
}

function isRenameInput(value: unknown): value is RenameChatFolderInput {
  return isRecord(value) && isValidId(value.folderId) && validName(value.name);
}

function isReorderInput(value: unknown): value is ReorderChatFoldersInput {
  return isRecord(value) && validIdArray(value.folderIds) && validKind(value.kind);
}

function isMoveInput(value: unknown): value is MoveConversationToFolderInput {
  return isRecord(value) && isValidId(value.conversationId) && (value.folderId === null || isValidId(value.folderId));
}

function isBulkMoveInput(value: unknown): value is MoveConversationsToFolderInput {
  return isRecord(value) && validIdArray(value.conversationIds) && (value.folderId === null || isValidId(value.folderId));
}

function isDeleteInput(value: unknown): value is DeleteChatFolderInput {
  return isRecord(value) && isValidId(value.folderId) && typeof value.deleteConversations === "boolean";
}

function isFolderIdInput(value: unknown): value is FolderBackupPreviewInput {
  return isRecord(value) && isValidId(value.folderId);
}

function isExportInput(value: unknown): value is ExportFolderBackupInput {
  return isRecord(value)
    && isValidId(value.folderId)
    && typeof value.includeMedia === "boolean"
    && validPassphrase(value.passphrase)
    && value.passphraseConfirmed === true;
}

function isPreviewImportInput(value: unknown): value is PreviewFolderImportInput {
  return isRecord(value) && typeof value.fileCapability === "string" && value.fileCapability.length <= 128;
}

function isImportInput(value: unknown): value is ImportFolderBackupInput {
  if (!isRecord(value) || typeof value.fileCapability !== "string" || value.fileCapability.length > 128) return false;
  if (!validPassphrase(value.passphrase)) return false;
  if (value.mode !== "new-folder" && value.mode !== "merge") return false;
  return value.mode !== "merge" || isValidId(value.targetFolderId);
}

function isLockInput(value: unknown): value is LockFolderInput {
  return isRecord(value)
    && isValidId(value.folderId)
    && validPassphrase(value.passphrase)
    && (value.rememberOnDevice === undefined || typeof value.rememberOnDevice === "boolean");
}

function isUnlockInput(value: unknown): value is UnlockFolderInput {
  return isRecord(value)
    && isValidId(value.folderId)
    && validOptionalPassphrase(value.passphrase)
    && (value.useRememberedUnlock === undefined || typeof value.useRememberedUnlock === "boolean")
    && (validPassphrase(value.passphrase) || value.useRememberedUnlock === true);
}

async function issueBackupFileCapability(senderId: number, profileId: string, filePath: string): Promise<{
  token: string;
  fileName: string;
  byteCount: number;
}> {
  if (path.extname(filePath).toLowerCase() !== ".vfbackup") throw new Error("Select a .vfbackup file");
  const linkStats = await fs.lstat(filePath);
  if (linkStats.isSymbolicLink() || !linkStats.isFile()) throw new Error("Backup must be a regular file");
  if (linkStats.size <= 0 || linkStats.size > MAX_BACKUP_BYTES) throw new Error("Backup file size is outside the supported range");
  const realPath = await fs.realpath(filePath);
  const stats = await fs.stat(realPath);
  const token = crypto.randomUUID();
  backupFileCapabilities.set(token, {
    senderId,
    profileId,
    filePath,
    realPath,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    dev: stats.dev,
    ino: stats.ino,
    expiresAt: Date.now() + FILE_CAPABILITY_TTL_MS,
  });
  return { token, fileName: path.basename(filePath), byteCount: stats.size };
}

async function resolveBackupFileCapability(
  token: string,
  senderId: number,
  profileId: string,
  consume: boolean,
): Promise<string> {
  const capability = backupFileCapabilities.get(token);
  if (!capability || capability.senderId !== senderId || capability.profileId !== profileId) {
    throw new Error("Backup file approval is invalid");
  }
  if (capability.expiresAt <= Date.now()) {
    backupFileCapabilities.delete(token);
    throw new Error("Backup file approval expired");
  }
  const linkStats = await fs.lstat(capability.filePath);
  const realPath = await fs.realpath(capability.filePath);
  const stats = await fs.stat(realPath);
  if (
    linkStats.isSymbolicLink()
    || !stats.isFile()
    || realPath !== capability.realPath
    || stats.size !== capability.size
    || stats.mtimeMs !== capability.mtimeMs
    || stats.dev !== capability.dev
    || stats.ino !== capability.ino
  ) {
    backupFileCapabilities.delete(token);
    throw new Error("Backup file changed after approval");
  }
  if (consume) backupFileCapabilities.delete(token);
  return realPath;
}

function safeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function registerChatFolderHandlers(): void {
  registerIpcChannel("chat-folders:list", async (event) => {
    try {
      const result = await listChatFolders(getProfileSessionId(event.sender));
      return { ok: true, folders: result.folders };
    } catch (error) {
      logError("chat-folders:list failed", safeError(error, "Unknown error"));
      return { ok: false, error: "Failed to list chat folders", folders: [] };
    }
  });

  registerIpcChannel("chat-folders:create", async (event, input: unknown) => {
    if (!isCreateInput(input)) return { ok: false, error: "Invalid create-folder input" };
    try { return { ok: true, folder: await createChatFolder(input, getProfileSessionId(event.sender)) }; }
    catch (error) { return { ok: false, error: safeError(error, "Failed to create folder") }; }
  });

  registerIpcChannel("chat-folders:rename", async (event, input: unknown) => {
    if (!isRenameInput(input)) return { ok: false, error: "Invalid rename-folder input" };
    try { return { ok: true, folder: await renameChatFolder(input, getProfileSessionId(event.sender)) }; }
    catch (error) { return { ok: false, error: safeError(error, "Failed to rename folder") }; }
  });

  registerIpcChannel("chat-folders:reorder", async (event, input: unknown) => {
    if (!isReorderInput(input)) return { ok: false, error: "Invalid reorder input" };
    try { return { ok: true, result: await reorderChatFolders(input, getProfileSessionId(event.sender)) }; }
    catch (error) { return { ok: false, error: safeError(error, "Failed to reorder folders") }; }
  });

  registerIpcChannel("chat-folders:move-conversation", async (event, input: unknown) => {
    if (!isMoveInput(input)) return { ok: false, error: "Invalid move input" };
    try { return { ok: true, result: await moveConversationToFolder(input, getProfileSessionId(event.sender)) }; }
    catch (error) { return { ok: false, error: safeError(error, "Failed to move conversation") }; }
  });

  registerIpcChannel("chat-folders:move-conversations", async (event, input: unknown) => {
    if (!isBulkMoveInput(input)) return { ok: false, error: "Invalid bulk-move input" };
    try { return { ok: true, result: await moveConversationsToFolder(input, getProfileSessionId(event.sender)) }; }
    catch (error) { return { ok: false, error: safeError(error, "Failed to move conversations") }; }
  });

  registerIpcChannel("chat-folders:delete", async (event, input: unknown) => {
    if (!isDeleteInput(input)) return { ok: false, error: "Invalid delete-folder input" };
    try { return { ok: true, result: await deleteChatFolder(input, getProfileSessionId(event.sender)) }; }
    catch (error) { return { ok: false, error: safeError(error, "Failed to delete folder") }; }
  });

  registerIpcChannel("chat-folders:get-backup-preview", async (event, input: unknown) => {
    if (!isFolderIdInput(input)) return { ok: false, error: "Invalid backup-preview input" };
    try { return { ok: true, preview: await getBackupPreview(input, getProfileSessionId(event.sender)) }; }
    catch (error) { return { ok: false, error: safeError(error, "Failed to get backup preview") }; }
  });

  registerIpcChannel("chat-folders:export-backup", async (event, input: unknown) => {
    if (!isExportInput(input)) return { ok: false, error: "Export requires a folder id and matching 8+ character passphrases" };
    const defaultName = `venice-forge-folder-backup-${Date.now()}.vfbackup`;
    // verify-no-native-dialogs: allow — explicit user-mediated encrypted folder-backup export
    const selection = await dialog.showSaveDialog({
      title: "Export encrypted chat-folder backup",
      defaultPath: defaultName,
      filters: [{ name: "Venice Forge Backup", extensions: ["vfbackup"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    if (selection.canceled || !selection.filePath) return { ok: false, canceled: true };
    const destination = selection.filePath.toLowerCase().endsWith(".vfbackup") ? selection.filePath : `${selection.filePath}.vfbackup`;
    try {
      const result = await exportBackup(input, getProfileSessionId(event.sender), destination);
      return { ok: result.ok, fileName: result.fileName, error: result.error };
    }
    catch (error) { return { ok: false, error: safeError(error, "Failed to export backup") }; }
  });

  registerIpcChannel("chat-folders:pick-import-file", async (event) => {
    // verify-no-native-dialogs: allow — explicit user-mediated encrypted folder-backup import
    const selection = await dialog.showOpenDialog({
      title: "Select encrypted chat-folder backup",
      filters: [{ name: "Venice Forge Backup", extensions: ["vfbackup"] }],
      properties: ["openFile"],
    });
    if (selection.canceled || selection.filePaths.length !== 1) return { ok: false, canceled: true };
    try {
      const profileId = getProfileSessionId(event.sender);
      const issued = await issueBackupFileCapability(event.sender.id, profileId, selection.filePaths[0]);
      return { ok: true, fileCapability: issued.token, fileName: issued.fileName, byteCount: issued.byteCount };
    } catch (error) {
      return { ok: false, error: safeError(error, "Failed to approve backup file") };
    }
  });

  registerIpcChannel("chat-folders:preview-import", async (event, input: unknown) => {
    if (!isPreviewImportInput(input)) return { ok: false, error: "Invalid import-preview input" };
    try {
      const profileId = getProfileSessionId(event.sender);
      const backupFilePath = await resolveBackupFileCapability(input.fileCapability, event.sender.id, profileId, false);
      return { ok: true, preview: await previewImport({ backupFilePath }, profileId) };
    } catch (error) { return { ok: false, error: safeError(error, "Failed to preview import") }; }
  });

  registerIpcChannel("chat-folders:import-backup", async (event, input: unknown) => {
    if (!isImportInput(input)) return { ok: false, error: "Import requires an approved backup file, mode, and passphrase" };
    try {
      const profileId = getProfileSessionId(event.sender);
      const backupFilePath = await resolveBackupFileCapability(input.fileCapability, event.sender.id, profileId, true);
      return await importBackup({ ...input, backupFilePath }, profileId);
    } catch (error) { return { ok: false, error: safeError(error, "Failed to import backup") }; }
  });

  registerIpcChannel("chat-folders:lock", async (event, input: unknown) => {
    if (!isLockInput(input)) return { ok: false, error: "Lock requires a folder id and an 8+ character passphrase" };
    try { await lockFolder(input, getProfileSessionId(event.sender)); return { ok: true }; }
    catch (error) { return { ok: false, error: safeError(error, "Failed to lock folder") }; }
  });

  registerIpcChannel("chat-folders:unlock", async (event, input: unknown) => {
    if (!isUnlockInput(input)) return { ok: false, error: "Unlock requires valid credentials" };
    try { await unlockFolder(input, getProfileSessionId(event.sender)); return { ok: true }; }
    catch (error) {
      if (error instanceof FolderUnlockBackoffError) return { ok: false, error: error.message, retryAfter: error.retryAfter };
      return { ok: false, error: safeError(error, "Failed to unlock folder") };
    }
  });

  registerIpcChannel("chat-folders:get-lock-state", async (event, input: unknown) => {
    if (!isFolderIdInput(input)) return { ok: false, error: "Invalid lock-state input" };
    try { return { ok: true, lockState: await getLockState(input.folderId, getProfileSessionId(event.sender)) }; }
    catch (error) { return { ok: false, error: safeError(error, "Failed to get lock state") }; }
  });
}

export function __clearChatFolderFileCapabilitiesForTests(): void {
  backupFileCapabilities.clear();
}
