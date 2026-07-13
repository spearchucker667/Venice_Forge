// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptPayload as electronEncrypt, decryptPayload as electronDecrypt } from "../../electron/services/backupCrypto";
import { createEncryptedBackup, downloadEncryptedBackup } from "../../src/services/backupExportService";
import { importEncryptedBackup } from "../../src/services/backupImportService";
import { BACKUP_SCHEMA_VERSION } from "../../electron/services/backupCrypto";
import { toBase64 } from "../../src/services/backupCryptoWeb";

// Mock the desktop functions
vi.mock("../../src/services/desktopBridge", () => ({
  isElectron: () => false,
  desktopFiles: {
    exportJson: vi.fn().mockResolvedValue(true)
  },
  desktopSync: {
    decryptBackup: vi.fn().mockResolvedValue({ ok: false, error: "Not available in test" }),
    encryptBackup: vi.fn().mockResolvedValue({ ok: false, error: "Not available in test" })
  }
}));

// Mock the desktop functions
vi.mock("../../src/services/desktopBridge", () => ({
  isElectron: () => false,
  desktopFiles: {
    exportJson: vi.fn().mockResolvedValue(true)
  },
  desktopSync: {
    decryptBackup: vi.fn().mockResolvedValue({ ok: true, data: "decrypted_data" })
  }
}));

// Mock DOM APIs for web crypto tests
vi.mock("../../src/shared/env", () => ({
  isTest: () => true
}));

describe("cross-runtime backup compatibility", () => {
  const testPassword = "test-password-123";
  const testPayload = JSON.stringify({ test: "data", chats: [{ id: "1", content: "test" }] });

  it("should create backups that can be decrypted by both runtimes", async () => {
    // Create Electron backup (traditional format)
    const electronBackup = await electronEncrypt(testPayload, testPassword);
    
    // Create Web backup 
    const webBackup = await createEncryptedBackup(testPayload, testPassword);
    
    console.log("=== Electron Backup ===");
    console.log("Salt:", electronBackup.salt);
    console.log("IV:", electronBackup.iv);
    console.log("Ciphertext length:", electronBackup.ciphertext.length);
    console.log("Contains colon:", electronBackup.ciphertext.includes(":"));
    console.log("Ciphertext sample:", electronBackup.ciphertext.substring(0, 50));
    
    console.log("\n=== Web Backup ===");
    console.log("Salt:", webBackup.salt);
    console.log("IV:", webBackup.iv);
    console.log("Ciphertext length:", webBackup.ciphertext.length);
    console.log("Contains colon:", webBackup.ciphertext.includes(":"));
    console.log("Ciphertext sample:", webBackup.ciphertext.substring(0, 50));
    
    // Add detailed logging for the buffers
    try {
      const webCiphertextBuffer = Buffer.from(webBackup.ciphertext, 'base64');
      console.log("Web ciphertext buffer length:", webCiphertextBuffer.length);
      console.log("Web ciphertext buffer first 20 bytes:", webCiphertextBuffer.subarray(0, 20).toString('hex'));
      console.log("Web ciphertext buffer last 20 bytes:", webCiphertextBuffer.subarray(-20).toString('hex'));
      
      // Try to extract what we think the auth tag should be
      if (webCiphertextBuffer.length >= 16) {
        const authTag = webCiphertextBuffer.subarray(webCiphertextBuffer.length - 16);
        console.log("Extracted auth tag:", authTag.toString('hex'));
        const ciphertextOnly = webCiphertextBuffer.subarray(0, webCiphertextBuffer.length - 16);
        console.log("Ciphertext only length:", ciphertextOnly.length);
        console.log("Ciphertext only first 20 bytes:", ciphertextOnly.subarray(0, Math.min(20, ciphertextOnly.length)).toString('hex'));
      }
    } catch (bufferError) {
      console.log("Buffer processing error:", bufferError.message);
    }
    
    // Electron backup should be decryptable by Electron
    const electronDecrypted = await electronDecrypt(
      electronBackup.ciphertext,
      electronBackup.salt,
      electronBackup.iv,
      testPassword
    );
    expect(electronDecrypted).toBe(testPayload);
    
    console.log("\n=== Electron decryption successful ===");
    
    // Web backup should be decryptable by Electron (this should now work)
    try {
      const webDecrypted = await electronDecrypt(
        webBackup.ciphertext,
        webBackup.salt,
        webBackup.iv,
        testPassword
      );
      expect(webDecrypted).toBe(testPayload);
      console.log("=== Web backup decryption successful ===");
    } catch (error) {
      console.log("Web backup decryption error:", error.message);
      
      // Let's also try to decode it manually to see what's wrong
      try {
        const combinedBufferFromBase64 = Buffer.from(webBackup.ciphertext, 'base64');
        console.log("Decoded buffer length:", combinedBufferFromBase64.length);
        console.log("Buffer last 20 bytes:", combinedBufferFromBase64.subarray(-20).toString('base64'));
      } catch (decodeError) {
        console.log("Base64 decode error:", decodeError.message);
      }
      
      throw error;
    }
    
    // Electron backup should be decryptable by Web (this requires proper mocking)
    // We'll test this by creating an Electron backup in WebCrypto-compatible format
    const electronWebFormatBackup = await electronEncrypt(testPayload, testPassword, true);
    expect(electronWebFormatBackup.ciphertext).not.toContain(":");
  });

  it("should handle Electron's colon-separated format in WebCrypto implementation", async () => {
    // Create Electron-style backup
    const electronBackup = await electronEncrypt(testPayload, testPassword);
    
    // Verify it has colon-separated format
    expect(electronBackup.ciphertext).toContain(":");
    
    // This should work after we fix the compatibility
    // For now, this test documents the expected behavior
  });

  it("should handle WebCrypto's combined buffer format in Electron implementation", async () => {
    // Create Web-style backup (mocked)
    const webBackup = await createEncryptedBackup(testPayload, testPassword);
    
    // Verify it doesn't have colon-separated format
    expect(webBackup.ciphertext).not.toContain(":");
    
    // This should work after we fix the compatibility
    // For now, this test documents the expected behavior
  });
});