// @vitest-environment node
import { describe, it, expect } from "vitest";
import { encryptPayload, decryptPayload } from "./backupCrypto";

describe("backupCrypto", () => {
  it("should encrypt and decrypt a payload correctly", async () => {
    const payload = JSON.stringify({ test: "data", secret: "value" });
    const password = "super-secret-password-123!";

    const encrypted = await encryptPayload(payload, password);
    expect(encrypted).toHaveProperty("salt");
    expect(encrypted).toHaveProperty("iv");
    expect(encrypted).toHaveProperty("ciphertext");

    const decrypted = await decryptPayload(
      encrypted.ciphertext,
      encrypted.salt,
      encrypted.iv,
      password
    );

    expect(decrypted).toBe(payload);
  });

  it("should fail to decrypt with the wrong password", async () => {
    const payload = "secret message";
    const encrypted = await encryptPayload(payload, "correct-password");

    await expect(
      decryptPayload(
        encrypted.ciphertext,
        encrypted.salt,
        encrypted.iv,
        "wrong-password"
      )
    ).rejects.toThrow(); // AES-GCM auth tag will fail
  });

  it("rejects tampered ciphertext and authentication tags", async () => {
    const encrypted = await encryptPayload("secret", "password");
    const [ciphertext, tag] = encrypted.ciphertext.split(":");
    const tamperedCiphertext = `${ciphertext.slice(0, -2)}AA:${tag}`;
    const tamperedTag = `${ciphertext}:${tag.slice(0, -2)}AA`;
    await expect(decryptPayload(tamperedCiphertext, encrypted.salt, encrypted.iv, "password")).rejects.toThrow();
    await expect(decryptPayload(tamperedTag, encrypted.salt, encrypted.iv, "password")).rejects.toThrow();
  });

  it("rejects malformed envelopes and invalid Base64", async () => {
    await expect(decryptPayload("missing-tag", "not base64", "also bad", "password")).rejects.toThrow(/Invalid Base64 salt/);
    const encrypted = await encryptPayload("secret", "password");
    await expect(decryptPayload("invalid", encrypted.salt, encrypted.iv, "password")).rejects.toThrow(/missing auth tag/);
  });
});
