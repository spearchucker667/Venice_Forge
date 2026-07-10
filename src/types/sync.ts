/** @fileoverview Types for local-first sync and tombstones. */

import type { STORE_NAMES } from "../constants/venice";
import type { Tombstone as SyncProtocolTombstone } from "../shared/syncProtocol";

export type SyncStoreName = (typeof STORE_NAMES)[number];

/** Re-export the canonical tombstone type from the shared sync protocol. */
export type Tombstone = SyncProtocolTombstone;
