/** @fileoverview IndexedDB storage service with transparent at-rest encryption for sensitive stores. */

import { DB_NAME, DB_VERSION, STORE_NAMES } from "../constants/venice";
import { warn } from "../shared/logger";
import { encryptData, decryptData } from "./cryptoService";
import { applyMigrations } from "./dbMigrations";

type StoreName = (typeof STORE_NAMES)[number];

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

async function decodeRows<T>(store: StoreName, rows: Record<string, unknown>[]): Promise<GetItemsResult<T>> {
  if (!ENCRYPTED_STORES.includes(store)) {
    return { items: rows as T[], decryptFailures: 0 };
  }

  const decrypted = await Promise.all(
    rows.map(async (row) => {
      if (row._isEncryptedWrapper === true && row.data) return decryptData(row.data);
      if (row._isEncryptedWrapper === true) return null;
      return row;
    }),
  );
  const decryptFailures = decrypted.filter((value) => !value).length;
  if (decryptFailures > 0) {
    warn(
      `[storageService] ${decryptFailures} record(s) in "${store}" could not be decrypted and were skipped. ` +
      "This may indicate key-store loss, data corruption, or a browser/profile reset. The records are still persisted in IndexedDB.",
    );
  }
  return { items: decrypted.filter(Boolean) as T[], decryptFailures };
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
   * @param store The target object store name.
   * @param item The record to persist.
   * @returns A promise resolving to the saved record with generated id and timestamp.
   */
  async saveItem<T extends Record<string, unknown>>(store: StoreName, item: T): Promise<T & { id: string; timestamp: number }> {
    const db = await this.openDB();
    const id = typeof item.id === "string" ? item.id : crypto.randomUUID();
    const timestamp = typeof item.timestamp === "number" ? item.timestamp : Date.now();

    let payload: Record<string, unknown> = { ...item, id, timestamp };
    if (ENCRYPTED_STORES.includes(store)) {
      const encryptedData = await encryptData(payload);
      payload = { id, timestamp, data: encryptedData, _isEncryptedWrapper: true };
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(payload);
      tx.oncomplete = () => resolve({ ...item, id, timestamp } as T & { id: string; timestamp: number }); // Return unencrypted to caller
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Retrieves all items from a store, decrypting encrypted records.
   * @param store The object store name to query.
   * @returns A promise resolving to an array of decrypted records sorted by timestamp descending.
   */
  async getItemsWithMeta<T = unknown>(store: StoreName): Promise<GetItemsResult<T>> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = async () => {
        const decoded = await decodeRows<T>(store, (req.result || []) as Record<string, unknown>[]);
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
    const tx = db.transaction(store, "readonly");
    const objectStore = tx.objectStore(store);

    if (!objectStore.indexNames.contains("timestamp")) {
      const result = await this.getItemsWithMeta<T>(store);
      return {
        ...result,
        items: result.items.slice(offset, offset + limit),
        total: result.items.length,
        offset,
        limit,
        hasMore: offset + limit < result.items.length,
      };
    }

    return new Promise((resolve, reject) => {
      const rows: Record<string, unknown>[] = [];
      const countRequest = objectStore.count();
      const cursorRequest = objectStore.index("timestamp").openCursor(null, "prev");
      let total: number | null = null;
      let cursorDone = false;
      let advanced = offset === 0;
      let settled = false;

      const finish = async () => {
        if (settled || total === null || !cursorDone) return;
        settled = true;
        try {
          const decoded = await decodeRows<T>(store, rows);
          resolve({
            ...decoded,
            total,
            offset,
            limit,
            hasMore: offset + rows.length < total,
          });
        } catch (error) {
          reject(error);
        }
      };

      countRequest.onsuccess = () => {
        total = countRequest.result;
        void finish();
      };
      countRequest.onerror = () => reject(countRequest.error);
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
        rows.push(cursor.value as Record<string, unknown>);
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Retrieves a single record by id from a store, decrypting if the record is
   * in the encrypted-stores set. Returns null when the record does not exist.
   * @param store The object store name to query.
   * @param id The unique identifier of the record.
   * @returns A promise resolving to the decrypted record or null.
   */
  async getItem<T = unknown>(store: StoreName, id: string): Promise<T | null> {
    if (typeof id !== "string" || !id) return null;
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(id);
      req.onsuccess = async () => {
        const row = req.result as Record<string, unknown> | undefined;
        if (!row) {
          resolve(null);
          return;
        }
        if (!ENCRYPTED_STORES.includes(store)) {
          resolve(row as T);
          return;
        }
        if (row._isEncryptedWrapper && row.data) {
          const decrypted = await decryptData(row.data);
          if (decrypted === null) {
            warn(`[storageService] Record "${id}" in store "${store}" could not be decrypted.`);
            resolve(null);
            return;
          }
          resolve(decrypted as T);
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
   * Deletes a single record from a store.
   * @param store The object store name.
   * @param id The unique identifier of the record to delete.
   * @returns A promise resolving to true on success.
   */
  async deleteItem(store: StoreName, id: string): Promise<boolean> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Clears all records from the specified store.
   * @param store The object store name to clear.
   * @returns A promise resolving to true on success.
   */
  async clearStore(store: StoreName): Promise<boolean> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
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
   */
  async patchMedia<T extends object>(id: string, patch: Record<string, unknown>): Promise<T> {
    if (typeof id !== "string" || !id) throw new Error("patchMedia: id is required");
    const existing = (await this.getItem("images", id)) as T | null;
    if (!existing) throw new Error(`patchMedia: record not found: ${id}`);
    const next = { ...(existing as object), ...patch, id, timestamp: (existing as { timestamp?: number }).timestamp ?? Date.now() };
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
      if (typeof id !== "string" || !id) continue;
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
      if (typeof id !== "string" || !id) continue;
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
