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

