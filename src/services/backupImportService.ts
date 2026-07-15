/** @fileoverview Service for manually importing an encrypted backup of all syncable tables. */

import {
  isElectron,
  desktopSync,
} from "./desktopBridge";
export { saveStoreRecord, deleteStoreRecord, fetchStoreRecords, importDecryptedPacket, type SyncableRecord, IMPORTABLE_STORES } from "./syncPacketImporter";

import { fetchStoreRecords, importDecryptedPacket, IMPORTABLE_STORES, type SyncableRecord } from "./syncPacketImporter";
import type { SyncStoreName } from "../types/sync";
import { BACKUP_SCHEMA_VERSION, deriveBackupKey, fromBase64, EncryptedBackupManifest } from "./backupCryptoWeb";
import { toEpochMilliseconds } from "../shared/syncTimestamp";
import { compareSyncRecords } from "../shared/syncConvergence";

export interface ImportSummary {
  recordsImported: number;
  recordsSkipped: number;
  tombstonesApplied: number;
}

export interface ImportPlanModel {
  totalRecords: number;
  stores: Array<{
    storeName: string;
    records: number; // total in backup
    newRecords: number;
    modifiedRecords: number;
    conflicts: number;
    identical: number;
  }>;
}

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


/** Parses a manual backup manifest and previews the detailed import plan. */
export async function previewBackup(manifest: EncryptedBackupManifest, password: string): Promise<ImportPlanModel> {
  const decrypted = JSON.parse(await decryptBackup(manifest, password)) as Record<string, unknown>;
  const plan: ImportPlanModel = { totalRecords: 0, stores: [] };

  for (const [storeName, records] of Object.entries(decrypted)) {
    if (!IMPORTABLE_STORES.has(storeName) || !Array.isArray(records)) continue;
    
    let newRecords = 0;
    let modifiedRecords = 0;
    let conflicts = 0;
    let identical = 0;

    const importedRecords = records as SyncableRecord[];
    let localRecords: SyncableRecord[] = [];
    try {
      localRecords = await fetchStoreRecords(storeName as SyncStoreName);
    } catch {
      // If we can't fetch (e.g. store doesn't exist), assume all are new
    }

    const localMap = new Map(localRecords.map(r => [r.id, r]));

    for (const imported of importedRecords) {
      const local = localMap.get(imported.id);
      if (!local) {
        newRecords++;
      } else {
        // Manual import preview: consider divergent updatedAt as conflict
        const localUpdate = toEpochMilliseconds(local.updatedAt) ?? 0;
        const importUpdate = toEpochMilliseconds(imported.updatedAt) ?? 0;
        const isConflict = localUpdate !== importUpdate;
          
        if (isConflict) {
          conflicts++;
        } else {
          // LWW comparison
          const cmp = compareSyncRecords(imported, local);
          if (cmp > 0) modifiedRecords++;
          else identical++;
        }
      }
    }

    plan.stores.push({
      storeName,
      records: importedRecords.length,
      newRecords,
      modifiedRecords,
      conflicts,
      identical,
    });
    plan.totalRecords += importedRecords.length;
  }

  return plan;
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
