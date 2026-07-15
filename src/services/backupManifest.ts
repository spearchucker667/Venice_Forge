/** @fileoverview Versioned, authenticated metadata for portable manual backups. */

export const LEGACY_MANUAL_BACKUP_VERSION = 2;
export const MANUAL_BACKUP_MANIFEST_VERSION = 3;
export const MANUAL_BACKUP_FORMAT = "venice-forge-manual-backup";

export type BackupRuntime = "electron" | "web";
export type BackupAlgorithm = "XChaCha20-Poly1305" | "AES-256-GCM";
export type BackupKdf = "Argon2id" | "PBKDF2-SHA-256";

export interface BackupManifestMetadata {
  format: typeof MANUAL_BACKUP_FORMAT;
  formatVersion: typeof MANUAL_BACKUP_MANIFEST_VERSION;
  appVersion: string;
  exportedAt: string;
  source: {
    runtime: BackupRuntime;
    deviceRef: string;
    profileRef: string;
  };
  crypto: {
    algorithm: BackupAlgorithm;
    kdf: BackupKdf;
    keyVersion: number;
  };
  contents: {
    totalRecords: number;
    storeCounts: Record<string, number>;
    tombstoneCount: number;
    embeddedBlobCount: number;
    includesMedia: boolean;
    exclusions: string[];
    payloadSha256: string;
  };
}

export interface BuildBackupManifestMetadataInput {
  data: Record<string, unknown>;
  appVersion: string;
  exportedAt: string;
  runtime: BackupRuntime;
  deviceRef: string;
  profileId: string;
  crypto: BackupManifestMetadata["crypto"];
  exclusions: string[];
}

const MEDIA_STORES = new Set(["images", "files", "rp_assets"]);
const SHA256_RE = /^[a-f0-9]{64}$/;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function countEmbeddedBlobs(value: unknown): number {
  if (typeof value === "string") return value.startsWith("data:") ? 1 : 0;
  if (Array.isArray(value)) return value.reduce<number>((count, item) => count + countEmbeddedBlobs(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .reduce<number>((count, item) => count + countEmbeddedBlobs(item), 0);
  }
  return 0;
}

function summarizeBackupContents(data: Record<string, unknown>): {
  totalRecords: number;
  storeCounts: Record<string, number>;
  tombstoneCount: number;
  embeddedBlobCount: number;
  includesMedia: boolean;
} {
  const storeCounts = Object.fromEntries(
    Object.entries(data)
      .filter(([, records]) => Array.isArray(records))
      .map(([storeName, records]) => [storeName, (records as unknown[]).length]),
  );
  return {
    totalRecords: Object.values(storeCounts).reduce((total, count) => total + count, 0),
    storeCounts,
    tombstoneCount: storeCounts.tombstones ?? 0,
    embeddedBlobCount: countEmbeddedBlobs(data),
    includesMedia: Array.from(MEDIA_STORES).some((storeName) => (storeCounts[storeName] ?? 0) > 0),
  };
}

export async function hashPortableBackupData(data: Record<string, unknown>): Promise<string> {
  return sha256Hex(canonicalJson(data));
}

export async function buildBackupManifestMetadata(
  input: BuildBackupManifestMetadataInput,
): Promise<BackupManifestMetadata> {
  const summary = summarizeBackupContents(input.data);
  return {
    format: MANUAL_BACKUP_FORMAT,
    formatVersion: MANUAL_BACKUP_MANIFEST_VERSION,
    appVersion: input.appVersion,
    exportedAt: input.exportedAt,
    source: {
      runtime: input.runtime,
      deviceRef: input.deviceRef,
      profileRef: (await sha256Hex(input.profileId)).slice(0, 16),
    },
    crypto: { ...input.crypto },
    contents: {
      ...summary,
      exclusions: [...input.exclusions],
      payloadSha256: await hashPortableBackupData(input.data),
    },
  };
}

export function isBackupManifestMetadata(value: unknown): value is BackupManifestMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metadata = value as Partial<BackupManifestMetadata>;
  return metadata.format === MANUAL_BACKUP_FORMAT
    && metadata.formatVersion === MANUAL_BACKUP_MANIFEST_VERSION
    && typeof metadata.appVersion === "string"
    && typeof metadata.exportedAt === "string"
    && Number.isFinite(Date.parse(metadata.exportedAt))
    && !!metadata.source
    && (metadata.source.runtime === "electron" || metadata.source.runtime === "web")
    && typeof metadata.source.deviceRef === "string"
    && typeof metadata.source.profileRef === "string"
    && !!metadata.crypto
    && (metadata.crypto.algorithm === "XChaCha20-Poly1305" || metadata.crypto.algorithm === "AES-256-GCM")
    && (metadata.crypto.kdf === "Argon2id" || metadata.crypto.kdf === "PBKDF2-SHA-256")
    && Number.isInteger(metadata.crypto.keyVersion)
    && !!metadata.contents
    && Number.isInteger(metadata.contents.totalRecords)
    && !!metadata.contents.storeCounts
    && typeof metadata.contents.storeCounts === "object"
    && Number.isInteger(metadata.contents.tombstoneCount)
    && Number.isInteger(metadata.contents.embeddedBlobCount)
    && typeof metadata.contents.includesMedia === "boolean"
    && Array.isArray(metadata.contents.exclusions)
    && metadata.contents.exclusions.every((item) => typeof item === "string")
    && typeof metadata.contents.payloadSha256 === "string"
    && SHA256_RE.test(metadata.contents.payloadSha256);
}

export async function verifyBackupManifestMetadata(
  outer: BackupManifestMetadata,
  authenticated: BackupManifestMetadata,
  data: Record<string, unknown>,
  profileId?: string,
): Promise<void> {
  const summary = summarizeBackupContents(data);
  const expectedProfileRef = profileId === undefined ? outer.source.profileRef : (await sha256Hex(profileId)).slice(0, 16);
  if (!isBackupManifestMetadata(outer)
    || !isBackupManifestMetadata(authenticated)
    || canonicalJson(outer) !== canonicalJson(authenticated)
    || canonicalJson({
      totalRecords: outer.contents.totalRecords,
      storeCounts: outer.contents.storeCounts,
      tombstoneCount: outer.contents.tombstoneCount,
      embeddedBlobCount: outer.contents.embeddedBlobCount,
      includesMedia: outer.contents.includesMedia,
    }) !== canonicalJson(summary)
    || outer.source.profileRef !== expectedProfileRef
    || outer.contents.payloadSha256 !== await hashPortableBackupData(data)) {
    throw new Error("Backup manifest metadata authentication failed.");
  }
}
