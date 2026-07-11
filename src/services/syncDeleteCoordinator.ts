/**
 * @fileoverview Authoritative delete coordinator for syncable records.
 *
 * This is the single entry point for deleting a record that participates in
 * desktop sync. It guarantees that:
 *   1. A canonical tombstone is created.
 *   2. The tombstone is persisted locally before the target record is removed.
 *   3. The target record is deleted with sync echo suppressed.
 *   4. The exact encrypted tombstone is emitted to the sync bridge.
 */

import { createTombstone } from "../shared/syncProtocol";
import type { Tombstone, SyncStoreName } from "../types/sync";
import { TombstoneService } from "./tombstoneService";
import StorageService from "./storageService";
import { desktopSync, isElectron } from "./desktopBridge";

export interface DeleteSyncableRecordResult {
  ok: boolean;
  tombstone: Tombstone;
  error?: string;
}

/**
 * Authoritatively deletes a syncable record.
 *
 * The tombstone is persisted first so that a crash between deletion and
 * persistence can never leave a record deleted without a tombstone. The target
 * deletion runs with `bypassSyncEcho: true` so the sync engine does not try to
 * re-coordinate the same deletion.
 *
 * Tombstone emission is gated to desktop mode and an active sync engine so web
 * mode does not generate console noise for a bridge that does not exist.
 */
export async function deleteSyncableRecord(
  storeName: SyncStoreName,
  recordId: string,
  deviceId?: string,
): Promise<DeleteSyncableRecordResult> {
  const tombstone = createTombstone(storeName, recordId, deviceId);
  try {
    await TombstoneService.saveTombstone(tombstone);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to persist tombstone";
    console.error(`[syncDeleteCoordinator] Failed to save tombstone for ${storeName}/${recordId}:`, err);
    return { ok: false, tombstone, error };
  }

  try {
    await StorageService.deleteItem(storeName, recordId, { bypassSyncEcho: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to delete target record";
    console.error(`[syncDeleteCoordinator] Failed to delete target for ${storeName}/${recordId}:`, err);
    return { ok: false, tombstone, error };
  }

  if (isElectron()) {
    try {
      const status = await desktopSync.getStatus();
      if (status.ok && status.mainWatcher === "running") {
        const emitResult = await desktopSync.writePacket({
          storeName: "tombstones",
          id: tombstone.id,
          recordJson: JSON.stringify(tombstone),
        });
        if (!emitResult.ok) {
          const error = emitResult.error || "Failed to emit tombstone packet";
          console.error(`[syncDeleteCoordinator] Failed to emit tombstone for ${storeName}/${recordId}: ${error}`);
          return { ok: false, tombstone, error };
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to emit tombstone packet";
      console.error(`[syncDeleteCoordinator] Failed to emit tombstone for ${storeName}/${recordId}:`, err);
      return { ok: false, tombstone, error };
    }
  }

  return { ok: true, tombstone };
}
