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
});
