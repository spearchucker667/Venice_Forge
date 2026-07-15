/** @fileoverview Transactional replace-import orchestration with durable rollback. */

import { STORE_NAMES } from "../constants/venice";
import type { SyncStoreName } from "../types/sync";
import type { EncryptedBackupManifest } from "./backupCryptoWeb";
import {
  applyPreparedBackup,
  deleteStoreRecord,
  fetchStoreRecords,
  IMPORTABLE_STORES,
  prepareBackupImport,
  type ImportSummary,
  type PreparedBackupImport,
} from "./backupImportService";
import { createEncryptedBackup } from "./backupExportService";
import { desktopSync, isElectron } from "./desktopBridge";
import StorageService from "./storageService";

export interface ReplaceImportRecoveryMetadata {
  id: string;
  createdAt: string;
}

export interface ReplaceImportResult extends ImportSummary {
  recovery: ReplaceImportRecoveryMetadata;
}

const MAIN_MANAGED_STORES = new Set<SyncStoreName>([
  "conversations",
  "character_cards",
  "personas",
  "lorebooks",
  "rp_chats",
  "rp_assets",
  "rpScenarios",
]);

const REPLACEABLE_STORES = STORE_NAMES.filter((storeName) => IMPORTABLE_STORES.has(storeName));

export class ReplaceImportError extends Error {
  readonly rolledBack: boolean;
  readonly recoveryId: string;
  readonly originalError: unknown;
  readonly rollbackError?: unknown;

  constructor(input: {
    message: string;
    rolledBack: boolean;
    recoveryId: string;
    originalError: unknown;
    rollbackError?: unknown;
  }) {
    super(input.message);
    this.name = "ReplaceImportError";
    this.rolledBack = input.rolledBack;
    this.recoveryId = input.recoveryId;
    this.originalError = input.originalError;
    this.rollbackError = input.rollbackError;
  }
}

/** Clears the active profile from both renderer IndexedDB and main-managed stores. */
export async function clearCurrentProfileForReplace(): Promise<void> {
  for (const storeName of REPLACEABLE_STORES) {
    if (MAIN_MANAGED_STORES.has(storeName)) {
      const records = await fetchStoreRecords(storeName);
      for (const record of records) {
        await deleteStoreRecord(storeName, record.id, "manual-import");
      }
    }
    await StorageService.clearStore(storeName);
  }
}

async function createVerifiedCurrentRecovery(password: string): Promise<{
  manifest: EncryptedBackupManifest;
  prepared: PreparedBackupImport;
  metadata: ReplaceImportRecoveryMetadata;
}> {
  const manifest = await createEncryptedBackup(password);
  const prepared = await prepareBackupImport(manifest, password);
  const persisted = await desktopSync.createReplaceImportRecovery({ manifest, password });
  if (!persisted.ok || !persisted.recovery) {
    throw new Error(persisted.error || "Could not persist a verified replace-import recovery backup.");
  }
  return { manifest, prepared, metadata: persisted.recovery };
}

async function applyReplacementWithRecovery(
  incoming: PreparedBackupImport,
  password: string,
): Promise<ReplaceImportResult> {
  const recovery = await createVerifiedCurrentRecovery(password);
  try {
    await clearCurrentProfileForReplace();
    const summary = await applyPreparedBackup(incoming);
    return { ...summary, recovery: recovery.metadata };
  } catch (originalError) {
    try {
      await clearCurrentProfileForReplace();
      await applyPreparedBackup(recovery.prepared);
    } catch (rollbackError) {
      throw new ReplaceImportError({
        message: "Replace import failed and automatic rollback also failed. Use the retained recovery backup.",
        rolledBack: false,
        recoveryId: recovery.metadata.id,
        originalError,
        rollbackError,
      });
    }
    throw new ReplaceImportError({
      message: "Replace import failed. The original profile data was restored automatically.",
      rolledBack: true,
      recoveryId: recovery.metadata.id,
      originalError,
    });
  }
}

/** Stages the incoming backup before creating recovery or mutating either storage runtime. */
export async function replaceBackupWithRecovery(
  manifest: EncryptedBackupManifest,
  password: string,
): Promise<ReplaceImportResult> {
  if (!isElectron()) {
    throw new Error("Replace import is available only in the Venice Forge desktop app.");
  }
  const incoming = await prepareBackupImport(manifest, password);
  return applyReplacementWithRecovery(incoming, password);
}

/** Restores a retained recovery artifact transactionally, preserving the current state as a new recovery. */
export async function restoreReplaceImportRecovery(
  recoveryId: string,
  password: string,
): Promise<ReplaceImportResult> {
  if (!isElectron()) {
    throw new Error("Recovery restore is available only in the Venice Forge desktop app.");
  }
  const loaded = await desktopSync.loadReplaceImportRecovery({ id: recoveryId, password });
  if (!loaded.ok || !loaded.manifest) {
    throw new Error(loaded.error || "Could not load the replace-import recovery backup.");
  }
  const incoming = await prepareBackupImport(loaded.manifest, password);
  return applyReplacementWithRecovery(incoming, password);
}

export async function getLatestReplaceImportRecovery(): Promise<ReplaceImportRecoveryMetadata | null> {
  if (!isElectron()) return null;
  const result = await desktopSync.getLatestReplaceImportRecovery();
  if (!result.ok) throw new Error(result.error || "Could not inspect replace-import recovery backups.");
  return result.recovery ?? null;
}
