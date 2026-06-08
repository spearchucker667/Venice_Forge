/** @fileoverview Versioned IndexedDB migration steps for Venice Forge.
 *
 * Each migration step corresponds to a DB_VERSION increment. When the database
 * is opened at a version higher than the stored on-disk version, IndexedDB fires
 * `onupgradeneeded` with `event.oldVersion` set to the previous schema version.
 * `applyMigrations` applies every step whose `toVersion` is > oldVersion and
 * <= newVersion, in ascending order, within the single upgrade transaction.
 *
 * ### Adding a new migration
 * 1. Bump `DB_VERSION` in `src/constants/venice.ts`.
 * 2. Add a new object to `MIGRATIONS` with `toVersion = <new DB_VERSION>` and
 *    implement the `up` function using the provided `IDBDatabase` and
 *    `IDBTransaction`.
 * 3. If the new version adds a store, also add the store name to `STORE_NAMES`
 *    in `src/constants/venice.ts` and (if it holds sensitive data) to
 *    `ENCRYPTED_STORES` in `src/services/storageService.ts`.
 *
 * ### Invariants
 * - Migrations are append-only. Never modify or delete an existing step.
 * - Each `up` function must be idempotent (safe to run on an already-migrated
 *   database, e.g. by checking `db.objectStoreNames.contains(...)` before
 *   `createObjectStore`).
 * - No migration step may read or write record data — only schema changes
 *   (createObjectStore, deleteObjectStore, createIndex, deleteIndex) are
 *   permitted inside `onupgradeneeded`.
 */

/** A single versioned migration step. */
export interface MigrationStep {
  /** The DB version this step brings the schema to. */
  toVersion: number;
  /** Human-readable description for logging and diagnostics. */
  description: string;
  /**
   * Applies the schema change within the active upgrade transaction.
   * @param db   The IDBDatabase being upgraded.
   * @param tx   The versionchange IDBTransaction (use for index ops).
   * @param oldVersion  The version before this upgrade began.
   */
  up(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void;
}

/**
 * All migration steps, ordered by `toVersion` ascending.
 * Do NOT reorder or modify existing entries.
 */
export const MIGRATIONS: MigrationStep[] = [
  {
    toVersion: 1,
    description: "Initial schema — images, chats, settings, diagnostics",
    up(db) {
      for (const name of ["images", "chats", "settings", "diagnostics"] as const) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    },
  },
  {
    toVersion: 2,
    description: "Add conversations store for multi-conversation persistence",
    up(db) {
      if (!db.objectStoreNames.contains("conversations")) {
        db.createObjectStore("conversations", { keyPath: "id" });
      }
    },
  },
  {
    toVersion: 3,
    description: "Add ai_memory and files stores",
    up(db) {
      if (!db.objectStoreNames.contains("ai_memory")) {
        db.createObjectStore("ai_memory", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    },
  },
  {
    toVersion: 4,
    description: "Reserved version bump (theme token invariant / dual-client audit)",
    up(_db) {
      // No schema change — version 4 was a non-schema release bump.
      // This step is kept as a placeholder to keep toVersion numbering
      // in sync with the DB_VERSION history.
    },
  },
  {
    toVersion: 5,
    description: "Add Character RP Studio stores (character_cards, personas, lorebooks, rp_chats, rp_assets)",
    up(db) {
      for (const name of [
        "character_cards",
        "personas",
        "lorebooks",
        "rp_chats",
        "rp_assets",
      ] as const) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    },
  },
  {
    toVersion: 6,
    description: "Add timestamp index for paginated Media Studio reads",
    up(db, tx) {
      if (!db.objectStoreNames.contains("images")) return;
      const store = tx.objectStore("images");
      if (!store.indexNames.contains("timestamp")) {
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    },
  },
  {
    toVersion: 7,
    description: "Add projects store for Project Workspace (first-class metadata + asset tagging support)",
    up(db) {
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
    },
  },
];

/**
 * Runs every pending migration whose `toVersion` falls in the range
 * `(oldVersion, newVersion]`, in ascending order.
 *
 * Call this from `IDBOpenDBRequest.onupgradeneeded`:
 * ```ts
 * request.onupgradeneeded = (event) => {
 *   applyMigrations(request.result, request.transaction!, event.oldVersion, event.newVersion ?? DB_VERSION);
 * };
 * ```
 *
 * @param db          The IDBDatabase being upgraded.
 * @param tx          The versionchange transaction.
 * @param oldVersion  The schema version currently on disk (0 for a fresh database).
 * @param newVersion  The target schema version.
 */
export function applyMigrations(
  db: IDBDatabase,
  tx: IDBTransaction,
  oldVersion: number,
  newVersion: number
): void {
  const pending = MIGRATIONS
    .filter((m) => m.toVersion > oldVersion && m.toVersion <= newVersion)
    .sort((a, b) => a.toVersion - b.toVersion);

  for (const step of pending) {
    try {
      step.up(db, tx, oldVersion);
    } catch (err) {
      // Re-throw with context so the caller (onupgradeneeded → onerror) surfaces it.
      throw new Error(
        `[dbMigrations] Migration to v${step.toVersion} ("${step.description}") failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
}

/** Returns a summary of all migration steps for diagnostics / Settings UI. */
export function getMigrationHistory(): Array<{ toVersion: number; description: string }> {
  return MIGRATIONS.map(({ toVersion, description }) => ({ toVersion, description }));
}
