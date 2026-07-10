import { importEncryptedBackup } from "./backupImportService";
import { desktopSync } from "./desktopBridge";
import { exportSyncPacket } from "./backupExportService";
import type { SyncStoreName } from "../types/sync";

let remoteChangeListenerCleanup: (() => void) | null = null;
let currentPassword = "";

export async function initSyncEngine(password: string) {
  currentPassword = password;
  
  if (typeof window === "undefined") {
    console.warn("Sync Engine disabled: No desktop bridge available (Web Mode)");
    return;
  }

  // Register the remote change listener
  remoteChangeListenerCleanup = desktopSync.onRemoteChange(async (event) => {
    try {
      const { filename, base64Data } = event;
      // console.log(`[SyncEngine] Received remote change: ${filename}`);
      
      const jsonStr = Buffer.from(base64Data, "base64").toString("utf-8");
      const packet = JSON.parse(jsonStr);

      const result = await importEncryptedBackup(packet, currentPassword);
      if (!result.ok) {
        console.error(`[SyncEngine] Failed to import packet ${filename}:`, result.error);
      } else {
        console.warn(`[SyncEngine] Imported packet ${filename}: skipped=${result.summary?.recordsSkipped}, imported=${result.summary?.recordsImported}`);
      }
    } catch (err) {
      console.error(`[SyncEngine] Error applying remote change:`, err);
    }
  });

  if (typeof window !== "undefined") {
    window.addEventListener("venice:storage-saved", handleStorageSaved);
  }
}

export function stopSyncEngine() {
  if (remoteChangeListenerCleanup) {
    remoteChangeListenerCleanup();
    remoteChangeListenerCleanup = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("venice:storage-saved", handleStorageSaved);
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

/** Called by StorageService/Zustand when a local record is saved/deleted. */
export async function emitLocalChange(storeName: SyncStoreName, record: unknown, id: string) {
  if (typeof window === "undefined" || !currentPassword) return;

  try {
    const packet = await exportSyncPacket(storeName, record, currentPassword);
    const jsonStr = JSON.stringify(packet);
    const base64Data = Buffer.from(jsonStr, "utf-8").toString("base64");
    
    const filename = `${storeName}_${id}.enc`;
    await desktopSync.writePacket({ filename, base64Data });
  } catch (err) {
    console.error(`[SyncEngine] Failed to emit local change for ${storeName} ${id}:`, err);
  }
}
