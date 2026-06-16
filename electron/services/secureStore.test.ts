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
  setApiKey,
  getApiKey,
  deleteApiKey,
  isApiKeyConfigured,
  __clearCacheForTests,
  getJinaApiKey,
  getSecureStoreStatus,
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
});
