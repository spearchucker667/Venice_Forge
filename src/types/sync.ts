/** @fileoverview Types for local-first sync and tombstones. */

import type { STORE_NAMES } from "../constants/venice";
import type { Tombstone as SyncProtocolTombstone } from "../shared/syncProtocol";

export type SyncStoreName = (typeof STORE_NAMES)[number];

/** Re-export the canonical tombstone type from the shared sync protocol. */
export type Tombstone = SyncProtocolTombstone;

/** Origin of a storage mutation. Only `local-user` writes should auto-emit
 *  sync packets; remote-sync / manual-import / migration writes must not
 *  re-broadcast. */
export type MutationOrigin =
  | "local-user"
  | "remote-sync"
  | "manual-import"
  | "migration";
