import crypto from "crypto";

export const BACKUP_SCHEMA_VERSION = 2; // Bumped version for .vfbackup structure
export const PBKDF2_ITERATIONS = 210000;
export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12;
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
 * With useWebFormat=true, returns a combined ciphertext+tag buffer compatible with WebCrypto.
 */
export async function encryptPayload(plaintext: string, password: string, useWebFormat: boolean = false): Promise<{ salt: string, iv: string, ciphertext: string }> {
  if (!password) throw new Error("Password is required");
  const salt = crypto.randomBytes(SALT_BYTE_LENGTH);
  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  
  const key = await deriveBackupKey(password, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag().toString("base64");
  
  let finalCiphertext: string;
  if (useWebFormat) {
    // Create combined format compatible with WebCrypto
    const encryptedBuffer = Buffer.from(encrypted, "base64");
    const authTagBuffer = Buffer.from(authTag, "base64");
    const combinedBuffer = Buffer.concat([encryptedBuffer, authTagBuffer]);
    finalCiphertext = combinedBuffer.toString("base64");
  } else {
    // Append authTag to ciphertext (Node.js requires manual auth tag handling for GCM)
    finalCiphertext = encrypted + ":" + authTag;
  }
  
  return {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: finalCiphertext
  };
}

/** 
 * Decrypts a ciphertext payload using AES-256-GCM. 
 * Handles both Electron's colon-separated format and WebCrypto's combined buffer format.
 */
export async function decryptPayload(ciphertextWithTag: string, saltBase64: string, ivBase64: string, password: string): Promise<string> {
  if (!password) throw new Error("Password is required");
  const salt = decodeBase64(saltBase64, "salt", SALT_BYTE_LENGTH);
  const iv = decodeBase64(ivBase64, "iv", IV_BYTE_LENGTH);
  
  const key = await deriveBackupKey(password, salt);
  
  // Check if it's Electron's colon-separated format or WebCrypto's combined format
  const parts = ciphertextWithTag.split(":");
  
  if (parts.length === 2) {
    // Electron format: ciphertext:authTag
    const ciphertext = parts[0];
    decodeBase64(ciphertext, "ciphertext");
    const authTag = decodeBase64(parts[1], "authentication tag", AUTH_TAG_BYTE_LENGTH);
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } else {
    // WebCrypto format: combined ciphertext+tag buffer
    // WebCrypto passes the entire buffer to decrypt(), so we need to do the same
    try {
      const combinedBuffer = decodeBase64(ciphertextWithTag, "combined ciphertext and tag");
        
      if (combinedBuffer.length < AUTH_TAG_BYTE_LENGTH) {
        throw new Error("Buffer too short to contain auth tag");
      }
        
      // Extract auth tag (last 16 bytes) and ciphertext (everything else)
      const authTag = combinedBuffer.subarray(combinedBuffer.length - AUTH_TAG_BYTE_LENGTH);
      const ciphertextBuffer = combinedBuffer.subarray(0, combinedBuffer.length - AUTH_TAG_BYTE_LENGTH);
        
      // For WebCrypto compatibility, we decrypt the entire buffer as-is
      // Node.js crypto.subtle.decrypt equivalent
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
        
      let decrypted = decipher.update(ciphertextBuffer);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
        
      return decrypted.toString("utf8");
    } catch (e: any) {
      // More detailed error reporting
      throw new Error("Invalid ciphertext format (missing auth tag): " + e.message);
    }
  }
}
