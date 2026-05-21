// Code Owner: fayeblade (@spearchucker667)
/**
 * SecureStore: Stores the Venice API key encrypted using Electron's safeStorage
 * (DPAPI on Windows, Keychain on macOS, Secret Service on Linux).
 * On Windows, safeStorage is required. Plaintext fallback is allowed only on
 * non-Windows platforms when VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true.
 *
 * The key is NEVER exposed to the renderer process.
 */
import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

const STORE_FILE = "secure-prefs.json";
const ALLOW_PLAINTEXT_FALLBACK =
  process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE === "true";

export type SecureStorageMode = "encrypted" | "unavailable" | "plaintext-fallback";

let lastReadError: string | null = null;

function getStorePath(): string {
  return path.join(app.getPath("userData"), STORE_FILE);
}

function readStore(): Record<string, string> {
  try {
    const raw = fs.readFileSync(getStorePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      lastReadError = "Secure preferences file does not contain an object.";
      return {};
    }
    lastReadError = null;
    return parsed as Record<string, string>;
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      lastReadError = null;
    } else {
      lastReadError = "Secure preferences file is corrupted or unreadable.";
    }
    return {};
  }
}

function writeStore(data: Record<string, string>): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    // Restrict file to owner read/write only on POSIX systems.
    // Ignored on Windows (which uses ACLs via NTFS / DPAPI instead).
    mode: 0o600,
  });
}

export function setApiKey(key: string): void {
  const store = readStore();
  if (safeStorage.isEncryptionAvailable()) {
    store["apiKey"] = safeStorage.encryptString(key).toString("base64");
    store["apiKeyEncrypted"] = "true";
  } else {
    if (process.platform === "win32") {
      throw new Error(
        "Windows secure storage is unavailable. Venice Forge will not store the API key without OS encryption."
      );
    }
    if (!ALLOW_PLAINTEXT_FALLBACK) {
      throw new Error(
        "OS secure storage is unavailable. Set VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true to allow documented non-Windows plaintext fallback."
      );
    }
    store["apiKey"] = key;
    store["apiKeyEncrypted"] = "false";
  }
  writeStore(store);
}

export function getApiKey(): string | null {
  const store = readStore();
  const raw = store["apiKey"];
  if (!raw) return null;

  if (store["apiKeyEncrypted"] === "true") {
    try {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    } catch {
      lastReadError =
        "Failed to decrypt API key. The stored data may be corrupted or the OS credential changed.";
      return null;
    }
  }
  return raw;
}

export function deleteApiKey(): void {
  const store = readStore();
  delete store["apiKey"];
  delete store["apiKeyEncrypted"];
  writeStore(store);
}

export function isApiKeyConfigured(): boolean {
  // Must test actual decryptability, not just raw byte presence.
  // A corrupted or DPAPI-unreadable blob would pass the raw check but fail here.
  return getApiKey() !== null;
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function getStorageMode(): SecureStorageMode {
  if (safeStorage.isEncryptionAvailable()) return "encrypted";
  if (process.platform !== "win32" && ALLOW_PLAINTEXT_FALLBACK) return "plaintext-fallback";
  return "unavailable";
}

export function getSecureStoreStatus(): {
  mode: SecureStorageMode;
  encryptionAvailable: boolean;
  corrupted: boolean;
  error: string | null;
} {
  // Calling getApiKey() runs readStore() + decryption, capturing both
  // file-read errors (via lastReadError reset) and DPAPI decrypt errors.
  getApiKey();
  return {
    mode: getStorageMode(),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    corrupted: !!lastReadError,
    error: lastReadError,
  };
}
