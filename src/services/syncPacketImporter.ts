/** @fileoverview Service for importing decrypted sync packets (manual or remote sync). */

import StorageService from "./storageService";
import { TombstoneService } from "./tombstoneService";
import {
  isElectron,
  desktopChat,
  desktopCharacterCards,
  desktopPersonas,
  desktopLorebooks,
  desktopRpChats,
  desktopRpAssets,
  desktopScenarios,
  desktopSync,
} from "./desktopBridge";
import type { SyncStoreName, MutationOrigin } from "../types/sync";
import { STORE_NAMES } from "../constants/venice";
import { validateTombstone } from "../shared/syncProtocol";
import { toEpochMilliseconds } from "../shared/syncTimestamp";
import { createConflictIdentity } from "../shared/syncConflictIdentity";
import {
  compareSyncMessages,
  compareSyncRecords,
  findMessageContentDivergences,
} from "../shared/syncConvergence";

export interface SyncableRecord {
  id: string;
  updatedAt?: number | string;
  deletedAt?: number | string | null;
  revisionId?: string;
  baseRevisionId?: string;
  deviceId?: string;
  name?: string;
  title?: string;
  messages?: Record<string, unknown>[];
}

/**
 * Provenance metadata embedded on every conflict record created during sync.
 * The previous design inferred which revision was "local" vs. "remote" purely
 * from the presence of the `_conflict_` id suffix, which silently inverted the
 * Keep Local / Keep Remote button semantics whenever the imported revision
 * won the merge. THIS block is the canonical source of truth and overrides
 * any id-suffix inference in the resolver UI.
 */
export interface SyncConflictProvenance {
  kind: "sync-conflict";
  conflictIdentity: string;
  originalRecordId: string;
  winningSource: "local" | "imported";
  winningRevisionId: string | null;
  winningDeviceId: string;
  losingSource: "local" | "imported";
  losingRevisionId: string | null;
  losingDeviceId: string;
  recordedAt: string;
}

export const SYNC_CONFLICT_META_KEY = "_meta";

export function readSyncConflictProvenance(record: unknown): SyncConflictProvenance | null {
  if (!record || typeof record !== "object") return null;
  const meta = (record as Record<string, unknown>)[SYNC_CONFLICT_META_KEY];
  if (!meta || typeof meta !== "object") return null;
  const candidate = meta as Partial<SyncConflictProvenance>;
  if (candidate.kind !== "sync-conflict") return null;
  if (candidate.winningSource !== "local" && candidate.winningSource !== "imported") return null;
  if (candidate.losingSource !== "local" && candidate.losingSource !== "imported") return null;
  if (typeof candidate.conflictIdentity !== "string") return null;
  if (typeof candidate.originalRecordId !== "string") return null;
  return {
    kind: "sync-conflict",
    conflictIdentity: candidate.conflictIdentity,
    originalRecordId: candidate.originalRecordId,
    winningSource: candidate.winningSource,
    winningRevisionId: typeof candidate.winningRevisionId === "string" ? candidate.winningRevisionId : null,
    winningDeviceId: typeof candidate.winningDeviceId === "string" ? candidate.winningDeviceId : "",
    losingSource: candidate.losingSource,
    losingRevisionId: typeof candidate.losingRevisionId === "string" ? candidate.losingRevisionId : null,
    losingDeviceId: typeof candidate.losingDeviceId === "string" ? candidate.losingDeviceId : "",
    recordedAt: typeof candidate.recordedAt === "string" ? candidate.recordedAt : new Date(0).toISOString(),
  };
}

export const IMPORTABLE_STORES = new Set<string>(STORE_NAMES.filter((storeName) => storeName !== "diagnostics" && storeName !== "characterCardDrafts"));

/** Saves a record to a specific store, routing to IPC if needed in Desktop mode. */
export async function saveStoreRecord(
  storeName: SyncStoreName,
  record: unknown,
  origin: MutationOrigin = "remote-sync",
  remoteApplyToken?: string,
): Promise<void> {
  if (isElectron() && origin === "remote-sync") {
    const recordObject = record as Record<string, unknown>;
    const id = typeof recordObject.id === "string" ? recordObject.id : "";
    const result = await desktopSync.applyRemoteMutation({
      storeName,
      id,
      recordJson: JSON.stringify(recordObject),
      remoteApplyToken: remoteApplyToken ?? "",
    });
    if (!result.ok) throw new Error(result.error || "Remote sync save was rejected.");
    return;
  }
  if (isElectron()) {
    switch (storeName) {
      case "conversations":
        await desktopChat.save(record as never, origin);
        return;
      case "character_cards":
        await desktopCharacterCards.save(record as never, origin);
        return;
      case "personas":
        await desktopPersonas.save(record as never, origin);
        return;
      case "lorebooks":
        await desktopLorebooks.save(record as never, origin);
        return;
      case "rp_chats":
        await desktopRpChats.save(record as never, origin);
        return;
      case "rp_assets":
        await desktopRpAssets.save(record as never, origin);
        return;
      case "rpScenarios":
        await desktopScenarios.save(record as never, origin);
        return;
    }
  }

  // Web mode OR IndexedDB-only stores
  if (origin === "remote-sync") {
    await StorageService.saveImportedItem(storeName, record as Record<string, unknown>);
    return;
  }
  await StorageService.saveItem(storeName, record as Record<string, unknown>, { origin });
}

/** Deletes a record from a specific store, routing to IPC if needed in Desktop mode. */
export async function deleteStoreRecord(
  storeName: SyncStoreName,
  recordId: string,
  origin: MutationOrigin = "remote-sync",
  remoteApplyToken?: string,
): Promise<void> {
  if (isElectron() && origin === "remote-sync") {
    const result = await desktopSync.applyRemoteMutation({
      storeName,
      id: recordId,
      delete: true,
      remoteApplyToken: remoteApplyToken ?? "",
    });
    if (!result.ok) throw new Error(result.error || "Remote sync delete was rejected.");
    return;
  }
  if (isElectron()) {
    switch (storeName) {
      case "conversations":
        await desktopChat.delete(recordId, origin);
        return;
      case "character_cards":
        await desktopCharacterCards.delete(recordId, origin);
        return;
      case "personas":
        await desktopPersonas.delete(recordId, origin);
        return;
      case "lorebooks":
        await desktopLorebooks.delete(recordId, origin);
        return;
      case "rp_chats":
        await desktopRpChats.delete(recordId, origin);
        return;
      case "rp_assets":
        await desktopRpAssets.delete(recordId, origin);
        return;
      case "rpScenarios":
        await desktopScenarios.delete(recordId, origin);
        return;
    }
  }

  // Web mode OR IndexedDB-only stores
  await StorageService.deleteItem(storeName, recordId, { origin });
}

/** Fetches records from a specific store, routing to IPC if needed in Desktop mode. */
export async function fetchStoreRecords(storeName: SyncStoreName): Promise<SyncableRecord[]> {
  if (isElectron()) {
    switch (storeName) {
      case "conversations": {
        const res = await desktopChat.list();
        return res.ok ? (res.conversations as unknown as SyncableRecord[]) : [];
      }
      case "character_cards": {
        const res = await desktopCharacterCards.list();
        return res.ok ? (res.cards as unknown as SyncableRecord[]) : [];
      }
      case "personas": {
        const res = await desktopPersonas.list();
        return res.ok ? (res.personas as unknown as SyncableRecord[]) : [];
      }
      case "lorebooks": {
        const res = await desktopLorebooks.list();
        return res.ok ? (res.lorebooks as unknown as SyncableRecord[]) : [];
      }
      case "rp_chats": {
        const rpRes = await desktopRpChats.list();
        return rpRes.ok ? (rpRes.chats as unknown as SyncableRecord[]) : [];
      }
      case "rp_assets": {
        const res = await desktopRpAssets.list();
        return res.ok ? (res.assets as unknown as SyncableRecord[]) : [];
      }
      case "rpScenarios": {
        const res = await desktopScenarios.list();
        return res.ok ? (res.scenarios as unknown as SyncableRecord[]) : [];
      }
    }
  }

  return await StorageService.getItems(storeName) as SyncableRecord[];
}

/** 
 * Validates, decrypts, and applies a single decrypted packet.
 * @param storeName The store to apply to.
 * @param id The record ID.
 * @param recordJson The decrypted JSON payload.
 */
export async function importDecryptedPacket(
  storeName: SyncStoreName,
  id: string,
  recordJson: string,
  operationId?: string,
  remoteApplyToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const importOrigin: MutationOrigin = !isElectron() || remoteApplyToken ? "remote-sync" : "manual-import";
    if (!IMPORTABLE_STORES.has(storeName)) return { ok: false, error: "Store is not allowed for import." };
    if (!/^[a-zA-Z0-9_.:-]{1,256}$/.test(id) || id.includes("..")) return { ok: false, error: "Invalid record ID." };

    if (storeName === "tombstones") {
      const parsed = JSON.parse(recordJson);
      const validation = validateTombstone(parsed);
      if (!validation.ok) {
        return { ok: false, error: `Malformed tombstone: ${validation.error}` };
      }
      await TombstoneService.saveTombstone(validation.tombstone);
      await deleteStoreRecord(validation.tombstone.storeName, validation.tombstone.recordId, importOrigin, remoteApplyToken);
      return { ok: true };
    }

    const imported = JSON.parse(recordJson) as SyncableRecord;
    if (!imported || typeof imported !== "object" || imported.id !== id) return { ok: false, error: "Record ID mismatch." };
    
    // Check against tombstone locally
    const tombstoneId = `${storeName}:${id}`;
    const localTombstone = await StorageService.getItem("tombstones", tombstoneId) as { deletedAt: number } | null;
    
    const importedUpdatedAt = toEpochMilliseconds(imported.updatedAt);
    if (imported.updatedAt !== undefined && importedUpdatedAt === null) {
      return { ok: false, error: "Imported record has an invalid updatedAt timestamp." };
    }
    const importedUpdateEpoch = importedUpdatedAt ?? 0;
    const localDeletedAt = toEpochMilliseconds(localTombstone?.deletedAt);

    if (localTombstone && localDeletedAt === null) {
      return { ok: false, error: "Local tombstone has an invalid deletedAt timestamp." };
    }
    if (localDeletedAt !== null && localDeletedAt >= importedUpdateEpoch) {
      // Local tombstone is newer, meaning it was deleted recently. Reject the
      // stale packet so the caller (and remote sync ack) knows the record is gone.
      return { ok: false, error: "Local tombstone is newer; record skipped." };
    }

    const localRecords = await fetchStoreRecords(storeName);
    const local = localRecords.find(r => r.id === id);

    if (!local) {
      // Record doesn't exist locally, so save it
      await saveStoreRecord(storeName, imported, importOrigin, remoteApplyToken);
    } else {
      // Both exist, check for divergence
      let isConflict = false;
      if (importOrigin === "manual-import") {
        // For manual imports, any divergence in updatedAt is treated as a conflict
        // to prevent silent data loss or unexpected silent overwrites.
        const localUpdate = toEpochMilliseconds(local.updatedAt) ?? 0;
        const importUpdate = importedUpdateEpoch;
        isConflict = localUpdate !== importUpdate;
      } else {
        isConflict = !!(
          imported.deviceId && local.deviceId && imported.deviceId !== local.deviceId &&
          imported.revisionId && local.revisionId && 
          imported.revisionId !== local.revisionId &&
          imported.baseRevisionId !== local.revisionId && 
          local.baseRevisionId !== imported.revisionId
        );
      }
        
        
      if (isConflict) {
        const preserveStores = ["character_cards", "promptLibrary", "personas", "lorebooks", "rpScenarios", "projects", "scenes"];
        const mergeStores = ["chats", "rp_chats", "conversations"];

        if (preserveStores.includes(storeName)) {
          const importedWins = compareSyncRecords(imported, local) > 0;
          const loser = importedWins ? local : imported;
          const winner = importedWins ? imported : local;
          const conflictIdentity = await createConflictIdentity({
            storeName,
            recordId: id,
            sourceDeviceId: loser.deviceId,
            remoteRevisionId: loser.revisionId,
          });
          const newId = `${id}_conflict_${conflictIdentity.slice(0, 16)}`;
          const localDeviceRef = typeof local.deviceId === "string" ? local.deviceId : "this-device";
          const importedDeviceRef = typeof imported.deviceId === "string" ? imported.deviceId : "remote";
          const conflictRecord = {
            ...loser,
            id: newId,
            name: loser.name ? `${loser.name} (Conflict from ${loser.deviceId || "Remote"})` : undefined,
            title: loser.title ? `${loser.title} (Conflict from ${loser.deviceId || "Remote"})` : undefined,
            [SYNC_CONFLICT_META_KEY]: {
              kind: "sync-conflict",
              conflictIdentity,
              originalRecordId: id,
              winningSource: importedWins ? "imported" : "local",
              winningRevisionId: winner.revisionId ?? null,
              winningDeviceId: importedWins ? importedDeviceRef : localDeviceRef,
              losingSource: importedWins ? "local" : "imported",
              losingRevisionId: loser.revisionId ?? null,
              losingDeviceId: importedWins ? localDeviceRef : importedDeviceRef,
              recordedAt: new Date().toISOString(),
            },
          };
          await saveStoreRecord(storeName, conflictRecord, importOrigin, remoteApplyToken);
          if (storeName === "character_cards") {
            const { mergeCharacterCardConflict } = await import("./characterCards/characterCardSyncMerge");
            await saveStoreRecord(storeName, mergeCharacterCardConflict(winner as unknown as Record<string, unknown>, loser as unknown as Record<string, unknown>), importOrigin, remoteApplyToken);
          } else if (importedWins) await saveStoreRecord(storeName, imported, importOrigin, remoteApplyToken);
        } else if (mergeStores.includes(storeName)) {
          // Message-level append merge
          const localMessages = local.messages || [];
          const importedMessages = imported.messages || [];

          // Flag same-id / diverged-content messages so a local edit
          // (or an imported edit) is never silently dropped. The divergent
          // imported copy is preserved as a `_conflict_<identity>` record
          // so the resolver UI can surface both edits for manual review.
          const divergences = findMessageContentDivergences(
            localMessages as Array<Record<string, unknown>>,
            importedMessages as Array<Record<string, unknown>>,
          );
          const divergenceByMsgId = new Map<string, { local: Record<string, unknown>; imported: Record<string, unknown> }>();
          for (const divergence of divergences) divergenceByMsgId.set(divergence.id, divergence);

          // Treat the conversation itself as a conflict when any of its messages
          // were edited on both sides — only then do we fall back to the
          // whole-record conflict shape and skip the append merge.
          if (divergences.length > 0 && importOrigin !== "manual-import") {
            // For whole-record merges (the imported has a *newer* revisionId
            // for the same conversation id and only diverges on one or two
            // edits), fork every diverged imported message into its own
            // conflict record so the user can pick edit-by-edit.
            for (const divergence of divergences) {
              const conflictIdentity = await createConflictIdentity({
                storeName,
                recordId: `${id}:msg:${divergence.id}`,
                sourceDeviceId: typeof divergence.local.deviceId === "string" ? divergence.local.deviceId : "this-device",
                remoteRevisionId: typeof divergence.imported.revisionId === "string" ? divergence.imported.revisionId : undefined,
              });
              const newMsgId = `${divergence.id}_conflict_${conflictIdentity.slice(0, 16)}`;
              const conflictMessage = {
                ...divergence.imported,
                id: newMsgId,
                [SYNC_CONFLICT_META_KEY]: {
                  kind: "sync-conflict",
                  conflictIdentity,
                  originalRecordId: divergence.id,
                  winningSource: "local",
                  winningRevisionId: typeof divergence.local.revisionId === "string" ? divergence.local.revisionId : null,
                  winningDeviceId: typeof divergence.local.deviceId === "string" ? divergence.local.deviceId : "this-device",
                  losingSource: "imported",
                  losingRevisionId: typeof divergence.imported.revisionId === "string" ? divergence.imported.revisionId : null,
                  losingDeviceId: typeof divergence.imported.deviceId === "string" ? divergence.imported.deviceId : "remote",
                  recordedAt: new Date().toISOString(),
                },
              };
              const parentRef = { parentRecordId: id, parentMessageId: divergence.id };
              await saveStoreRecord(storeName, { ...conflictMessage, ...parentRef }, importOrigin, remoteApplyToken);
            }
            // Mark the conflict metadata on the surviving local conversation.
            const localWithProvenance = {
              ...local,
              divergedMessageIds: divergences.map((d) => d.id),
            };
            await saveStoreRecord(storeName, localWithProvenance, importOrigin, remoteApplyToken);
          } else {
            const localMsgIds = new Set(localMessages.map((m: Record<string, unknown>) => m.id));
            const newMessages = importedMessages.filter(
              (m: Record<string, unknown>) =>
                !localMsgIds.has(m.id as string) && !divergenceByMsgId.has(m.id as string),
            );
            if (newMessages.length > 0) {
              const mergedRecord = {
                ...local,
                messages: [...localMessages, ...newMessages].sort(compareSyncMessages),
                updatedAt: Math.max(toEpochMilliseconds(local.updatedAt) ?? 0, importedUpdateEpoch),
              };
              await saveStoreRecord(storeName, mergedRecord, importOrigin, remoteApplyToken);
            }
          }
        } else {
          // No conflict merge logic, just LWW
          if (compareSyncRecords(imported, local) > 0) {
            await saveStoreRecord(storeName, imported, importOrigin, remoteApplyToken);
          }
        }
      } else {
        // No conflict, just use last-write-wins
        if (compareSyncRecords(imported, local) > 0) {
          await saveStoreRecord(storeName, imported, importOrigin, remoteApplyToken);
        }
      }
    }

    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error importing packet for ${storeName}/${id}:`, err);
    return { ok: false, error: errorMsg };
  }
}
