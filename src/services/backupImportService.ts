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
    if (typeof window !== "undefined") {
      (window as VeniceWindowWithSyncFlag).__VENICE_IS_SYNCING = true;
    }

    const imported = JSON.parse(recordJson) as SyncableRecord;
    
    // Check against tombstone locally
    const tombstoneId = `${storeName}:${id}`;
    const localTombstone = await StorageService.getItem("tombstones", tombstoneId) as { deletedAt: number } | null;
    
    const importedUpdatedAt = imported.updatedAt || 0;

    if (localTombstone && localTombstone.deletedAt > importedUpdatedAt) {
      // Local tombstone is newer, meaning it was deleted recently. Skip import.
      return { ok: true };
    }

    const localRecords = await StorageService.getItems(storeName) as SyncableRecord[];
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

    if (typeof window !== "undefined") {
      (window as VeniceWindowWithSyncFlag).__VENICE_IS_SYNCING = false;
    }
    return { ok: true };
  } catch (err) {
    if (typeof window !== "undefined") {
      (window as VeniceWindowWithSyncFlag).__VENICE_IS_SYNCING = false;
    }
    const errorMsg = err instanceof Error ? err.message : "Unknown error during import.";
    return { ok: false, error: errorMsg };
  }
}

