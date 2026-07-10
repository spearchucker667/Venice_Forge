/** @fileoverview Service for manually exporting an encrypted backup of all syncable tables. */

import StorageService from "./storageService";
import { STORE_NAMES } from "../constants/venice";
import {
  isElectron,
  desktopChat,
  desktopCharacterCards,
  desktopPersonas,
  desktopLorebooks,
  desktopRpChats,
  desktopRpAssets,
  desktopScenarios,
  desktopFiles,
} from "./desktopBridge";
import type { SyncStoreName } from "../types/sync";

export const BACKUP_SCHEMA_VERSION = 1;
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

/** Helper to convert Uint8Array/ArrayBuffer to base64. */
export function toBase64(buffer: Uint8Array | ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  // Using chunks to prevent Maximum call stack size exceeded in String.fromCharCode.apply
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
}

/** Helper to convert base64 to Uint8Array. */
export function fromBase64(b64: string): Uint8Array {
  const binary = typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Derive an AES-GCM key from a password string using PBKDF2. */
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

/** Fetch all records for a specific store, routing to IPC if needed in Desktop mode. */
export async function fetchStoreRecords(storeName: SyncStoreName): Promise<unknown[]> {
  if (isElectron()) {
    switch (storeName) {
      case "conversations": {
        const chatsResult = await desktopChat.list();
        return chatsResult.ok ? chatsResult.conversations : [];
      }
      case "character_cards": {
        const charsResult = await desktopCharacterCards.list();
        return charsResult.ok ? charsResult.cards : [];
      }
      case "personas": {
        const personasResult = await desktopPersonas.list();
        return personasResult.ok ? personasResult.personas : [];
      }
      case "lorebooks": {
        const lorebooksResult = await desktopLorebooks.list();
        return lorebooksResult.ok ? lorebooksResult.lorebooks : [];
      }
      case "rp_chats": {
        const rpChatsResult = await desktopRpChats.list();
        return rpChatsResult.ok ? rpChatsResult.chats : [];
      }
      case "rp_assets": {
        const rpAssetsResult = await desktopRpAssets.list();
        return rpAssetsResult.ok ? rpAssetsResult.assets : [];
      }
      case "rpScenarios": {
        const scenariosResult = await desktopScenarios.list();
        return scenariosResult.ok ? scenariosResult.scenarios : [];
      }
    }
  }

  // Web mode OR IndexedDB-only stores
  return StorageService.getItems(storeName);
}

/** Creates an encrypted backup manifest containing all syncable data. */
export async function createEncryptedBackup(password: string): Promise<EncryptedBackupManifest> {
  const data: Record<string, unknown[]> = {};

  for (const storeName of STORE_NAMES) {
    if (storeName === "diagnostics") continue;
    data[storeName] = await fetchStoreRecords(storeName as SyncStoreName);
  }

  const jsonPayload = JSON.stringify(data);
  const encodedPayload = new TextEncoder().encode(jsonPayload);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

  const key = await deriveBackupKey(password, salt);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedPayload
  );

  return {
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertextBuffer),
  };
}

/** Creates an encrypted packet containing a single record for sync. */
export async function exportSyncPacket(storeName: SyncStoreName, record: unknown, password: string): Promise<EncryptedBackupManifest> {
  const data: Record<string, unknown[]> = { [storeName]: [record] };

  const jsonPayload = JSON.stringify(data);
  const encodedPayload = new TextEncoder().encode(jsonPayload);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

  const key = await deriveBackupKey(password, salt);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedPayload
  );

  return {
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertextBuffer),
  };
}
export async function downloadEncryptedBackup(manifest: EncryptedBackupManifest): Promise<boolean> {
  const jsonManifest = JSON.stringify(manifest, null, 2);
  const filename = `venice-backup-${new Date().toISOString().slice(0, 10)}.enc`;

  if (isElectron()) {
    const result = await desktopFiles.exportJson(manifest, filename);
    return result;
  } else {
    if (typeof document !== "undefined") {
      const blob = new Blob([jsonManifest], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      return true;
    }
    return false;
  }
}
