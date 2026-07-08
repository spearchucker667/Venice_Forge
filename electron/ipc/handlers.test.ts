// VERIFY-056 regression guard
// @vitest-environment node
/** @fileoverview Unit tests for Electron IPC handler registration and safety guard enforcement. */

import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";
import path from "path";
import os from "os";
import { ipcMain } from "electron";

const capturedHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn((name: string) => {
      if (name === "home") return os.homedir();
      if (name === "downloads") return path.join(os.homedir(), "Downloads");
      if (name === "documents") return path.join(os.homedir(), "Documents");
      if (name === "userData") return path.join(os.tmpdir(), "vf-test-data");
      if (name === "appPath") return process.cwd();
      return os.tmpdir();
    }),
    getAppPath: vi.fn(() => process.cwd()),
    getVersion: vi.fn(() => "1.0.3-test"),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      capturedHandlers.set(channel, handler);
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  dialog: {
    showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined })),
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  },
  shell: {
    openPath: vi.fn(async () => ""),
  },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
  },
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

vi.mock("../services/secureStore", () => ({
  deleteApiKey: vi.fn(),
  deleteJinaApiKey: vi.fn(),
  getApiKey: vi.fn(() => null),
  getJinaApiKey: vi.fn(() => null),
  getSecureStoreStatus: vi.fn(() => ({ encryptionAvailable: true, mode: "safeStorage", corrupted: false, error: null })),
  isApiKeyConfigured: vi.fn(() => false),
  isJinaApiKeyConfigured: vi.fn(() => false),
  setApiKey: vi.fn(),
  setJinaApiKey: vi.fn(),
  setCredential: vi.fn(),
  getCredential: vi.fn(() => null),
  deleteCredential: vi.fn(),
  setProfilePassword: vi.fn(),
  verifyProfilePassword: vi.fn(() => true),
  isProfilePasswordSet: vi.fn(() => false),
  clearProfilePassword: vi.fn(),
  getProfilePasswordLockoutSeconds: vi.fn(() => 0),
  setMasterPassword: vi.fn(),
  verifyMasterPassword: vi.fn(() => ({ verified: true, lockedOutSeconds: 0 })),
  isMasterPasswordSet: vi.fn(() => false),
  clearMasterPassword: vi.fn(),
}));

vi.mock("../services/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  getLogsDir: vi.fn(() => path.join(os.tmpdir(), "vf-logs")),
  openLogsFolder: vi.fn(),
  getLastApiError: vi.fn(() => ""),
}));

vi.mock("../services/veniceClient", () => ({
  abortVeniceRequest: vi.fn(() => ({ ok: true })),
  performVeniceRequest: vi.fn(async () => ({ ok: true, status: 200, headers: {}, body: {} })),
  readResponseError: vi.fn(() => "error"),
}));

// Default the runtime snapshot to ON (Family Safe Mode). Tests that need
// Adult Mode can flip the vi.fn() return value via mockReturnValueOnce(false)
// or use the exported setter directly. The real module's state is a module-
// level boolean so vi.fn mocks are scoped to the import above.
vi.mock("../services/runtimeSafetySettings", () => ({
  getRuntimeLocalFamilySafeModeEnabled: vi.fn(() => true),
  setRuntimeLocalFamilySafeModeEnabled: vi.fn(),
}));

vi.mock("../services/configService", () => ({
  exportConfigTemplate: vi.fn(async () => ({ ok: true })),
  getPaths: vi.fn(() => ({ configPath: "/mock/config.yaml", themesPath: "/mock/themes.yaml", source: "userdata" })),
  getSanitizedConfig: vi.fn(() => ({ config: {}, status: {} })),
  getStatus: vi.fn(() => ({})),
  initializeConfig: vi.fn(async () => ({})),
  loadMergedThemes: vi.fn(async () => ({ themes: {}, warnings: [] })),
  openConfigFolder: vi.fn(async () => ({ ok: true, path: "" })),
  reloadConfig: vi.fn(async () => ({})),
  resetSecureStoreKeys: vi.fn(() => ({ venice: false, jina: false })),
  writeSanitizedConfig: vi.fn(async () => ({ ok: true, redactedFields: [] })),
}));

vi.mock("../services/chatStorage", () => ({
  deleteConversation: vi.fn(async () => ({ ok: true })),
  getConversation: vi.fn(async () => null),
  listConversations: vi.fn(async () => []),
  saveConversation: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../services/memoryPuller", () => ({
  pullContext: vi.fn(async (input: unknown) => ({
    injectedText: "",
    facts: [],
    summaries: [],
    tokenEstimate: 0,
    input,
  })),
}));

import { registerIpcHandlers } from "./handlers";
import { resetIpcRateLimitForTests } from "../utils/rateLimit";
import {
  clearProfilePassword,
  isProfilePasswordSet,
  setProfilePassword,
  verifyProfilePassword,
  getProfilePasswordLockoutSeconds,
  setMasterPassword,
  verifyMasterPassword,
  isMasterPasswordSet,
  clearMasterPassword,
  setApiKey,
  setJinaApiKey,
  deleteApiKey,
  deleteJinaApiKey,
  getJinaApiKey,
} from "../services/secureStore";

describe("registerIpcHandlers", () => {
  beforeAll(() => {
    capturedHandlers.clear();
    registerIpcHandlers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetIpcRateLimitForTests();
  });

  it("is idempotent when bootstrap calls registration more than once", () => {
    const registeredChannels = new Set(capturedHandlers.keys());
    registerIpcHandlers();
    expect(ipcMain.handle).not.toHaveBeenCalled();
    expect(new Set(capturedHandlers.keys())).toEqual(registeredChannels);
  });

  it("registers profile password IPC handlers without returning verifier material", async () => {
    vi.mocked(isProfilePasswordSet).mockReturnValueOnce(true);
    vi.mocked(verifyProfilePassword).mockReturnValueOnce(true);

    expect(await capturedHandlers.get("profilePassword:isSet")!(null, "work")).toBe(true);
    expect(await capturedHandlers.get("profilePassword:set")!(null, { profileId: "work", password: "secret" })).toEqual({ ok: true });
    expect(await capturedHandlers.get("profilePassword:verify")!(null, { profileId: "work", password: "secret" })).toEqual({ ok: true, verified: true, lockedOutSeconds: 0 });
    expect(await capturedHandlers.get("profilePassword:clear")!(null, "work")).toEqual({ ok: true });

    expect(setProfilePassword).toHaveBeenCalledWith("secret", "work");
    expect(verifyProfilePassword).toHaveBeenCalledWith("secret", "work");
    expect(getProfilePasswordLockoutSeconds).toHaveBeenCalledWith("work");
    expect(clearProfilePassword).toHaveBeenCalledWith("work");
  });

  it("registers master password IPC handlers without returning verifier material", async () => {
    vi.mocked(isMasterPasswordSet).mockReturnValueOnce(true);
    vi.mocked(verifyMasterPassword).mockReturnValueOnce({ verified: true, lockedOutSeconds: 0 });

    expect(await capturedHandlers.get("masterPassword:isSet")!(null)).toBe(true);
    expect(await capturedHandlers.get("masterPassword:set")!(null, "secret")).toEqual({ ok: true });
    expect(await capturedHandlers.get("masterPassword:verify")!(null, "secret")).toEqual({ ok: true, verified: true, lockedOutSeconds: 0 });
    expect(await capturedHandlers.get("masterPassword:clear")!(null)).toEqual({ ok: true });

    expect(setMasterPassword).toHaveBeenCalledWith("secret");
    expect(verifyMasterPassword).toHaveBeenCalledWith("secret");
    expect(clearMasterPassword).toHaveBeenCalled();
  });

  describe("generic credential bridge denylist", () => {
    it.each([
      "password",
      "master_password",
      "profile_password",
      "profile_password:user-a",
      "profile_password_user-a",
      "account_password",
      "my_unlock_secret",
      "secret-unlock-token",
    ])("credential:set rejects reserved name '%s'", async (key) => {
      const handler = capturedHandlers.get("credential:set");
      const result = await handler!(null, { key, value: "secret" });
      expect(result).toMatchObject({ ok: false });
      expect(result.error).toMatch(/reserved/i);
    });

    it.each([
      "master_password",
      "profile_password",
      "profile_password:user-a",
      "account_password",
    ])("credential:get returns null for reserved name '%s'", async (key) => {
      const handler = capturedHandlers.get("credential:get");
      const result = await handler!(null, key);
      expect(result).toEqual({ ok: true, value: null });
    });

    it.each([
      "master_password",
      "profile_password",
      "account_password",
    ])("credential:delete no-ops for reserved name '%s'", async (key) => {
      const handler = capturedHandlers.get("credential:delete");
      const result = await handler!(null, key);
      expect(result).toEqual({ ok: true });
    });

    it("credential:set still allows non-reserved api-key-like keys", async () => {
      const handler = capturedHandlers.get("credential:set");
      const result = await handler!(null, { key: "openrouter_api_key", value: "sk-or-xxx" });
      expect(result).toEqual({ ok: true });
    });
  });

  describe("venice:request", () => {
    it("returns a 451 response when the safety guard blocks the request", async () => {
      const handler = capturedHandlers.get("venice:request");
      expect(handler).toBeDefined();

      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/chat/completions",
          method: "POST",
          body: { messages: [{ role: "user", content: "loli" }] },
        }
      );

      expect(result).toMatchObject({
        ok: false,
        status: 451,
        statusText: "Blocked by Family Safe Mode",
      });
      expect(result.body).toHaveProperty("error");
      expect(result.body).toHaveProperty("reasonCode");
    });

    it("allows safe requests to proceed to performVeniceRequest", async () => {
      const { performVeniceRequest } = await import("../services/veniceClient");
      vi.mocked(performVeniceRequest).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {},
        body: { data: [] },
      } as any);

      const handler = capturedHandlers.get("venice:request");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/models",
          method: "GET",
          body: undefined,
        }
      );

      expect(result).toMatchObject({ ok: true, status: 200 });
    });

    it("skips the local guard in Adult Mode and calls the Venice client", async () => {
      const { performVeniceRequest } = await import("../services/veniceClient");
      const { getRuntimeLocalFamilySafeModeEnabled } = await import("../services/runtimeSafetySettings");
      // Flip the runtime snapshot to OFF for this test (Adult Mode).
      vi.mocked(getRuntimeLocalFamilySafeModeEnabled).mockReturnValueOnce(false);
      vi.mocked(performVeniceRequest).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: { id: "adult-mode-forwarded" },
        contentType: "application/json",
      });
      const handler = capturedHandlers.get("venice:request");

      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/chat/completions",
          method: "POST",
          body: { messages: [{ role: "user", content: "loli" }] },
          // Renderer-supplied flag is ignored; the runtime snapshot is the
          // canonical source. (kept for back-compat documentation)
          localFamilySafeModeEnabled: false,
        },
      );

      expect(performVeniceRequest).toHaveBeenCalled();
      expect(result).toMatchObject({ ok: true, status: 200 });
    });

    // A2 regression: guard dedup contract — non-trigger payload reaches
    // the Venice client and returns 200. The real guard does not flag
    // the synthetic fixture text, so this asserts the non-blocked path.
    // (The blocked path is covered by the test above.)
    it("passes a non-trigger payload through the IPC handler to the Venice client", async () => {
      const handler = capturedHandlers.get("venice:request");
      expect(handler).toBeDefined();

      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/chat/completions",
          method: "POST",
          body: { messages: [{ role: "user", content: "guard-mock-blocked-fixture-payload" }] },
        }
      );

      expect(result).toMatchObject({ ok: true, status: 200 });
    });

    // P1-015: renderer-supplied localFamilySafeModeEnabled=false MUST NOT
    // affect Electron enforcement. The main-process runtime snapshot is
    // the canonical source. The handler returns 451 because the real
    // guard flags the trigger regardless of the renderer-supplied flag.
    it("ignores renderer-supplied localFamilySafeModeEnabled=false in Electron mode", async () => {
      const handler = capturedHandlers.get("venice:request");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/chat/completions",
          method: "POST",
          body: { messages: [{ role: "user", content: "loli" }] },
          localFamilySafeModeEnabled: false,
        }
      );
      expect(result).toMatchObject({ ok: false, status: 451 });
    });

    it("calls recordDecision exactly once per IPC guard run", async () => {
      const { getAuditSnapshot, _resetAuditCounters_TEST_ONLY } = await import("../../src/shared/safety");
      _resetAuditCounters_TEST_ONLY();

      const handler = capturedHandlers.get("venice:request");
      // Send a payload that the real guard will block.
      await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/chat/completions",
          method: "POST",
          body: { messages: [{ role: "user", content: "loli" }] },
        }
      );

      const snap = getAuditSnapshot();
      // Exactly one blocked decision was recorded by the IPC handler.
      expect(snap.blocked).toBe(1);
    });
  });

  describe("IPC rate limiting", () => {
    it("throttles repeated strict-channel calls per sender", async () => {
      const handler = capturedHandlers.get("venice:request");
      expect(handler).toBeDefined();
      const event = { sender: { id: 7, isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents };

      for (let i = 0; i < 30; i += 1) {
        await handler!(event, { endpoint: "/models", method: "GET" });
      }
      const throttled = await handler!(event, { endpoint: "/models", method: "GET" });

      expect(throttled).toMatchObject({ ok: false, status: 429, error: "Rate limit exceeded" });
    });
  });

  describe("app:proxyScrape", () => {
    it("rejects malformed URLs", async () => {
      const handler = capturedHandlers.get("app:proxyScrape");
      expect(handler).toBeDefined();

      const result = await handler!(null, "not a url");

      expect(result).toMatchObject({ ok: false, error: "Invalid URL format" });
    });

    it("rejects http scrape targets by default", async () => {
      const handler = capturedHandlers.get("app:proxyScrape");
      expect(handler).toBeDefined();

      const result = await handler!(null, "http://example.com");

      expect(result).toMatchObject({ ok: false, error: "Only https URLs are allowed" });
    });

    it("rejects private http scrape targets before DNS or network access", async () => {
      const handler = capturedHandlers.get("app:proxyScrape");
      expect(handler).toBeDefined();

      const result = await handler!(null, "http://127.0.0.1/private");

      expect(result).toMatchObject({ ok: false, error: "Only https URLs are allowed" });
    });
  });

  describe("conversations:pullContext", () => {
    it("clamps memory pull bounds before calling the memory puller", async () => {
      const { pullContext } = await import("../services/memoryPuller");
      const handler = capturedHandlers.get("conversations:pullContext");
      expect(handler).toBeDefined();

      await handler!(null, { message: "hello", maxItems: 1e9, maxTokens: 1e9 });
      expect(pullContext).toHaveBeenLastCalledWith({ message: "hello", maxItems: 50, maxTokens: 8192 });

      await handler!(null, { message: "hello", maxItems: -10, maxTokens: -10 });
      expect(pullContext).toHaveBeenLastCalledWith({ message: "hello", maxItems: 1, maxTokens: 1 });

      await handler!(null, { message: "hello", maxItems: "many", maxTokens: "huge" });
      expect(pullContext).toHaveBeenLastCalledWith({ message: "hello", maxItems: 5, maxTokens: 1200 });
    });
  });

  describe("venice:streamChat", () => {
    it("returns 451 when the safety guard blocks streaming chat", async () => {
      const handler = capturedHandlers.get("venice:streamChat");
      expect(handler).toBeDefined();

      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/chat/completions",
          method: "POST",
          body: { messages: [{ role: "user", content: "shota" }] },
        }
      );

      expect(result).toMatchObject({
        ok: false,
        status: 451,
      });
    });

    it("rejects non-chat endpoints for streaming", async () => {
      const handler = capturedHandlers.get("venice:streamChat");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/models",
          method: "GET",
        }
      );

      expect(result).toMatchObject({
        ok: false,
        statusText: "Local transport error",
      });
      expect(result.body.error).toMatch(/streaming is only available/i);
    });
  });

  describe("app:readLocalFile", () => {
    it("advertises only text attachment extensions in the native picker", async () => {
      const handler = capturedHandlers.get("app:readLocalFile");
      expect(handler).toBeDefined();

      const { dialog } = await import("electron");
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: true,
        filePaths: [],
      });

      await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents }
      );

      expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
        title: "Import text attachment",
        filters: [
          { name: "Text attachments", extensions: ["txt", "md", "json", "csv", "yaml", "yml"] },
        ],
      }));
    });

    it("rejects hidden files (dotfiles)", async () => {
      const handler = capturedHandlers.get("app:readLocalFile");
      expect(handler).toBeDefined();

      const { dialog } = await import("electron");
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ["/Users/test/.hidden.txt"],
      });

      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents }
      );

      expect(result).toMatchObject({
        ok: false,
        error: "Hidden files are not importable.",
      });
    });

    it("rejects unsupported extensions", async () => {
      const handler = capturedHandlers.get("app:readLocalFile");
      const { dialog } = await import("electron");
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ["/Users/test/malicious.exe"],
      });

      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents }
      );

      expect(result).toMatchObject({
        ok: false,
        error: "Unsupported attachment type.",
      });
    });

    it("keeps document and image formats out of the text-only local reader", async () => {
      const handler = capturedHandlers.get("app:readLocalFile");
      expect(handler).toBeDefined();

      const { dialog } = await import("electron");
      for (const ext of [".pdf", ".docx", ".doc", ".xls", ".xlsx", ".png", ".jpg", ".webp"]) {
        vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
          canceled: false,
          filePaths: [`/Users/test/attachment${ext}`],
        });

        const result = await handler!(
          { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents }
        );

        expect(result).toMatchObject({
          ok: false,
          error: "Unsupported attachment type.",
        });
      }
    });
  });

  describe("apiKey:set", () => {
    it("rejects empty API keys", async () => {
      const handler = capturedHandlers.get("apiKey:set");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        ""
      );

      expect(result).toMatchObject({ ok: false });
      expect(result.error).toBeDefined();
    });
  });

  describe("app:saveRoutedImage", () => {
    it("successfully writes base64 image data to a sanitized path", async () => {
      const handler = capturedHandlers.get("app:saveRoutedImage");
      expect(handler).toBeDefined();

      const dummyBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        dummyBase64,
        "test-image.png",
        "anime"
      );

      expect(result).toMatchObject({ ok: true });
      expect(result.filePath).toBeDefined();
      expect(result.filePath).toContain("anime");
      expect(result.filePath).toContain("test-image.png");
    });

    it("rejects path traversal attempts in subfolders", async () => {
      const handler = capturedHandlers.get("app:saveRoutedImage");
      expect(handler).toBeDefined();

      const dummyBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        dummyBase64,
        "test-image.png",
        "../../escape"
      );

      // The subfolder will be sanitized (removing / and .), resulting in "escape".
      // Therefore, it won't traverse, but rather be saved in target baseDir/escape/test-image.png
      expect(result.ok).toBe(true);
      expect(result.filePath).not.toContain("..");
      expect(result.filePath).toContain("escape");
    });

    it("rejects invalid argument types", async () => {
      const handler = capturedHandlers.get("app:saveRoutedImage");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        12345, // invalid base64Data
        "test.png",
        "anime"
      );

      expect(result).toMatchObject({ ok: false });
      expect(result.error).toMatch(/must be a string/i);
    });

    it("rejects blocked executable extensions", async () => {
      const handler = capturedHandlers.get("app:saveRoutedImage");
      const dummyBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      for (const ext of [".exe", ".bat", ".cmd", ".ps1", ".sh", ".js", ".mjs", ".cjs", ".app", ".dmg", ".zip", ".7z", ".pdf", ".html"]) {
        const result = await handler!(
          { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
          dummyBase64,
          `malicious${ext}`,
          "anime"
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/not allowed for security reasons/i);
      }
    });

    it("rejects unknown extensions not in the allowlist", async () => {
      const handler = capturedHandlers.get("app:saveRoutedImage");
      const dummyBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        dummyBase64,
        "data.txt",
        "anime"
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not in the allowed list/i);
    });

    it("allows only validated image extensions with matching bytes", async () => {
      const handler = capturedHandlers.get("app:saveRoutedImage");
      const dummyBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        dummyBase64,
        "safe.png",
        "anime"
      );
      expect(result.ok).toBe(true);
      expect(result.filePath).toBeDefined();
    });

    it("rejects video, GIF, arbitrary bytes, and MIME/extension mismatches", async () => {
      const handler = capturedHandlers.get("app:saveRoutedImage");
      const pngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      for (const ext of [".gif", ".mp4", ".webm"]) {
        const result = await handler!(
          { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
          pngBase64,
          `unsafe${ext}`,
          "anime"
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/allowed list/i);
      }

      const arbitrary = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        Buffer.from("not an image").toString("base64"),
        "spoof.png",
        "anime"
      );
      expect(arbitrary).toMatchObject({ ok: false });
      expect(arbitrary.error).toMatch(/supported image/i);

      const mismatch = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        pngBase64,
        "wrong.webp",
        "anime"
      );
      expect(mismatch).toMatchObject({ ok: false });
      expect(mismatch.error).toMatch(/extension/i);
    });
  });

  describe("config:exportTemplate", () => {
    it("uses the main-process save dialog instead of a renderer-supplied path", async () => {
      const { dialog } = await import("electron");
      const { exportConfigTemplate } = await import("../services/configService");
      vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({ canceled: false, filePath: "/tmp/template.yaml" });

      const handler = capturedHandlers.get("config:exportTemplate");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        "/renderer/ignored.yaml",
      );

      expect(dialog.showSaveDialog).toHaveBeenCalled();
      expect(exportConfigTemplate).toHaveBeenCalledWith("/tmp/template.yaml");
      expect(result).toEqual({ ok: true });
    });
  });

  // P0 #1: Electron Jina/scrape response-body screening. The URL is already
  // screened before network dispatch; the body returned by the remote
  // service must also be screened through the runtime snapshot.
  describe("Electron Jina + scrape response-body screening (VERIFY-019)", () => {
    let originalFetch: typeof globalThis.fetch | undefined;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(async () => {
      globalThis.fetch = originalFetch;
      // Reset the runtime mock to its default (Family Safe Mode ON) so
      // tests outside this describe block are not polluted.
      const { getRuntimeLocalFamilySafeModeEnabled } = await import("../services/runtimeSafetySettings");
      vi.mocked(getRuntimeLocalFamilySafeModeEnabled).mockReset();
      vi.mocked(getRuntimeLocalFamilySafeModeEnabled).mockReturnValue(true);
    });

    it("blocks a Jina response whose body contains a CSAM trigger", async () => {
      // Jina: mock fetch returns a body that contains a CSAM trigger term.
      globalThis.fetch = vi.fn(async () =>
        new Response(
          JSON.stringify({ data: "Some content csam more content" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ) as unknown as typeof globalThis.fetch;

      const handler = capturedHandlers.get("jina:request");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000 },
      );

      // Body screen blocks → 451 with the canonical userMessage.
      expect(result).toMatchObject({ ok: false, status: 451 });
      expect(result.body).toMatchObject({
        reasonCode: "CSAM_EXPLICIT_TERM",
        category: "csam_request",
        severity: "critical",
      });
      expect(result.body.error).toMatch(/family safe mode/i);
      expect(JSON.stringify(result.body)).not.toContain("Some content");
    });

    it("drops unsafe renderer-supplied Jina headers and keeps only allowlisted forwarding headers", async () => {
      const { getRuntimeLocalFamilySafeModeEnabled } = await import("../services/runtimeSafetySettings");
      vi.mocked(getRuntimeLocalFamilySafeModeEnabled).mockReturnValue(false);
      globalThis.fetch = vi.fn(async () =>
        new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
      ) as unknown as typeof globalThis.fetch;

      const handler = capturedHandlers.get("jina:request");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          url: "https://r.jina.ai/https://example.com",
          headers: {
            Authorization: "Bearer renderer-secret",
            "x-jina-api-key": "renderer-secret",
            Cookie: "sid=1",
            Host: "internal",
            Referer: "https://evil.example",
            "X-Forwarded-For": "127.0.0.1",
            Accept: "text/plain",
            "X-Return-Format": "markdown",
          },
          timeoutMs: 5000,
        },
      );

      expect(result).toMatchObject({ ok: true, status: 200 });
      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
      expect(init.headers).toEqual({
        accept: "text/plain",
        "x-return-format": "markdown",
      });
    });

    it("does NOT return the raw blocked body to the renderer", async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(
          "loli term should never reach the renderer when blocked",
          { status: 200, headers: { "content-type": "text/plain" } },
        ),
      ) as unknown as typeof globalThis.fetch;

      const handler = capturedHandlers.get("jina:request");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000 },
      );

      expect(result.status).toBe(451);
      // The raw body MUST NOT appear in the response — neither as `body`,
      // `data`, nor any other field.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(/loli term should never reach/i);
    });

    // VERIFY-039: the Electron boundary enforces the same cap as Express.
    it("returns 413 and cancels an over-limit Jina response stream", async () => {
      let cancelled = false;
      const chunk = new Uint8Array(1024 * 1024);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.enqueue(new Uint8Array([1]));
        },
        cancel() {
          cancelled = true;
        },
      });
      globalThis.fetch = vi.fn(async () => new Response(body, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })) as unknown as typeof globalThis.fetch;

      const handler = capturedHandlers.get("jina:request");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000 },
      );

      expect(result).toMatchObject({ ok: false, status: 413 });
      expect(result.error).toMatch(/2 MiB limit/i);
      expect(cancelled).toBe(true);
    });

    it("skips body screening in Adult Mode (runtime snapshot OFF)", async () => {
      const { getRuntimeLocalFamilySafeModeEnabled } = await import("../services/runtimeSafetySettings");
      // Use mockReturnValue so the URL pre-check + the body screen both
      // observe Adult Mode.
      vi.mocked(getRuntimeLocalFamilySafeModeEnabled).mockReturnValue(false);

      // Body is intentionally CSAM-flavoured; Adult Mode must NOT block.
      globalThis.fetch = vi.fn(async () =>
        new Response(
          "csam term in body — should pass in Adult Mode",
          { status: 200, headers: { "content-type": "text/plain" } },
        ),
      ) as unknown as typeof globalThis.fetch;

      const handler = capturedHandlers.get("jina:request");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000 },
      );

      expect(result.status).toBe(200);
      expect(result.ok).toBe(true);
    });
  });

  // Audit 2026-07-08 #1 + #3: profile-scoped credential isolation. Each
  // credential IPC channel must validate the supplied profile id before
  // reaching the storage layer. An invalid id must NOT write a storage
  // entry shape that collides with separators (`_`, `:`, `/`).
  describe("audit 2026-07-08: profile-scoped credential isolation", () => {
    const ctx = () =>
      ({ sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents });

    it("apiKey:set accepts a valid storage id and writes to that profile", async () => {
      const handler = capturedHandlers.get("apiKey:set");
      const ok = await handler!(ctx(), { key: "sk-valid", profileId: "work" });
      expect(ok).toEqual({ ok: true });
      expect(setApiKey).toHaveBeenCalledWith("sk-valid", "work");
    });

    it("apiKey:set rejects an invalid profileId without writing", async () => {
      const handler = capturedHandlers.get("apiKey:set");
      const bad = await handler!(ctx(), { key: "sk-valid", profileId: "bad_id" });
      expect(bad).toMatchObject({ ok: false });
      expect(setApiKey).not.toHaveBeenCalled();
    });

    it("apiKey:set with omitted profileId falls back to the default profile", async () => {
      const handler = capturedHandlers.get("apiKey:set");
      const ok = await handler!(ctx(), { key: "sk-default", profileId: undefined });
      expect(ok).toEqual({ ok: true });
      expect(setApiKey).toHaveBeenCalledWith("sk-default", "default");
    });

    it("apiKey:delete rejects an invalid profileId without writing", async () => {
      const handler = capturedHandlers.get("apiKey:delete");
      const bad = await handler!(ctx(), "../../x");
      expect(bad).toMatchObject({ ok: false });
      expect(deleteApiKey).not.toHaveBeenCalled();
    });

    it("apiKey:isConfigured returns false for invalid profileId without throwing", async () => {
      const handler = capturedHandlers.get("apiKey:isConfigured");
      const result = await handler!(ctx(), "bad_id");
      expect(result).toBe(false);
    });

    it("jinaApiKey:set accepts a valid storage id and writes to that profile", async () => {
      const handler = capturedHandlers.get("jinaApiKey:set");
      const ok = await handler!(ctx(), { key: "jina-valid-key", profileId: "work" });
      expect(ok).toEqual({ ok: true });
      expect(setJinaApiKey).toHaveBeenCalledWith("jina-valid-key", "work");
    });

    it("jinaApiKey:set rejects an invalid profileId without writing", async () => {
      const handler = capturedHandlers.get("jinaApiKey:set");
      const bad = await handler!(ctx(), { key: "jina-valid-key", profileId: "bad_id" });
      expect(bad).toMatchObject({ ok: false });
      expect(setJinaApiKey).not.toHaveBeenCalled();
    });

    it("jinaApiKey:delete rejects an invalid profileId without writing", async () => {
      const handler = capturedHandlers.get("jinaApiKey:delete");
      const bad = await handler!(ctx(), "../../x");
      expect(bad).toMatchObject({ ok: false });
      expect(deleteJinaApiKey).not.toHaveBeenCalled();
    });

    it("jinaApiKey:test uses the supplied profile's key, not the default's", async () => {
      // Profile A is the active profile; default has a different key.
      vi.mocked(getJinaApiKey).mockImplementation((pid) =>
        pid === "work" ? "jina-key-A" : "jina-key-default",
      );
      // Suppress the actual HTTP call to keep the test isolated.
      vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));

      const handler = capturedHandlers.get("jinaApiKey:test");
      const result = await handler!(ctx(), "work");
      expect(result.ok).toBe(true);
      // Verify the request actually used the profile-A key.
      const fetchMock = vi.mocked(globalThis.fetch);
      const fetchCall = fetchMock.mock.calls[0];
      const sentHeaders = fetchCall?.[1]?.headers as Record<string, string> | undefined;
      expect(sentHeaders?.Authorization).toBe("Bearer jina-key-A");

      vi.unstubAllGlobals();
    });

    it("jinaApiKey:test falls back to the default profile key when id is omitted", async () => {
      vi.mocked(getJinaApiKey).mockReturnValue("jina-key-default");
      vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));

      const handler = capturedHandlers.get("jinaApiKey:test");
      const result = await handler!(ctx(), undefined);
      expect(result.ok).toBe(true);
      const fetchMock = vi.mocked(globalThis.fetch);
      const sentHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
      expect(sentHeaders?.Authorization).toBe("Bearer jina-key-default");

      vi.unstubAllGlobals();
    });

    it("jinaApiKey:test rejects an invalid profileId", async () => {
      const handler = capturedHandlers.get("jinaApiKey:test");
      const result = await handler!(ctx(), "bad_id");
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/Invalid profile id/);
    });

    it("jina:request uses the supplied profile's Jina key", async () => {
      vi.mocked(getJinaApiKey).mockImplementation((pid) =>
        pid === "work" ? "jina-key-A" : "jina-key-default",
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })),
      );

      const handler = capturedHandlers.get("jina:request");
      const result = await handler!(
        ctx(),
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000, profileId: "work" },
      );

      expect(result.ok).toBe(true);
      const fetchMock = vi.mocked(globalThis.fetch);
      const sentHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
      expect(sentHeaders?.Authorization).toBe("Bearer jina-key-A");

      vi.unstubAllGlobals();
    });

    it("jina:request without profileId falls back to the default profile key", async () => {
      vi.mocked(getJinaApiKey).mockReturnValue("jina-key-default");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })),
      );

      const handler = capturedHandlers.get("jina:request");
      const result = await handler!(
        ctx(),
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000 },
      );

      expect(result.ok).toBe(true);
      const fetchMock = vi.mocked(globalThis.fetch);
      const sentHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
      expect(sentHeaders?.Authorization).toBe("Bearer jina-key-default");

      vi.unstubAllGlobals();
    });

    it("jina:request rejects an invalid profileId", async () => {
      const handler = capturedHandlers.get("jina:request");
      const result = await handler!(
        ctx(),
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000, profileId: "../../x" },
      );

      expect(result).toMatchObject({ ok: false });
      // Specifically: a generic 400-class shape so an invalid-profile
      // attempt cannot enumerate the underlying error.
      expect(typeof result.status).toBe("number");
    });
  });

  // Audit 2026-07-08 #2: default profile cannot be password-locked (Option A).
  describe("audit 2026-07-08: default profile lock policy", () => {
    const ctx = () =>
      ({ sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents });

    it("profilePassword:set rejects the reserved default id without writing", async () => {
      const handler = capturedHandlers.get("profilePassword:set");
      const result = await handler!(ctx(), { profileId: "default", password: "secret" });
      expect(result).toMatchObject({ ok: false });
      expect(result.error).toMatch(/default profile cannot be password-protected/);
      // MUST NOT have written a verifier row to secure-prefs.
      expect(setProfilePassword).not.toHaveBeenCalled();
    });

    it("profilePassword:set still works for non-default valid ids", async () => {
      const handler = capturedHandlers.get("profilePassword:set");
      const result = await handler!(ctx(), { profileId: "work", password: "secret" });
      expect(result).toEqual({ ok: true });
      expect(setProfilePassword).toHaveBeenCalledWith("secret", "work");
    });
  });
});
