/** @fileoverview IndexedDB at-rest encryption for chats and settings using AES-GCM. */

// Code Owner: fayeblade (@spearchucker667)
const ALGO = "AES-GCM";
const KEY_NAME = "venice-forge-key";

/** Shape of a persisted key record in the key store. */
interface KeyRecord {
  id: string;
  key: CryptoKey;
}

/** Shape of the encrypted payload wrapper produced by encryptData. */
export interface EncryptedPayload {
  _encrypted: true;
  iv: number[];
  data: number[];
}

/** Promise latch ensuring only one key-generation sequence runs at a time. */
let keyPromise: Promise<CryptoKey> | null = null;

/**
 * Retrieves an existing AES-GCM key from IndexedDB or generates a new one.
 * @returns A promise resolving to the CryptoKey.
 */
async function getOrCreateKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    const db = await openKeyDB();
    const existing = await new Promise<KeyRecord | undefined>((resolve, reject) => {
      const tx = db.transaction("keys", "readonly");
      const req = tx.objectStore("keys").get(KEY_NAME);
      req.onsuccess = () => resolve(req.result as KeyRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    if (existing) return existing.key;
    const key = await crypto.subtle.generateKey(
      { name: ALGO, length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    return new Promise<CryptoKey>((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      const putReq = tx.objectStore("keys").put({ id: KEY_NAME, key });
      putReq.onsuccess = () => resolve(key);
      putReq.onerror = () => reject(putReq.error);
    });
  })().catch((err) => {
    keyPromise = null; // Allow retry on next call
    throw err;
  });
  return keyPromise;
}

/**
 * Opens the dedicated key storage IndexedDB.
 * @returns A promise resolving to the key database.
 */
function openKeyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("venice_forge_keys", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("keys", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Encrypts a JavaScript value using AES-GCM.
 * @param data The value to encrypt.
 * @returns A promise resolving to the encrypted payload wrapper.
 */
export async function encryptData<T>(data: T): Promise<EncryptedPayload> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoded
  );

  return {
    _encrypted: true,
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  };
}

/**
 * Decrypts an AES-GCM encrypted payload back into its original value.
 * @param encryptedPayload The wrapper object produced by encryptData.
 * @returns A promise resolving to the decrypted value, or null on failure.
 */
export async function decryptData<T>(encryptedPayload: EncryptedPayload | T): Promise<T | null> {
  if (!encryptedPayload || !(encryptedPayload as EncryptedPayload)._encrypted) return encryptedPayload as T;
  try {
    const key = await getOrCreateKey();
    const payload = encryptedPayload as EncryptedPayload;
    const iv = new Uint8Array(payload.iv);
    const encrypted = new Uint8Array(payload.data);
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGO, iv },
      key,
      encrypted
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    // Redacted: do not log decryption error details in production.
    return null;
  }
}
