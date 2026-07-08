/** @fileoverview Manages encrypted storage of API keys using Electron
 *  safeStorage (DPAPI on Windows, Keychain on macOS, Secret Service on Linux). */

// Code Owner: fayeblade (@spearchucker667)
import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

/** Name of the JSON file used for secure preferences storage. */
const STORE_FILE = "secure-prefs.json";

/** Whether plaintext fallback is permitted when OS encryption is unavailable. */
function isPlaintextFallbackAllowed(): boolean {
  return process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE === "true";
}

/** Describes the current secure storage mode. */
export type SecureStorageMode = "encrypted" | "unavailable" | "plaintext-fallback";

/** Per-key error map keyed by preference name. The status reporter reads from
 *  this directly instead of relying on a shared mutable `lastReadError`, which
 *  was racy when both API keys were read concurrently (the Jina getter would
 *  overwrite the Venice getter's diagnostic, or vice versa). */
const lastReadErrors: Record<string, string | null> = {
  apiKey: null,
  jinaApiKey: null,
};

/** In-memory cache to prevent blocking main-process disk I/O on repeated reads. */
let memoryCache: Record<string, string> | null = null;

/** Exposed strictly for test isolation. */
export function __clearCacheForTests(): void {
  memoryCache = null;
}

/** Returns the absolute path to the secure preferences file. */
function getStorePath(): string {
  return path.join(app.getPath("userData"), STORE_FILE);
}

/** Reads and parses the secure preferences file.
 *  @returns A record of string key-value pairs.
 */
function readStore(prefKey: keyof typeof lastReadErrors): Record<string, string> {
  if (memoryCache !== null) {
    return memoryCache;
  }
  try {
    const raw = fs.readFileSync(getStorePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      lastReadErrors[prefKey] = "Secure preferences file does not contain an object.";
      return {};
    }
    lastReadErrors[prefKey] = null;
    memoryCache = parsed as Record<string, string>;
    return memoryCache;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      lastReadErrors[prefKey] = null;
    } else {
      lastReadErrors[prefKey] = "Secure preferences file is corrupted or unreadable.";
    }
    return {};
  }
}

/** Persists the secure preferences object to disk with restricted permissions.
 *  @param data The key-value record to write.
 */
function writeStore(data: Record<string, string>): void {
  const storePath = getStorePath();
  const tempPath = `${storePath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), {
      encoding: "utf-8",
      // Restrict file to owner read/write only on POSIX systems.
      // Ignored on Windows (which uses ACLs via NTFS / DPAPI instead).
      mode: 0o600,
    });
    fs.renameSync(tempPath, storePath);
    memoryCache = { ...data };
  } catch (err) {
    try { fs.unlinkSync(tempPath); } catch { /* ignore cleanup errors */ }
    throw err;
  }
}

/** Encrypts and stores the Venice API key using OS-level encryption when possible.
 *  @param key The API key to store.
 */
export function setApiKey(key: string, profileId: string = "default"): void {
  const store = readStore("apiKey");
  const k = profileId === "default" ? "apiKey" : `apiKey_${profileId}`;
  const ke = profileId === "default" ? "apiKeyEncrypted" : `apiKeyEncrypted_${profileId}`;
  if (safeStorage.isEncryptionAvailable()) {
    store[k] = safeStorage.encryptString(key).toString("base64");
    store[ke] = "true";
  } else {
    if (process.platform === "win32" || process.platform === "darwin") {
      throw new Error(
        `${process.platform === "win32" ? "Windows" : "macOS"} secure storage is unavailable. Venice Forge will not store the API key without OS encryption.`
      );
    }
    if (!isPlaintextFallbackAllowed()) {
      throw new Error(
        "OS secure storage is unavailable. Set VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true to allow documented plaintext fallback (Linux-only, emits security warning)."
      );
    }
    // Linux plaintext fallback — log a clear security warning (never on Win/mac).
    // Per AGENTS.md and review: this is a last-resort Linux-only escape hatch.
    console.warn("[SECURITY] Using plaintext API key storage because OS secure storage (safeStorage) is unavailable. This is Linux-only and should only be used in trusted environments.");
    store[k] = key;
    store[ke] = "false";
  }
  writeStore(store);
}

/** Retrieves and decrypts the stored Venice API key, if available.
 *  @returns The decrypted key, or null if missing or corrupted.
 */
export function getApiKey(profileId: string = "default"): string | null {
  const store = readStore("apiKey");
  const k = profileId === "default" ? "apiKey" : `apiKey_${profileId}`;
  const ke = profileId === "default" ? "apiKeyEncrypted" : `apiKeyEncrypted_${profileId}`;
  const raw = store[k];
  if (typeof raw !== "string" || raw.length === 0) return null;

  const encryptedFlag = store[ke] as unknown;
  const isEncrypted = encryptedFlag === "true" || encryptedFlag === true;

  if (isEncrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    } catch {
      lastReadErrors.apiKey =
        "Failed to decrypt API key. The stored data may be corrupted or the OS credential changed.";
      return null;
    }
  }

  // Reject plaintext unconditionally on Windows and macOS.
  if (process.platform === "win32" || process.platform === "darwin") {
    lastReadErrors.apiKey = "Plaintext API key storage is not allowed on this platform.";
    return null;
  }

  if (!isPlaintextFallbackAllowed()) {
    lastReadErrors.apiKey =
      "Plaintext API key storage is disabled. Re-save credentials so they are written to OS secure storage, or explicitly set VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true for Linux fallback.";
    return null;
  }

  if (process.platform === "linux") {
    console.warn("[SECURITY] Returning plaintext-stored API key (Linux fallback only).");
  }

  return raw;
}

/** Removes the stored Venice API key from secure preferences. */
export function deleteApiKey(profileId: string = "default"): void {
  const store = readStore("apiKey");
  const k = profileId === "default" ? "apiKey" : `apiKey_${profileId}`;
  const ke = profileId === "default" ? "apiKeyEncrypted" : `apiKeyEncrypted_${profileId}`;
  delete store[k];
  delete store[ke];
  writeStore(store);
}

// ── Jina API key storage (same safeStorage policy) ──

/** Encrypts and stores the Jina API key using OS-level encryption when possible.
 *  @param key The Jina API key to store.
 */
export function setJinaApiKey(key: string, profileId: string = "default"): void {
  const store = readStore("jinaApiKey");
  const k = profileId === "default" ? "jinaApiKey" : `jinaApiKey_${profileId}`;
  const ke = profileId === "default" ? "jinaApiKeyEncrypted" : `jinaApiKeyEncrypted_${profileId}`;
  if (safeStorage.isEncryptionAvailable()) {
    store[k] = safeStorage.encryptString(key).toString("base64");
    store[ke] = "true";
  } else {
    if (process.platform === "win32" || process.platform === "darwin") {
      throw new Error(
        `${process.platform === "win32" ? "Windows" : "macOS"} secure storage is unavailable. Venice Forge will not store the API key without OS encryption.`
      );
    }
    if (!isPlaintextFallbackAllowed()) {
      throw new Error(
        "OS secure storage is unavailable. Set VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true to allow documented plaintext fallback."
      );
    }
    store[k] = key;
    store[ke] = "false";
  }
  writeStore(store);
}

/** Retrieves and decrypts the stored Jina API key, if available.
 *  @returns The decrypted key, or null if missing or corrupted.
 */
export function getJinaApiKey(profileId: string = "default"): string | null {
  const store = readStore("jinaApiKey");
  const k = profileId === "default" ? "jinaApiKey" : `jinaApiKey_${profileId}`;
  const ke = profileId === "default" ? "jinaApiKeyEncrypted" : `jinaApiKeyEncrypted_${profileId}`;
  const raw = store[k];
  if (typeof raw !== "string" || raw.length === 0) return null;

  const encryptedFlag = store[ke] as unknown;
  const isEncrypted = encryptedFlag === "true" || encryptedFlag === true;

  if (isEncrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    } catch {
      lastReadErrors.jinaApiKey = "Failed to decrypt Jina API key. The stored data may be corrupted or the OS credential changed.";
      return null;
    }
  }

  if (process.platform === "win32" || process.platform === "darwin") {
    lastReadErrors.jinaApiKey = "Plaintext Jina API key storage is not allowed on this platform.";
    return null;
  }

  if (!isPlaintextFallbackAllowed()) {
    lastReadErrors.jinaApiKey =
      "Plaintext Jina API key storage is disabled. Re-save credentials so they are written to OS secure storage, or explicitly set VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true for Linux fallback.";
    return null;
  }

  return raw;
}

/** Removes the stored Jina API key from secure preferences. */
export function deleteJinaApiKey(profileId: string = "default"): void {
  const store = readStore("jinaApiKey");
  const k = profileId === "default" ? "jinaApiKey" : `jinaApiKey_${profileId}`;
  const ke = profileId === "default" ? "jinaApiKeyEncrypted" : `jinaApiKeyEncrypted_${profileId}`;
  delete store[k];
  delete store[ke];
  writeStore(store);
}

/** Checks whether a usable Jina API key is currently stored. */
export function isJinaApiKeyConfigured(profileId: string = "default"): boolean {
  return getJinaApiKey(profileId) !== null;
}

/** Checks whether a usable Venice API key is currently stored. */
export function isApiKeyConfigured(profileId: string = "default"): boolean {
  // Must test actual decryptability, not just raw byte presence.
  // A corrupted or DPAPI-unreadable blob would pass the raw check but fail here.
  return getApiKey(profileId) !== null;
}

/** Checks whether OS-level encryption is available on this platform. */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/** Determines the active secure storage mode based on platform and availability.
 *  @returns The current storage mode identifier.
 */
export function getStorageMode(): SecureStorageMode {
  if (safeStorage.isEncryptionAvailable()) return "encrypted";
  if (process.platform !== "win32" && process.platform !== "darwin" && isPlaintextFallbackAllowed()) return "plaintext-fallback";
  return "unavailable";
}

/** Returns the current status of the secure store, including any corruption errors.
 *  @returns A status object describing mode, availability, and errors.
 */
export function getSecureStoreStatus(): {
  mode: SecureStorageMode;
  encryptionAvailable: boolean;
  corrupted: boolean;
  error: string | null;
} {
  getApiKey();
  const apiKeyError = lastReadErrors.apiKey;

  getJinaApiKey();
  const jinaKeyError = lastReadErrors.jinaApiKey;

  const error = apiKeyError || jinaKeyError;

  return {
    mode: getStorageMode(),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    corrupted: !!error,
    error,
  };
}


// ── Generic Credential Storage (Master Password, Profile Secrets) ──
// Master password and any other "generic credential" follows the same
// fail-closed contract as the Venice / Jina API key slot: on platforms
// where OS encryption is unavailable (Linux without a Secret Service,
// or any future unencrypted path) we MUST obtain an explicit
// VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true opt-in before writing
// or reading plaintext. Otherwise the credential is unreachable.
//
// Strict plaintext-no-go exception:
//   Credential names in `STRICT_NO_PLAINTEXT_CREDENTIAL_NAMES` (master
//   password + any generic "password" record) NEVER honour the Linux
//   plaintext escape hatch. They fail closed on every OS — even when
//   `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` is set. This was
//   added per release-blocker #7 so a stolen credentials file cannot
//   surface a usable password verifier on a Linux box.

/** Credential names that are never allowed to fall back to plaintext on any OS.
 *  The set is the canonical whitelist; the pattern allowlist covers every
 *  profile-namespaced password variant (RELEASE-BLOCKER #5). */
const STRICT_NO_PLAINTEXT_CREDENTIAL_NAMES: ReadonlySet<string> = new Set([
  "password",
  "master_password",
  "profile_password",
]);

/** Pattern allowlist for credential names that must refuse plaintext under any
 *  escape hatch. Covers:
 *    - profile_password, profile_password:abc, profile_password_abc
 *    - any name ending in _password (used for auth/unlock credentials)
 *  The Linux plaintext-fallback opt-in NEVER enables these. */
const STRICT_NO_PLAINTEXT_CREDENTIAL_PATTERN: readonly RegExp[] = [
  /^profile_password(?:[:_].+)?$/i,
  /_password$/i,
];

/** Returns true when the named credential must never be stored or read as
 *  plaintext, regardless of OS, env opt-in, or platform. */
function isStrictNoPlaintextCredential(name: string): boolean {
  if (typeof name !== "string" || name.length === 0) return false;
  if (STRICT_NO_PLAINTEXT_CREDENTIAL_NAMES.has(name)) return true;
  for (const pattern of STRICT_NO_PLAINTEXT_CREDENTIAL_PATTERN) {
    if (pattern.test(name)) return true;
  }
  return false;
}

/** Encrypts and stores a generic credential. */
export function setCredential(key: string, value: string): void {
  const store = readStore("apiKey"); // We use apiKey's error slot for generic creds for now, or don't report
  const k = `cred_${key}`;
  const ke = `credEncrypted_${key}`;

  if (safeStorage.isEncryptionAvailable()) {
    store[k] = safeStorage.encryptString(value).toString("base64");
    store[ke] = "true";
  } else {
    // Release-blocker #7: master_password / password must NEVER be written in
    // plaintext under any escape hatch. Surface the canonical refuse-the-
    // plaintext message BEFORE the platform/window branch so the same error
    // text is returned on Linux, macOS, and Windows for password credentials.
    if (isStrictNoPlaintextCredential(key)) {
      throw new Error(
        `Credential "${key}" requires OS-level encryption and is configured to refuse the plaintext fallback. Set up credentials on a host where Electron safeStorage encryption is available (DPAPI on Windows, Keychain on macOS, Secret Service on Linux).`,
      );
    }
    if (process.platform === "win32" || process.platform === "darwin") {
      throw new Error("Native credential storage unavailable.");
    }
    if (!isPlaintextFallbackAllowed()) {
      throw new Error(
        "OS secure storage is unavailable. Set VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true to allow documented plaintext fallback (Linux-only, emits security warning).",
      );
    }
    console.warn(
      `[SECURITY] Using plaintext storage for credential "${key}" because OS secure storage (safeStorage) is unavailable. Linux-only escape hatch — do not enable on untrusted machines.`,
    );
    store[k] = value;
    store[ke] = "false";
  }
  writeStore(store);
}

/** Retrieves and decrypts a generic credential. */
export function getCredential(key: string): string | null {
  const store = readStore("apiKey");
  const k = `cred_${key}`;
  const ke = `credEncrypted_${key}`;
  const raw = store[k];
  if (typeof raw !== "string" || raw.length === 0) return null;

  const encryptedFlag = store[ke] as unknown;
  const isEncrypted = encryptedFlag === "true" || encryptedFlag === true;

  if (isEncrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    } catch {
      return null;
    }
  }

  if (process.platform === "win32" || process.platform === "darwin") {
    return null;
  }
  // Release-blocker #7: master_password / password plaintext reads are
  // forbidden on any OS — even with the Linux plaintext-fallback opt-in
  // set. Return null so the caller is forced to re-enter / re-setup the
  // password through the standard encrypted path. This keeps a stolen
  // credentials file from leaking a usable password on Linux.
  if (isStrictNoPlaintextCredential(key)) {
    return null;
  }
  // Even on Linux, plaintext credential reads require the same explicit
  // opt-in as writes — never silently expose a plaintext blob.
  if (!isPlaintextFallbackAllowed()) {
    return null;
  }
  return raw;
}

/** Deletes a generic credential. */
export function deleteCredential(key: string): void {
  const store = readStore("apiKey");
  const k = `cred_${key}`;
  const ke = `credEncrypted_${key}`;
  delete store[k];
  delete store[ke];
  writeStore(store);
}

// ── Profile Password (RELEASE-BLOCKER #4 / #5) ──
//
// Profile passwords are treated as a strict, fail-closed credential: they
// NEVER admit the Linux plaintext-fallback escape hatch. The credential is
// always written/read via the encrypted-safeStorage path and is namespaced
// per profile id so two profiles can have independent passwords.
//
// The full setup/unlock UI is intentionally NOT wired into a renderer flow
// in this release. The secureStore entry points below are the audit-level
// minimum the release-blocker asks for: every existing `setCredential("profile_password*", …)`
// call site is funneled through `setProfilePassword` which fails closed on
// every OS. The verifier-on-disk format is a JSON PBKDF2-SHA256 record with
// a per-profile random salt. Web Crypto parity is not available in the
// Electron main process at this layer; Node `crypto` keeps verification
// deterministic and self-contained.
//
// Renderer callers should NOT use `setCredential("profile_password", …)`
// directly. Use `setProfilePassword`, `verifyProfilePassword`,
// `isProfilePasswordSet`, `clearProfilePassword` via the IPC bridge.

import crypto from "crypto";

const PROFILE_PASSWORD_VERIFIER_VERSION = 1;
const PROFILE_PASSWORD_ALGORITHM = "pbkdf2-sha256";
const PROFILE_PASSWORD_ITERATIONS = 310_000;
const PROFILE_PASSWORD_SALT_BYTES = 16;
const PROFILE_PASSWORD_DIGEST_BYTES = 32;

interface ProfilePasswordVerifierRecord {
  version: 1;
  algorithm: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  digest: string;
}

/** Canonical credential name for the active profile's password. */
export function getProfilePasswordName(profileId: string): string {
  if (typeof profileId !== "string" || profileId.length === 0) return "profile_password";
  return `profile_password:${profileId}`;
}

/** Returns true if any form of profile password is currently configured. */
export function isAnyProfilePasswordConfigured(): boolean {
  const store = readStore("apiKey");
  for (const key of Object.keys(store)) {
    if (key.startsWith("cred_profile_password")) return true;
  }
  return false;
}

function buildProfilePasswordVerifier(plaintext: string): ProfilePasswordVerifierRecord {
  const salt = crypto.randomBytes(PROFILE_PASSWORD_SALT_BYTES);
  const digest = crypto.pbkdf2Sync(
    plaintext,
    salt,
    PROFILE_PASSWORD_ITERATIONS,
    PROFILE_PASSWORD_DIGEST_BYTES,
    "sha256",
  );
  return {
    version: PROFILE_PASSWORD_VERIFIER_VERSION,
    algorithm: PROFILE_PASSWORD_ALGORITHM,
    iterations: PROFILE_PASSWORD_ITERATIONS,
    salt: salt.toString("base64"),
    digest: digest.toString("base64"),
  };
}

function parseProfilePasswordVerifier(raw: string): ProfilePasswordVerifierRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Partial<ProfilePasswordVerifierRecord>;
  if (
    record.version !== PROFILE_PASSWORD_VERIFIER_VERSION ||
    record.algorithm !== PROFILE_PASSWORD_ALGORITHM ||
    record.iterations !== PROFILE_PASSWORD_ITERATIONS ||
    typeof record.salt !== "string" ||
    typeof record.digest !== "string"
  ) {
    return null;
  }
  const salt = Buffer.from(record.salt, "base64");
  const digest = Buffer.from(record.digest, "base64");
  if (salt.length !== PROFILE_PASSWORD_SALT_BYTES || digest.length !== PROFILE_PASSWORD_DIGEST_BYTES) return null;
  return record as ProfilePasswordVerifierRecord;
}

/** Sets the given plaintext password for the active profile. The plaintext is
 *  NEVER written to disk — only the salted PBKDF2 verifier record is stored. */
export function setProfilePassword(plaintext: string, profileId: string): void {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Profile password must be a non-empty string.");
  }
  const verifier = JSON.stringify(buildProfilePasswordVerifier(plaintext));
  // setCredential stores via the safeStorage encrypted path on every OS;
  // isStrictNoPlaintextCredential refuses plaintext for `profile_password*`.
  setCredential(getProfilePasswordName(profileId), verifier);
}

/** Returns true if the supplied plaintext matches the on-disk verifier. */
export function verifyProfilePassword(plaintext: string, profileId: string): boolean {
  if (typeof plaintext !== "string" || plaintext.length === 0) return false;
  const raw = getCredential(getProfilePasswordName(profileId));
  if (typeof raw !== "string" || raw.length === 0) return false;
  const expected = parseProfilePasswordVerifier(raw);
  if (!expected) return false;
  const salt = Buffer.from(expected.salt, "base64");
  const expectedDigest = Buffer.from(expected.digest, "base64");
  const candidate = crypto.pbkdf2Sync(
    plaintext,
    salt,
    expected.iterations,
    expectedDigest.length,
    "sha256",
  );
  if (candidate.length !== expectedDigest.length) return false;
  return crypto.timingSafeEqual(candidate, expectedDigest);
}

/** Returns true if the active profile has a stored password. */
export function isProfilePasswordSet(profileId: string): boolean {
  const raw = getCredential(getProfilePasswordName(profileId));
  return typeof raw === "string" && parseProfilePasswordVerifier(raw) !== null;
}

/** Removes the active profile's password. */
export function clearProfilePassword(profileId: string): void {
  deleteCredential(getProfilePasswordName(profileId));
}
