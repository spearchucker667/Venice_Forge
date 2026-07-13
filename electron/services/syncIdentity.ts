import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { decryptPayload, encryptPayload, type EncryptedBackupManifest } from "./backupCrypto";

const IDENTITY_VERSION = 1;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SyncIdentity {
  syncSetId: string;
  keyId: string;
}

interface StoredSyncIdentity extends SyncIdentity {
  version: 1;
}

function validateIdentity(value: unknown): SyncIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid encrypted sync identity.");
  }
  const candidate = value as Partial<StoredSyncIdentity>;
  if (candidate.version !== IDENTITY_VERSION || !UUID_RE.test(candidate.syncSetId ?? "") || !UUID_RE.test(candidate.keyId ?? "")) {
    throw new Error("Invalid encrypted sync identity.");
  }
  return { syncSetId: candidate.syncSetId!, keyId: candidate.keyId! };
}

async function readIdentity(filePath: string, password: string): Promise<SyncIdentity> {
  const manifest = JSON.parse(await fs.readFile(filePath, "utf8")) as EncryptedBackupManifest;
  if (manifest.version !== 2) throw new Error("Unsupported encrypted sync identity version.");
  const plaintext = await decryptPayload(manifest.ciphertext, manifest.salt, manifest.iv, password);
  return validateIdentity(JSON.parse(plaintext));
}

export async function ensureSyncIdentity(vfbackupDirectory: string, password: string): Promise<SyncIdentity> {
  const filePath = path.join(vfbackupDirectory, "sync-identity.json");
  try {
    return await readIdentity(filePath, password);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const identity: StoredSyncIdentity = {
    version: IDENTITY_VERSION,
    syncSetId: crypto.randomUUID(),
    keyId: crypto.randomUUID(),
  };
  const encrypted = await encryptPayload(JSON.stringify(identity), password);
  const manifest: EncryptedBackupManifest = {
    version: 2,
    exportedAt: new Date().toISOString(),
    ...encrypted,
  };
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.mkdir(vfbackupDirectory, { recursive: true });
  try {
    await fs.writeFile(temporary, JSON.stringify(manifest), { encoding: "utf8", mode: 0o600, flag: "wx" });
    try {
      await fs.link(temporary, filePath);
      return { syncSetId: identity.syncSetId, keyId: identity.keyId };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return await readIdentity(filePath, password);
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export function packetMatchesSyncIdentity(packet: Record<string, unknown>, identity: SyncIdentity): boolean {
  return packet._syncSetId === identity.syncSetId && packet._keyId === identity.keyId;
}
