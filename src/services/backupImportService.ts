/** @fileoverview Service for manually importing an encrypted backup of all syncable tables. */

import StorageService from "./storageService";
import { STORE_NAMES } from "../constants/venice";
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
} from "./desktopBridge";
import type { SyncStoreName } from "../types/sync";
import { deriveBackupKey, fromBase64, type EncryptedBackupManifest } from "./backupExportService";

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

/** 
 * Validates, decrypts, and applies an encrypted backup manifest.
 * @param manifest The encrypted manifest object.
 * @param password The user-provided passphrase for decryption.
 * @returns An import summary with counts of imported, skipped, and tombstones applied.
 */
export async function importEncryptedBackup(
  manifest: EncryptedBackupManifest,
  password: string
): Promise<{ ok: boolean; summary?: ImportSummary; error?: string }> {
  try {
    if (typeof window !== "undefined") {
      (window as VeniceWindowWithSyncFlag).__VENICE_IS_SYNCING = true;
    }
    
    const salt = fromBase64(manifest.salt);
    const iv = fromBase64(manifest.iv);
    const ciphertext = fromBase64(manifest.ciphertext);

    const key = await deriveBackupKey(password, salt);
    
    let plaintextBuffer: ArrayBuffer;
    try {
      plaintextBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );
    } catch {
      if (typeof window !== "undefined") {
        (window as VeniceWindowWithSyncFlag).__VENICE_IS_SYNCING = false;
      }
      return { ok: false, error: "Decryption failed. Incorrect password or corrupted data." };
    }

    const plaintextStr = new TextDecoder().decode(plaintextBuffer);
    const data = JSON.parse(plaintextStr) as Record<string, unknown[]>;

    const summary: ImportSummary = {
      recordsImported: 0,
      recordsSkipped: 0,
      tombstonesApplied: 0,
    };

    // We must process tombstones first to build a map of deleted records.
    const importedTombstones = (data["tombstones"] || []) as Array<{ id: string, storeName: SyncStoreName, recordId: string, deletedAt: number }>;
    
    // First, apply all imported tombstones that are newer than local tombstones.
    for (const tombstone of importedTombstones) {
      const localTombstone = await StorageService.getItem("tombstones", tombstone.id) as { deletedAt: number } | null;
      if (!localTombstone || localTombstone.deletedAt < tombstone.deletedAt) {
        await TombstoneService.recordTombstone(tombstone.storeName, tombstone.recordId, "import");
        // Ensure the record is deleted locally
        await deleteStoreRecord(tombstone.storeName, tombstone.recordId);
        summary.tombstonesApplied++;
      }
    }

    // Now, iterate through all stores and merge records
    const { fetchStoreRecords } = await import("./backupExportService");
    
    for (const storeName of STORE_NAMES) {
      if (storeName === "diagnostics" || storeName === "tombstones") continue;

      const importedRecords = (data[storeName] || []) as SyncableRecord[];
      if (!importedRecords.length) continue;

      const localRecords = (await fetchStoreRecords(storeName)) as SyncableRecord[];
      const localMap = new Map(localRecords.map((r) => [r.id, r]));

      for (const imported of importedRecords) {
        if (!imported.id) {
          summary.recordsSkipped++;
          continue;
        }

        // Check against tombstone locally
        const tombstoneId = `${storeName}:${imported.id}`;
        const localTombstone = await StorageService.getItem("tombstones", tombstoneId) as { deletedAt: number } | null;
        
        const importedUpdatedAt = imported.updatedAt || 0;

        if (localTombstone && localTombstone.deletedAt > importedUpdatedAt) {
          // Local tombstone is newer, meaning it was deleted recently. Skip import.
          summary.recordsSkipped++;
          continue;
        }

        const local = localMap.get(imported.id);
        if (!local) {
          // Record doesn't exist locally, so save it
          await saveStoreRecord(storeName, imported);
          summary.recordsImported++;
        } else {
          // Both exist, check for divergence
          const isConflict = 
            imported.deviceId && local.deviceId && imported.deviceId !== local.deviceId &&
            imported.revisionId && local.revisionId && 
            imported.revisionId !== local.revisionId &&
            imported.baseRevisionId !== local.revisionId && 
            local.baseRevisionId !== imported.revisionId;
            
          if (isConflict) {
            if (storeName === "character_cards" || storeName === "promptLibrary") {
              // Preserve conflict copy
              const newId = `${imported.id}_conflict_${Date.now()}`;
              const conflictRecord = {
                ...imported,
                id: newId,
                name: imported.name ? `${imported.name} (Conflict from ${imported.deviceId || "Remote"})` : undefined,
                title: imported.title ? `${imported.title} (Conflict from ${imported.deviceId || "Remote"})` : undefined,
              };
              await saveStoreRecord(storeName, conflictRecord);
              summary.recordsImported++;
              continue;
            } else if (storeName === "chats" || storeName === "rp_chats") {
              // Message-level append merge
              const localMessages = local.messages || [];
              const importedMessages = imported.messages || [];
              
              const localMsgIds = new Set(localMessages.map((m: Record<string, unknown>) => m.id));
              const newMessages = importedMessages.filter((m: Record<string, unknown>) => !localMsgIds.has(m.id));
              
              if (newMessages.length > 0) {
                const mergedRecord = {
                  ...local,
                  messages: [...localMessages, ...newMessages].sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.createdAt as number) - (b.createdAt as number)),
                  updatedAt: Math.max(local.updatedAt || 0, importedUpdatedAt)
                };
                await saveStoreRecord(storeName, mergedRecord);
                summary.recordsImported++;
              } else {
                summary.recordsSkipped++;
              }
              continue;
            }
          }
          
          // No conflict, or type doesn't support branching, just use last-write-wins
          const localUpdate = local.updatedAt || 0;
          if (importedUpdatedAt > localUpdate) {
            await saveStoreRecord(storeName, imported);
            summary.recordsImported++;
          } else {
            summary.recordsSkipped++;
          }
        }
      }
    }

    if (typeof window !== "undefined") {
      (window as VeniceWindowWithSyncFlag).__VENICE_IS_SYNCING = false;
    }
    return { ok: true, summary };
  } catch (err) {
    if (typeof window !== "undefined") {
      (window as VeniceWindowWithSyncFlag).__VENICE_IS_SYNCING = false;
    }
    const errorMsg = err instanceof Error ? err.message : "Unknown error during import.";
    return { ok: false, error: errorMsg };
  }
}
