/**
 * @fileoverview Service for tracking hard-deleted items via tombstones.
 * These tombstones are used by the sync engine to propagate deletions to other devices.
 */

import StorageService from "./storageService";
import type { Tombstone, SyncStoreName } from "../types/sync";
import { createTombstone } from "../shared/syncProtocol";

export class TombstoneService {
  /**
   * Persists a tombstone exactly as provided, preserving fields such as
   * `deletedAt` and `deviceId`. Sync echo is suppressed because tombstones
   * are themselves sync metadata.
   * @param tombstone The tombstone to persist.
   */
  static async saveTombstone(tombstone: Tombstone): Promise<void> {
    await StorageService.saveItem("tombstones", tombstone as unknown as Record<string, unknown>, {
      bypassSyncEcho: true,
    });
  }

  /**
   * Records a tombstone for a deleted record.
   * @param storeName The store from which the record was deleted.
   * @param recordId The ID of the deleted record.
   * @param deviceIdOrOptions Optional device id or option bag.
   */
  static async recordTombstone(
    storeName: SyncStoreName,
    recordId: string,
    deviceIdOrOptions?: string | { deletedAt?: number; deviceId?: string },
  ): Promise<void> {
    const options = typeof deviceIdOrOptions === "string" ? { deviceId: deviceIdOrOptions } : deviceIdOrOptions;
    const tombstone = createTombstone(
      storeName,
      recordId,
      options?.deviceId,
      options?.deletedAt ?? Date.now(),
    );
    await this.saveTombstone(tombstone);
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
