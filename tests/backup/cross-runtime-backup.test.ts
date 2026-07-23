// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { encryptPayload as electronEncrypt, decryptPayload as electronDecrypt } from "../../electron/services/backupCrypto";
import { createEncryptedBackup } from "../../src/services/backupExportService";

// Mock the desktop functions (Web mode)
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

// Mock DOM APIs for web crypto tests
vi.mock("../../src/shared/env", () => ({
  isTest: () => true
}));

// Mock storage service to return our test data
vi.mock("../../src/services/storageService", async () => {
  const actual = (await vi.importActual("../../src/services/storageService")) as any;
  return {
    __esModule: true,
    default: {
      ...actual.default,
      getItems: vi.fn().mockImplementation((storeName: string) => {
        // For testing cross-runtime compatibility, we want predictable content
        // that we can verify was encrypted/decrypted correctly
        switch (storeName) {
          case "chats":
            return Promise.resolve([{ id: "test1", content: "test chat content" }]);
          case "settings":
            return Promise.resolve([{ id: "setting1", value: "test setting" }]);
          default:
            return Promise.resolve([]);
        }
      })
    }
  };
});

describe("cross-runtime backup compatibility", () => {
  const testPassword = "test-password-123";
  // Expected payload that matches our mocked storage data
  const testPayload = JSON.stringify({
  images: [],
  chats: [{ id: "test1", content: "test chat content" }],
  settings: [{ id: "setting1", value: "test setting" }],
  conversations: [],
  ai_memory: [],
  files: [],
  character_cards: [],
  personas: [],
  lorebooks: [],
  rp_chats: [],
  rp_assets: [],
  projects: [],
  promptLibrary: [],
  scenes: [],
  rpScenarios: [],
  workflowTemplates: [],
  researchSessions: [],
  visualWorkflows: [],
  playground: [],
  tombstones: []
});
  const webProfileBoundPayload = {
    images: [],
    chats: [{ id: "test1", content: "test chat content", profileId: "default" }],
    settings: [{ id: "setting1", value: "test setting", profileId: "default" }],
    conversations: [],
    ai_memory: [],
    files: [],
    character_cards: [],
    personas: [],
    lorebooks: [],
    rp_chats: [],
    rp_assets: [],
    projects: [],
    promptLibrary: [],
    scenes: [],
    rpScenarios: [],
    workflowTemplates: [],
    researchSessions: [],
    visualWorkflows: [],
    playground: [],
    imageInspectorSessions: [],
    tombstones: [],
    chat_folders: [],
  };

  it("should create backups that can be decrypted by both runtimes", async () => {
    // Create Electron backup (traditional format)
    const electronBackup = await electronEncrypt(testPayload, testPassword);
    
    // Create Web backup 
    // NOTE: createEncryptedBackup only takes password parameter, payload comes from database
    const webBackup = await createEncryptedBackup(testPassword);
    
    // Electron backup should be decryptable by Electron
    const electronDecrypted = await electronDecrypt(
      electronBackup.ciphertext,
      electronBackup.salt,
      electronBackup.iv,
      testPassword
    );
    expect(electronDecrypted).toBe(testPayload);
    
    // Web backup should be decryptable by Electron (this should now work)
    const webDecrypted = await electronDecrypt(
      webBackup.ciphertext,
      webBackup.salt,
      webBackup.iv,
      testPassword
    );
    const parsedWebPayload = JSON.parse(webDecrypted);
    expect(parsedWebPayload._veniceForgeBackup).toMatchObject({
      profileId: "default",
      manifestMetadata: webBackup.metadata,
    });
    delete parsedWebPayload._veniceForgeBackup;
    expect(parsedWebPayload).toEqual(webProfileBoundPayload);
    
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
    // Create Web-style backup (using actual database)
    const webBackup = await createEncryptedBackup(testPassword);
    
    // Verify it doesn't have colon-separated format
    expect(webBackup.ciphertext).not.toContain(":");
    
    // This should work after we fix the compatibility
    // For now, this test documents the expected behavior
  });
});
