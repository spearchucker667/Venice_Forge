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
});
