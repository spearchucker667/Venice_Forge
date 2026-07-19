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
import { SALT_BYTE_LENGTH, IV_BYTE_LENGTH, deriveBackupKey, toBase64, EncryptedBackupManifest } from "./backupCryptoWeb";
import { sanitizePortableData } from "./syncDataSanitizer";
import { getActiveProfileId } from "./activeProfile";
import { BACKUP_PROFILE_METADATA_KEY, backupRecordBelongsToProfile } from "../shared/backupProfile";
import { version as appVersion } from "../../package.json";
const MANUAL_BACKUP_MANIFEST_VERSION = 3;

const PORTABLE_BACKUP_EXCLUSIONS = [
  "credentials",
  "diagnostics",
  "machine-local paths",
  "sync configuration",
];

// Media stores are excluded from manual backups and from sync emission
// by default. The 3.0 beta audit (P1 #7) requires an explicit opt-in so
// audio/video assets do not silently leave the user's machine without
// a visible acknowledgement.
export const BACKUP_MEDIA_STORES: readonly SyncStoreName[] = ["images", "files", "rp_assets"];

export interface EncryptedBackupOptions {
  includeCharacterCardDrafts?: boolean;
  // Forwarded to `desktopSync.startSync` and to local store iteration.
  // Defaults to false so media blobs never cross the network unless the
  // user explicitly ticked the opt-in.
  includeMedia?: boolean;
}

function createWebExportDeviceRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `web-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
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
      case "chat_folders": {
        const { desktopChatFolders } = await import("./desktopBridge");
        const foldersResult = await desktopChatFolders.list();
        return foldersResult.ok ? foldersResult.folders : [];
      }
    }
  }

  // Web mode OR IndexedDB-only stores
  const profileId = getActiveProfileId();
  const records = await StorageService.getItems(storeName);
  return records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record) || "profileId" in record) return record;
    return { ...record, profileId };
  });
}

/** Creates an encrypted backup manifest containing all syncable data. */
export async function createEncryptedBackup(
  password: string,
  options: EncryptedBackupOptions = {}
): Promise<EncryptedBackupManifest> {
  const rendererProfileId = getActiveProfileId();
  let profileId = rendererProfileId;
  let exportToken: string | undefined;
  let deviceRef = "";

  if (isElectron()) {
    const lease = await desktopSync.beginBackupExport();
    if (!lease.ok || !lease.profileId || !lease.token || !lease.deviceId) {
      throw new Error(lease.error || "Failed to begin backup export.");
    }
    if (lease.profileId !== rendererProfileId) {
      throw new Error("Backup export profile session changed. Reactivate the profile and retry.");
    }
    profileId = lease.profileId;
    exportToken = lease.token;
    deviceRef = lease.deviceId;
  } else {
    deviceRef = createWebExportDeviceRef();
  }

  const includeMedia = options.includeMedia === true;
  const mediaStoreSet = new Set<string>(BACKUP_MEDIA_STORES);

  const portableData: Record<string, unknown> = {};
  const excludedStoreNames: string[] = [];
  const mediaStoreNames = new Set<string>();

  for (const storeName of STORE_NAMES) {
    if (storeName === "diagnostics") continue;
    if (storeName === "characterCardDrafts" && options.includeCharacterCardDrafts !== true) continue;
    if (mediaStoreSet.has(storeName)) {
      mediaStoreNames.add(storeName);
      if (!includeMedia) {
        excludedStoreNames.push(storeName);
        portableData[storeName] = [];
        continue;
      }
    }
    if (getActiveProfileId() !== profileId) {
      throw new Error("Backup export profile session changed during collection. Retry the export.");
    }
    const sanitized = sanitizePortableData(await fetchStoreRecords(storeName as SyncStoreName)) as unknown[];
    portableData[storeName] = sanitized.filter((record) => backupRecordBelongsToProfile(record, profileId));
  }

  if (getActiveProfileId() !== profileId) {
    throw new Error("Backup export profile session changed during collection. Retry the export.");
  }
  const exportedAt = new Date().toISOString();
  const { buildBackupManifestMetadata } = await import("./backupManifest");
  const exclusionList = [...PORTABLE_BACKUP_EXCLUSIONS];
  if (!includeMedia) {
    exclusionList.push(
      `media stores skipped by default: ${sortedStoreList([...mediaStoreNames]).join(", ")}`,
    );
  }
  const metadata = await buildBackupManifestMetadata({
    data: portableData,
    appVersion,
    exportedAt,
    runtime: isElectron() ? "electron" : "web",
    deviceRef,
    profileId,
    crypto: isElectron()
      ? { algorithm: "XChaCha20-Poly1305", kdf: "Argon2id", keyVersion: 1 }
      : { algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", keyVersion: 1 },
    exclusions: exclusionList,
  });
  const jsonPayload = JSON.stringify({
    [BACKUP_PROFILE_METADATA_KEY]: { profileId, manifestMetadata: metadata },
    ...portableData,
  });

  if (isElectron()) {
    const res = await desktopSync.encryptBackup(jsonPayload, password, exportToken!);
    if (!res.ok || !res.data) throw new Error(res.error || "Encryption failed in main process");
    return {
      version: MANUAL_BACKUP_MANIFEST_VERSION,
      exportedAt,
      metadata,
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
    version: MANUAL_BACKUP_MANIFEST_VERSION,
    exportedAt,
    metadata,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertextBuffer),
  };
}

/**
 * Returns the canonical list of syncable store names whose contents may
 * include user-generated media blobs (encoded image attachments,
 * Research Workspace file uploads, RP character assets). These stores
 * are skipped during manual backup export and skipped during sync
 * emission unless the caller opts in via `EncryptedBackupOptions.includeMedia`
 * or its sync counterpart.
 */
export function getBackupMediaStoreNames(): readonly SyncStoreName[] {
  return BACKUP_MEDIA_STORES;
}

function sortedStoreList(names: readonly string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function downloadEncryptedBackup(manifest: EncryptedBackupManifest): Promise<boolean> {
  const jsonManifest = JSON.stringify(manifest, null, 2);
  const filename = `venice-forge-${new Date().toISOString().slice(0, 10)}.vfbackup`;

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
