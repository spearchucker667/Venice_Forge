import { importDecryptedPacket } from "./backupImportService";
import { desktopSync } from "./desktopBridge";
import type { SyncStoreName } from "../types/sync";
import { sanitizePortableData } from "./syncDataSanitizer";
import { createTombstone, validateTombstone } from "../shared/syncProtocol";

let remoteChangeListenerCleanup: (() => void) | null = null;
let syncActive = false;

export interface SyncEngineStartResult {
  ok: boolean;
  status: "running" | "paused" | "stopped" | "error";
  error?: string;
}

export async function initSyncEngine(password: string): Promise<SyncEngineStartResult> {
  if (typeof window === "undefined") {
    const error = "Sync Engine disabled: No desktop bridge available (Web Mode)";
    console.warn(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }

  // Idempotent: remove any previous listeners before registering new ones.
  stopSyncEngine();

  // Pass password to main process to start the watcher and enable decryption
  const startResult = await desktopSync.startSync({ password });
  if (!startResult.ok) {
    const error = startResult.error || "Failed to start sync in main process.";
    console.error(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }

  // Register the remote change listener
  remoteChangeListenerCleanup = desktopSync.onRemoteChange(async (event) => {
    try {
      const { storeName, id, recordJson } = event;

      if (storeName === "tombstones") {
        const parsed = JSON.parse(recordJson);
        const validation = validateTombstone(parsed);
        if (!validation.ok) {
          console.error(`[SyncEngine] Rejected malformed tombstone: ${validation.error}`);
          return;
        }
        await importDecryptedPacket(storeName as SyncStoreName, id, recordJson);
        return;
      }

      const result = await importDecryptedPacket(storeName as SyncStoreName, id, recordJson);
      if (!result.ok) {
        console.error(`[SyncEngine] Failed to import packet ${storeName}/${id}:`, result.error);
      }
    } catch (err) {
      console.error(`[SyncEngine] Error applying remote change:`, err);
    }
  });

  window.addEventListener("venice:storage-saved", handleStorageSaved);
  window.addEventListener("venice:storage-deleted", handleStorageDeleted);

  syncActive = true;
  return { ok: true, status: "running" };
}

export function stopSyncEngine(): SyncEngineStartResult {
  syncActive = false;
  if (remoteChangeListenerCleanup) {
    remoteChangeListenerCleanup();
    remoteChangeListenerCleanup = null;
  }

  if (typeof window !== "undefined") {
    window.removeEventListener("venice:storage-saved", handleStorageSaved);
    window.removeEventListener("venice:storage-deleted", handleStorageDeleted);
    desktopSync.stopSync().catch((err) => console.error("[SyncEngine] Failed to stop sync in main process:", err));
  }

  return { ok: true, status: "stopped" };
}

export async function pauseSyncEngine(): Promise<SyncEngineStartResult> {
  syncActive = false;
  if (remoteChangeListenerCleanup) {
    remoteChangeListenerCleanup();
    remoteChangeListenerCleanup = null;
  }

  if (typeof window !== "undefined") {
    window.removeEventListener("venice:storage-saved", handleStorageSaved);
    window.removeEventListener("venice:storage-deleted", handleStorageDeleted);
  }

  try {
    const res = await desktopSync.pauseSync();
    if (!res.ok) {
      const error = res.error || "Failed to pause sync in main process.";
      console.error(`[SyncEngine] ${error}`);
      return { ok: false, status: "error", error };
    }
    return { ok: true, status: "paused" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error pausing sync.";
    console.error(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }
}

type VeniceWindowWithSyncFlag = Window & {
  __VENICE_IS_SYNCING?: boolean;
};

function handleStorageSaved(e: Event) {
  const veniceWindow = window as VeniceWindowWithSyncFlag;
  if (typeof window !== "undefined" && veniceWindow.__VENICE_IS_SYNCING) {
    return;
  }
  const customEvent = e as CustomEvent<{ store: SyncStoreName; record: unknown; id: string }>;
  const { store, record, id } = customEvent.detail;
  // Ignore diagnostics or non-sync stores
  if (store === "diagnostics") return;
  emitLocalChange(store, record, id);
}

function handleStorageDeleted(e: Event) {
  const veniceWindow = window as VeniceWindowWithSyncFlag;
  if (typeof window !== "undefined" && veniceWindow.__VENICE_IS_SYNCING) {
    return;
  }
  const customEvent = e as CustomEvent<{ store: SyncStoreName; id: string }>;
  const { store, id } = customEvent.detail;
  if (store === "diagnostics" || store === "tombstones") return;
  emitLocalTombstone(store, id);
}

/** Called by StorageService/Zustand when a local record is saved/deleted. */
export async function emitLocalChange(storeName: SyncStoreName, record: unknown, id: string) {
  if (typeof window === "undefined" || !syncActive) return;

  try {
    const recordJson = JSON.stringify(sanitizePortableData(record));
    await desktopSync.writePacket({ storeName, id, recordJson });
  } catch (err) {
    console.error(`[SyncEngine] Failed to emit local change for ${storeName} ${id}:`, err);
  }
}

/** Emits a tombstone packet for a local deletion. */
export async function emitLocalTombstone(storeName: SyncStoreName, id: string) {
  if (typeof window === "undefined" || !syncActive) return;

  try {
    const tombstone = createTombstone(storeName, id);
    await desktopSync.writePacket({ storeName: "tombstones", id, recordJson: JSON.stringify(tombstone) });
  } catch (err) {
    console.error(`[SyncEngine] Failed to emit tombstone for ${storeName} ${id}:`, err);
  }
}
