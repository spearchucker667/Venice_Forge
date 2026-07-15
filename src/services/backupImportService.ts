/** @fileoverview Service for staging and importing encrypted portable backups. */

import { isElectron, desktopSync } from "./desktopBridge";
export { saveStoreRecord, deleteStoreRecord, fetchStoreRecords, importDecryptedPacket, type SyncableRecord, IMPORTABLE_STORES } from "./syncPacketImporter";

import { fetchStoreRecords, importDecryptedPacket, IMPORTABLE_STORES, type SyncableRecord } from "./syncPacketImporter";
import type { SyncStoreName } from "../types/sync";
import { deriveBackupKey, fromBase64, type EncryptedBackupManifest } from "./backupCryptoWeb";
import { toEpochMilliseconds } from "../shared/syncTimestamp";
import { compareSyncRecords } from "../shared/syncConvergence";
import { BACKUP_PROFILE_METADATA_KEY } from "../shared/backupProfile";
import { validateTombstone } from "../shared/syncProtocol";
import { version as appVersion } from "../../package.json";
import type { BackupManifestMetadata } from "./backupManifest";

const LEGACY_MANUAL_BACKUP_VERSION = 2;
const MANUAL_BACKUP_MANIFEST_VERSION = 3;

const RECORD_ID_RE = /^[a-zA-Z0-9_.:-]{1,256}$/;

export interface ImportSummary {
  recordsImported: number;
  recordsSkipped: number;
  tombstonesApplied: number;
}

export interface ImportPlanModel {
  totalRecords: number;
  manifest: ImportManifestPreview;
  warnings: ImportPlanWarning[];
  stores: Array<{
    storeName: string;
    records: number;
    newRecords: number;
    modifiedRecords: number;
    conflicts: number;
    identical: number;
  }>;
}

export interface ImportPlanWarning {
  code: "legacy-manifest" | "app-version-mismatch" | "media-included" | "data-exclusions";
  severity: "info" | "warning";
  message: string;
}

export interface ImportManifestPreview {
  version: number;
  metadataVerified: boolean;
  exportedAt: string;
  appVersion?: string;
  sourceRuntime?: "electron" | "web";
  sourceDeviceRef?: string;
  sourceProfileRef?: string;
  algorithm?: string;
  kdf?: string;
  keyVersion?: number;
  tombstoneCount: number;
  embeddedBlobCount: number;
  includesMedia: boolean;
  exclusions: string[];
  payloadSha256?: string;
}

export interface PreparedBackupImport {
  data: Record<string, SyncableRecord[]>;
  plan: ImportPlanModel;
  skippedRecords: number;
}

function validateManifest(manifest: EncryptedBackupManifest): void {
  if (!manifest || typeof manifest !== "object"
    || (manifest.version !== LEGACY_MANUAL_BACKUP_VERSION && manifest.version !== MANUAL_BACKUP_MANIFEST_VERSION)
    || typeof manifest.exportedAt !== "string" || !Number.isFinite(Date.parse(manifest.exportedAt))
    || typeof manifest.salt !== "string" || typeof manifest.iv !== "string" || typeof manifest.ciphertext !== "string") {
    throw new Error("Malformed encrypted backup manifest.");
  }
  if (manifest.version === MANUAL_BACKUP_MANIFEST_VERSION
    && (!manifest.metadata || typeof manifest.metadata !== "object" || Array.isArray(manifest.metadata))) {
    throw new Error("Malformed encrypted backup manifest metadata.");
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

function parseAndValidatePayload(decryptedJson: string): {
  data: Record<string, SyncableRecord[]>;
  portableData: Record<string, unknown>;
  embeddedMetadata?: BackupManifestMetadata;
  profileId?: string;
  skippedRecords: number;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptedJson);
  } catch {
    throw new Error("Decrypted backup payload is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Decrypted backup payload must be an object.");
  }

  const data: Record<string, SyncableRecord[]> = {};
  const portableData: Record<string, unknown> = {};
  const profileMetadata = (parsed as Record<string, unknown>)[BACKUP_PROFILE_METADATA_KEY];
  const embeddedMetadata = profileMetadata && typeof profileMetadata === "object" && !Array.isArray(profileMetadata)
    ? (profileMetadata as Record<string, unknown>).manifestMetadata
    : undefined;
  const profileId = profileMetadata && typeof profileMetadata === "object" && !Array.isArray(profileMetadata)
    && typeof (profileMetadata as Record<string, unknown>).profileId === "string"
    ? (profileMetadata as Record<string, unknown>).profileId as string
    : undefined;
  let skippedRecords = 0;
  for (const [storeName, records] of Object.entries(parsed as Record<string, unknown>)) {
    if (storeName === BACKUP_PROFILE_METADATA_KEY) continue;
    portableData[storeName] = records;
    if (!IMPORTABLE_STORES.has(storeName)) {
      if (Array.isArray(records)) skippedRecords += records.length;
      continue;
    }
    if (!Array.isArray(records)) {
      throw new Error(`Backup store ${storeName} must contain an array of records.`);
    }

    const ids = new Set<string>();
    const validated: SyncableRecord[] = records.map((record, index) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error(`Backup store ${storeName} record ${index} must be an object.`);
      }
      const candidate = record as SyncableRecord;
      if (typeof candidate.id !== "string" || !RECORD_ID_RE.test(candidate.id) || candidate.id.includes("..")) {
        throw new Error(`Backup store ${storeName} record ${index} has an invalid record ID.`);
      }
      if (ids.has(candidate.id)) {
        throw new Error(`Backup store ${storeName} contains duplicate record ID ${candidate.id}.`);
      }
      ids.add(candidate.id);
      if (storeName === "tombstones") {
        const tombstone = validateTombstone(candidate);
        if (!tombstone.ok) throw new Error(`Backup tombstone ${candidate.id} is invalid: ${tombstone.error}`);
      }
      return candidate;
    });
    data[storeName] = validated;
  }
  return {
    data,
    portableData,
    embeddedMetadata: embeddedMetadata as BackupManifestMetadata | undefined,
    profileId,
    skippedRecords,
  };
}

async function buildImportPlan(
  data: Record<string, SyncableRecord[]>,
  manifest: ImportManifestPreview,
  warnings: ImportPlanWarning[],
): Promise<ImportPlanModel> {
  const plan: ImportPlanModel = { totalRecords: 0, stores: [], manifest, warnings };

  for (const [storeName, importedRecords] of Object.entries(data)) {
    let newRecords = 0;
    let modifiedRecords = 0;
    let conflicts = 0;
    let identical = 0;
    let localRecords: SyncableRecord[] = [];
    try {
      localRecords = await fetchStoreRecords(storeName as SyncStoreName);
    } catch {
      // An unavailable local store means every valid incoming record is new.
    }

    const localMap = new Map(localRecords.map((record) => [record.id, record]));
    for (const imported of importedRecords) {
      const local = localMap.get(imported.id);
      if (!local) {
        newRecords += 1;
        continue;
      }
      const localUpdate = toEpochMilliseconds(local.updatedAt) ?? 0;
      const importUpdate = toEpochMilliseconds(imported.updatedAt) ?? 0;
      if (localUpdate !== importUpdate) {
        conflicts += 1;
      } else if (compareSyncRecords(imported, local) > 0) {
        modifiedRecords += 1;
      } else {
        identical += 1;
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

function buildManifestPreview(manifest: EncryptedBackupManifest): {
  preview: ImportManifestPreview;
  warnings: ImportPlanWarning[];
} {
  if (manifest.version === LEGACY_MANUAL_BACKUP_VERSION) {
    return {
      preview: {
        version: manifest.version,
        metadataVerified: false,
        exportedAt: manifest.exportedAt,
        tombstoneCount: 0,
        embeddedBlobCount: 0,
        includesMedia: false,
        exclusions: [],
      },
      warnings: [{
        code: "legacy-manifest",
        severity: "warning",
        message: "Legacy version-2 backup: authenticated source, crypto, content-count, and exclusion metadata is unavailable.",
      }],
    };
  }

  const metadata = manifest.metadata!;
  const warnings: ImportPlanWarning[] = [];
  if (metadata.appVersion !== appVersion) {
    warnings.push({
      code: "app-version-mismatch",
      severity: "warning",
      message: `Backup app version ${metadata.appVersion} differs from this app version ${appVersion}.`,
    });
  }
  if (metadata.contents.includesMedia) {
    warnings.push({ code: "media-included", severity: "info", message: "This backup includes media records." });
  }
  if (metadata.contents.exclusions.length > 0) {
    warnings.push({
      code: "data-exclusions",
      severity: "info",
      message: `Excluded by design: ${metadata.contents.exclusions.join(", ")}.`,
    });
  }
  return {
    preview: {
      version: manifest.version,
      metadataVerified: true,
      exportedAt: metadata.exportedAt,
      appVersion: metadata.appVersion,
      sourceRuntime: metadata.source.runtime,
      sourceDeviceRef: metadata.source.deviceRef,
      sourceProfileRef: metadata.source.profileRef,
      algorithm: metadata.crypto.algorithm,
      kdf: metadata.crypto.kdf,
      keyVersion: metadata.crypto.keyVersion,
      tombstoneCount: metadata.contents.tombstoneCount,
      embeddedBlobCount: metadata.contents.embeddedBlobCount,
      includesMedia: metadata.contents.includesMedia,
      exclusions: [...metadata.contents.exclusions],
      payloadSha256: metadata.contents.payloadSha256,
    },
    warnings,
  };
}

/** Decrypts and validates the complete import payload without mutating storage. */
export async function prepareBackupImport(
  manifest: EncryptedBackupManifest,
  password: string,
): Promise<PreparedBackupImport> {
  const decryptedJson = await decryptBackup(manifest, password);
  const { data, portableData, embeddedMetadata, profileId, skippedRecords } = parseAndValidatePayload(decryptedJson);
  if (manifest.version === MANUAL_BACKUP_MANIFEST_VERSION) {
    const { isBackupManifestMetadata, verifyBackupManifestMetadata } = await import("./backupManifest");
    if (!manifest.metadata || !embeddedMetadata || manifest.exportedAt !== manifest.metadata.exportedAt) {
      throw new Error("Backup manifest metadata authentication failed.");
    }
    if (!isBackupManifestMetadata(manifest.metadata) || !isBackupManifestMetadata(embeddedMetadata)) {
      throw new Error("Backup manifest metadata authentication failed.");
    }
    if (!profileId) throw new Error("Backup manifest metadata authentication failed.");
    await verifyBackupManifestMetadata(manifest.metadata, embeddedMetadata, portableData, profileId);
  }
  const { preview, warnings } = buildManifestPreview(manifest);
  return { data, skippedRecords, plan: await buildImportPlan(data, preview, warnings) };
}

/** Parses a manual backup manifest and previews the detailed import plan. */
export async function previewBackup(manifest: EncryptedBackupManifest, password: string): Promise<ImportPlanModel> {
  return (await prepareBackupImport(manifest, password)).plan;
}

/** Applies a previously decrypted and validated payload without decrypting again. */
export async function applyPreparedBackup(prepared: PreparedBackupImport): Promise<ImportSummary> {
  let importedCount = 0;
  let skippedCount = prepared.skippedRecords;
  let tombstoneCount = 0;

  if (isElectron()) {
    const suppression = await desktopSync.setEmissionSuppressed({ suppressed: true });
    if (!suppression.ok) throw new Error(suppression.error || "Could not suppress sync emission during import.");
  }

  try {
    for (const [storeName, records] of Object.entries(prepared.data)) {
      for (const record of records) {
        const result = await importDecryptedPacket(
          storeName as SyncStoreName,
          record.id,
          JSON.stringify(record),
        );
        if (result.ok) {
          if (storeName === "tombstones") tombstoneCount += 1;
          else importedCount += 1;
        } else {
          skippedCount += 1;
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

/** Fully decrypts, validates, and imports an encrypted backup manifest. */
export async function parseAndImportBackup(
  manifest: EncryptedBackupManifest,
  password: string,
): Promise<ImportSummary> {
  return applyPreparedBackup(await prepareBackupImport(manifest, password));
}
