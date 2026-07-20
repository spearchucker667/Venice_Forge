/**
 * @fileoverview Single-file-per-record storage for Chat Folders.
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { app } from "electron";
import { logError, logInfo } from "./logger";
import { isValidId as isCanonicalValidId } from "../../src/utils/idValidation";
import { isValidProfileStorageId } from "../../src/utils/profileIdValidation";
import type { ChatFolder } from "../../src/shared/chatFolderContracts";

const CHAT_FOLDERS_DIR = "chat-folders";
const TMP_SUFFIX = ".tmp";
const MAX_SCAN_FILES = 1000;
const MAX_LOAD_FILES = 1000;

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && isCanonicalValidId(id);
}

export function getChatFoldersDir(profileId: string = "default"): string {
  if (!isValidProfileStorageId(profileId)) throw new Error("Invalid profile id.");
  const root = path.join(app.getPath("userData"), CHAT_FOLDERS_DIR);
  return profileId === "default" ? root : path.join(root, "profiles", profileId);
}

function fileFor(id: string, profileId: string = "default"): string {
  return path.join(getChatFoldersDir(profileId), `${id}.json`);
}

function isValidChatFolder(obj: unknown): obj is ChatFolder {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (!isValidId(o.id)) return false;
  if (typeof o.name !== "string") return false;
  if (typeof o.sortOrder !== "number") return false;
  if (typeof o.schemaVersion !== "number") return false;
  if (o.kind !== "standard" && o.kind !== "character") return false;
  if (typeof o.profileId !== "string") return false;
  return true;
}

/** Legacy folder shape without kind field. */
interface LegacyChatFolder {
  id: string;
  profileId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  lockState?: "unlocked" | "locked";
  lockedAt?: string | null;
  lockVersion?: number;
  schemaVersion: number;
}

function isLegacyChatFolder(obj: unknown): obj is LegacyChatFolder {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (!isValidId(o.id)) return false;
  if (typeof o.name !== "string") return false;
  if (typeof o.sortOrder !== "number") return false;
  if (typeof o.schemaVersion !== "number") return false;
  if (typeof o.profileId !== "string") return false;
  return true;
}

export async function listChatFolders(profileId: string = "default"): Promise<{ folders: ChatFolder[]; truncated: boolean; totalScanned: number }> {
  const base = getChatFoldersDir(profileId);
  const names: string[] = [];
  let handle: Awaited<ReturnType<typeof fs.opendir>>;
  try {
    handle = await fs.opendir(base);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { folders: [], truncated: false, totalScanned: 0 };
    }
    throw err;
  }
  try {
    for await (const entry of handle) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        const id = entry.name.slice(0, -".json".length);
        if (isValidId(id)) {
          names.push(id);
          if (names.length >= MAX_SCAN_FILES) {
            logInfo(`chat-folders directory scan reached ${MAX_SCAN_FILES}; further files skipped`);
            break;
          }
        }
      }
    }
  } finally {
    // for-await handles cleanup
  }
  const folders: ChatFolder[] = [];
  for (const id of names.slice(0, MAX_LOAD_FILES)) {
    const item = await readChatFolder(id, profileId);
    if (item) folders.push(item);
  }
  return { folders, truncated: names.length > MAX_LOAD_FILES, totalScanned: names.length };
}

export async function readChatFolder(id: string, profileId: string = "default"): Promise<ChatFolder | null> {
  if (!isValidId(id)) return null;
  const file = fileFor(id, profileId);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (isValidChatFolder(parsed)) return parsed;
    if (isLegacyChatFolder(parsed)) {
      return migrateLegacyFolder(parsed, profileId);
    }
    throw new Error("schema validation failed");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") return null;
    logError(`chat-folders file corrupt or unreadable`, { path: file, error: String(err) });
    try {
      const backupPath = `${file}.backup.${Date.now()}.${crypto.randomUUID()}`;
      await fs.rename(file, backupPath);
      logInfo(`Corrupt chat-folders file backed up`, backupPath);
    } catch {
      // best effort
    }
    return null;
  }
}

async function migrateLegacyFolder(legacy: LegacyChatFolder, profileId: string): Promise<ChatFolder> {
  // For now, default to "standard" kind. A full migration that inspects
  // conversation contents should run as a one-time migration step.
  // This handles the case where a legacy folder is read before the migration runs.
  const migrated: ChatFolder = {
    ...legacy,
    kind: "standard",
    lockState: legacy.lockState ?? "unlocked",
    lockedAt: legacy.lockedAt ?? null,
    lockVersion: legacy.lockVersion ?? 0,
    schemaVersion: Math.max(legacy.schemaVersion, 1),
  };
  // Save the migrated version
  await saveChatFolder(migrated, profileId);
  return migrated;
}

export async function saveChatFolder(folder: ChatFolder, profileId: string = "default"): Promise<{ ok: boolean; error?: string }> {
  if (!isValidChatFolder(folder)) return { ok: false, error: "schema validation failed" };
  const id = folder.id;
  if (!isValidId(id)) return { ok: false, error: "invalid id" };
  const dir = getChatFoldersDir(profileId);
  await fs.mkdir(dir, { recursive: true });
  const target = fileFor(id, profileId);
  const tmp = `${target}${TMP_SUFFIX}`;
  try {
    const raw = JSON.stringify(folder, null, 2);
    await fs.writeFile(tmp, raw, "utf-8");
    await fs.rename(tmp, target);
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to write chat-folders file" };
  }
}

export async function deleteChatFolderFile(id: string, profileId: string = "default"): Promise<{ ok: boolean; error?: string }> {
  if (!isValidId(id)) return { ok: false, error: "invalid id" };
  try {
    const target = fileFor(id, profileId);
    await fs.unlink(target);
    return { ok: true };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") return { ok: true };
    return { ok: false, error: "Failed to delete chat-folders file" };
  }
}
