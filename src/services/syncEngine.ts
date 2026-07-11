import { importDecryptedPacket } from "./backupImportService";
import { desktopSync } from "./desktopBridge";
import type { MutationOrigin, SyncStoreName } from "../types/sync";
import { sanitizePortableData } from "./syncDataSanitizer";
import { validateTombstone } from "../shared/syncProtocol";
import { deleteSyncableRecord } from "./syncDeleteCoordinator";

let remoteChangeListenerCleanup: (() => void) | null = null;
let syncActive = false;

export interface SyncEngineStartResult {
  ok: boolean;
  status: "running" | "paused" | "stopped" | "error";
  error?: string;
}

function detachRendererSyncListeners(): void {
  syncActive = false;
  if (remoteChangeListenerCleanup) {
    remoteChangeListenerCleanup();
    remoteChangeListenerCleanup = null;
  }

  if (typeof window !== "undefined") {
    window.removeEventListener("venice:storage-saved", handleStorageSaved);
    window.removeEventListener("venice:storage-deleted", handleStorageDeleted);
  }
}

function attachRendererSyncListeners(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("venice:storage-saved", handleStorageSaved);
  window.addEventListener("venice:storage-deleted", handleStorageDeleted);
}

export async function initSyncEngine(password: string): Promise<SyncEngineStartResult> {
  if (typeof window === "undefined") {
    const error = "Sync Engine disabled: No desktop bridge available (Web Mode)";
    console.warn(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }

  // Idempotent: detach renderer listeners and stop the main process before
  // starting, so a delayed prior stop cannot terminate a newly started watcher.
  detachRendererSyncListeners();

  try {
    const stopResult = await desktopSync.stopSync();
    if (!stopResult.ok) {
      const error = stopResult.error || "Failed to stop previous sync session.";
      console.error(`[SyncEngine] ${error}`);
      return { ok: false, status: "error", error };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error stopping sync.";
    console.error(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }

  // Pass password to main process to start the watcher and enable decryption
  const startResult = await desktopSync.startSync({ password });
  if (!startResult.ok) {
    const error = startResult.error || "Failed to start sync in main process.";
    console.error(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }

  // Register the remote change listener
  remoteChangeListenerCleanup = desktopSync.onRemoteChange(async (event) => {
    const { storeName, id, operationId, recordJson } = event;
    try {
      if (storeName === "tombstones") {
        const parsed = JSON.parse(recordJson);
        const validation = validateTombstone(parsed);
        if (!validation.ok) {
          console.error(`[SyncEngine] Rejected malformed tombstone: ${validation.error}`);
          await desktopSync.acknowledgeOperation({ operationId, ok: false });
          return;
        }
        await importDecryptedPacket(storeName as SyncStoreName, id, recordJson);
        await desktopSync.acknowledgeOperation({ operationId, ok: true });
        return;
      }

      const result = await importDecryptedPacket(storeName as SyncStoreName, id, recordJson);
      await desktopSync.acknowledgeOperation({ operationId, ok: result.ok });
      if (!result.ok) {
        console.error(`[SyncEngine] Failed to import packet ${storeName}/${id}:`, result.error);
      }
    } catch (err) {
      console.error(`[SyncEngine] Error applying remote change:`, err);
      await desktopSync.acknowledgeOperation({ operationId, ok: false }).catch(() => {});
    }
  });

  attachRendererSyncListeners();
  syncActive = true;
  return { ok: true, status: "running" };
}

export async function stopSyncEngine(): Promise<SyncEngineStartResult> {
  detachRendererSyncListeners();

  if (typeof window !== "undefined") {
    try {
      const res = await desktopSync.stopSync();
      if (!res.ok) {
        const error = res.error || "Failed to stop sync in main process.";
        console.error(`[SyncEngine] ${error}`);
        return { ok: false, status: "error", error };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error stopping sync.";
      console.error(`[SyncEngine] ${error}`);
      return { ok: false, status: "error", error };
    }
  }

  return { ok: true, status: "stopped" };
}

export async function pauseSyncEngine(): Promise<SyncEngineStartResult> {
  // Pause the main process first; only detach renderer listeners on success.
  // If pause fails, the engine keeps listening so the user sees the error state
  // and can retry without losing remote-change delivery.
  try {
    const res = await desktopSync.pauseSync();
    if (!res.ok) {
      const error = res.error || "Failed to pause sync in main process.";
      console.error(`[SyncEngine] ${error}`);
      return { ok: false, status: "error", error };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error pausing sync.";
    console.error(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }

  detachRendererSyncListeners();
  return { ok: true, status: "paused" };
}

function handleStorageSaved(e: Event) {
  const customEvent = e as CustomEvent<{ store: SyncStoreName; record: unknown; id: string; origin?: MutationOrigin }>;
  const { store, record, id, origin } = customEvent.detail;
  // Diagnostics is explicitly excluded from sync. Tombstones are sync metadata
  // and are emitted by the authoritative delete coordinator, not re-routed here.
  if (store === "diagnostics" || store === "tombstones") return;
  // Only local-user mutations should auto-emit sync packets. Undefined origin
  // is treated as local-user for back-compat with older storage event emitters.
  if (origin !== undefined && origin !== "local-user") return;
  emitLocalChange(store, record, id);
}

async function handleStorageDeleted(e: Event) {
  const customEvent = e as CustomEvent<{ store: SyncStoreName; id: string; origin?: MutationOrigin }>;
  const { store, id, origin } = customEvent.detail;
  // Diagnostics is explicitly excluded from sync. Tombstones are sync metadata
  // and are emitted by the authoritative delete coordinator, not re-routed here.
  if (store === "diagnostics" || store === "tombstones") return;
  // Only local-user mutations should auto-emit sync tombstones. Undefined origin
  // is treated as local-user for back-compat with older storage event emitters.
  if (origin !== undefined && origin !== "local-user") return;
  try {
    await deleteSyncableRecord(store, id);
  } catch (err) {
    console.error(`[SyncEngine] Failed to route deletion for ${store}/${id}:`, err);
  }
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


