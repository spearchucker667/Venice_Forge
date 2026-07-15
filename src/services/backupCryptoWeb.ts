import type { BackupManifestMetadata } from "./backupManifest";

/** Sync-packet and legacy manual-backup envelope version. */
export const BACKUP_SCHEMA_VERSION = 2;
export const PBKDF2_ITERATIONS = 210000;
export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12;

export interface EncryptedBackupManifest {
  version: number;
  exportedAt: string;
  metadata?: BackupManifestMetadata;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
}

export function toBase64(buffer: Uint8Array | ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
}

export function fromBase64(b64: string): Uint8Array {
  const binary = typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function deriveBackupKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
