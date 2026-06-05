/** @fileoverview IndexedDB storage service with transparent at-rest encryption for sensitive stores. */

import { DB_NAME, DB_VERSION, STORE_NAMES } from "../constants/venice";
import { warn } from "../shared/logger";
import { encryptData, decryptData } from "./cryptoService";

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
];

export interface GetItemsResult<T = unknown> {
  items: T[];
  decryptFailures: number;
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
      request.onupgradeneeded = () => {
        const db = request.result;
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
        let results = req.result || [];
        let decryptFailures = 0;
        if (ENCRYPTED_STORES.includes(store)) {
          const decrypted = await Promise.all(
            results.map(async (row: Record<string, unknown>) => {
               if (row._isEncryptedWrapper) {
                  const val = await decryptData(row.data);
                  return val === null ? null : val;
               }
               return await decryptData(row);
            })
          );
          // BUG-001: surface silent decrypt failures so the user is aware data
          // could not be read (e.g. after key-store loss, data corruption, or browser/profile reset).
          decryptFailures = decrypted.filter((v) => !v).length;
          if (decryptFailures > 0) {
            warn(
              `[storageService] ${decryptFailures} record(s) in "${store}" could not be decrypted and were skipped. ` +
              "This may indicate key-store loss, data corruption, or a browser/profile reset. The records are still persisted in IndexedDB."
            );
          }
          results = decrypted.filter(Boolean);
        }
        const sorted = results.sort((a: { timestamp?: number }, b: { timestamp?: number }) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve({ items: sorted as T[], decryptFailures });
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getItems<T = unknown>(store: StoreName): Promise<T[]> {
    const { items } = await this.getItemsWithMeta<T>(store);
    return items;
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
        if (row._isEncryptedWrapper) {
          const decrypted = await decryptData(row.data);
          if (decrypted === null) {
            warn(`[storageService] Record "${id}" in store "${store}" could not be decrypted.`);
            resolve(null);
            return;
          }
          resolve(decrypted as T);
          return;
        }
        const decrypted = await decryptData(row);
        resolve(decrypted as T | null);
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
};

export default StorageService;
