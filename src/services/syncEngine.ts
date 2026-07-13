import { importDecryptedPacket } from "./backupImportService";
import { desktopSync } from "./desktopBridge";
import type { MutationOrigin, SyncStoreName } from "../types/sync";
import type { SyncRuntimeStatus } from "../types/desktop";
import { sanitizePortableData } from "./syncDataSanitizer";
import { validateTombstone } from "../shared/syncProtocol";
import { getActiveProfileId } from "./activeProfile";

let remoteChangeListenerCleanup: (() => void) | null = null;
let syncActive = false;

export interface SyncEngineStartResult {
  ok: boolean;
  status: "running" | "paused" | "stopped" | "error";
  error?: string;
}

async function notifyRendererSessionAttached(attached: boolean): Promise<void> {
  try {
    await desktopSync.setRendererSessionAttached({ attached });
  } catch (err) {
    console.error(`[SyncEngine] Failed to notify renderer session ${attached ? "attached" : "detached"}:`, err);
  }
}

async function detachRendererSyncListeners(): Promise<void> {
  syncActive = false;
  if (remoteChangeListenerCleanup) {
    remoteChangeListenerCleanup();
    remoteChangeListenerCleanup = null;
  }

  if (typeof window !== "undefined") {
    window.removeEventListener("venice:storage-saved", handleStorageSaved);
  }

  await notifyRendererSessionAttached(false);
}

function attachRendererSyncListeners(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("venice:storage-saved", handleStorageSaved);
}

function registerRemoteChangeListener(): void {
  remoteChangeListenerCleanup = desktopSync.onRemoteChange(async (event) => {
    const { storeName, id, operationId, recordJson, remoteApplyToken } = event;
    try {
      if (storeName === "tombstones") {
        const parsed = JSON.parse(recordJson);
        const validation = validateTombstone(parsed);
        if (!validation.ok) {
          console.error(`[SyncEngine] Rejected malformed tombstone: ${validation.error}`);
          await desktopSync.acknowledgeOperation({ operationId, ok: false });
          return;
        }
        await importDecryptedPacket(storeName as SyncStoreName, id, recordJson, operationId, remoteApplyToken);
        await desktopSync.acknowledgeOperation({ operationId, ok: true });
        return;
      }

      const result = await importDecryptedPacket(storeName as SyncStoreName, id, recordJson, operationId, remoteApplyToken);
      await desktopSync.acknowledgeOperation({ operationId, ok: result.ok });
      if (!result.ok) {
        console.error(`[SyncEngine] Failed to import packet ${storeName}/${id}:`, result.error);
      }
    } catch (err) {
      console.error(`[SyncEngine] Error applying remote change:`, err);
      await desktopSync.acknowledgeOperation({ operationId, ok: false }).catch(() => {});
    }
  });
}

export async function initSyncEngine(password: string): Promise<SyncEngineStartResult> {
  if (typeof window === "undefined") {
    const error = "Sync Engine disabled: No desktop bridge available (Web Mode)";
    console.warn(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }

  // Idempotent: detach renderer listeners and stop the main process before
  // starting, so a delayed prior stop cannot terminate a newly started watcher.
  await detachRendererSyncListeners();

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
  const startResult = await desktopSync.startSync({ password, profileId: getActiveProfileId() });
  if (!startResult.ok) {
    const error = startResult.error || "Failed to start sync in main process.";
    console.error(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }

  // Register the remote change listener
  registerRemoteChangeListener();

  attachRendererSyncListeners();
  syncActive = true;
  await notifyRendererSessionAttached(true);
  return { ok: true, status: "running" };
}

export async function reattachSyncEngine(): Promise<SyncEngineStartResult> {
  if (typeof window === "undefined") {
    const error = "Sync Engine disabled: No desktop bridge available (Web Mode)";
    console.warn(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }

  // Verify the main process watcher is still running and holds the passphrase.
  // This lets us reattach after a renderer reload without asking the user to
  // re-enter their password.
  let status: SyncRuntimeStatus;
  try {
    const res = await desktopSync.getStatus();
    if (!res.ok) {
      const error = res.degradedReason || "Failed to read sync status from main process.";
      console.error(`[SyncEngine] ${error}`);
      return { ok: false, status: "error", error };
    }
    status = res;
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error reading sync status.";
    console.error(`[SyncEngine] ${error}`);
    return { ok: false, status: "error", error };
  }

  if (status.mainWatcher !== "running") {
    return {
      ok: false,
      status: status.mainWatcher,
      error: "Main sync watcher is not running. Enter the passphrase to start sync.",
    };
  }
  if (!status.authenticated) {
    return {
      ok: false,
      status: "error",
      error: "Sync session is not authenticated. Enter the passphrase to start sync.",
    };
  }
  if (status.profileId !== getActiveProfileId()) {
    return {
      ok: false,
      status: "error",
      error: "The running sync session belongs to another profile. Stop it before switching profiles.",
    };
  }

  // Idempotent cleanup before re-attaching.
  await detachRendererSyncListeners();

  // Re-register the remote change listener.
  registerRemoteChangeListener();

  attachRendererSyncListeners();
  syncActive = true;
  await notifyRendererSessionAttached(true);
  return { ok: true, status: "running" };
}

export async function stopSyncEngine(): Promise<SyncEngineStartResult> {
  await detachRendererSyncListeners();

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

  await detachRendererSyncListeners();
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
