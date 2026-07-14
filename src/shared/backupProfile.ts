/** Profile metadata and validation for manual encrypted backup payloads. */

import { isValidProfileStorageId } from "../utils/profileIdValidation";

export const BACKUP_PROFILE_METADATA_KEY = "_veniceForgeBackup";

export function backupRecordBelongsToProfile(record: unknown, profileId: string): boolean {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const recordProfile = typeof (record as Record<string, unknown>).profileId === "string"
    ? (record as Record<string, unknown>).profileId as string
    : "default";
  return recordProfile === profileId;
}

export function validateBackupPayloadProfile(payload: string, profileId: string): boolean {
  if (!isValidProfileStorageId(profileId)) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;

  const data = parsed as Record<string, unknown>;
  const metadata = data[BACKUP_PROFILE_METADATA_KEY];
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  if ((metadata as Record<string, unknown>).profileId !== profileId) return false;

  return Object.entries(data).every(([key, records]) => {
    if (key === BACKUP_PROFILE_METADATA_KEY) return true;
    return Array.isArray(records) && records.every((record) => backupRecordBelongsToProfile(record, profileId));
  });
}
