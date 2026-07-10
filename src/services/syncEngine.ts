import { importDecryptedPacket } from "./backupImportService";
import { desktopSync } from "./desktopBridge";
import type { SyncStoreName } from "../types/sync";
import { sanitizePortableData } from "./syncDataSanitizer";

let remoteChangeListenerCleanup: (() => void) | null = null;
let syncActive = false;

export async function initSyncEngine(password: string) {
  if (typeof window === "undefined") {
    console.warn("Sync Engine disabled: No desktop bridge available (Web Mode)");
    return;
  }

  // Pass password to main process to start the watcher and enable decryption
  const startResult = await desktopSync.startSync({ password });
  if (!startResult.ok) {
    console.error("[SyncEngine] Failed to start sync in main process:", startResult.error);
    return;
  }
  syncActive = true;

  // Register the remote change listener
  remoteChangeListenerCleanup = desktopSync.onRemoteChange(async (event) => {
    try {
      const { storeName, id, recordJson } = event;
      
      const result = await importDecryptedPacket(storeName as SyncStoreName, id, recordJson);
      if (!result.ok) {
        console.error(`[SyncEngine] Failed to import packet ${storeName}/${id}:`, result.error);
      }
    } catch (err) {
      console.error(`[SyncEngine] Error applying remote change:`, err);
    }
  });

  if (typeof window !== "undefined") {
    window.addEventListener("venice:storage-saved", handleStorageSaved);
    window.addEventListener("venice:storage-deleted", handleStorageDeleted);
  }
}

export function stopSyncEngine() {
  syncActive = false;
  if (remoteChangeListenerCleanup) {
    remoteChangeListenerCleanup();
    remoteChangeListenerCleanup = null;
  }
  
  if (typeof window !== "undefined") {
    desktopSync.stopSync().catch(err => console.error("[SyncEngine] Failed to stop sync in main process:", err));
  }

  if (typeof window !== "undefined") {
    window.removeEventListener("venice:storage-saved", handleStorageSaved);
    window.removeEventListener("venice:storage-deleted", handleStorageDeleted);
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
    const tombstone = { storeName, id, deletedAt: Date.now() };
    await desktopSync.writePacket({ storeName: "tombstones", id, recordJson: JSON.stringify(tombstone) });
  } catch (err) {
    console.error(`[SyncEngine] Failed to emit tombstone for ${storeName} ${id}:`, err);
  }
}
