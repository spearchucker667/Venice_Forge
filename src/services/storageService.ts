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

/**
 * Thrown when `saveItem` would overwrite a record that belongs to a different
 * profile (two profiles sharing the same `id` in the `id`-keyed object stores
 * would otherwise silently collide once the record keys are equal).
 */
export class CrossProfileIdCollisionError extends Error {
  public readonly store: StoreName;
  public readonly id: string;
  public readonly existingProfile: string;
  constructor(store: StoreName, id: string, existingProfile: string) {
    super(
      `[storageService] Cannot save record with id "${id}" in store "${store}": ` +
      `id is already used by profile "${existingProfile}". Use a profile-unique id ` +
      `(e.g. suffix with profile name, or use crypto.randomUUID()) so cross-profile ` +
      `records cannot overwrite each other through the shared keyPath.`,
    );
    this.name = "CrossProfileIdCollisionError";
    this.store = store;
    this.id = id;
    this.existingProfile = existingProfile;
  }
}

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
async function decodeRow<T>(store: StoreName, row: Record<string, unknown>): Promise<[T | null, boolean]> {
  if (!ENCRYPTED_STORES.includes(store)) {
    return [row as T, true];
  }
  if (row._isEncryptedWrapper !== true) {
    // Legacy plaintext record in an encrypted store — keep but flag as
    // not-OK so the caller can warn about the inconsistency.
    return [row as T, false];
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
   * Profile isolation: before writing, the call probes for an existing row
   * with the same `id` that belongs to a *different* profile. If such a row
   * exists the call rejects with `CrossProfileIdCollisionError` instead of
   * silently overwriting the other profile's record (the object stores use
   * the logical `id` as the IndexedDB keyPath, so two profiles using the
   * same id would otherwise collapse onto the same physical row). The
   * collision guard operates inside a single readonly transaction so the
   * read is consistent with concurrent writes.
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

    const existingOwner = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => {
        const row = req.result as Record<string, unknown> | undefined;
        if (!row) {
          resolve(null);
          return;
        }
        const rowProfile = typeof row[PROFILE_ID_FIELD] === "string"
          ? (row[PROFILE_ID_FIELD] as string)
          : DEFAULT_PROFILE_ID;
        resolve(rowProfile);
      };
      req.onerror = () => reject(req.error);
    });

    if (existingOwner !== null && existingOwner !== activeProfile) {
      throw new CrossProfileIdCollisionError(store, id, existingOwner);
    }

    let payload: Record<string, unknown> = {
      ...item,
      id,
      timestamp,
      [PROFILE_ID_FIELD]: activeProfile,
    };
    if (ENCRYPTED_STORES.includes(store)) {
      const encryptedData = await encryptData(payload);
      payload = { id, timestamp, [PROFILE_ID_FIELD]: activeProfile, data: encryptedData, _isEncryptedWrapper: true };
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(payload);
      tx.oncomplete = () => resolve({ ...item, id, timestamp } as T & { id: string; timestamp: number }); // Return unencrypted to caller
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
    // both be scoped to the active profile.
    //   - Preferred path: use the `profileId` index for both count() and the
    //     timestamp cursor fallback filter (most stores have a profileId
    //     index after migration v15).
    //   - Legacy fallback (no profileId index): count all rows, filter the
    //     cursor result manually. `effectiveTotal` is set to the filtered row
    //     length so the page navigator never reports a bogus "next page".
    const hasProfileIndex = objectStore.indexNames.contains("profileId");
    if (!hasProfileIndex) {
      warn(
        `[storageService] Store "${store}" lacks a profileId index so ` +
        "pagination will fall back to in-memory filtering. Apply migration v15+.",
      );
    }

    return new Promise((resolve, reject) => {
      const rows: Record<string, unknown>[] = [];
      let total: number | null = null;
      let cursorDone = false;
      let advanced = offset === 0;
      let settled = false;

      const finish = async () => {
        if (settled || total === null || !cursorDone) return;
        settled = true;
        try {
          const decoded = await decodeRows<T>(store, rows, activeProfile);
          const effectiveTotal = hasProfileIndex ? total : decoded.items.length;
          resolve({
            ...decoded,
            total: effectiveTotal,
            offset,
            limit,
            hasMore: offset + decoded.items.length < effectiveTotal,
          });
        } catch (error) {
          reject(error);
        }
      };

      const countRequest = hasProfileIndex
        ? objectStore.index("profileId").count(IDBKeyRange.only(activeProfile))
        : objectStore.count();
      countRequest.onsuccess = () => {
        total = countRequest.result;
        void finish();
      };
      countRequest.onerror = () => reject(countRequest.error);

      const cursorRequest = objectStore.index("timestamp").openCursor(null, "prev");
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || rows.length >= limit) {
          cursorDone = true;
          void finish();
          return;
        }
        if (!advanced) {
          advanced = true;
          cursor.advance(offset);
          return;
        }
        const row = cursor.value as Record<string, unknown>;
        // Always enforce profile scope on every row the cursor returns,
        // regardless of whether the profileId index is present. The cursor
        // walks the `timestamp` index (not the profileId index), so without
        // this guard the page would leak rows from other profiles whenever
        // the profileId index is missing OR a row is missing the field.
        if (!rowBelongsToActiveProfile(row, activeProfile)) {
          cursor.continue();
          return;
        }
        rows.push(row);
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
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
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(id);
      req.onsuccess = async () => {
        const row = req.result as Record<string, unknown> | undefined;
        if (!row) {
          resolve(null);
          return;
        }
        if (!rowBelongsToActiveProfile(row, activeProfile)) {
          resolve(null);
          return;
        }
        if (!ENCRYPTED_STORES.includes(store)) {
          resolve(row as T);
          return;
        }
        if (row._isEncryptedWrapper && row.data) {
          const result = await decryptDataResult(row.data);
          if (!result.ok) {
            warn(`[storageService] Record "${id}" in store "${store}" could not be decrypted.`);
            resolve(null);
            return;
          }
          resolve(result.data as T);
          return;
        }
        if (row._isEncryptedWrapper) {
          warn(`[storageService] Encrypted record "${id}" in store "${store}" is missing payload; returning null.`);
          resolve(null);
          return;
        }
        resolve(row as T);
      };
      req.onerror = () => reject(req.error);
    });
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
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);
      const lookup = objectStore.get(id);
      lookup.onsuccess = () => {
        const row = lookup.result as Record<string, unknown> | undefined;
        if (!row) {
          resolve(false);
          return;
        }
        if (!rowBelongsToActiveProfile(row, activeProfile)) {
          // Foreign-profile row — refuse the delete and abort the transaction
          // so the read-only probe does not accidentally commit.
          try { tx.abort(); } catch { /* transaction already finalised */ }
          resolve(false);
          return;
        }
        objectStore.delete(id);
      };
      lookup.onerror = () => reject(lookup.error);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        // Aborted transactions raise here; treat foreign-profile abort as
        // `false` (the explicit "not deleted" return above).
        if (tx.error && tx.error.name === "AbortError") {
          resolve(false);
          return;
        }
        reject(tx.error);
      };
    });
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
