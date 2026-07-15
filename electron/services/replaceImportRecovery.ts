/** @fileoverview Durable, profile-bound recovery artifacts for destructive backup replacement. */

import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { decryptPayload, type EncryptedBackupManifest } from "./backupCrypto";
import { validateBackupPayloadProfile } from "../../src/shared/backupProfile";
import { isValidProfileStorageId } from "../../src/utils/profileIdValidation";
import { isBackupManifestMetadata } from "../../src/services/backupManifest";

const RECOVERY_DIRECTORY = "replace-import-recovery";
const RECOVERY_RECORD_VERSION = 1;
const MAX_RETAINED_RECOVERIES = 3;
const MAX_MANIFEST_BYTES = 256 * 1024 * 1024;
const RECOVERY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReplaceImportRecoveryMetadata {
  id: string;
  createdAt: string;
}

interface ReplaceImportRecoveryRecord extends ReplaceImportRecoveryMetadata {
  version: 1;
  profileId: string;
  manifest: EncryptedBackupManifest;
}

function assertProfileId(profileId: string): void {
  if (!isValidProfileStorageId(profileId)) throw new Error("Invalid recovery profile id.");
}

function assertRecoveryId(id: string): void {
  if (!RECOVERY_ID_RE.test(id)) throw new Error("Invalid replace-import recovery id.");
}

function assertManifest(manifest: EncryptedBackupManifest): void {
  if (
    !manifest ||
    typeof manifest !== "object" ||
    (manifest.version !== 2 && manifest.version !== 3) ||
    typeof manifest.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(manifest.exportedAt)) ||
    typeof manifest.salt !== "string" ||
    typeof manifest.iv !== "string" ||
    typeof manifest.ciphertext !== "string"
  ) {
    throw new Error("Malformed replace-import recovery manifest.");
  }
  if (manifest.version === 3 && !isBackupManifestMetadata(manifest.metadata)) {
    throw new Error("Malformed replace-import recovery manifest metadata.");
  }
  if (Buffer.byteLength(JSON.stringify(manifest), "utf8") > MAX_MANIFEST_BYTES) {
    throw new Error("Replace-import recovery manifest exceeds the maximum size.");
  }
}

function profileDirectory(userDataRoot: string, profileId: string): string {
  assertProfileId(profileId);
  return path.join(userDataRoot, RECOVERY_DIRECTORY, profileId);
}

function recoveryPath(userDataRoot: string, profileId: string, id: string): string {
  assertRecoveryId(id);
  return path.join(profileDirectory(userDataRoot, profileId), `${id}.json`);
}

async function verifyManifestProfile(
  manifest: EncryptedBackupManifest,
  password: string,
  profileId: string,
): Promise<void> {
  assertManifest(manifest);
  if (!password) throw new Error("Recovery password is required.");
  const payload = await decryptPayload(manifest.ciphertext, manifest.salt, manifest.iv, password);
  if (!validateBackupPayloadProfile(payload, profileId)) {
    throw new Error("Replace-import recovery payload does not belong to the active profile.");
  }
}

function parseRecoveryRecord(value: unknown, expectedProfileId: string, expectedId?: string): ReplaceImportRecoveryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed replace-import recovery record.");
  }
  const record = value as Partial<ReplaceImportRecoveryRecord>;
  if (
    record.version !== RECOVERY_RECORD_VERSION ||
    typeof record.id !== "string" ||
    !RECOVERY_ID_RE.test(record.id) ||
    (expectedId !== undefined && record.id !== expectedId) ||
    record.profileId !== expectedProfileId ||
    typeof record.createdAt !== "string" ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    !record.manifest
  ) {
    throw new Error("Malformed replace-import recovery record.");
  }
  assertManifest(record.manifest);
  return record as ReplaceImportRecoveryRecord;
}

async function readRecoveryRecord(filePath: string, profileId: string, expectedId?: string): Promise<ReplaceImportRecoveryRecord> {
  const data = await fs.readFile(filePath, "utf8");
  return parseRecoveryRecord(JSON.parse(data), profileId, expectedId);
}

async function listRecoveryRecords(userDataRoot: string, profileId: string): Promise<ReplaceImportRecoveryRecord[]> {
  const directory = profileDirectory(userDataRoot, profileId);
  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const records: ReplaceImportRecoveryRecord[] = [];
  for (const entry of entries) {
    const match = /^([0-9a-f-]{36})\.json$/i.exec(entry);
    if (!match || !RECOVERY_ID_RE.test(match[1])) continue;
    try {
      records.push(await readRecoveryRecord(path.join(directory, entry), profileId, match[1]));
    } catch {
      // Corrupt artifacts remain inert and are never offered as recovery choices.
    }
  }
  return records.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function pruneOldRecoveries(userDataRoot: string, profileId: string): Promise<void> {
  const records = await listRecoveryRecords(userDataRoot, profileId);
  await Promise.all(records.slice(MAX_RETAINED_RECOVERIES).map((record) =>
    fs.rm(recoveryPath(userDataRoot, profileId, record.id), { force: true }),
  ));
}

export async function persistReplaceImportRecovery(
  userDataRoot: string,
  profileId: string,
  manifest: EncryptedBackupManifest,
  password: string,
): Promise<ReplaceImportRecoveryMetadata> {
  await verifyManifestProfile(manifest, password, profileId);

  const directory = profileDirectory(userDataRoot, profileId);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const record: ReplaceImportRecoveryRecord = {
    version: RECOVERY_RECORD_VERSION,
    id,
    profileId,
    createdAt,
    manifest,
  };
  const target = recoveryPath(userDataRoot, profileId, id);
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(record), { encoding: "utf8", flag: "wx", mode: 0o600 });
    await fs.rename(temporary, target);
    await fs.chmod(target, 0o600);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  await pruneOldRecoveries(userDataRoot, profileId);
  return { id, createdAt };
}

export async function getLatestReplaceImportRecovery(
  userDataRoot: string,
  profileId: string,
): Promise<ReplaceImportRecoveryMetadata | null> {
  const [latest] = await listRecoveryRecords(userDataRoot, profileId);
  return latest ? { id: latest.id, createdAt: latest.createdAt } : null;
}

export async function loadReplaceImportRecovery(
  userDataRoot: string,
  profileId: string,
  id: string,
  password: string,
): Promise<EncryptedBackupManifest> {
  const record = await readRecoveryRecord(recoveryPath(userDataRoot, profileId, id), profileId, id);
  await verifyManifestProfile(record.manifest, password, profileId);
  return record.manifest;
}
