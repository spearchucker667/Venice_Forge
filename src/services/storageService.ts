/** @fileoverview IndexedDB storage service with transparent at-rest encryption for sensitive stores. */

import { DB_NAME, DB_VERSION, STORE_NAMES } from "../constants/venice";
import { warn } from "../shared/logger";
import { assertValidId, isValidId } from "../utils/idValidation";
import { encryptData, decryptDataResult, type EncryptedPayload } from "./cryptoService";
import { applyMigrations } from "./dbMigrations";
import { DEFAULT_PROFILE_ID, getActiveProfileId } from "./activeProfile";

type StoreName = (typeof STORE_NAMES)[number];

/** Marker field added to every record so reads can filter by active profile. */
export const PROFILE_ID_FIELD = "profileId";
const LOGICAL_ID_FIELD = "logicalId";

/** List of store names whose records are encrypted before persistence. */
// diagnostics is intentionally excluded: it stores sanitized timing/status metadata
// only (no raw prompts, no API keys), so encryption overhead is not warranted.
const ENCRYPTED_STORES: StoreName[] = [
  "chats",
  "settings",
  "images",
  "conversations",
  "ai_memory",
  "files",
  "character_cards",
  "personas",
  "lorebooks",
  "rp_chats",
  "rp_assets",
  // Project Workspace metadata (and any future project-scoped assets) are
  // treated as user content and encrypted at rest for both Electron and web modes.
  "projects",
  // Phase 2D Prompt Library — user-saved, reusable prompt records with
  // versioning. Encrypted at rest like other user content.
  "promptLibrary",
  // Phase 2E Scene Composer — visual composition tool for arranging prompts,
  // media references, and models into structured scenes. Encrypted at rest.
  "scenes",
  // Phase 2F RP Studio Polish — user-authored scenarios, encrypted at rest
  // like other user content.
  "rpScenarios",
  "workflowTemplates",
  "researchSessions",
  "visualWorkflows",
  "playground",
];

export interface GetItemsResult<T = unknown> {
  items: T[];
  decryptFailures: number;
}

export interface GetItemsPageResult<T = unknown> extends GetItemsResult<T> {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Decodes an IndexDB row that may be encrypted (cipher inside `data`,
 * `_isEncryptedWrapper === true`) or plaintext. Returns a tuple of
 * `[item, ok]` where `ok === false` means decryption failed for an
 * encrypted row that survived the profile filter.
 */
function toPhysicalId(profileId: string, logicalId: string): string {
  return `${profileId}:${logicalId}`;
}

function logicalIdFromRow(row: Record<string, unknown>): string | null {
  if (typeof row[LOGICAL_ID_FIELD] === "string") return row[LOGICAL_ID_FIELD] as string;
  if (typeof row.id === "string") {
    const rowProfile = typeof row[PROFILE_ID_FIELD] === "string" ? row[PROFILE_ID_FIELD] as string : null;
    const prefix = rowProfile ? `${rowProfile}:` : "";
    if (prefix && row.id.startsWith(prefix)) return row.id.slice(prefix.length);
    return row.id;
  }
  return null;
}

function normalizePlainRow<T>(row: Record<string, unknown>): T {
  const logicalId = logicalIdFromRow(row);
  const normalized = { ...row };
  if (logicalId) normalized.id = logicalId;
  delete normalized[LOGICAL_ID_FIELD];
  return normalized as T;
}

async function decodeRow<T>(store: StoreName, row: Record<string, unknown>): Promise<[T | null, boolean]> {
  if (!ENCRYPTED_STORES.includes(store)) {
    return [normalizePlainRow<T>(row), true];
  }
  if (row._isEncryptedWrapper !== true) {
    // Legacy plaintext record in an encrypted store — keep but flag as
    // not-OK so the caller can warn about the inconsistency.
    return [normalizePlainRow<T>(row), false];
  }
  if (!row.data) return [null, false];
  const result = await decryptDataResult<T>(row.data as EncryptedPayload);
  if (!result.ok) return [null, false];
  return [result.data as T, true];
}

/**
 * Returns true if the row belongs to the active profile. Records with no
 * `profileId` field are treated as legacy and attributed to the default
 * profile (matches the pre-profile-isolation behaviour).
 */
function rowBelongsToActiveProfile(row: Record<string, unknown>, activeProfile: string): boolean {
  const rowProfile = typeof row[PROFILE_ID_FIELD] === "string"
    ? (row[PROFILE_ID_FIELD] as string)
    : DEFAULT_PROFILE_ID;
  return rowProfile === activeProfile;
}

function candidatePhysicalIds(activeProfile: string, logicalId: string): string[] {
  const scoped = toPhysicalId(activeProfile, logicalId);
  return activeProfile === DEFAULT_PROFILE_ID ? [scoped, logicalId] : [scoped];
}

async function findWritablePhysicalId(db: IDBDatabase, store: StoreName, activeProfile: string, logicalId: string): Promise<string> {
  if (activeProfile !== DEFAULT_PROFILE_ID) return toPhysicalId(activeProfile, logicalId);
  const legacyRow = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(logicalId);
    req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
    req.onerror = () => reject(req.error);
  });
  if (legacyRow && rowBelongsToActiveProfile(legacyRow, DEFAULT_PROFILE_ID)) return logicalId;
  return toPhysicalId(activeProfile, logicalId);
}

async function decodeRows<T>(
  store: StoreName,
  rows: Record<string, unknown>[],
  activeProfile: string,
): Promise<GetItemsResult<T>> {
  // Filter to the active profile BEFORE decrypting so unrelated-profile
  // records don't burn cipher cycles.
  const scoped = rows.filter((row) => rowBelongsToActiveProfile(row, activeProfile));
  if (!ENCRYPTED_STORES.includes(store)) {
    return { items: scoped as T[], decryptFailures: 0 };
  }
  const decrypted = await Promise.all(scoped.map((row) => decodeRow<T>(store, row)));
  const items = decrypted.flatMap(([value]) => (value === null ? [] : [value]));
  const decryptFailures = decrypted.filter(([, ok]) => !ok).length;
  if (decryptFailures > 0) {
    warn(
      `[storageService] ${decryptFailures} record(s) in "${store}" for profile "${activeProfile}" could not be decrypted. ` +
      "This may indicate key-store loss, data corruption, or a browser/profile reset.",
    );
  }
  return { items: items as T[], decryptFailures };
}

export class MissingTimestampIndexError extends Error {
  constructor(store: StoreName) {
    super(`IndexedDB store "${store}" is missing required timestamp index.`);
    this.name = "MissingTimestampIndexError";
  }
}

/**
 * Provides CRUD operations over IndexedDB with automatic encryption for
 * configured object stores.
 */
const StorageService = {
  /** The open IndexedDB database instance, cached after first open. */
  db: null as IDBDatabase | null,

  /**
   * Opens or returns the cached IndexedDB connection.
   * @returns A promise resolving to the IDBDatabase instance.
   */
  openDB(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        return reject(new Error("indexedDB is not defined"));
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const tx = request.transaction!;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion ?? 0;
        // Run all pending versioned migration steps (see src/services/dbMigrations.ts).
        // Falls back to creating any missing store for forward-compat with stores
        // added before the migration system existed.
        applyMigrations(db, tx, oldVersion, DB_VERSION);
        // Safety net: ensure every current store exists even if a migration step
        // was accidentally omitted (never deletes existing data).
        STORE_NAMES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "id" });
          }
        });
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Saves an item to the specified store, encrypting if required.
   *
   * Profile isolation: object stores keep `keyPath: "id"` for migration
   * stability, but new writes use a profile-scoped physical id internally
   * (`profileId:logicalId`). The decrypted/plain record returned to callers
   * still uses the logical `id`.
   *
   * @param store The target object store name.
   * @param item The record to persist.
   * @returns A promise resolving to the saved record with generated id and timestamp.
   */
  async saveItem<T extends Record<string, unknown>>(store: StoreName, item: T): Promise<T & { id: string; timestamp: number }> {
    const db = await this.openDB();
    const id = typeof item.id === "string" ? item.id : crypto.randomUUID();
    assertValidId(id, "saveItem");
    const timestamp = typeof item.timestamp === "number" ? item.timestamp : Date.now();
    const activeProfile = getActiveProfileId();
    const physicalId = await findWritablePhysicalId(db, store, activeProfile, id);

    let payload: Record<string, unknown> = {
      ...item,
      id,
      timestamp,
      [PROFILE_ID_FIELD]: activeProfile,
    };
    if (ENCRYPTED_STORES.includes(store)) {
      const encryptedData = await encryptData(payload);
      payload = {
        id: physicalId,
        [LOGICAL_ID_FIELD]: id,
        timestamp,
        [PROFILE_ID_FIELD]: activeProfile,
        data: encryptedData,
        _isEncryptedWrapper: true,
      };
    } else {
      payload = {
        ...payload,
        id: physicalId,
        [LOGICAL_ID_FIELD]: id,
      };
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(payload);
      tx.oncomplete = () => resolve({ ...item, id, timestamp } as T & { id: string; timestamp: number }); // Return logical record to caller
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Retrieves all items from a store, decrypting encrypted records and
   * filtering to the active profile.
   * @param store The object store name to query.
   * @returns A promise resolving to an array of decrypted records sorted by timestamp descending.
   */
  async getItemsWithMeta<T = unknown>(store: StoreName): Promise<GetItemsResult<T>> {
    const db = await this.openDB();
    const activeProfile = getActiveProfileId();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = async () => {
        const decoded = await decodeRows<T>(store, (req.result || []) as Record<string, unknown>[], activeProfile);
        decoded.items.sort((a, b) => ((b as { timestamp?: number }).timestamp || 0) - ((a as { timestamp?: number }).timestamp || 0));
        resolve(decoded);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getItems<T = unknown>(store: StoreName): Promise<T[]> {
    const { items } = await this.getItemsWithMeta<T>(store);
    return items;
  },

  async getItemsPageWithMeta<T = unknown>(
    store: StoreName,
    options: { offset?: number; limit?: number } = {},
  ): Promise<GetItemsPageResult<T>> {
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 60)));
    const db = await this.openDB();
    const activeProfile = getActiveProfileId();
    const tx = db.transaction(store, "readonly");
    const objectStore = tx.objectStore(store);

    if (!objectStore.indexNames.contains("timestamp")) {
      throw new MissingTimestampIndexError(store);
    }

    // Profile isolation invariant: the page total and the page cursor must
    // both be scoped to the active profile. We walk the timestamp index once
    // and filter before applying `offset`; this keeps legacy default rows
    // without profileId visible to the default profile and prevents offset
    // from being consumed by another profile's rows.
    const hasProfileIndex = objectStore.indexNames.contains("profileId");
    if (!hasProfileIndex) {
      warn(
        `[storageService] Store "${store}" lacks a profileId index so ` +
        "pagination will fall back to in-memory filtering. Apply migration v15+.",
      );
    }

    return new Promise((resolve, reject) => {
      const filteredRows: Record<string, unknown>[] = [];
      const cursorRequest = objectStore.index("timestamp").openCursor(null, "prev");
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          const total = filteredRows.length;
          const rows = filteredRows.slice(offset, offset + limit);
          void (async () => {
            try {
              const decoded = await decodeRows<T>(store, rows, activeProfile);
              resolve({
                ...decoded,
                total,
                offset,
                limit,
                hasMore: offset + decoded.items.length < total,
              });
            } catch (error) {
              reject(error);
            }
          })();
          return;
        }
        const row = cursor.value as Record<string, unknown>;
        if (rowBelongsToActiveProfile(row, activeProfile)) {
          filteredRows.push(row);
        }
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
      tx.onerror = () => reject(tx.error);
    });
  },

  async getRawProfileRow(db: IDBDatabase, store: StoreName, id: string, activeProfile: string): Promise<Record<string, unknown> | null> {
    const candidates = candidatePhysicalIds(activeProfile, id);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const objectStore = tx.objectStore(store);
      let index = 0;
      const readNext = () => {
        if (index >= candidates.length) {
          resolve(null);
          return;
        }
        const req = objectStore.get(candidates[index]);
        index += 1;
        req.onsuccess = () => {
          const row = req.result as Record<string, unknown> | undefined;
          if (row && rowBelongsToActiveProfile(row, activeProfile)) {
            resolve(row);
            return;
          }
          readNext();
        };
        req.onerror = () => reject(req.error);
      };
      readNext();
    });
  },

  async deleteRawProfileRows(db: IDBDatabase, store: StoreName, id: string, activeProfile: string): Promise<boolean> {
    const candidates = candidatePhysicalIds(activeProfile, id);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);
      let deleted = false;
      let index = 0;
      const readNext = () => {
        if (index >= candidates.length) return;
        const key = candidates[index];
        index += 1;
        const req = objectStore.get(key);
        req.onsuccess = () => {
          const row = req.result as Record<string, unknown> | undefined;
          if (row && rowBelongsToActiveProfile(row, activeProfile)) {
            objectStore.delete(key);
            deleted = true;
          }
          readNext();
        };
        req.onerror = () => reject(req.error);
      };
      readNext();
      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Retrieves a single record by id from a store, decrypting if the record is
   * in the encrypted-stores set. Returns null when the record does not exist
   * or belongs to a different profile.
   * @param store The object store name to query.
   * @param id The unique identifier of the record.
   * @returns A promise resolving to the decrypted record or null.
   */
  async getItem<T = unknown>(store: StoreName, id: string): Promise<T | null> {
    if (!isValidId(id)) return null;
    const db = await this.openDB();
    const activeProfile = getActiveProfileId();
    const row = await this.getRawProfileRow(db, store, id, activeProfile);
    if (!row) return null;
    if (!ENCRYPTED_STORES.includes(store)) return normalizePlainRow<T>(row);
    if (row._isEncryptedWrapper && row.data) {
      const result = await decryptDataResult(row.data);
      if (!result.ok) {
        warn(`[storageService] Record "${id}" in store "${store}" could not be decrypted.`);
        return null;
      }
      return result.data as T;
    }
    if (row._isEncryptedWrapper) {
      warn(`[storageService] Encrypted record "${id}" in store "${store}" is missing payload; returning null.`);
      return null;
    }
    return normalizePlainRow<T>(row);
  },

  /**
   * Deletes a single record from a store. Profile isolation invariant:
   * before deleting, the call verifies the row belongs to the active
   * profile. If the row is owned by a different profile the call returns
   * `false` (not an error) so the caller can treat "missing" and
   * "foreign-profile" identically. Cross-profile deletes are intentionally
   * rejected — there is no UI path that should be able to wipe another
   * profile's record through this entry point.
   *
   * @param store The object store name.
   * @param id The unique identifier of the record to delete.
   * @returns A promise resolving to true when a row owned by the active
   *          profile was deleted, false otherwise (including row missing or
   *          owned by a different profile).
   */
  async deleteItem(store: StoreName, id: string): Promise<boolean> {
    assertValidId(id, "deleteItem");
    const db = await this.openDB();
    const activeProfile = getActiveProfileId();
    return this.deleteRawProfileRows(db, store, id, activeProfile);
  },

  /**
   * Clears all records from the specified store. Only clears records that
   * belong to the active profile — never accidentally wipes another
   * profile's data.
   * @param store The object store name to clear.
   * @returns A promise resolving to true on success.
   */
  async clearStore(store: StoreName): Promise<boolean> {
    const db = await this.openDB();
    const activeProfile = getActiveProfileId();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);
      const req = objectStore.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          return;
        }
        const row = cursor.value as Record<string, unknown>;
        if (rowBelongsToActiveProfile(row, activeProfile)) {
          cursor.delete();
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Deletes every record in every store that is tagged with the given
   * profile id. This is the renderer-side half of profile deletion:
   * it purges IndexedDB rows without decrypting them so a profile's
   * encrypted data cannot be recovered later by switching back.
   *
   * The default profile is intentionally rejected — deleting the default
   * profile is a metadata-only operation and does not purge anything.
   *
   * @param profileId The profile whose records should be removed.
   * @returns The number of stores that were scanned.
   */
  async deleteRecordsForProfile(profileId: string): Promise<number> {
    if (profileId === DEFAULT_PROFILE_ID) return 0;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      let completed = 0;
      for (const store of STORE_NAMES) {
        const tx = db.transaction(store, "readwrite");
        const objectStore = tx.objectStore(store);
        const req = objectStore.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const row = cursor.value as Record<string, unknown>;
          const rowProfile = typeof row[PROFILE_ID_FIELD] === "string"
            ? (row[PROFILE_ID_FIELD] as string)
            : DEFAULT_PROFILE_ID;
          if (rowProfile === profileId) {
            cursor.delete();
          }
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => {
          completed += 1;
          if (completed === STORE_NAMES.length) resolve(completed);
        };
        tx.onerror = () => reject(tx.error);
      }
    });
  },

  /**
   * Media Studio helpers. All values are persisted in the `images` store and
   * round-trip through the standard encrypt/decrypt path. The migrator in
   * `mediaMigration.ts` is applied on read to enrich legacy records.
   */

  /**
   * Upsert a single media record. Returns the persisted record.
   */
  async putMedia<T extends object>(item: T): Promise<T & { id: string; timestamp: number }> {
    return (await this.saveItem("images", item as Record<string, unknown>)) as T & {
      id: string;
      timestamp: number;
    };
  },

  /**
   * Patch a single media record. The patch is shallow-merged into the
   * existing record. Throws if the record does not exist.
   * Supports a function-based patch for atomic read-modify-write (AUDIT-007).
   */
  async patchMedia<T extends object>(id: string, patch: Record<string, unknown> | ((existing: T) => Record<string, unknown>)): Promise<T> {
    assertValidId(id, "patchMedia");
    const existing = (await this.getItem("images", id)) as T | null;
    if (!existing) throw new Error(`patchMedia: record not found: ${id}`);
    const patchRecord = typeof patch === "function" ? patch(existing) : patch;
    const next = { ...(existing as object), ...patchRecord, id, timestamp: (existing as { timestamp?: number }).timestamp ?? Date.now() };
    await this.saveItem("images", next);
    return next as T;
  },

  /**
   * Apply the same patch to multiple records. Records that do not exist are
   * silently skipped. Returns the number of records updated.
   */
  async bulkPatchMedia(ids: readonly string[], patch: Record<string, unknown>): Promise<number> {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    let updated = 0;
    for (const id of ids) {
      if (!isValidId(id)) continue;
      try {
        const existing = (await this.getItem("images", id)) as Record<string, unknown> | null;
        if (!existing) continue;
        await this.saveItem("images", { ...existing, ...patch, id, timestamp: existing.timestamp });
        updated += 1;
      } catch (err) {
        warn(`[storageService] bulkPatchMedia: failed to patch ${id}: ${(err as Error).message}`);
      }
    }
    return updated;
  },

  /**
   * Delete a single media record.
   */
  async deleteMedia(id: string): Promise<boolean> {
    return this.deleteItem("images", id);
  },

  /**
   * Delete multiple media records. Returns the number of records actually
   * removed (best-effort; a delete that errors is counted as not removed).
   */
  async deleteMediaMany(ids: readonly string[]): Promise<number> {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    let removed = 0;
    for (const id of ids) {
      if (!isValidId(id)) continue;
      try {
        const ok = await this.deleteItem("images", id);
        if (ok) removed += 1;
      } catch (err) {
        warn(`[storageService] deleteMediaMany: failed to delete ${id}: ${(err as Error).message}`);
      }
    }
    return removed;
  },
};

export default StorageService;
