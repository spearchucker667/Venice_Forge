import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import crypto from "crypto";
import { promises as fs } from "fs";
import { logInfo, logError } from "./logger";
import { redactErrorMessage } from "../../src/shared/redaction";
import { BrowserWindow } from "electron";
import { encryptPayload, decryptPayload, EncryptedBackupManifest } from "./backupCrypto";
import { getSyncPath, setSyncPath, getDeviceId } from "./syncConfig";

let watcher: FSWatcher | null = null;
let currentSyncPath: string | null = null;
let mainWindowRef: BrowserWindow | null = null;
let currentPassword: string | null = null;
let syncStatus: "stopped" | "paused" | "running" = "stopped";
let localEmissionSuppressed = false;
const processedOperationIds = new Set<string>();
const MAX_PACKET_BYTES = 50 * 1024 * 1024;
export const SYNC_STORE_ALLOWLIST = new Set([
  "images", "chats", "settings", "conversations", "ai_memory", "files", "character_cards",
  "personas", "lorebooks", "rp_chats", "rp_assets", "projects", "promptLibrary", "scenes",
  "rpScenarios", "workflowTemplates", "researchSessions", "visualWorkflows", "playground", "tombstones",
]);

/** Initialize the watcher. Must provide the mainWindow to send events back. */
export async function initSyncFolderWatcher(mainWindow: BrowserWindow) {
  mainWindowRef = mainWindow;
  currentSyncPath = await getSyncPath();
}

export async function startSyncWatcher(password: string): Promise<{ ok: boolean; error?: string }> {
  if (!password) return { ok: false, error: "Sync passphrase is required." };
  currentPassword = password;
  syncStatus = "running";
  if (currentSyncPath) {
    return await setSyncFolder(currentSyncPath);
  }
  return { ok: true };
}

export async function stopSyncWatcher(): Promise<{ ok: boolean; error?: string }> {
  currentPassword = null;
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  syncStatus = "stopped";
  return { ok: true };
}

export async function pauseSyncWatcher(): Promise<{ ok: boolean; error?: string }> {
  if (watcher) await watcher.close();
  watcher = null;
  currentPassword = null;
  syncStatus = "paused";
  return { ok: true };
}

export function getSyncStatus() {
  return { status: syncStatus, configured: Boolean(currentSyncPath) };
}

/** Temporarily suppresses local sync emission (used during bulk import). */
export function setSyncEmissionSuppressed(suppressed: boolean): void {
  localEmissionSuppressed = suppressed;
}

/** Returns whether local sync emission is currently suppressed. */
export function isSyncEmissionSuppressed(): boolean {
  return localEmissionSuppressed;
}

/** Set the sync folder and start watching. */
export async function setSyncFolder(syncPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }

    currentSyncPath = syncPath;
    await setSyncPath(syncPath);
    if (!syncPath) {
      return { ok: true };
    }

    // Ensure .vfbackup directory exists
    const vfbackupPath = path.join(syncPath, ".vfbackup");
    await fs.mkdir(vfbackupPath, { recursive: true });
    await fs.mkdir(path.join(vfbackupPath, "blobs"), { recursive: true });
    await fs.mkdir(path.join(vfbackupPath, "objects"), { recursive: true });
    for (const entry of await fs.readdir(path.join(vfbackupPath, "blobs"))) {
      if (entry.endsWith(".tmp")) await fs.rm(path.join(vfbackupPath, "blobs", entry), { force: true });
    }

    // Only start watching if we have a password
    if (currentPassword) {
      watcher = chokidar.watch(path.join(vfbackupPath, "blobs"), {
        ignored: /(^|[/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: false, // We DO want to process existing files on startup
        depth: 0 // only watch blobs directly in blobs folder
      });

      watcher.on("add", handleRemoteChange);
      watcher.on("change", handleRemoteChange);
      
      logInfo("syncFolderWatcher", "Started watching approved encrypted sync folder");
    } else {
      logInfo("syncFolderWatcher", "Encrypted sync folder configured; sync is paused");
    }

    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncFolderWatcher", `Failed to set sync folder: ${redactErrorMessage(errorMsg)}`);
    return { ok: false, error: redactErrorMessage(errorMsg) };
  }
}

/** Get current sync folder. */
export function getSyncFolder(): string | null {
  return currentSyncPath;
}

/** Handle incoming changes from the filesystem. */
async function handleRemoteChange(filePath: string) {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  if (!currentPassword) return;

  const filename = path.basename(filePath);

  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_PACKET_BYTES) throw new Error("Encrypted packet exceeds maximum size");
    const data = await fs.readFile(filePath, "utf8");
    const manifest: EncryptedBackupManifest = JSON.parse(data);

    // Ensure valid version
    if (manifest.version !== 2 || typeof manifest.salt !== "string" || typeof manifest.iv !== "string" || typeof manifest.ciphertext !== "string") {
      logError("syncFolderWatcher", `Unsupported backup version for ${filename}`);
      return;
    }

    const decrypted = await decryptPayload(manifest.ciphertext, manifest.salt, manifest.iv, currentPassword);
    const parsed = JSON.parse(decrypted);

    logInfo("syncFolderWatcher", `Detected remote change for ${filename}`);
    
    // We expect the parsed JSON to contain storeName and id
    if (!parsed._storeName || !SYNC_STORE_ALLOWLIST.has(parsed._storeName) || !parsed._id || !parsed.data
      || typeof parsed._operationId !== "string" || !/^[a-f0-9]{64}$/.test(parsed._operationId)) {
      logError("syncFolderWatcher", `Decrypted payload missing metadata for ${filename}`);
      return;
    }
    
    const localDeviceId = await getDeviceId();
    if (parsed._sourceDeviceId === localDeviceId) {
      // Ignore our own echoes
      return;
    }
    if (processedOperationIds.has(parsed._operationId)) return;
    processedOperationIds.add(parsed._operationId);
    if (processedOperationIds.size > 10_000) processedOperationIds.delete(processedOperationIds.values().next().value as string);

    mainWindowRef.webContents.send("sync:onRemoteChange", { 
      storeName: parsed._storeName,
      id: parsed._id,
      recordJson: JSON.stringify(parsed.data)
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncFolderWatcher", `Failed to read/decrypt changed sync file ${filename}: ${redactErrorMessage(errorMsg)}`);
  }
}

/** Write an encrypted packet to the sync folder. */
export async function writePacket(storeName: string, id: string, recordJson: string): Promise<{ ok: boolean; error?: string }> {
  if (localEmissionSuppressed) return { ok: true };
  if (!currentSyncPath) return { ok: false, error: "Sync folder not configured." };
  if (!currentPassword) return { ok: false, error: "Sync is not active (no password)." };

  // Strict path traversal and semantic validation for storeName and id
  if (!SYNC_STORE_ALLOWLIST.has(storeName)) {
    return { ok: false, error: `Invalid storeName: ${storeName}` };
  }
  
  if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_.:-]{1,256}$/.test(id) || id.includes("..")) {
    return { ok: false, error: "Invalid id" };
  }

  try {
    if (Buffer.byteLength(recordJson, "utf8") > MAX_PACKET_BYTES) return { ok: false, error: "Payload exceeds maximum allowed size" };
    const parsedRecord = JSON.parse(recordJson);
    if (!parsedRecord || typeof parsedRecord !== "object" || Array.isArray(parsedRecord)) {
      return { ok: false, error: "recordJson must be a valid object" };
    }
    
    // Ensure the inner record id matches the wrapper id
    if (parsedRecord.id !== id) {
      return { ok: false, error: "Record ID mismatch between envelope and payload" };
    }

    const operationId = crypto.createHash("sha256").update(`${storeName}\0${id}\0${recordJson}`).digest("hex");
    const payload = JSON.stringify({
      _storeName: storeName,
      _id: id,
      _operationId: operationId,
      _sourceDeviceId: await getDeviceId(),
      data: parsedRecord
    });
    
    if (payload.length > 50 * 1024 * 1024) { // 50MB reasonable max
      return { ok: false, error: "Payload exceeds maximum allowed size" };
    }

    const encrypted = await encryptPayload(payload, currentPassword);

    const manifest: EncryptedBackupManifest = {
      version: 2,
      exportedAt: new Date().toISOString(),
      salt: encrypted.salt,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext
    };

    const manifestJson = JSON.stringify(manifest, null, 2);

    // Hash the canonical payload for idempotent naming
    const canonicalHash = crypto.createHash("sha256").update(payload).digest("hex");
    const filename = `${canonicalHash}.json`;

    const vfbackupPath = path.join(currentSyncPath, ".vfbackup");
    const blobsPath = path.join(vfbackupPath, "blobs");
    const filePath = path.join(blobsPath, filename);

    // Check if it already exists (content-addressed, so if hash matches, content matches)
    try {
      await fs.access(filePath);
      // Already exists, no need to write again
      return { ok: true };
    } catch {
      // File doesn't exist, proceed
    }

    // Atomic write
    const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    try {
      await fs.writeFile(tmpPath, manifestJson, { encoding: "utf8", flag: "wx" });
      await fs.rename(tmpPath, filePath);
    } finally {
      await fs.rm(tmpPath, { force: true });
    }

    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncFolderWatcher", `Failed to write packet: ${redactErrorMessage(errorMsg)}`);
    return { ok: false, error: redactErrorMessage(errorMsg) };
  }
}
