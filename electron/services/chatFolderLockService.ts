import { readChatFolder, saveChatFolder } from "./chatFolderStorage";
import { getCredential, setCredential, deleteCredential } from "./secureStore";
import _sodium from "libsodium-wrappers-sumo";
import type { LockFolderInput, UnlockFolderInput, FolderLockState } from "../../src/shared/chatFolderContracts";
import { logError, logInfo } from "./logger";

interface LockMetadata {
  salt: string;
  nonce: string;
  wrappedKey: string;
  failedAttempts: number;
  lastFailedAt: string | null;
  rememberOnDevice: boolean;
}

interface DeviceUnlockMetadata {
  nonce: string;
  wrappedKey: string;
  deviceKey: string;
}

const MIN_PASSPHRASE_LENGTH = 8;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 300_000;

function getLockCredentialKey(profileId: string, folderId: string): string {
  return `chat-folder-lock:${profileId}:${folderId}`;
}

function getDeviceCredentialKey(profileId: string, folderId: string): string {
  return `${getLockCredentialKey(profileId, folderId)}:device`;
}

function calculateBackoff(failedAttempts: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, Math.max(0, failedAttempts - 1)), BACKOFF_MAX_MS);
}

function retryDeadline(metadata: LockMetadata): number | null {
  if (metadata.failedAttempts <= 0 || !metadata.lastFailedAt) return null;
  const failedAt = Date.parse(metadata.lastFailedAt);
  if (!Number.isFinite(failedAt)) return null;
  return failedAt + calculateBackoff(metadata.failedAttempts);
}

function parseMetadata(value: string): LockMetadata {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") throw new Error("Lock metadata is invalid");
  const metadata = parsed as Partial<LockMetadata>;
  if (
    typeof metadata.salt !== "string"
    || typeof metadata.nonce !== "string"
    || typeof metadata.wrappedKey !== "string"
    || typeof metadata.failedAttempts !== "number"
    || typeof metadata.rememberOnDevice !== "boolean"
  ) {
    throw new Error("Lock metadata is invalid");
  }
  return {
    ...metadata,
    lastFailedAt: typeof metadata.lastFailedAt === "string" ? metadata.lastFailedAt : null,
  } as LockMetadata;
}

async function getArgonConstants(): Promise<{ opslimit: number; memlimit: number }> {
  await _sodium.ready;
  return {
    opslimit: _sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    memlimit: _sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
  };
}

function restoreCredential(key: string, previous: string | null): void {
  if (previous === null) deleteCredential(key);
  else setCredential(key, previous);
}

export class FolderUnlockBackoffError extends Error {
  constructor(public readonly retryAfter: string) {
    super("Too many unlock attempts. Wait before trying again.");
    this.name = "FolderUnlockBackoffError";
  }
}

export async function lockFolder(input: LockFolderInput, profileId: string = "default"): Promise<void> {
  const folder = await readChatFolder(input.folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  if (folder.lockState === "locked") throw new Error("Folder is already locked");
  if (typeof input.passphrase !== "string" || input.passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters long`);
  }

  const { opslimit, memlimit } = await getArgonConstants();
  const lockKey = getLockCredentialKey(profileId, input.folderId);
  const deviceKeyName = getDeviceCredentialKey(profileId, input.folderId);
  const previousLockCredential = getCredential(lockKey);
  const previousDeviceCredential = getCredential(deviceKeyName);
  const folderKey = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
  const salt = _sodium.randombytes_buf(_sodium.crypto_pwhash_SALTBYTES);
  const kek = _sodium.crypto_pwhash(
    folderKey.length,
    input.passphrase,
    salt,
    opslimit,
    memlimit,
    _sodium.crypto_pwhash_ALG_ARGON2ID13,
  );

  try {
    const nonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const wrappedKey = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(folderKey, null, null, nonce, kek);
    const metadata: LockMetadata = {
      salt: Buffer.from(salt).toString("base64"),
      nonce: Buffer.from(nonce).toString("base64"),
      wrappedKey: Buffer.from(wrappedKey).toString("base64"),
      failedAttempts: 0,
      lastFailedAt: null,
      rememberOnDevice: input.rememberOnDevice === true,
    };

    setCredential(lockKey, JSON.stringify(metadata));
    if (input.rememberOnDevice) {
      const deviceKey = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
      try {
        const deviceNonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
        const deviceWrappedKey = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
          folderKey,
          null,
          null,
          deviceNonce,
          deviceKey,
        );
        const deviceMetadata: DeviceUnlockMetadata = {
          nonce: Buffer.from(deviceNonce).toString("base64"),
          wrappedKey: Buffer.from(deviceWrappedKey).toString("base64"),
          deviceKey: Buffer.from(deviceKey).toString("base64"),
        };
        setCredential(deviceKeyName, JSON.stringify(deviceMetadata));
      } finally {
        _sodium.memzero(deviceKey);
      }
    } else {
      deleteCredential(deviceKeyName);
    }

    const saveResult = await saveChatFolder({
      ...folder,
      lockState: "locked",
      lockedAt: new Date().toISOString(),
      lockVersion: (folder.lockVersion || 0) + 1,
    }, profileId);
    if (!saveResult.ok) throw new Error(saveResult.error ?? "Failed to persist folder lock state");
    logInfo("Folder locked", { folderId: input.folderId, rememberOnDevice: input.rememberOnDevice === true });
  } catch (error) {
    restoreCredential(lockKey, previousLockCredential);
    restoreCredential(deviceKeyName, previousDeviceCredential);
    throw error;
  } finally {
    _sodium.memzero(folderKey);
    _sodium.memzero(kek);
  }
}

export async function unlockFolder(input: UnlockFolderInput, profileId: string = "default"): Promise<void> {
  const folder = await readChatFolder(input.folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  if (folder.lockState !== "locked") return;
  if (!input.passphrase && !input.useRememberedUnlock) throw new Error("Passphrase required");

  const lockKey = getLockCredentialKey(profileId, input.folderId);
  const storedMetadata = getCredential(lockKey);
  if (!storedMetadata) throw new Error("Lock metadata not found");
  const metadata = parseMetadata(storedMetadata);
  const deadline = retryDeadline(metadata);
  if (deadline !== null && deadline > Date.now()) {
    throw new FolderUnlockBackoffError(new Date(deadline).toISOString());
  }

  const { opslimit, memlimit } = await getArgonConstants();
  let folderKey: Uint8Array | null = null;
  let usedDeviceUnlock = false;

  try {
    if (input.useRememberedUnlock && metadata.rememberOnDevice) {
      const deviceMetadataValue = getCredential(getDeviceCredentialKey(profileId, input.folderId));
      if (deviceMetadataValue) {
        try {
          const deviceMetadata = JSON.parse(deviceMetadataValue) as DeviceUnlockMetadata;
          const deviceKey = new Uint8Array(Buffer.from(deviceMetadata.deviceKey, "base64"));
          try {
            folderKey = _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
              null,
              new Uint8Array(Buffer.from(deviceMetadata.wrappedKey, "base64")),
              null,
              new Uint8Array(Buffer.from(deviceMetadata.nonce, "base64")),
              deviceKey,
            );
            usedDeviceUnlock = true;
          } finally {
            _sodium.memzero(deviceKey);
          }
        } catch {
          folderKey = null;
        }
      }
    }

    if (!folderKey && input.passphrase) {
      const kek = _sodium.crypto_pwhash(
        _sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
        input.passphrase,
        new Uint8Array(Buffer.from(metadata.salt, "base64")),
        opslimit,
        memlimit,
        _sodium.crypto_pwhash_ALG_ARGON2ID13,
      );
      try {
        folderKey = _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          new Uint8Array(Buffer.from(metadata.wrappedKey, "base64")),
          null,
          new Uint8Array(Buffer.from(metadata.nonce, "base64")),
          kek,
        );
      } catch {
        metadata.failedAttempts += 1;
        metadata.lastFailedAt = new Date().toISOString();
        setCredential(lockKey, JSON.stringify(metadata));
        const retryAfter = new Date(Date.now() + calculateBackoff(metadata.failedAttempts)).toISOString();
        logError("Folder unlock failed", { folderId: input.folderId, failedAttempts: metadata.failedAttempts });
        throw new FolderUnlockBackoffError(retryAfter);
      } finally {
        _sodium.memzero(kek);
      }
    }

    if (!folderKey) throw new Error("Unable to unlock folder. Provide the passphrase or use remembered unlock.");

    const saveResult = await saveChatFolder({ ...folder, lockState: "unlocked", lockedAt: null }, profileId);
    if (!saveResult.ok) throw new Error(saveResult.error ?? "Failed to persist folder unlock state");

    metadata.failedAttempts = 0;
    metadata.lastFailedAt = null;
    setCredential(lockKey, JSON.stringify(metadata));
    logInfo("Folder unlocked", { folderId: input.folderId, usedDeviceUnlock });
  } finally {
    if (folderKey) _sodium.memzero(folderKey);
  }
}

export async function getLockState(folderId: string, profileId: string = "default"): Promise<FolderLockState> {
  const folder = await readChatFolder(folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  let failedAttempts = 0;
  let retryAfter: string | undefined;
  const storedMetadata = getCredential(getLockCredentialKey(profileId, folderId));
  if (storedMetadata) {
    try {
      const metadata = parseMetadata(storedMetadata);
      failedAttempts = metadata.failedAttempts;
      const deadline = retryDeadline(metadata);
      if (deadline !== null && deadline > Date.now()) retryAfter = new Date(deadline).toISOString();
    } catch {
      // Corrupt secure metadata stays fail-closed; the caller still sees the folder as locked.
    }
  }
  return {
    folderId,
    locked: folder.lockState === "locked",
    rememberedUnlockAvailable: getCredential(getDeviceCredentialKey(profileId, folderId)) !== null,
    failedAttempts,
    retryAfter,
  };
}
