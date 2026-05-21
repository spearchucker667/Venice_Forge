// Code Owner: fayeblade (@spearchucker667)
// IndexedDB at-rest encryption for chats and settings.
const ALGO = "AES-GCM";
const KEY_NAME = "venice-forge-key";

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openKeyDB();
  const existing = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction("keys", "readonly");
    const req = tx.objectStore("keys").get(KEY_NAME);
    req.onsuccess = () => resolve(req.result);
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
}

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

function ab2str(buf: ArrayBuffer): string {
  return String.fromCharCode.apply(null, Array.from(new Uint16Array(buf)));
}

function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length * 2);
  const bufView = new Uint16Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

export async function encryptData(data: any): Promise<any> {
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

export async function decryptData(encryptedPayload: any): Promise<any> {
  if (!encryptedPayload || !encryptedPayload._encrypted) return encryptedPayload;
  try {
    const key = await getOrCreateKey();
    const iv = new Uint8Array(encryptedPayload.iv);
    const encrypted = new Uint8Array(encryptedPayload.data);
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
