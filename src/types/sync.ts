/** @fileoverview Types for local-first sync and tombstones. */

import type { STORE_NAMES } from "../constants/venice";

export type SyncStoreName = (typeof STORE_NAMES)[number];

/** A record representing a hard-deleted item for sync propagation. */
export interface Tombstone {
  /** Unique ID for the tombstone itself, typically `storeName:recordId`. */
  id: string;
  /** The store where the record was deleted. */
  storeName: SyncStoreName;
  /** The ID of the deleted record. */
  recordId: string;
  /** Unix timestamp of deletion. */
  deletedAt: number;
  /** Device ID that performed the deletion (if known). */
  deviceId?: string;
}
