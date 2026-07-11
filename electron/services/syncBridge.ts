/**
 * @fileoverview Main-process bridge that emits encrypted sync packets and
 * tombstones for local filesystem changes. This closes the desktop local-change
 * propagation gap: saves/deletes that happen in the Electron main process now
 * write to the sync folder just like renderer-side IndexedDB saves do.
 */

import { getSyncStatus, writePacket } from "./syncFolderWatcher";
import { redactErrorMessage } from "../../src/shared/redaction";
import { logError } from "./logger";
import { createTombstone } from "../../src/shared/syncProtocol";
import type { MutationOrigin } from "../../src/types/sync";

/** Maps the IPC store namespace to the portable sync store name. */
export const SYNC_STORE_NAME_MAP: Record<string, string> = {
  conversations: "conversations",
  character_cards: "character_cards",
  personas: "personas",
  lorebooks: "lorebooks",
  rp_chats: "rp_chats",
  rp_assets: "rp_assets",
  rpScenarios: "rpScenarios",
};

/** Records that should never produce sync packets. */
const NON_SYNCABLE_STORES = new Set(["diagnostics", "tombstones"]);

/**
 * Emits an encrypted sync packet for a locally-saved record.
 * Errors are swallowed to avoid breaking the originating save operation.
 *
 * @param origin Mutation origin. Only `local-user` (or undefined for back-compat)
 *   mutations emit sync packets; remote-sync / manual-import / migration
 *   mutations are suppressed to avoid echo loops.
 */
export async function emitSyncPacket(
  storeName: string,
  id: string,
  record: unknown,
  origin?: MutationOrigin,
): Promise<void> {
  if (!storeName || NON_SYNCABLE_STORES.has(storeName)) return;
  if (origin !== undefined && origin !== "local-user") return;
  const syncStoreName = SYNC_STORE_NAME_MAP[storeName] ?? storeName;
  const status = getSyncStatus();
  if (!status.configured || status.mainWatcher !== "running") return;

  try {
    const recordJson = JSON.stringify(record);
    const res = await writePacket(syncStoreName, id, recordJson);
    if (!res.ok) {
      logError("syncBridge", `Failed to emit sync packet for ${syncStoreName}/${id}: ${res.error || "unknown"}`);
    }
  } catch (err) {
    logError("syncBridge", `Exception emitting sync packet for ${syncStoreName}/${id}: ${redactErrorMessage(err)}`);
  }
}

/**
 * Emits a tombstone packet for a locally-deleted record so that other devices
 * can apply the deletion.
 *
 * @param origin Mutation origin. Only `local-user` (or undefined for back-compat)
 *   deletions emit tombstones.
 */
export async function emitSyncTombstone(
  storeName: string,
  id: string,
  origin?: MutationOrigin,
): Promise<void> {
  if (!storeName || NON_SYNCABLE_STORES.has(storeName)) return;
  if (origin !== undefined && origin !== "local-user") return;
  const syncStoreName = SYNC_STORE_NAME_MAP[storeName] ?? storeName;
  const status = getSyncStatus();
  if (!status.configured || status.mainWatcher !== "running") return;

  try {
    const tombstone = createTombstone(syncStoreName as import("../../src/types/sync").SyncStoreName, id);
    const res = await writePacket("tombstones", tombstone.id, JSON.stringify(tombstone));
    if (!res.ok) {
      logError("syncBridge", `Failed to emit tombstone for ${syncStoreName}/${id}: ${res.error || "unknown"}`);
    }
  } catch (err) {
    logError("syncBridge", `Exception emitting tombstone for ${syncStoreName}/${id}: ${redactErrorMessage(err)}`);
  }
}
