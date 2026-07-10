/** @fileoverview Service for manually importing an encrypted backup of all syncable tables. */

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
import type { SyncStoreName } from "../types/sync";
import { BACKUP_SCHEMA_VERSION, deriveBackupKey, fromBase64, EncryptedBackupManifest } from "./backupCryptoWeb";
import { STORE_NAMES } from "../constants/venice";

interface SyncableRecord {
  id: string;
  updatedAt?: number;
  deletedAt?: number | null;
  revisionId?: string;
  baseRevisionId?: string;
  deviceId?: string;
  name?: string;
  title?: string;
  messages?: Record<string, unknown>[];
}

type VeniceWindowWithSyncFlag = Window & {
  __VENICE_IS_SYNCING?: boolean;
};

export interface ImportSummary {
  recordsImported: number;
  recordsSkipped: number;
  tombstonesApplied: number;
}

const IMPORTABLE_STORES = new Set<string>([...STORE_NAMES, "tombstones"]);

function validateManifest(manifest: EncryptedBackupManifest): void {
  if (!manifest || typeof manifest !== "object" || manifest.version !== BACKUP_SCHEMA_VERSION
    || typeof manifest.exportedAt !== "string" || !Number.isFinite(Date.parse(manifest.exportedAt))
    || typeof manifest.salt !== "string" || typeof manifest.iv !== "string" || typeof manifest.ciphertext !== "string") {
    throw new Error("Malformed encrypted backup manifest.");
  }
}

async function decryptBackup(manifest: EncryptedBackupManifest, password: string): Promise<string> {
  validateManifest(manifest);
  if (!password) throw new Error("Backup password is required.");
  if (isElectron()) {
    const res = await desktopSync.decryptBackup(manifest.ciphertext, manifest.salt, manifest.iv, password);
    if (!res.ok || !res.data) throw new Error(res.error || "Decryption failed in main process. Invalid password?");
    return res.data;
  }
  const key = await deriveBackupKey(password, fromBase64(manifest.salt));
  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(manifest.iv) }, key, fromBase64(manifest.ciphertext),
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    throw new Error("Failed to decrypt backup. Invalid password or corrupt data.");
  }
}

/** Saves a record to a specific store, routing to IPC if needed in Desktop mode. */
export async function saveStoreRecord(storeName: SyncStoreName, record: unknown): Promise<void> {
  if (isElectron()) {
    switch (storeName) {
      case "conversations":
        await desktopChat.save(record as never);
        return;
      case "character_cards":
        await desktopCharacterCards.save(record as never);
        return;
      case "personas":
        await desktopPersonas.save(record as never);
        return;
      case "lorebooks":
        await desktopLorebooks.save(record as never);
        return;
      case "rp_chats":
        await desktopRpChats.save(record as never);
        return;
      case "rp_assets":
        await desktopRpAssets.save(record as never);
        return;
      case "rpScenarios":
        await desktopScenarios.save(record as never);
        return;
    }
  }

  // Web mode OR IndexedDB-only stores
  await StorageService.saveItem(storeName, record as Record<string, unknown>);
}

/** Deletes a record from a specific store, routing to IPC if needed in Desktop mode. */
export async function deleteStoreRecord(storeName: SyncStoreName, recordId: string): Promise<void> {
  if (isElectron()) {
    switch (storeName) {
      case "conversations":
        await desktopChat.delete(recordId);
        return;
      case "character_cards":
        await desktopCharacterCards.delete(recordId);
        return;
      case "personas":
        await desktopPersonas.delete(recordId);
        return;
      case "lorebooks":
        await desktopLorebooks.delete(recordId);
        return;
      case "rp_chats":
        await desktopRpChats.delete(recordId);
        return;
      case "rp_assets":
        await desktopRpAssets.delete(recordId);
        return;
      case "rpScenarios":
        await desktopScenarios.delete(recordId);
        return;
    }
  }

  // Web mode OR IndexedDB-only stores
  await StorageService.deleteItem(storeName, recordId);
}

/** Fetches records from a specific store, routing to IPC if needed in Desktop mode. */
export async function fetchStoreRecords(storeName: SyncStoreName): Promise<SyncableRecord[]> {
  if (isElectron()) {
    switch (storeName) {
      case "conversations": {
        const res = await desktopChat.list();
        return res.ok ? (res.conversations as unknown as SyncableRecord[]) : [];
      }
      case "character_cards":
        return await desktopCharacterCards.list() as unknown as SyncableRecord[];
      case "personas":
        return await desktopPersonas.list() as unknown as SyncableRecord[];
      case "lorebooks":
        return await desktopLorebooks.list() as unknown as SyncableRecord[];
      case "rp_chats": {
        const rpRes = await desktopRpChats.list();
        return rpRes.ok ? (rpRes.chats as unknown as SyncableRecord[]) : [];
      }
      case "rp_assets":
        return await desktopRpAssets.list() as unknown as SyncableRecord[];
      case "rpScenarios":
        return await desktopScenarios.list() as unknown as SyncableRecord[];
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
  recordJson: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!IMPORTABLE_STORES.has(storeName)) return { ok: false, error: "Store is not allowed for import." };
    if (!/^[a-zA-Z0-9_.:-]{1,256}$/.test(id) || id.includes("..")) return { ok: false, error: "Invalid record ID." };
    if (typeof window !== "undefined") {
      (window as VeniceWindowWithSyncFlag).__VENICE_IS_SYNCING = true;
    }

    if (storeName === "tombstones") {
      const tomb = JSON.parse(recordJson) as { deletedAt: number, storeName: SyncStoreName, recordId: string };
      await TombstoneService.recordTombstone(tomb.storeName, tomb.recordId);
      await deleteStoreRecord(tomb.storeName, tomb.recordId);
      return { ok: true };
    }

    const imported = JSON.parse(recordJson) as SyncableRecord;
    if (!imported || typeof imported !== "object" || imported.id !== id) return { ok: false, error: "Record ID mismatch." };
    
    // Check against tombstone locally
    const tombstoneId = `${storeName}:${id}`;
    const localTombstone = await StorageService.getItem("tombstones", tombstoneId) as { deletedAt: number } | null;
    
    const importedUpdatedAt = imported.updatedAt || 0;

    if (localTombstone && localTombstone.deletedAt > importedUpdatedAt) {
      // Local tombstone is newer, meaning it was deleted recently. Skip import.
      return { ok: true };
    }

    const localRecords = await fetchStoreRecords(storeName);
    const local = localRecords.find(r => r.id === id);

    if (!local) {
      // Record doesn't exist locally, so save it
      await saveStoreRecord(storeName, imported);
    } else {
      // Both exist, check for divergence
      const isConflict = 
        imported.deviceId && local.deviceId && imported.deviceId !== local.deviceId &&
        imported.revisionId && local.revisionId && 
        imported.revisionId !== local.revisionId &&
        imported.baseRevisionId !== local.revisionId && 
        local.baseRevisionId !== imported.revisionId;
        
      if (isConflict) {
        const preserveStores = ["character_cards", "promptLibrary", "personas", "lorebooks", "rpScenarios", "projects", "scenes"];
        const mergeStores = ["chats", "rp_chats", "conversations"];

        if (preserveStores.includes(storeName)) {
          // Preserve conflict copy
          const newId = `${id}_conflict_${Date.now()}`;
          const conflictRecord = {
            ...imported,
            id: newId,
            name: imported.name ? `${imported.name} (Conflict from ${imported.deviceId || "Remote"})` : undefined,
            title: imported.title ? `${imported.title} (Conflict from ${imported.deviceId || "Remote"})` : undefined,
          };
          await saveStoreRecord(storeName, conflictRecord);
        } else if (mergeStores.includes(storeName)) {
          // Message-level append merge
          const localMessages = local.messages || [];
          const importedMessages = imported.messages || [];
          
          const localMsgIds = new Set(localMessages.map((m: Record<string, unknown>) => m.id));
          const newMessages = importedMessages.filter((m: Record<string, unknown>) => !localMsgIds.has(m.id as string));
          
          if (newMessages.length > 0) {
            const mergedRecord = {
              ...local,
              messages: [...localMessages, ...newMessages].sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.createdAt as number) - (b.createdAt as number)),
              updatedAt: Math.max(local.updatedAt || 0, importedUpdatedAt)
            };
            await saveStoreRecord(storeName, mergedRecord);
          }
        } else {
          // No conflict merge logic, just LWW
          const localUpdate = local.updatedAt || 0;
          if (importedUpdatedAt > localUpdate) {
            await saveStoreRecord(storeName, imported);
          }
        }
      } else {
        // No conflict, just use last-write-wins
        const localUpdate = local.updatedAt || 0;
        if (importedUpdatedAt > localUpdate) {
          await saveStoreRecord(storeName, imported);
        }
      }
    }

    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error importing packet for ${storeName}/${id}:`, err);
    return { ok: false, error: errorMsg };
  } finally {
    if (typeof window !== "undefined") {
      (window as VeniceWindowWithSyncFlag).__VENICE_IS_SYNCING = false;
    }
  }
}

/** Parses a manual backup manifest and previews the number of records. */
export async function previewBackup(manifest: EncryptedBackupManifest, password: string): Promise<{ totalRecords: number; stores: Array<{ storeName: string; records: number }> }> {
  const decrypted = JSON.parse(await decryptBackup(manifest, password)) as Record<string, unknown>;
  const stores = Object.entries(decrypted).filter(([storeName, records]) => IMPORTABLE_STORES.has(storeName) && Array.isArray(records))
    .map(([storeName, records]) => ({ storeName, records: (records as unknown[]).length }));
  return { totalRecords: stores.reduce((sum, store) => sum + store.records, 0), stores };
}

/** 
 * Fully decrypts and imports an EncryptedBackupManifest.
 * Returns a summary of the import operation.
 */
export async function parseAndImportBackup(
  manifest: EncryptedBackupManifest,
  password: string
): Promise<ImportSummary> {
  const decryptedJson = await decryptBackup(manifest, password);

  const data = JSON.parse(decryptedJson) as Record<string, SyncableRecord[]>;
  let importedCount = 0;
  let skippedCount = 0;
  let tombstoneCount = 0;

  // Suppress local sync emission while applying remote records so imported
  // records are not immediately echoed back to the sync folder.
  if (isElectron()) {
    await desktopSync.setEmissionSuppressed({ suppressed: true });
  }

  try {
    for (const storeName of Object.keys(data)) {
      if (!IMPORTABLE_STORES.has(storeName)) {
        skippedCount += Array.isArray(data[storeName]) ? data[storeName].length : 0;
        continue;
      }
      const records = data[storeName];
      if (!Array.isArray(records)) continue;

      for (const record of records) {
        const recordJson = JSON.stringify(record);
        // We can re-use importDecryptedPacket for conflict resolution
        const res = await importDecryptedPacket(storeName as SyncStoreName, record.id, recordJson);
        if (res.ok) {
          if (storeName === "tombstones") {
            tombstoneCount++;
          } else {
            importedCount++;
          }
        } else {
          skippedCount++;
        }
      }
    }
  } finally {
    if (isElectron()) {
      await desktopSync.setEmissionSuppressed({ suppressed: false });
    }
  }

  return { recordsImported: importedCount, recordsSkipped: skippedCount, tombstonesApplied: tombstoneCount };
}
