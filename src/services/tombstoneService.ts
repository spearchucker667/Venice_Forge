/**
 * @fileoverview Service for tracking hard-deleted items via tombstones.
 * These tombstones are used by the sync engine to propagate deletions to other devices.
 */

import StorageService from "./storageService";
import type { Tombstone, SyncStoreName } from "../types/sync";

export class TombstoneService {
  /**
   * Records a tombstone for a deleted record.
   * @param storeName The store from which the record was deleted.
   * @param recordId The ID of the deleted record.
   * @param deviceId Optional ID of the device that performed the deletion.
   */
  static async recordTombstone(storeName: SyncStoreName, recordId: string, deviceId?: string): Promise<void> {
    const id = `${storeName}:${recordId}`;
    const tombstone: Tombstone = {
      id,
      storeName,
      recordId,
      deletedAt: Date.now(),
      deviceId,
    };
    await StorageService.saveItem("tombstones", tombstone as unknown as Record<string, unknown>);
  }

  /**
   * Retrieves all tombstones across all stores.
   */
  static async getTombstones(): Promise<Tombstone[]> {
    return await StorageService.getItems<Tombstone>("tombstones");
  }

  /**
   * Retrieves tombstones for a specific store.
   * @param storeName The store name to filter by.
   */
  static async getTombstonesForStore(storeName: SyncStoreName): Promise<Tombstone[]> {
    const tombstones = await this.getTombstones();
    return tombstones.filter((t) => t.storeName === storeName);
  }

  /**
   * Removes a tombstone (e.g., after successful sync propagation).
   * @param tombstoneId The unique ID of the tombstone (`storeName:recordId`).
   */
  static async removeTombstone(tombstoneId: string): Promise<void> {
    await StorageService.deleteItem("tombstones", tombstoneId);
  }
}
