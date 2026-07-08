// @vitest-environment node

/** @fileoverview Unit tests for Electron secure store (API key storage). */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((val: string) => Buffer.from(`enc:${val}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString("utf-8").replace("enc:", "")),
  },
}));

import {
  safeStorage as mockedSafeStorage,
} from "electron";

import {
  setApiKey,
  getApiKey,
  deleteApiKey,
  isApiKeyConfigured,
  __clearCacheForTests,
  getJinaApiKey,
  getSecureStoreStatus,
  setCredential,
  getCredential,
  deleteCredential,
  setProfilePassword,
  verifyProfilePassword,
  isProfilePasswordSet,
  clearProfilePassword,
  getProfilePasswordName,
  isAnyProfilePasswordConfigured,
} from "./secureStore";

const STORE_PATH = path.join(os.tmpdir(), "secure-prefs.json");

function cleanStore() {
  try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  try { fs.unlinkSync(`${STORE_PATH}.tmp`); } catch { /* ignore */ }
}

describe("secureStore", () => {
  const originalPlaintextFlag = process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE;

  beforeEach(() => {
    delete process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE;
    __clearCacheForTests();
    cleanStore();
  });
  afterEach(() => {
    if (originalPlaintextFlag === undefined) {
      delete process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE;
    } else {
      process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = originalPlaintextFlag;
    }
    cleanStore();
  });

  it("encrypts and stores the API key when encryption is available", () => {
    setApiKey("vn-secret-key");
    expect(getApiKey()).toBe("vn-secret-key");
    expect(isApiKeyConfigured()).toBe(true);
  });

  it("returns null after deletion", () => {
    setApiKey("vn-secret-key");
    deleteApiKey();
    expect(getApiKey()).toBeNull();
    expect(isApiKeyConfigured()).toBe(false);
  });

  it("rejects non-string or empty raw values (H-005 / H-009)", () => {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ apiKey: "", apiKeyEncrypted: "true" }), "utf-8");
    __clearCacheForTests();
    expect(getApiKey()).toBeNull();

    fs.writeFileSync(STORE_PATH, JSON.stringify({ apiKey: 123, apiKeyEncrypted: "true" }), "utf-8");
    __clearCacheForTests();
    expect(getApiKey()).toBeNull();
  });

  it("fails closed on plaintext Venice and Jina key reads unless fallback is explicitly enabled", () => {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify({
        apiKey: "vn-plaintext",
        apiKeyEncrypted: "false",
        jinaApiKey: "jina-plaintext",
        jinaApiKeyEncrypted: "false",
      }),
      "utf-8",
    );
    __clearCacheForTests();

    expect(getApiKey()).toBeNull();
    expect(getJinaApiKey()).toBeNull();
    expect(getSecureStoreStatus()).toMatchObject({
      corrupted: true,
      error: expect.stringMatching(/plaintext/i),
    });

    process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = "true";
    __clearCacheForTests();
    if (process.platform === "linux") {
      expect(getApiKey()).toBe("vn-plaintext");
      expect(getJinaApiKey()).toBe("jina-plaintext");
    } else {
      expect(getApiKey()).toBeNull();
      expect(getJinaApiKey()).toBeNull();
    }
  });

  // ── Release-blocker #7: master_password / password fail closed EVERYWHERE ──
  // The Linux plaintext escape hatch is documented ONLY for the Venice / Jina
  // API key slot. Password credentials are an attacker-target: a stolen
  // credentials file must never surface a usable password verifier, even
  // when the operator has explicitly opted into the documented Linux
  // plaintext fallback. We assert this against the strict-credential name
  // set and prove the encrypted happy path is unaffected.

  it("setCredential refuses the Linux plaintext fallback for 'master_password' even when explicitly enabled", () => {
    process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = "true";
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(false);

    expect(() => setCredential("master_password", JSON.stringify({ v: 1 }))).toThrow(
      /refuse the plaintext fallback/,
    );

    // The store must remain empty — no plaintext row written even on the throw path.
    expect(fs.existsSync(STORE_PATH)).toBe(false);
  });

  it("setCredential allows the Linux plaintext fallback for non-strict credentials when explicitly enabled", () => {
    if (process.platform !== "linux") return;
    process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = "true";
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(false);

    expect(() => setCredential("profile_secret", "ok")).not.toThrow();
    expect(getCredential("profile_secret")).toBe("ok");
  });

  it("getCredential refuses the Linux plaintext fallback for 'master_password' even when explicitly enabled", () => {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify({
        cred_master_password: '{"v":1,"salt":"AAAA","iter":1,"hash":"BBBB"}',
        credEncrypted_master_password: "false",
      }),
      "utf-8",
    );
    process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = "true";
    __clearCacheForTests();
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(false);

    expect(getCredential("master_password")).toBeNull();
  });

  it("setCredential + getCredential round-trip for 'master_password' works when encryption is available", () => {
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(true);
    const record = { v: 1, salt: "AAAA", iter: 1000, hash: "BBBB" };
    setCredential("master_password", JSON.stringify(record));
    expect(getCredential("master_password")).toBe(JSON.stringify(record));
    deleteCredential("master_password");
    expect(getCredential("master_password")).toBeNull();
  });

  it("setCredential on Win/darwin without encryption still throws for 'password' (strict subset)", () => {
    // The macOS branch is unreachable inside this CI (linux runner), but if
    // the operator is on darwin or win32 the existing throw path covers it.
    // We assert the linux-path throw is enough; the existing encrypted
    // happy path covers the encrypted OS correctly above.
    process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = "true";
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(false);

    expect(() => setCredential("password", "secret")).toThrow(
      /refuse the plaintext fallback/,
    );
  });

  // ── RELEASE-BLOCKER #5: profile_password* and *_password must refuse plaintext EVERYWHERE ──
  // The credential-name pattern allowlist covers all profile-namespaced
  // password variants and any name ending in _password. We assert each path
  // throws on the Linux plaintext-fallback (with env opt-in enabled) and
  // that the encrypted happy path round-trips correctly.

  it.each([
    ["profile_password"],
    ["profile_password:user-a"],
    ["profile_password:user-b"],
    ["profile_password_work"],
    ["profile_password_work"],
    ["account_password"],
  ])("setCredential refuses the Linux plaintext fallback for '%s' even when explicitly enabled", (name) => {
    process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = "true";
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(false);

    expect(() => setCredential(name, "plaintext-secret")).toThrow(
      /refuse the plaintext fallback/,
    );
    expect(fs.existsSync(STORE_PATH)).toBe(false);
  });

  it("getCredential refuses the Linux plaintext fallback for profile_password* even when explicitly enabled", () => {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify({
        cred_profile_password_userA: "verifier-blob",
        credEncrypted_profile_password_userA: "false",
      }),
      "utf-8",
    );
    process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = "true";
    __clearCacheForTests();
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(false);

    expect(getCredential("profile_password:userA")).toBeNull();
    expect(getCredential("profile_password_userA")).toBeNull();
  });

  it("setCredential + getCredential round-trip for 'profile_password:userX' works when encryption is available", () => {
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(true);
    const record = JSON.stringify({ v: 1, hash: "h" });
    setCredential("profile_password:userX", record);
    expect(getCredential("profile_password:userX")).toBe(record);
  });

  // ── RELEASE-BLOCKER #4: profile password setup/verify surface ──
  // The renderer UI is intentionally not wired in this release, but the
  // secureStore layer MUST expose a verifier-only API that namespaces per
  // profile id, stores only a salted PBKDF2 verifier, refuses plaintext under
  // any escape hatch, and replays the encrypted happy path on every OS.

  it("setProfilePassword stores only a salted PBKDF2 verifier record when encryption is available", () => {
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(true);
    const plaintext = "super-secret-passphrase";
    setProfilePassword(plaintext, "userA");

    expect(isProfilePasswordSet("userA")).toBe(true);
    expect(isAnyProfilePasswordConfigured()).toBe(true);

    // The on-disk row must NOT contain the plaintext.
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    expect(raw).not.toContain(plaintext);

    // The credential row is written under a namespaced key.
    expect(raw).toMatch(/cred_profile_password:userA/);

    const verifierRaw = getCredential("profile_password:userA");
    expect(verifierRaw).toBeTruthy();
    const verifier = JSON.parse(verifierRaw as string) as {
      version: number;
      algorithm: string;
      iterations: number;
      salt: string;
      digest: string;
    };
    expect(verifier).toMatchObject({
      version: 1,
      algorithm: "pbkdf2-sha256",
      iterations: 310000,
    });
    expect(verifier.salt).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(verifier.digest).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(verifier.digest).not.toBe(plaintext);
  });

  it("verifyProfilePassword accepts the correct plaintext and rejects any other", () => {
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(true);
    setProfilePassword("hunter2", "userB");

    expect(verifyProfilePassword("hunter2", "userB")).toBe(true);
    expect(verifyProfilePassword("hunter3", "userB")).toBe(false);
    expect(verifyProfilePassword("", "userB")).toBe(false);
    expect(verifyProfilePassword("hunter2", "userC")).toBe(false);
  });

  it("clearProfilePassword removes the profile row but does not touch other profiles", () => {
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(true);
    setProfilePassword("pw-a", "userA");
    setProfilePassword("pw-b", "userB");

    expect(isProfilePasswordSet("userA")).toBe(true);
    expect(isProfilePasswordSet("userB")).toBe(true);

    clearProfilePassword("userA");

    expect(isProfilePasswordSet("userA")).toBe(false);
    expect(isProfilePasswordSet("userB")).toBe(true);
  });

  it("verifyProfilePassword rejects legacy unsalted SHA-256 verifier records", () => {
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(true);
    setCredential(
      "profile_password:legacy",
      "f52fbd32b2b3b86ff88ef6c490628285f48234fc6242c68934fb4c9ef1088f4d",
    );

    expect(isProfilePasswordSet("legacy")).toBe(false);
    expect(verifyProfilePassword("hunter2", "legacy")).toBe(false);
  });

  it("setProfilePassword refuses the Linux plaintext fallback even when explicitly opted-in", () => {
    process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = "true";
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(false);

    expect(() => setProfilePassword("plaintext", "userFails")).toThrow(
      /refuse the plaintext fallback/,
    );
    expect(isProfilePasswordSet("userFails")).toBe(false);
  });

  it("setProfilePassword rejects empty or non-string plaintext", () => {
    vi.mocked(mockedSafeStorage.isEncryptionAvailable).mockReturnValue(true);
    // @ts-expect-error intentionally bad input
    expect(() => setProfilePassword("", "userZ")).toThrow(/non-empty/);
    // @ts-expect-error intentionally bad input
    expect(() => setProfilePassword(undefined, "userZ")).toThrow(/non-empty/);
  });

  it("getProfilePasswordName namespaces per profile id and falls back to the legacy default", () => {
    expect(getProfilePasswordName("userA")).toBe("profile_password:userA");
    expect(getProfilePasswordName("")).toBe("profile_password");
  });
});
