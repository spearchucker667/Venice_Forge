import { describe, expect, it, beforeEach } from "vitest";
// @ts-ignore — fake-indexeddb ESM exports lack proper typings
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import { encryptData, decryptData } from "./cryptoService";

beforeEach(() => {
  // @ts-ignore
  global.indexedDB = new FDBFactory();
});

describe("cryptoService", () => {
  it("roundtrips plain objects through encrypt/decrypt", async () => {
    const original = { id: "test-1", message: "hello world", nested: { a: 1 } };
    const encrypted = await encryptData(original);
    expect(encrypted).toHaveProperty("_encrypted", true);
    expect(encrypted).toHaveProperty("iv");
    expect(encrypted).toHaveProperty("data");
    const decrypted = await decryptData(encrypted);
    expect(decrypted).toEqual(original);
  });

  it("roundtrips strings", async () => {
    const original = "just a string";
    const encrypted = await encryptData(original);
    const decrypted = await decryptData(encrypted);
    expect(decrypted).toEqual(original);
  });

  it("returns non-encrypted payload unchanged from decryptData", async () => {
    const payload = { foo: "bar" };
    const result = await decryptData(payload);
    expect(result).toEqual(payload);
  });

  it("returns null for corrupted encrypted payload", async () => {
    const corrupted = { _encrypted: true, iv: [0, 1, 2], data: [3, 4, 5] };
    const result = await decryptData(corrupted);
    expect(result).toBeNull();
  });

  it("returns null for null input", async () => {
    const result = await decryptData(null);
    expect(result).toBeNull();
  });
});
