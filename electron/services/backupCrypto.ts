import crypto from "crypto";
import _sodium from "libsodium-wrappers-sumo";
import type { BackupManifestMetadata } from "../../src/services/backupManifest";

export const BACKUP_SCHEMA_VERSION = 2; // Bumped version for .vfbackup structure
export const PBKDF2_ITERATIONS = 210000;
export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12; // Legacy PBKDF2 IV length
export const XCHACHA20_NONCE_LENGTH = 24;
const AUTH_TAG_BYTE_LENGTH = 16;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeBase64(value: string, label: string, expectedLength?: number): Buffer {
  if (!value || !BASE64_RE.test(value)) throw new Error(`Invalid Base64 ${label}`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new Error(`Invalid Base64 ${label}`);
  if (expectedLength !== undefined && decoded.length !== expectedLength) throw new Error(`Invalid ${label} length`);
  return decoded;
}

export interface EncryptedBackupManifest {
  version: number;
  exportedAt: string;
  metadata?: BackupManifestMetadata;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
}

/** Derive an AES-GCM key from a password string using PBKDF2. */
export function deriveBackupKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, 32, "sha256", (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/** 
 * Encrypts a plaintext payload using Argon2id and XChaCha20-Poly1305. 
 * Returns the salt, iv (nonce), and ciphertext as base64 strings.
 * With useWebFormat=true, returns a combined ciphertext+tag buffer compatible with WebCrypto.
 */
export async function encryptPayload(plaintext: string, password: string, useWebFormat: boolean = false): Promise<{ salt: string, iv: string, ciphertext: string }> {
  if (!password) throw new Error("Password is required");
  
  await _sodium.ready;
  const sodium = _sodium;
  
  const salt = sodium.randombytes_buf(16); // crypto_pwhash_SALTBYTES
  const nonce = sodium.randombytes_buf(24); // crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  
  const key = sodium.crypto_pwhash(
    32, // crypto_aead_xchacha20poly1305_ietf_KEYBYTES
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
  
  const cipherBuffer = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    null,
    null,
    nonce,
    key
  );
  
  let finalCiphertext: string;
  if (useWebFormat) {
    // Combined format: ciphertext+tag buffer
    finalCiphertext = Buffer.from(cipherBuffer).toString("base64");
  } else {
    // Append authTag to ciphertext for Electron's colon-separated format
    const encryptedBytes = cipherBuffer.slice(0, cipherBuffer.length - AUTH_TAG_BYTE_LENGTH);
    const authTagBytes = cipherBuffer.slice(cipherBuffer.length - AUTH_TAG_BYTE_LENGTH);
    finalCiphertext = Buffer.from(encryptedBytes).toString("base64") + ":" + Buffer.from(authTagBytes).toString("base64");
  }
  
  return {
    salt: Buffer.from(salt).toString("base64"),
    iv: Buffer.from(nonce).toString("base64"),
    ciphertext: finalCiphertext
  };
}

/** 
 * Decrypts a ciphertext payload.
 * Supports Argon2id/XChaCha20-Poly1305 (24-byte IV) and legacy PBKDF2/AES-256-GCM (12-byte IV).
 * Handles both Electron's colon-separated format and WebCrypto's combined buffer format.
 */
export async function decryptPayload(ciphertextWithTag: string, saltBase64: string, ivBase64: string, password: string): Promise<string> {
  if (!password) throw new Error("Password is required");
  
  // Need to parse salt first to pass existing test assertions checking for "Invalid Base64 salt"
  const salt = decodeBase64(saltBase64, "salt"); 
  const ivBuf = decodeBase64(ivBase64, "iv");
  
  if (ivBuf.length !== IV_BYTE_LENGTH && ivBuf.length !== XCHACHA20_NONCE_LENGTH) {
    throw new Error(`Invalid iv length`);
  }
  
  if (ivBuf.length === XCHACHA20_NONCE_LENGTH) {
    // Argon2id / XChaCha20-Poly1305
    if (salt.length !== 16) throw new Error(`Invalid salt length`);
    
    await _sodium.ready;
    const sodium = _sodium;
    
    const nonce = ivBuf;
    
    const key = sodium.crypto_pwhash(
      32,
      password,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_MODERATE,
      sodium.crypto_pwhash_MEMLIMIT_MODERATE,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    );
    
    let combinedBuffer: Uint8Array;
    const parts = ciphertextWithTag.split(":");
    
    if (parts.length === 2) {
      // Electron format: ciphertext:authTag
      const ciphertext = decodeBase64(parts[0], "ciphertext");
      const authTag = decodeBase64(parts[1], "authentication tag", AUTH_TAG_BYTE_LENGTH);
      combinedBuffer = new Uint8Array(Buffer.concat([ciphertext, authTag]));
    } else {
      // WebCrypto format: combined ciphertext+tag buffer
      try {
        combinedBuffer = new Uint8Array(decodeBase64(ciphertextWithTag, "combined ciphertext and tag"));
        if (combinedBuffer.length < AUTH_TAG_BYTE_LENGTH) {
          throw new Error("Buffer too short to contain auth tag");
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error("Invalid ciphertext format (missing auth tag): " + message);
      }
    }
    
    try {
      const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        combinedBuffer,
        null,
        nonce,
        key
      );
      return Buffer.from(decrypted).toString("utf8");
    } catch {
      throw new Error("Decryption failed (bad password or tampered payload)");
    }
    
  } else {
    // PBKDF2 / AES-256-GCM
    if (salt.length !== SALT_BYTE_LENGTH) throw new Error(`Invalid salt length`);
    
    const key = await deriveBackupKey(password, salt);
    
    const parts = ciphertextWithTag.split(":");
    
    if (parts.length === 2) {
      // Electron format
      const ciphertext = parts[0];
      decodeBase64(ciphertext, "ciphertext");
      const authTag = decodeBase64(parts[1], "authentication tag", AUTH_TAG_BYTE_LENGTH);
      
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuf);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(ciphertext, "base64", "utf8");
      decrypted += decipher.final("utf8");
      
      return decrypted;
    } else {
      // WebCrypto format
      try {
        const combinedBuffer = decodeBase64(ciphertextWithTag, "combined ciphertext and tag");
          
        if (combinedBuffer.length < AUTH_TAG_BYTE_LENGTH) {
          throw new Error("Buffer too short to contain auth tag");
        }
          
        const authTag = combinedBuffer.subarray(combinedBuffer.length - AUTH_TAG_BYTE_LENGTH);
        const ciphertextBuffer = combinedBuffer.subarray(0, combinedBuffer.length - AUTH_TAG_BYTE_LENGTH);
          
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuf);
        decipher.setAuthTag(authTag);
          
        let decrypted = decipher.update(ciphertextBuffer);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
          
        return decrypted.toString("utf8");
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error("Invalid ciphertext format (missing auth tag): " + message);
      }
    }
  }
}
