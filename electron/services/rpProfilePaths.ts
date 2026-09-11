/** Profile-scoped RP storage roots under userData/profiles/<id>/. */
import { app } from "electron";
import fs from "fs/promises";
import path from "path";
import { isValidProfileStorageId } from "../../src/utils/profileIdValidation";

const ALLOWED_RP_DIRS = new Set([
  "characters",
  "personas",
  "lorebooks",
  "rp-assets",
  "rp-scenarios",
  "rp-chats",
]);

export function assertRpProfileId(profileId: string): string {
  if (!isValidProfileStorageId(profileId)) throw new Error("Invalid profile id.");
  return profileId;
}

export function getRpProfileDir(profileId: string, dirName: string): string {
  const id = assertRpProfileId(profileId);
  if (!ALLOWED_RP_DIRS.has(dirName)) throw new Error("Invalid RP directory name.");
  return path.join(app.getPath("userData"), "profiles", id, dirName);
}

export function getLegacyRpDir(dirName: string): string {
  if (!ALLOWED_RP_DIRS.has(dirName)) throw new Error("Invalid RP directory name.");
  return path.join(app.getPath("userData"), dirName);
}

/** One-time move of the pre-profile global RP directory into `profiles/default`. */
export async function ensureRpProfileDir(profileId: string, dirName: string): Promise<string> {
  const scoped = getRpProfileDir(profileId, dirName);
  if (profileId === "default") {
    await migrateLegacyRpDir(dirName, scoped);
  }
  await fs.mkdir(scoped, { recursive: true, mode: 0o700 });
  return scoped;
}

async function migrateLegacyRpDir(dirName: string, scoped: string): Promise<void> {
  const legacy = getLegacyRpDir(dirName);
  try {
    await fs.access(legacy);
  } catch {
    return;
  }
  try {
    await fs.access(scoped);
    return;
  } catch {
    await fs.mkdir(path.dirname(scoped), { recursive: true, mode: 0o700 });
    await fs.rename(legacy, scoped);
  }
}

export async function purgeRpProfileDirs(profileId: string): Promise<void> {
  const id = assertRpProfileId(profileId);
  const root = path.join(app.getPath("userData"), "profiles", id);
  await fs.rm(root, { recursive: true, force: true });
}
