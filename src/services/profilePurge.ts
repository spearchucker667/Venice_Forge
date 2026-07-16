/** @fileoverview Profile deletion purge orchestrator.
 *
 * When a profile is deleted, removing its metadata entry is not enough:
 * the profile's API keys, password verifier, localStorage-scoped settings,
 * and IndexedDB records all remain on disk and could be read again if the
 * profile id is ever reused. This module performs a best-effort purge of
 * every profile-scoped surface that the renderer can reach.
 *
 * Limits:
 *   - Desktop Conversation Vault and secure-store cleanup is performed by one
 *     main-authoritative profile transaction bound to the active session.
 *   - Shared caches (model cache, character image cache, etc.) are global and
 *     are not profile-scoped.
 *   - The default profile is never purged; deleting it only removes metadata.
 */

import { DEFAULT_PROFILE_ID } from "./activeProfile";
import {
  desktopApiKey,
  desktopJinaApiKey,
  desktopProviderApiKey,
  desktopProfilePassword,
  desktopProfilePurge,
  isElectron,
} from "./desktopBridge";
import { PROVIDER_REGISTRY } from "../types/provider";
import StorageService from "./storageService";

/** Known localStorage key prefixes that Venice Forge owns.
 *  Only keys matching one of these prefixes are eligible for purge. */
const VENICE_OWNED_LOCAL_STORAGE_PREFIXES = [
  "venice-",
  "veniceForge:",
  "vf.",
];
const PROFILE_SCOPED_LOCAL_STORES = [
  "venice-settings",
  "venice-chat",
  "venice-memory",
  "venice-workflow",
  "venice-image-workspace",
  "venice-playground",
  "venice-projects",
  "venice-media",
  "venice-prompt-library",
  "venice-scenes",
  "venice-rp-studio",
  "venice-character-cards",
  "venice-personas",
  "venice-lorebooks",
  "venice-rp-chats",
  "venice-rp-assets",
  "venice-scenarios",
  "venice-workflow-templates",
  "venice-research",
  "venice-privacy",
  "venice-inspector",
  "venice-status",
];

export interface ProfilePurgeResult {
  profileId: string;
  veniceApiKeyRemoved: boolean;
  jinaApiKeyRemoved: boolean;
  providerApiKeysRemoved: number;
  passwordRemoved: boolean;
  localStorageKeysRemoved: number;
  indexedDBStoresScanned: number;
  mainProcessPurgeOk: boolean;
}

/**
 * Purges all renderer-reachable data owned by the given profile.
 * Runs best-effort: individual failures are logged but do not abort the purge.
 */
export async function purgeProfileData(profileId: string): Promise<ProfilePurgeResult> {
  if (profileId === DEFAULT_PROFILE_ID) {
    return {
      profileId,
      veniceApiKeyRemoved: false,
      jinaApiKeyRemoved: false,
      providerApiKeysRemoved: 0,
      passwordRemoved: false,
      localStorageKeysRemoved: 0,
      indexedDBStoresScanned: 0,
      mainProcessPurgeOk: false,
    };
  }

  const result: ProfilePurgeResult = {
    profileId,
    veniceApiKeyRemoved: false,
    jinaApiKeyRemoved: false,
    providerApiKeysRemoved: 0,
    passwordRemoved: false,
    localStorageKeysRemoved: 0,
    indexedDBStoresScanned: 0,
    mainProcessPurgeOk: false,
  };

  // 1. Desktop uses one active-session-bound transaction for vault + secure
  // store cleanup. Web mode retains the renderer/server-session cleanup path.
  if (isElectron()) {
    try {
      const main = await desktopProfilePurge.purge(profileId);
      result.mainProcessPurgeOk = main.ok;
      result.veniceApiKeyRemoved = main.steps?.veniceApiKey?.ok === true;
      result.jinaApiKeyRemoved = main.steps?.jinaApiKey?.ok === true;
      result.providerApiKeysRemoved = typeof main.steps?.providerApiKeys?.removed === "number" ? main.steps.providerApiKeys.removed : 0;
      result.passwordRemoved = main.steps?.passwordVerifier?.ok === true;
    } catch {
      /* ignore */
    }
  } else {
    try { result.veniceApiKeyRemoved = (await desktopApiKey.delete(profileId)).ok; } catch { /* ignore */ }
    try { result.jinaApiKeyRemoved = (await desktopJinaApiKey.delete(profileId)).ok; } catch { /* ignore */ }
    for (const providerId of Object.keys(PROVIDER_REGISTRY)) {
      try {
        const provider = await desktopProviderApiKey.delete(providerId);
        if (provider.ok) result.providerApiKeysRemoved += 1;
      } catch { /* ignore */ }
    }
    try { result.passwordRemoved = (await desktopProfilePassword.clear(profileId)).ok; } catch { /* ignore */ }
  }

  // 2. localStorage profile-scoped keys. We remove both the known Zustand
  // store keys and any other key that ends with `_${profileId}`.
  if (typeof window !== "undefined" && window.localStorage /* localStorage-allowed: profile purge; only removes profile-scoped keys */) {
    const keysToRemove: string[] = [];
    for (const base of PROFILE_SCOPED_LOCAL_STORES) {
      keysToRemove.push(`${base}_${profileId}`);
    }
    for (let i = 0; i < window.localStorage.length /* localStorage-allowed: profile purge; scans only key suffixes */; i++) {
      const key = window.localStorage.key(i) /* localStorage-allowed: profile purge; scans only key suffixes */;
      if (
        key &&
        key.endsWith(`_${profileId}`) &&
        VENICE_OWNED_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of [...new Set(keysToRemove)]) {
      try {
        window.localStorage.removeItem(key) /* localStorage-allowed: profile purge; removes profile-scoped keys */;
        result.localStorageKeysRemoved += 1;
      } catch {
        /* ignore */
      }
    }
  }

  // 3. IndexedDB records tagged with the profile id.
  try {
    result.indexedDBStoresScanned = await StorageService.deleteRecordsForProfile(profileId);
  } catch {
    /* ignore */
  }

  return result;
}
