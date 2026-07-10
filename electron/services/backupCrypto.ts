import crypto from "crypto";

export const BACKUP_SCHEMA_VERSION = 2; // Bumped version for .vfbackup structure
export const PBKDF2_ITERATIONS = 210000;
export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12;

export interface EncryptedBackupManifest {
  version: number;
  exportedAt: string;
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
 * Encrypts a plaintext payload using AES-256-GCM. 
 * Returns the salt, iv, and ciphertext as base64 strings.
 */
export async function encryptPayload(plaintext: string, password: string): Promise<{ salt: string, iv: string, ciphertext: string }> {
  const salt = crypto.randomBytes(SALT_BYTE_LENGTH);
  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  
  const key = await deriveBackupKey(password, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag().toString("base64");
  
  // Append authTag to ciphertext (Node.js requires manual auth tag handling for GCM)
  const finalCiphertext = encrypted + ":" + authTag;
  
  return {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: finalCiphertext
  };
}

/** 
 * Decrypts a ciphertext payload using AES-256-GCM. 
 */
export async function decryptPayload(ciphertextWithTag: string, saltBase64: string, ivBase64: string, password: string): Promise<string> {
  const salt = Buffer.from(saltBase64, "base64");
  const iv = Buffer.from(ivBase64, "base64");
  
  const key = await deriveBackupKey(password, salt);
  
  const parts = ciphertextWithTag.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid ciphertext format (missing auth tag)");
  }
  const ciphertext = parts[0];
  const authTag = Buffer.from(parts[1], "base64");
  
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
