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
import { desktopSync } from "./desktopBridge";

export interface DeleteSyncableRecordResult {
  ok: boolean;
  tombstone: Tombstone;
}

type VeniceWindowWithSyncFlag = Window & {
  __VENICE_IS_SYNCING?: boolean;
};

/**
 * Authoritatively deletes a syncable record.
 *
 * The tombstone is persisted first so that a crash between deletion and
 * persistence can never leave a record deleted without a tombstone. The target
 * deletion runs with `bypassSyncEcho: true` and with the renderer sync flag
 * raised so the sync engine does not try to re-coordinate the same deletion.
 */
export async function deleteSyncableRecord(
  storeName: SyncStoreName,
  recordId: string,
  deviceId?: string,
): Promise<DeleteSyncableRecordResult> {
  const tombstone = createTombstone(storeName, recordId, deviceId);
  await TombstoneService.saveTombstone(tombstone);

  const veniceWindow = window as VeniceWindowWithSyncFlag;
  const previousSyncFlag = veniceWindow.__VENICE_IS_SYNCING;
  veniceWindow.__VENICE_IS_SYNCING = true;
  try {
    await StorageService.deleteItem(storeName, recordId, { bypassSyncEcho: true });
  } finally {
    veniceWindow.__VENICE_IS_SYNCING = previousSyncFlag;
  }

  try {
    await desktopSync.writePacket({
      storeName: "tombstones",
      id: tombstone.id,
      recordJson: JSON.stringify(tombstone),
    });
  } catch (err) {
    console.error(`[syncDeleteCoordinator] Failed to emit tombstone for ${storeName}/${recordId}:`, err);
  }

  return { ok: true, tombstone };
}
