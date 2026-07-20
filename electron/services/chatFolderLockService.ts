/* eslint-disable @typescript-eslint/no-unused-vars */

import crypto from "crypto";
import { readChatFolder, saveChatFolder } from "./chatFolderStorage";
import { getCredential, setCredential, deleteCredential } from "./secureStore";
import _sodium from "libsodium-wrappers-sumo";
import type { LockFolderInput, UnlockFolderInput, FolderLockState } from "../../src/shared/chatFolderContracts";
import { logError, logInfo } from "./logger";

// Constants for KDF
const OPSLIMIT = _sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE;
const MEMLIMIT = _sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE;

// Lock metadata stored in secure storage
interface LockMetadata {
  salt: string; // base64
  nonce: string; // base64
  wrappedKey: string; // base64
  failedAttempts: number;
  lastFailedAt: string;
  rememberOnDevice: boolean;
}

function getLockCredentialKey(folderId: string): string {
  return `chat-folder-lock:${folderId}`;
}

function getFailedAttemptsKey(folderId: string): string {
  return `chat-folder-lock-failed:${folderId}`;
}

const MAX_FAILED_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000; // 30 seconds
const BACKOFF_MAX_MS = 300_000; // 5 minutes

function calculateBackoff(failedAttempts: number): number {
  const backoff = BACKOFF_BASE_MS * Math.pow(2, failedAttempts - 1);
  return Math.min(backoff, BACKOFF_MAX_MS);
}

export async function lockFolder(input: LockFolderInput, profileId: string = "default"): Promise<void> {
  const folder = await readChatFolder(input.folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  if (!input.passphrase) throw new Error("Passphrase is required");

  await _sodium.ready;
  
  // Generate a random folder key (32 bytes)
  const folderKey = _sodium.randombytes_buf(32);
  
  // Derive a KEK from the passphrase
  const salt = _sodium.randombytes_buf(_sodium.crypto_pwhash_SALTBYTES);
  const kek = _sodium.crypto_pwhash(
    32,
    input.passphrase,
    salt,
    OPSLIMIT,
    MEMLIMIT,
    _sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  // Wrap the folder key
  const nonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const wrappedKey = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    folderKey,
    null,
    null,
    nonce,
    kek
  );

  // Store metadata
  const lockMetadata: LockMetadata = {
    salt: Buffer.from(salt).toString("base64"),
    nonce: Buffer.from(nonce).toString("base64"),
    wrappedKey: Buffer.from(wrappedKey).toString("base64"),
    failedAttempts: 0,
    lastFailedAt: new Date().toISOString(),
    rememberOnDevice: input.rememberOnDevice ?? false,
  };
  
  setCredential(getLockCredentialKey(input.folderId), JSON.stringify(lockMetadata));
  
  // If rememberOnDevice, store a wrapped unlock key in OS secure storage
  if (input.rememberOnDevice) {
    // Create a secondary wrapped key using a device-specific key
    // This allows unlock without passphrase on this device
    const deviceSalt = _sodium.randombytes_buf(_sodium.crypto_pwhash_SALTBYTES);
    const deviceKey = _sodium.crypto_pwhash(
      32,
      "venice-forge-device-unlock-key", // Fixed device identifier
      deviceSalt,
      OPSLIMIT,
      MEMLIMIT,
      _sodium.crypto_pwhash_ALG_ARGON2ID13
    );
    
    const deviceNonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const deviceWrappedKey = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      folderKey,
      null,
      null,
      deviceNonce,
      deviceKey
    );
    
    const deviceMetadata = {
      salt: Buffer.from(deviceSalt).toString("base64"),
      nonce: Buffer.from(deviceNonce).toString("base64"),
      wrappedKey: Buffer.from(deviceWrappedKey).toString("base64"),
    };
    
    setCredential(`${getLockCredentialKey(input.folderId)}:device`, JSON.stringify(deviceMetadata));
  }

  folder.lockState = "locked";
  folder.lockedAt = new Date().toISOString();
  folder.lockVersion = (folder.lockVersion || 0) + 1;
  
  await saveChatFolder(folder, profileId);
  logInfo("Folder locked", { folderId: input.folderId, rememberOnDevice: input.rememberOnDevice });
}

export async function unlockFolder(input: UnlockFolderInput, profileId: string = "default"): Promise<void> {
  const folder = await readChatFolder(input.folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  
  if (!input.passphrase && !input.useRememberedUnlock) {
    throw new Error("Passphrase required");
  }

  const storedMetadataStr = getCredential(getLockCredentialKey(input.folderId));
  if (!storedMetadataStr) {
    throw new Error("Lock metadata not found");
  }

  const lockMetadata: LockMetadata = JSON.parse(storedMetadataStr);
  const salt = Buffer.from(lockMetadata.salt, "base64");
  const nonce = Buffer.from(lockMetadata.nonce, "base64");
  const wrappedKey = Buffer.from(lockMetadata.wrappedKey, "base64");

  await _sodium.ready;

  let folderKey: Uint8Array | null = null;
  let usedDeviceUnlock = false;
  
  if (input.useRememberedUnlock && lockMetadata.rememberOnDevice) {
    // Try device unlock first
    const deviceMetadataStr = getCredential(`${getLockCredentialKey(input.folderId)}:device`);
    if (deviceMetadataStr) {
      const deviceMetadata = JSON.parse(deviceMetadataStr);
      const deviceSalt = Buffer.from(deviceMetadata.salt, "base64");
      const deviceNonce = Buffer.from(deviceMetadata.nonce, "base64");
      const deviceWrappedKey = Buffer.from(deviceMetadata.wrappedKey, "base64");
      
      const deviceKey = _sodium.crypto_pwhash(
        32,
        "venice-forge-device-unlock-key",
        deviceSalt,
        OPSLIMIT,
        MEMLIMIT,
        _sodium.crypto_pwhash_ALG_ARGON2ID13
      );
      
      try {
        folderKey = _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          deviceWrappedKey,
          null,
          deviceNonce,
          deviceKey
        );
        usedDeviceUnlock = true;
      } catch {
        // Device unlock failed, fall back to passphrase
      }
    }
  }
  
  if (!folderKey && input.passphrase) {
    const kek = _sodium.crypto_pwhash(
      32,
      input.passphrase,
      salt,
      OPSLIMIT,
      MEMLIMIT,
      _sodium.crypto_pwhash_ALG_ARGON2ID13
    );

    try {
      folderKey = _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        wrappedKey,
        null,
        nonce,
        kek
      );
      
      // Reset failed attempts on successful unlock
      lockMetadata.failedAttempts = 0;
      setCredential(getLockCredentialKey(input.folderId), JSON.stringify(lockMetadata));
      deleteCredential(getFailedAttemptsKey(input.folderId));
    } catch {
      // Increment failed attempts
      lockMetadata.failedAttempts += 1;
      lockMetadata.lastFailedAt = new Date().toISOString();
      setCredential(getLockCredentialKey(input.folderId), JSON.stringify(lockMetadata));
      
      const backoffMs = calculateBackoff(lockMetadata.failedAttempts);
      const retryAfter = new Date(Date.now() + backoffMs).toISOString();
      
      logError("Folder unlock failed", { 
        folderId: input.folderId, 
        failedAttempts: lockMetadata.failedAttempts,
        retryAfter 
      });
      
      throw new Error(`Incorrect passphrase. ${lockMetadata.failedAttempts >= MAX_FAILED_ATTEMPTS ? `Too many attempts. Try again after ${new Date(retryAfter).toLocaleTimeString()}.` : ""}`);
    }
  }

  if (!folderKey) {
    throw new Error("Unable to unlock folder. Provide passphrase or enable remember-on-device.");
  }
  
  // Unlocked successfully
  folder.lockState = "unlocked";
  folder.lockedAt = null;
  await saveChatFolder(folder, profileId);
  logInfo("Folder unlocked", { folderId: input.folderId, usedDeviceUnlock });
}

export async function getLockState(folderId: string, profileId: string = "default"): Promise<FolderLockState> {
  const folder = await readChatFolder(folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  
  let failedAttempts = 0;
  let retryAfter: string | undefined;
  
  const storedMetadataStr = getCredential(getLockCredentialKey(folderId));
  if (storedMetadataStr) {
    try {
      const lockMetadata: LockMetadata = JSON.parse(storedMetadataStr);
      failedAttempts = lockMetadata.failedAttempts || 0;
      
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        const lastFailedAt = new Date(lockMetadata.lastFailedAt).getTime();
        const backoffMs = calculateBackoff(failedAttempts);
        const retryAt = lastFailedAt + backoffMs;
        if (retryAt > Date.now()) {
          retryAfter = new Date(retryAt).toISOString();
        }
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  const deviceMetadataStr = getCredential(`${getLockCredentialKey(folderId)}:device`);
  const rememberedUnlockAvailable = !!deviceMetadataStr;
  
  return {
    folderId,
    locked: folder.lockState === "locked",
    rememberedUnlockAvailable,
    failedAttempts,
    retryAfter,
  };
}
