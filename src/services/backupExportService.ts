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
  desktopSync
} from "./desktopBridge";
import type { SyncStoreName } from "../types/sync";
import { BACKUP_SCHEMA_VERSION, SALT_BYTE_LENGTH, IV_BYTE_LENGTH, deriveBackupKey, toBase64, EncryptedBackupManifest } from "./backupCryptoWeb";


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

  if (isElectron()) {
    const res = await desktopSync.encryptBackup(jsonPayload, password);
    if (!res.ok || !res.data) throw new Error(res.error || "Encryption failed in main process");
    return {
      version: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      salt: res.data.salt,
      iv: res.data.iv,
      ciphertext: res.data.ciphertext
    };
  }

  // Web fallback using Web Crypto
  const encodedPayload = new TextEncoder().encode(jsonPayload);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const key = await deriveBackupKey(password, salt);
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedPayload);

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
    return await desktopFiles.exportJson(manifest, filename);
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

