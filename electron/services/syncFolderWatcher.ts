import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import { promises as fs } from "fs";
import { logInfo, logError } from "./logger";
import { redactErrorMessage } from "../../src/shared/redaction";
import { BrowserWindow } from "electron";

let watcher: FSWatcher | null = null;
let currentSyncPath: string | null = null;
let mainWindowRef: BrowserWindow | null = null;

// Track recently written files by us to avoid echo loops
const recentWrites = new Set<string>();

/** Initialize the watcher. Must provide the mainWindow to send events back. */
export function initSyncFolderWatcher(mainWindow: BrowserWindow) {
  mainWindowRef = mainWindow;
}

/** Set the sync folder and start watching. */
export async function setSyncFolder(syncPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }

    currentSyncPath = syncPath;
    if (!syncPath) {
      return { ok: true };
    }

    // Ensure directory exists
    await fs.mkdir(syncPath, { recursive: true });

    // Initialize Chokidar
    watcher = chokidar.watch(syncPath, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      depth: 1 // only watch top level SyncObjects
    });

    watcher.on("add", handleRemoteChange);
    watcher.on("change", handleRemoteChange);
    
    logInfo("syncFolderWatcher", `Started watching sync folder: ${syncPath}`);
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
  if (!filePath.endsWith(".enc")) return;

  const filename = path.basename(filePath);

  // If we just wrote this file, ignore it to prevent loop
  if (recentWrites.has(filename)) {
    recentWrites.delete(filename);
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const base64Data = data.toString("base64");
    
    logInfo("syncFolderWatcher", `Detected remote change for ${filename}`);
    mainWindowRef.webContents.send("sync:onRemoteChange", { filename, base64Data });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncFolderWatcher", `Failed to read changed sync file ${filename}: ${redactErrorMessage(errorMsg)}`);
  }
}

/** Write an encrypted packet to the sync folder. */
export async function writePacket(filename: string, base64Data: string): Promise<{ ok: boolean; error?: string }> {
  if (!currentSyncPath) {
    return { ok: false, error: "Sync folder not configured." };
  }

  try {
    const filePath = path.join(currentSyncPath, filename);
    const data = Buffer.from(base64Data, "base64");
    
    // Add to recent writes so the watcher ignores the echo
    recentWrites.add(filename);
    
    // Auto-cleanup the ignore set in case the watcher event is missed/delayed
    setTimeout(() => {
      recentWrites.delete(filename);
    }, 5000);

    // Atomic write by writing to a temp file first then renaming
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, data);
    await fs.rename(tmpPath, filePath);

    logInfo("syncFolderWatcher", `Wrote sync packet ${filename}`);
    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncFolderWatcher", `Failed to write sync packet ${filename}: ${redactErrorMessage(errorMsg)}`);
    return { ok: false, error: redactErrorMessage(errorMsg) };
  }
}
