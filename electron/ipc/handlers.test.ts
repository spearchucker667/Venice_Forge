// VERIFY-056 regression guard
// VERIFY-098 regression guard
// VERIFY-099 regression guard
// VERIFY-100 regression guard
// VERIFY-101 regression guard
// VERIFY-102 regression guard
// @vitest-environment node
/** @fileoverview Unit tests for Electron IPC handler registration and safety guard enforcement. */

import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";
import path from "path";
import os from "os";
import * as fs from "fs/promises";
import { ipcMain } from "electron";
import {
  expectErrorResult,
  expectOkResult,
  invokeCapturedHandler,
} from "../test/ipcTestHelpers";
import type { VeniceIpcResponse } from "../services/veniceClient";

const capturedHandlers = new Map<string, (...args: unknown[]) => unknown>();

type IpcActionResult = { ok: true } | { ok: false; error: string };
type VeniceHandlerResult =
  | { ok: true; status: number; statusText: string; headers: Record<string, string>; body: unknown; contentType: string }
  | { ok: false; status: number; statusText: string; headers: Record<string, string>; body: unknown; contentType: string };
type JinaHandlerResult =
  | { ok: true; status: number; body?: unknown; contentType?: string }
  | { ok: false; status: number; body?: unknown; contentType?: string; error: string };
type JinaConnectionResult =
  | { ok: true; status: number; message: string }
  | { ok: false; status: number; message: string };
type ApiKeySetResult =
  | { ok: true; storageMode: string }
  | { ok: false; code: "INVALID_KEY" | "SECRET_STORAGE_UNAVAILABLE" | "SECRET_STORAGE_WRITE_FAILED"; safeMessage: string };

function expectRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(value).toBeTypeOf("object");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object IPC response body.");
  }
}

function invoke<TResult>(channel: string, ...args: unknown[]): Promise<TResult> {
  return invokeCapturedHandler<TResult>(capturedHandlers, channel, ...args);
}

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
      // Wrap handlers with a default trusted dev sender so existing handler
      // logic tests continue to pass without every test reconstructing a
      // WebFrameMain. Sender-validation adversarial tests override this by
      // passing an explicit untrusted senderFrame.
      capturedHandlers.set(channel, (event, ...args) => {
        const trustedEvent =
          event && typeof event === "object"
            ? "senderFrame" in event && event.senderFrame
              ? event
              : { ...event, senderFrame: { url: "http://localhost:5173" } }
            : { senderFrame: { url: "http://localhost:5173" } };
        return handler(trustedEvent, ...args);
      });
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

vi.mock("../services/secureStore", () => {
  const mockIsProviderApiKeyConfigured = vi.fn((..._args: unknown[]) => false);
  return {
    deleteApiKey: vi.fn(),
    deleteJinaApiKey: vi.fn(),
    deleteProviderApiKey: vi.fn(),
    getApiKey: vi.fn(() => null),
    getApiKeyConfigurationStatus: vi.fn(() => ({ configured: false, state: "not-configured", storageMode: "encrypted" })),
    getStorageMode: vi.fn(() => "encrypted"),
    getJinaApiKey: vi.fn(() => null),
    getSecureStoreStatus: vi.fn(() => ({ encryptionAvailable: true, mode: "safeStorage", corrupted: false, error: null })),
    isApiKeyConfigured: vi.fn(() => false),
    isJinaApiKeyConfigured: vi.fn(() => false),
    isProviderApiKeyConfigured: mockIsProviderApiKeyConfigured,
    isProviderCredentialConfigured: vi.fn(() => false),
    isProviderConfigured: vi.fn((...args: unknown[]) => mockIsProviderApiKeyConfigured(...args)),
    setApiKey: vi.fn(),
    setJinaApiKey: vi.fn(),
    setProviderApiKey: vi.fn(),
    setProviderCredential: vi.fn(),
    deleteProviderCredential: vi.fn(),
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
  };
});

vi.mock("../services/providerSettingsStore", () => ({
  disableProvider: vi.fn(),
  getProviderSettings: vi.fn(() => ({
    enabledProviders: {},
    autoFallbackEnabled: false,
    fallbackOrdering: [],
    nativeFallbackModels: { anthropic: "claude-3-5-sonnet-latest" },
  })),
  isProviderAvailableForFallback: vi.fn((providerId) => providerId === "anthropic" || providerId === "together"),
  updateProviderSettings: vi.fn((_profileId, update) => ({
    enabledProviders: update.enabledProviders ?? {},
    autoFallbackEnabled: update.autoFallbackEnabled ?? false,
    fallbackOrdering: update.fallbackOrdering ?? [],
    nativeFallbackModels: { anthropic: "claude-3-5-sonnet-latest" },
  })),
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

// Phase 8 — spy (not replace) the guarded dispatcher and the chat agent loop
// so Responses-transport tests can prove /responses routes through the
// single-turn guarded path while /chat/completions keeps the bounded tool
// loop. Real implementations are preserved.
vi.mock("../services/guardPipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/guardPipeline")>();
  return {
    ...actual,
    performGuardedVeniceRequest: vi.fn(actual.performGuardedVeniceRequest),
  };
});

vi.mock("../agent/runtime/chat-agent-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agent/runtime/chat-agent-runner")>();
  return {
    ...actual,
    runChatAgentLoop: vi.fn(actual.runChatAgentLoop),
  };
});

// Default the runtime snapshot to ON (Family Safe Mode). Tests that need
// Adult Mode can flip the vi.fn() return value via mockReturnValueOnce(false)
// or use the exported setter directly. The real module's state is a module-
// level boolean so vi.fn mocks are scoped to the import above.
vi.mock("../services/runtimeSafetySettings", () => ({
  getRuntimeLocalFamilySafeModeEnabled: vi.fn(() => true),
  setRuntimeLocalFamilySafeModeEnabled: vi.fn(),
  getRuntimeVeniceApiSafeMode: vi.fn(() => true),
  setRuntimeVeniceApiSafeMode: vi.fn(),
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

vi.mock("../services/syncBridge", () => ({
  emitSyncPacket: vi.fn(async () => undefined),
  emitSyncTombstone: vi.fn(async () => undefined),
}));

vi.mock("../services/memoryPuller", () => ({
  rebuildIndex: vi.fn(async () => 0),
  searchIndex: vi.fn(async () => []),
  pullContext: vi.fn(async (input: unknown) => ({
    injectedText: "",
    facts: [],
    summaries: [],
    tokenEstimate: 0,
    input,
  })),
}));

vi.mock("../services/conversationVault", () => ({
  getProfileConversationsDir: vi.fn((profileId: string) => `/vault/${profileId}`),
  saveConversation: vi.fn(async () => ({ ok: true, id: "conv-1" })),
  deleteConversation: vi.fn(async () => ({ ok: true })),
  getConversation: vi.fn(async () => null),
  listConversations: vi.fn(async () => []),
  archiveConversation: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../services/profilePurge", () => ({
  purgeMainProfileData: vi.fn(async (profileId: string) => ({ ok: true, profileId, steps: {} })),
}));

vi.mock("../services/characterCardStorage", () => ({
  saveCharacterCard: vi.fn(async () => ({ ok: true })),
  deleteCharacterCard: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../services/rpChatStorage", () => ({
  saveRpChat: vi.fn(async () => ({ ok: true })),
  deleteRpChat: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../services/rpStores", () => {
  const makeStore = () => ({
    save: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
  });
  return {
    personaStore: makeStore(),
    lorebookStore: makeStore(),
    rpAssetStore: makeStore(),
    scenarioStore: makeStore(),
  };
});

vi.mock("../services/backupCrypto", () => ({
  encryptPayload: vi.fn(async () => ({ salt: "salt", iv: "iv", ciphertext: "cipher" })),
  decryptPayload: vi.fn(async () => "{}"),
}));

import { registerIpcHandlers } from "./handlers";
import { resetIpcRateLimitForTests } from "../utils/rateLimit";
import * as syncBridge from "../services/syncBridge";
import { purgeMainProfileData } from "../services/profilePurge";
import { __resetRemoteApplyGrantsForTests, issueRemoteApplyGrant } from "../services/remoteApplyAuthority";
import {
  __resetProfileSessionsForTests,
  getProfileSessionId,
  setProfileSessionId,
} from "../services/profileSession";
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
  setProviderApiKey,
  deleteApiKey,
  deleteJinaApiKey,
  deleteProviderApiKey,
  isApiKeyConfigured,
  isJinaApiKeyConfigured,
  isProviderApiKeyConfigured,
  getJinaApiKey,
} from "../services/secureStore";
import {
  disableProvider,
  getProviderSettings,
  updateProviderSettings,
} from "../services/providerSettingsStore";

describe("registerIpcHandlers", () => {
  beforeAll(() => {
    capturedHandlers.clear();
    registerIpcHandlers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetIpcRateLimitForTests();
    __resetProfileSessionsForTests();
  });

  it("is idempotent when bootstrap calls registration more than once", () => {
    const registeredChannels = new Set(capturedHandlers.keys());
    registerIpcHandlers();
    expect(ipcMain.handle).not.toHaveBeenCalled();
    expect(new Set(capturedHandlers.keys())).toEqual(registeredChannels);
  });

  it("registers profile password IPC handlers without returning verifier material", async () => {
    const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
    const event = { sender };
    vi.mocked(isProfilePasswordSet).mockReturnValueOnce(true);
    vi.mocked(verifyProfilePassword).mockReturnValueOnce(true);

    expect(await capturedHandlers.get("profilePassword:isSet")!(null, "work")).toBe(true);
    setProfileSessionId(sender, "work");
    expect(await capturedHandlers.get("profilePassword:set")!(event, { profileId: "work", password: "secret" })).toEqual({ ok: true });
    expect(await capturedHandlers.get("profilePassword:verify")!(event, { profileId: "work", password: "secret" })).toEqual({ ok: true, verified: true, lockedOutSeconds: 0 });
    expect(await capturedHandlers.get("profilePassword:clear")!(event, { profileId: "work", currentPassword: "secret" })).toEqual({ ok: true });

    expect(setProfilePassword).toHaveBeenCalledWith("secret", "work");
    expect(verifyProfilePassword).toHaveBeenCalledWith("secret", "work");
    expect(getProfilePasswordLockoutSeconds).toHaveBeenCalledWith("work");
    expect(clearProfilePassword).toHaveBeenCalledWith("work");
    expect(getProfileSessionId(sender)).toBe("work");
  });

  it("binds profile purge to the active authenticated session", async () => {
    const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
    const event = { sender };
    setProfileSessionId(sender, "work");
    const handler = capturedHandlers.get("profile:purge");

    await expect(handler!(event, "other")).resolves.toMatchObject({ ok: false });
    expect(purgeMainProfileData).not.toHaveBeenCalled();
    await expect(handler!(event, "work")).resolves.toMatchObject({ ok: true, profileId: "work" });
    expect(purgeMainProfileData).toHaveBeenCalledWith("work");
  });

  it("activates unprotected profiles and rejects an incorrect protected-profile password", async () => {
    const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
    const event = { sender };
    const handler = capturedHandlers.get("profileSession:activate");

    vi.mocked(isProfilePasswordSet).mockReturnValueOnce(false);
    await expect(handler!(event, { profileId: "work" })).resolves.toEqual({
      ok: true,
      verified: true,
      profileId: "work",
      lockedOutSeconds: 0,
    });
    expect(getProfileSessionId(sender)).toBe("work");

    vi.mocked(isProfilePasswordSet).mockImplementation((profileId) => profileId === "private");
    vi.mocked(verifyProfilePassword).mockReturnValueOnce(false);
    await expect(handler!(event, { profileId: "private", password: "wrong" })).resolves.toEqual({
      ok: true,
      verified: false,
      lockedOutSeconds: 0,
    });
    expect(getProfileSessionId(sender)).toBe("work");
  });

  it("registers master password IPC handlers without returning verifier material", async () => {
    vi.mocked(isMasterPasswordSet)
      .mockReturnValueOnce(true) // for isSet
      .mockReturnValueOnce(false) // for set
      .mockReturnValue(true); // for clear
    vi.mocked(verifyMasterPassword).mockReturnValue({ verified: true, lockedOutSeconds: 0 });

    expect(await capturedHandlers.get("masterPassword:isSet")!(null)).toBe(true);
    expect(await capturedHandlers.get("masterPassword:set")!(null, "secret")).toEqual({ ok: true });
    expect(await capturedHandlers.get("masterPassword:verify")!(null, "secret")).toEqual({ ok: true, verified: true, lockedOutSeconds: 0 });
    const clearRes = await capturedHandlers.get("masterPassword:clear")!(null, { currentPassword: "secret" });
    console.warn("CLEAR RES", clearRes);
    expect(clearRes).toEqual({ ok: true });

    expect(vi.mocked(setMasterPassword)).toHaveBeenCalledWith("secret");
    expect(vi.mocked(verifyMasterPassword)).toHaveBeenCalledWith("secret");
    expect(vi.mocked(clearMasterPassword)).toHaveBeenCalled();
  });

  it("enforces minimum master password length", async () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(false);
    
    // Short set
    expect(await capturedHandlers.get("masterPassword:set")!(null, "123")).toEqual({ ok: false, error: "Password too short (min 4 characters)" });
    
    // Short change
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    expect(await capturedHandlers.get("masterPassword:change")!(null, { currentPassword: "old", newPassword: "123" }))
      .toEqual({ ok: false, error: "Both current and new passwords must be provided. New password min 4 characters." });
  });

  describe("generic credential IPC removed (VF-AUD-20260912-IPC-P2-003)", () => {
    it.each([
      "credential:set",
      "credential:get",
      "credential:delete",
    ])("does not register %s", (channel) => {
      expect(capturedHandlers.has(channel)).toBe(false);
    });
  });

  describe("dead workspace-propose IPC removed (VF-AUD-20260912-IPC-P2-002)", () => {
    it.each([
      "documentAgent:workspace:proposeChangeset",
      "documentAgent:workspace:proposeMove",
      "documentAgent:workspace:proposeTrash",
    ])("does not register %s", (channel) => {
      expect(capturedHandlers.has(channel)).toBe(false);
    });
  });

  describe("venice:request", () => {
    it("derives the credential profile from the WebContents session", async () => {
      const { performVeniceRequest } = await import("../services/veniceClient");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "work");

      const handler = capturedHandlers.get("venice:request");
      const result = await handler!(
        { sender },
        {
          endpoint: "/models",
          method: "GET",
          profileId: "../../forged",
        },
      );

      expect(result).toMatchObject({ ok: true, status: 200 });
      expect(performVeniceRequest).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: "work" }),
        expect.any(Object),
      );
    });

    it("returns a 451 response when the safety guard blocks the request", async () => {
      expect(capturedHandlers.get("venice:request")).toBeDefined();

      const result = await invoke<VeniceHandlerResult>(
        "venice:request",
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
      expectErrorResult(result);
      expectRecord(result.body);
      expect(result.body).toHaveProperty("error");
      expect(result.body).toHaveProperty("reasonCode");
    });

    it("allows safe requests to proceed to performVeniceRequest", async () => {
      const { performVeniceRequest } = await import("../services/veniceClient");
      vi.mocked(performVeniceRequest).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: { data: [] },
        contentType: "application/json",
      } satisfies VeniceIpcResponse);

      const result = await invoke<VeniceHandlerResult>(
        "venice:request",
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/models",
          method: "GET",
          body: undefined,
        }
      );

      expect(result).toMatchObject({ ok: true, status: 200 });
    });

    it("keeps mandatory child safety active when the optional family filter is disabled", async () => {
      const { performVeniceRequest } = await import("../services/veniceClient");
      const { getRuntimeLocalFamilySafeModeEnabled } = await import("../services/runtimeSafetySettings");
      // Flip the runtime snapshot to OFF for this test (Adult Mode).
      vi.mocked(getRuntimeLocalFamilySafeModeEnabled).mockReturnValueOnce(false);
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

      expect(performVeniceRequest).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: false, status: 451 });
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
      const event = { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents };

      await handler!(event, { message: "hello", maxItems: 1e9, maxTokens: 1e9 });
      expect(pullContext).toHaveBeenLastCalledWith({ message: "hello", maxItems: 50, maxTokens: 8192 }, "default");

      await handler!(event, { message: "hello", maxItems: -10, maxTokens: -10 });
      expect(pullContext).toHaveBeenLastCalledWith({ message: "hello", maxItems: 1, maxTokens: 1 }, "default");

      await handler!(event, { message: "hello", maxItems: "many", maxTokens: "huge" });
      expect(pullContext).toHaveBeenLastCalledWith({ message: "hello", maxItems: 5, maxTokens: 1200 }, "default");
    });
  });

  describe("encrypted conversation vault profile-session isolation", () => {
    it("derives vault and memory-index authority from WebContents", async () => {
      const vault = await import("../services/conversationVault");
      const memory = await import("../services/memoryPuller");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      const event = { sender };
      setProfileSessionId(sender, "work");
      const record = { version: 1, id: "conv-1", title: "Work", createdAt: 1, updatedAt: 1, model: "m", messages: [], metadata: { tags: [], pinned: false, archived: false, source: "user", messageCount: 0 }, memory: { summary: "", topics: [], entities: [], projectRefs: [] } };

      await capturedHandlers.get("conversations:list")!(event, {});
      await capturedHandlers.get("conversations:get")!(event, "conv-1");
      await capturedHandlers.get("conversations:save")!(event, { record, origin: "remote-sync" });
      await capturedHandlers.get("conversations:delete")!(event, { id: "conv-1", origin: "remote-sync" });
      await capturedHandlers.get("conversations:archive")!(event, { id: "conv-1", origin: "remote-sync" });
      await capturedHandlers.get("conversations:search")!(event, "work", {});
      await capturedHandlers.get("conversations:pullContext")!(event, { message: "work" });
      await capturedHandlers.get("conversations:rebuildIndex")!(event);
      await capturedHandlers.get("app:openConversationsFolder")!(event);

      expect(vault.listConversations).toHaveBeenCalledWith({}, "work");
      expect(vault.getConversation).toHaveBeenCalledWith("conv-1", "work");
      expect(vault.saveConversation).toHaveBeenCalledWith(expect.objectContaining({ id: "conv-1" }), "work");
      expect(vault.deleteConversation).toHaveBeenCalledWith("conv-1", "work");
      expect(vault.archiveConversation).toHaveBeenCalledWith("conv-1", "work");
      expect(memory.searchIndex).toHaveBeenCalledWith("work", {}, "work");
      expect(memory.pullContext).toHaveBeenCalledWith(expect.objectContaining({ message: "work" }), "work");
      expect(memory.rebuildIndex).toHaveBeenCalledWith("work");
      expect(vault.getProfileConversationsDir).toHaveBeenCalledWith("work");
    });
  });

  describe("manual backup export profile-session isolation", () => {
    it("binds a one-time export lease to the WebContents profile", async () => {
      const { encryptPayload } = await import("../services/backupCrypto");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      const event = { sender };
      setProfileSessionId(sender, "work");

      const lease = await capturedHandlers.get("sync:beginBackupExport")!(event) as { token: string; profileId: string };
      expect(lease).toMatchObject({ ok: true, profileId: "work", token: expect.any(String) });
      const payload = JSON.stringify({
        _veniceForgeBackup: { profileId: "work" },
        conversations: [{ id: "conv-1", profileId: "work" }],
      });

      await expect(capturedHandlers.get("sync:encryptBackup")!(event, {
        payload,
        password: "password",
        token: lease.token,
      })).resolves.toMatchObject({ ok: true });
      expect(encryptPayload).toHaveBeenCalledWith(payload, "password");

      await expect(capturedHandlers.get("sync:encryptBackup")!(event, {
        payload,
        password: "password",
        token: lease.token,
      })).resolves.toMatchObject({ ok: false });
    });

    it("rejects switched sessions and cross-profile records before encryption", async () => {
      const { encryptPayload } = await import("../services/backupCrypto");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      const event = { sender };
      setProfileSessionId(sender, "work");

      const switchedLease = await capturedHandlers.get("sync:beginBackupExport")!(event) as { token: string };
      setProfileSessionId(sender, "default");
      await expect(capturedHandlers.get("sync:encryptBackup")!(event, {
        payload: JSON.stringify({ _veniceForgeBackup: { profileId: "work" } }),
        password: "password",
        token: switchedLease.token,
      })).resolves.toMatchObject({ ok: false });

      setProfileSessionId(sender, "work");
      const mixedLease = await capturedHandlers.get("sync:beginBackupExport")!(event) as { token: string };
      await expect(capturedHandlers.get("sync:encryptBackup")!(event, {
        payload: JSON.stringify({
          _veniceForgeBackup: { profileId: "work" },
          conversations: [{ id: "default-conversation" }],
        }),
        password: "password",
        token: mixedLease.token,
      })).resolves.toMatchObject({ ok: false });

      const metadataLease = await capturedHandlers.get("sync:beginBackupExport")!(event) as { token: string };
      await expect(capturedHandlers.get("sync:encryptBackup")!(event, {
        payload: JSON.stringify({ _veniceForgeBackup: { profileId: "default" } }),
        password: "password",
        token: metadataLease.token,
      })).resolves.toMatchObject({ ok: false });

      const expiredLease = await capturedHandlers.get("sync:beginBackupExport")!(event) as { token: string };
      const now = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(now + 6 * 60 * 1000);
      try {
        await expect(capturedHandlers.get("sync:encryptBackup")!(event, {
          payload: JSON.stringify({ _veniceForgeBackup: { profileId: "work" } }),
          password: "password",
          token: expiredLease.token,
        })).resolves.toMatchObject({ ok: false });
      } finally {
        clock.mockRestore();
      }
      expect(encryptPayload).not.toHaveBeenCalled();
    });
  });

  describe("origin-aware sync emission", () => {
    const ctx = () =>
      ({ sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents });

    it("chat:save does not call syncBridge for remote-sync origin", async () => {
      const handler = capturedHandlers.get("chat:save");
      const conversation = { id: "chat-1", title: "t", createdAt: 1, updatedAt: 1, model: "m", messages: [] };
      await handler!(ctx(), { conversation, origin: "remote-sync" });
      expect(syncBridge.emitSyncPacket).not.toHaveBeenCalled();
    });

    it("chat:save emits a sync packet once for local-user origin", async () => {
      const handler = capturedHandlers.get("chat:save");
      const conversation = { id: "chat-1", title: "t", createdAt: 1, updatedAt: 1, model: "m", messages: [] };
      await handler!(ctx(), { conversation, origin: "local-user" });
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledTimes(1);
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledWith("conversations", "chat-1", conversation, "local-user");
    });

    it("chat:save defaults omitted origin to local-user and emits", async () => {
      const handler = capturedHandlers.get("chat:save");
      const conversation = { id: "chat-1", title: "t", createdAt: 1, updatedAt: 1, model: "m", messages: [] };
      await handler!(ctx(), { conversation });
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledTimes(1);
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledWith("conversations", "chat-1", conversation, "local-user");
    });

    it("chat:save rejects an invalid mutation origin", async () => {
      const conversation = { id: "chat-1", title: "t", createdAt: 1, updatedAt: 1, model: "m", messages: [] };
      const result = await invoke<IpcActionResult>("chat:save", ctx(), { conversation, origin: "bad-origin" });
      expectErrorResult(result);
      expect(result.error).toMatch(/invalid mutation origin/i);
      expect(syncBridge.emitSyncPacket).not.toHaveBeenCalled();
    });

    it("chat:delete does not call syncBridge for remote-sync origin", async () => {
      const handler = capturedHandlers.get("chat:delete");
      await handler!(ctx(), { id: "chat-1", origin: "remote-sync" });
      expect(syncBridge.emitSyncTombstone).not.toHaveBeenCalled();
    });

    it("chat:delete emits a tombstone once for local-user origin", async () => {
      const handler = capturedHandlers.get("chat:delete");
      await handler!(ctx(), { id: "chat-1", origin: "local-user" });
      expect(syncBridge.emitSyncTombstone).toHaveBeenCalledTimes(1);
      expect(syncBridge.emitSyncTombstone).toHaveBeenCalledWith("conversations", "chat-1", "local-user");
    });

    it("conversations:save does not call syncBridge for remote-sync origin", async () => {
      const handler = capturedHandlers.get("conversations:save");
      const record = { version: 1, id: "conv-1", title: "t", createdAt: 1, updatedAt: 1, model: "m", messages: [], metadata: { tags: [], pinned: false, archived: false, source: "user", messageCount: 0 }, memory: { summary: "", topics: [], entities: [], projectRefs: [] } };
      await handler!(ctx(), { record, origin: "remote-sync" });
      expect(syncBridge.emitSyncPacket).not.toHaveBeenCalled();
    });

    it("conversations:save emits a sync packet once for local-user origin without leaking origin", async () => {
      const handler = capturedHandlers.get("conversations:save");
      const record = { version: 1, id: "conv-1", title: "t", createdAt: 1, updatedAt: 1, model: "m", messages: [], metadata: { tags: [], pinned: false, archived: false, source: "user", messageCount: 0 }, memory: { summary: "", topics: [], entities: [], projectRefs: [] } };
      await handler!(ctx(), { record, origin: "local-user" });
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledTimes(1);
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledWith(
        "conversations",
        "conv-1",
        expect.objectContaining({ id: "conv-1" }),
        "local-user"
      );
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledWith(
        "conversations",
        "conv-1",
        expect.not.objectContaining({ origin: expect.anything() }),
        "local-user"
      );
    });

    it("conversations:save rejects an invalid mutation origin", async () => {
      const record = { version: 1, id: "conv-1", title: "t", createdAt: 1, updatedAt: 1, model: "m", messages: [], metadata: { tags: [], pinned: false, archived: false, source: "user", messageCount: 0 }, memory: { summary: "", topics: [], entities: [], projectRefs: [] } };
      const result = await invoke<IpcActionResult>("conversations:save", ctx(), { record, origin: "bad-origin" });
      expectErrorResult(result);
      expect(result.error).toMatch(/invalid mutation origin/i);
      expect(syncBridge.emitSyncPacket).not.toHaveBeenCalled();
    });

    it("conversations:delete does not call syncBridge for remote-sync origin", async () => {
      const handler = capturedHandlers.get("conversations:delete");
      await handler!(ctx(), { id: "conv-1", origin: "remote-sync" });
      expect(syncBridge.emitSyncTombstone).not.toHaveBeenCalled();
    });

    it("conversations:delete emits a tombstone once for local-user origin", async () => {
      const handler = capturedHandlers.get("conversations:delete");
      await handler!(ctx(), { id: "conv-1", origin: "local-user" });
      expect(syncBridge.emitSyncTombstone).toHaveBeenCalledTimes(1);
      expect(syncBridge.emitSyncTombstone).toHaveBeenCalledWith("conversations", "conv-1", "local-user");
    });

    it("remote-sync origin on a save handler does not emit a sync packet (integration regression)", async () => {
      const handler = capturedHandlers.get("chat:save");
      const record = { id: "chat-1", title: "t", createdAt: 1, updatedAt: 1, model: "m", messages: [] };
      await handler!(ctx(), { conversation: record, origin: "remote-sync" });
      expect(syncBridge.emitSyncPacket).not.toHaveBeenCalled();
    });
  });

  describe("legacy chat profile-session isolation", () => {
    it("derives list/get/save/delete storage authority from WebContents", async () => {
      const storage = await import("../services/chatStorage");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      const event = { sender };
      setProfileSessionId(sender, "work");
      const conversation = { id: "shared", title: "Work", createdAt: 1, updatedAt: 1, model: "m", messages: [], profileId: "forged" };

      await capturedHandlers.get("chat:list")!(event);
      await capturedHandlers.get("chat:listPage")!(event, { offset: 0, limit: 10 });
      await capturedHandlers.get("chat:get")!(event, "shared");
      await capturedHandlers.get("chat:save")!(event, { conversation, origin: "remote-sync" });
      await capturedHandlers.get("chat:delete")!(event, { id: "shared", origin: "remote-sync" });

      expect(storage.listConversations).toHaveBeenNthCalledWith(1, undefined, "work");
      expect(storage.listConversations).toHaveBeenNthCalledWith(2, { offset: 0, limit: 10 }, "work");
      expect(storage.getConversation).toHaveBeenCalledWith("shared", "work");
      expect(storage.saveConversation).toHaveBeenCalledWith(
        expect.objectContaining({ id: "shared", profileId: "work" }),
        "work",
      );
      expect(storage.deleteConversation).toHaveBeenCalledWith("shared", "work");

      expect(await capturedHandlers.get("conversations:detectLegacyHistory")!(event)).toBe(false);
      expect(await capturedHandlers.get("conversations:migrateLegacyHistory")!(event)).toEqual({
        ok: false,
        migrated: 0,
        failed: 0,
        skipped: 0,
        error: "Legacy migration is available only from the default profile.",
      });
    });
  });

  describe("venice:streamChat", () => {
    it("derives the streaming credential profile from the WebContents session", async () => {
      const { performVeniceRequest } = await import("../services/veniceClient");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "work");

      const handler = capturedHandlers.get("venice:streamChat");
      const result = await handler!(
        { sender },
        {
          endpoint: "/chat/completions",
          method: "POST",
          body: { messages: [{ role: "user", content: "hello" }] },
          profileId: "../../forged",
        },
      );

      expect(result).toMatchObject({ ok: true, status: 200 });
      expect(performVeniceRequest).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: "work" }),
        expect.objectContaining({ onDelta: expect.any(Function) }),
      );
    });

    it("returns 451 when the safety guard blocks streaming chat", async () => {
      expect(capturedHandlers.get("venice:streamChat")).toBeDefined();

      const result = await invoke<VeniceHandlerResult>(
        "venice:streamChat",
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
      const result = await invoke<VeniceHandlerResult>(
        "venice:streamChat",
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
      expectErrorResult(result);
      expectRecord(result.body);
      expect(result.body.error).toMatch(/streaming is only available/i);
    });

    it("Phase 8 — /responses streams through the guarded single-turn path (no agent tool loop)", async () => {
      const { performGuardedVeniceRequest } = await import("../services/guardPipeline");
      const { runChatAgentLoop } = await import("../agent/runtime/chat-agent-runner");
      const guardedSpy = vi.mocked(performGuardedVeniceRequest);
      const agentLoopSpy = vi.mocked(runChatAgentLoop);
      guardedSpy.mockClear();
      agentLoopSpy.mockClear();

      const result = await invoke<VeniceHandlerResult>(
        "venice:streamChat",
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/responses",
          method: "POST",
          body: { model: "test-model", input: "hello" },
        }
      );

      expect(result).toMatchObject({ ok: true, status: 200 });
      expect(guardedSpy).toHaveBeenCalledTimes(1);
      expect(agentLoopSpy).not.toHaveBeenCalled();
    });

    it("Phase 8 — /chat/completions still uses the bounded agent tool loop", async () => {
      const { performGuardedVeniceRequest } = await import("../services/guardPipeline");
      const { runChatAgentLoop } = await import("../agent/runtime/chat-agent-runner");
      const guardedSpy = vi.mocked(performGuardedVeniceRequest);
      const agentLoopSpy = vi.mocked(runChatAgentLoop);
      guardedSpy.mockClear();
      agentLoopSpy.mockClear();

      await invoke<VeniceHandlerResult>(
        "venice:streamChat",
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/chat/completions",
          method: "POST",
          body: { model: "test-model", messages: [{ role: "user", content: "hello" }] },
        }
      );

      expect(agentLoopSpy).toHaveBeenCalledTimes(1);
    });

    it("Phase 8 — the safety guard blocks /responses payloads before dispatch", async () => {
      const { runChatAgentLoop } = await import("../agent/runtime/chat-agent-runner");
      const agentLoopSpy = vi.mocked(runChatAgentLoop);
      agentLoopSpy.mockClear();

      const result = await invoke<VeniceHandlerResult>(
        "venice:streamChat",
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/responses",
          method: "POST",
          body: {
            model: "test-model",
            input: [{ type: "message", role: "user", content: "loli" }],
          },
        }
      );

      expect(result).toMatchObject({ ok: false, status: 451 });
      expect(agentLoopSpy).not.toHaveBeenCalled();
    });

    it("Phase 8 — rejects non-POST methods on /responses (validator method gate)", async () => {
      const result = await invoke<VeniceHandlerResult>(
        "venice:streamChat",
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        {
          endpoint: "/responses",
          method: "GET",
        }
      );

      expect(result).toMatchObject({ ok: false, statusText: "Local transport error" });
      expectRecord(result.body);
      // The shared endpoint/method validator rejects GET on the POST-only
      // /responses entry before the streaming handler runs.
      expect(result.body.error).toMatch(/not allowed for endpoint \/responses/i);
    });
  });


  describe("app:loadYamlFile", () => {
    it("reads the selected YAML file from the validated open descriptor", async () => {
      const handler = capturedHandlers.get("app:loadYamlFile");
      expect(handler).toBeDefined();

      const { dialog } = await import("electron");
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vf-yaml-import-"));
      const filePath = path.join(tmpDir, "theme.yaml");
      await fs.writeFile(filePath, "theme: path\n", "utf-8");
      const probe = await fs.open(filePath, "r");
      const fileHandlePrototype = Object.getPrototypeOf(probe) as { readFile: (options: { encoding: "utf-8" }) => Promise<string> };
      await probe.close();
      const descriptorReadSpy = vi.spyOn(fileHandlePrototype, "readFile").mockResolvedValue("theme: descriptor\n");

      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: [filePath],
      });

      try {
        const result = await handler!(
          { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents }
        );

        expect(result).toMatchObject({
          ok: true,
          canceled: false,
          data: "theme: descriptor\n",
        });
        expect(descriptorReadSpy).toHaveBeenCalledWith({ encoding: "utf-8" });
      } finally {
        descriptorReadSpy.mockRestore();
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("apiKey:set", () => {
    it("rejects empty API keys", async () => {
      const result = await invoke<ApiKeySetResult>(
        "apiKey:set",
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        ""
      );

      expect(result).toMatchObject({ ok: false, code: "INVALID_KEY" });
      expectErrorResult(result);
      expect(result.safeMessage).toMatch(/non-empty/i);
    });
  });

  it("does not register the removed fixed-folder image writer", () => {
    expect(capturedHandlers.has("app:saveRoutedImage")).toBe(false);
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
      if (originalFetch) globalThis.fetch = originalFetch;
      else vi.unstubAllGlobals();
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

      const result = await invoke<JinaHandlerResult>(
        "jina:request",
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000 },
      );

      // Body screen blocks → 451 with the canonical userMessage.
      expect(result).toMatchObject({ ok: false, status: 451 });
      expectErrorResult(result);
      expectRecord(result.body);
      expect(result.body).toMatchObject({
        reasonCode: "CSAM_EXPLICIT_TERM",
        category: "csam_request",
        severity: "critical",
      });
      expect(result.body.error).toMatch(/blocked by mandatory child-safety protection/i);
      expect(JSON.stringify(result.body)).not.toContain("Some content");
    });

    it("drops unsafe renderer-supplied Jina headers and keeps only allowlisted forwarding headers", async () => {
      const { getRuntimeLocalFamilySafeModeEnabled } = await import("../services/runtimeSafetySettings");
      vi.mocked(getRuntimeLocalFamilySafeModeEnabled).mockReturnValue(false);
      globalThis.fetch = vi.fn(async () =>
        new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
      ) as unknown as typeof globalThis.fetch;

      const result = await invoke<JinaHandlerResult>(
        "jina:request",
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

      const result = await invoke<JinaHandlerResult>(
        "jina:request",
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000 },
      );

      expect(result.status).toBe(451);
      expectErrorResult(result);
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

      const result = await invoke<JinaHandlerResult>(
        "jina:request",
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000 },
      );

      expect(result).toMatchObject({ ok: false, status: 413 });
      expectErrorResult(result);
      expect(result.error).toMatch(/2 MiB limit/i);
      expect(cancelled).toBe(true);
    });

    it("keeps mandatory response screening active when the optional filter is off", async () => {
      const { getRuntimeLocalFamilySafeModeEnabled } = await import("../services/runtimeSafetySettings");
      // Use mockReturnValue so the URL pre-check + the body screen both
      // observe Adult Mode.
      vi.mocked(getRuntimeLocalFamilySafeModeEnabled).mockReturnValue(false);

      // Body is intentionally child-exploitation material; the mandatory
      // guard must block it even when the optional family filter is off.
      globalThis.fetch = vi.fn(async () =>
        new Response(
          "csam term in body — must remain blocked",
          { status: 200, headers: { "content-type": "text/plain" } },
        ),
      ) as unknown as typeof globalThis.fetch;

      const result = await invoke<JinaHandlerResult>(
        "jina:request",
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000 },
      );

      expect(result.status).toBe(451);
      expectErrorResult(result);
    });
  });

  // VERIFY-099: credential and password administration is bound to the
  // authenticated WebContents session. Renderer profile ids are retained in
  // the preload types for compatibility but cannot select a secure-store row.
  describe("audit 2026-07-08: profile-scoped credential isolation", () => {
    const ctx = () =>
      ({ sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents });

    function sessionCtx(profileId = "work") {
      const event = ctx();
      setProfileSessionId(event.sender, profileId);
      return event;
    }

    it("binds Venice key status, set, delete, and test to the session profile", async () => {
      const event = sessionCtx();
      vi.mocked(isApiKeyConfigured).mockReturnValue(true);

      expect(await capturedHandlers.get("apiKey:isConfigured")!(event, "../../forged")).toBe(true);
      expect(await capturedHandlers.get("apiKey:set")!(event, { key: "sk-valid", profileId: "default" })).toEqual({ ok: true, storageMode: "encrypted" });
      expect(await capturedHandlers.get("apiKey:delete")!(event, "default")).toEqual({ ok: true, storageMode: "encrypted" });
      await capturedHandlers.get("apiKey:test")!(event, "../../forged");

      expect(isApiKeyConfigured).toHaveBeenCalledWith("work");
      expect(setApiKey).toHaveBeenCalledWith("sk-valid", "work");
      expect(deleteApiKey).toHaveBeenCalledWith("work");
    });

    it("binds fallback-provider key status, set, and delete to the session profile", async () => {
      const event = sessionCtx();

      await capturedHandlers.get("providerApiKey:isConfigured")!(event, { providerId: "groq", profileId: "default" });
      await capturedHandlers.get("providerApiKey:set")!(event, { providerId: "groq", key: "sk-provider", profileId: "../../forged" });
      await capturedHandlers.get("providerApiKey:delete")!(event, { providerId: "groq", profileId: "default" });

      expect(isProviderApiKeyConfigured).toHaveBeenCalledWith("groq", "work");
      expect(setProviderApiKey).toHaveBeenCalledWith("groq", "sk-provider", "work");
      expect(deleteProviderApiKey).toHaveBeenCalledWith("groq", "work");
      expect(disableProvider).toHaveBeenCalledWith("work", "groq");
    });

    it("binds fallback consent to the session and requires a configured provider key", async () => {
      const event = sessionCtx();
      vi.mocked(isProviderApiKeyConfigured).mockImplementation((providerId, profileId) =>
        providerId === "anthropic" && profileId === "work",
      );

      await capturedHandlers.get("providerSettings:get")!(event);
      const accepted = await capturedHandlers.get("providerSettings:update")!(event, {
        enabledProviders: { anthropic: true },
        autoFallbackEnabled: true,
        fallbackOrdering: ["anthropic"],
      });
      const rejected = await capturedHandlers.get("providerSettings:update")!(event, {
        enabledProviders: { together: true },
      });

      expect(getProviderSettings).toHaveBeenCalledWith("work");
      expect(updateProviderSettings).toHaveBeenCalledWith("work", expect.objectContaining({
        enabledProviders: { anthropic: true },
      }));
      expect(accepted).toMatchObject({ ok: true });
      expect(rejected).toMatchObject({ ok: false, error: expect.stringMatching(/not configured/i) });
    });

    it("rejects duplicate, unknown, and disabled fallback ordering entries", async () => {
      const event = sessionCtx();
      vi.mocked(isProviderApiKeyConfigured).mockReturnValue(true);
      vi.mocked(getProviderSettings).mockReturnValue({
        enabledProviders: { anthropic: true },
        autoFallbackEnabled: true,
        fallbackOrdering: [],
        nativeFallbackModels: { anthropic: "claude-3-5-sonnet-latest" },
      });
      const handler = capturedHandlers.get("providerSettings:update")!;

      await expect(handler(event, { fallbackOrdering: ["anthropic", "anthropic"] }))
        .resolves.toMatchObject({ ok: false, error: expect.stringMatching(/duplicate/i) });
      await expect(handler(event, { fallbackOrdering: ["unknown"] }))
        .resolves.toMatchObject({ ok: false, error: expect.stringMatching(/invalid provider/i) });
      await expect(handler(event, { fallbackOrdering: ["together"] }))
        .resolves.toMatchObject({ ok: false, error: expect.stringMatching(/enabled/i) });
      expect(updateProviderSettings).not.toHaveBeenCalled();
    });

    it("binds Jina key status, set, delete, and test to the session profile", async () => {
      vi.mocked(getJinaApiKey).mockImplementation((pid) =>
        pid === "work" ? "jina-key-A" : "jina-key-default",
      );
      vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
      const event = sessionCtx();

      await capturedHandlers.get("jinaApiKey:isConfigured")!(event, "../../forged");
      expect(await capturedHandlers.get("jinaApiKey:set")!(event, { key: "jina-valid-key", profileId: "default" })).toEqual({ ok: true });
      expect(await capturedHandlers.get("jinaApiKey:delete")!(event, "default")).toEqual({ ok: true });
      const result = await invoke<JinaConnectionResult>("jinaApiKey:test", event, "../../forged");
      expectOkResult(result);
      expect(isJinaApiKeyConfigured).toHaveBeenCalledWith("work");
      expect(setJinaApiKey).toHaveBeenCalledWith("jina-valid-key", "work");
      expect(deleteJinaApiKey).toHaveBeenCalledWith("work");
      expect(getJinaApiKey).toHaveBeenCalledWith("work");

      vi.unstubAllGlobals();
    });

    it("binds profile-password set and clear mutations to the session profile", async () => {
      const event = sessionCtx();

      expect(await capturedHandlers.get("profilePassword:set")!(event, { profileId: "personal", password: "secret" })).toEqual({ ok: true });
      vi.mocked(verifyProfilePassword).mockReturnValueOnce(true);
      expect(await capturedHandlers.get("profilePassword:clear")!(event, { profileId: "personal", currentPassword: "secret" })).toEqual({ ok: true });

      expect(setProfilePassword).toHaveBeenCalledWith("secret", "work");
      expect(clearProfilePassword).toHaveBeenCalledWith("work");
    });

    it("jina:request uses the WebContents session profile's Jina key", async () => {
      vi.mocked(getJinaApiKey).mockImplementation((pid) =>
        pid === "work" ? "jina-key-A" : "jina-key-default",
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })),
      );

      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "work");
      const result = await invoke<JinaHandlerResult>(
        "jina:request",
        { sender },
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000, profileId: "default" },
      );

      expectOkResult(result);
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

      const result = await invoke<JinaHandlerResult>(
        "jina:request",
        ctx(),
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000 },
      );

      expectOkResult(result);
      const fetchMock = vi.mocked(globalThis.fetch);
      const sentHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
      expect(sentHeaders?.Authorization).toBe("Bearer jina-key-default");

      vi.unstubAllGlobals();
    });

    it("jina:request ignores an invalid renderer profileId and uses the session", async () => {
      vi.mocked(getJinaApiKey).mockImplementation((pid) =>
        pid === "work" ? "jina-key-A" : "jina-key-default",
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })),
      );

      const handler = capturedHandlers.get("jina:request");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "work");
      const result = await handler!(
        { sender },
        { url: "https://r.jina.ai/https://example.com", headers: {}, timeoutMs: 5000, profileId: "../../x" },
      );

      expect(result).toMatchObject({ ok: true, status: 200 });
      const fetchMock = vi.mocked(globalThis.fetch);
      const sentHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
      expect(sentHeaders?.Authorization).toBe("Bearer jina-key-A");

      vi.unstubAllGlobals();
    });
  });

  // VF-20260916-P3-001: jinaApiKey:test must enforce the same timeout and
  // bounded-body discipline as jina:request so a hung or oversized probe
  // cannot pin the handler open.
  describe("jinaApiKey:test timeout and body bounds", () => {
    const ctx = () =>
      ({ sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("aborts a hanging probe and returns a localized timeout result", async () => {
      vi.useFakeTimers();
      let observedSignal: AbortSignal | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, init?: RequestInit) => {
          observedSignal = init?.signal ?? undefined;
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("This operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          });
        }),
      );

      const pending = invoke<JinaConnectionResult>("jinaApiKey:test", ctx());
      await vi.advanceTimersByTimeAsync(15_000);
      const result = await pending;

      expect(observedSignal?.aborted).toBe(true);
      expect(result).toEqual({ ok: false, status: 0, message: "Jina connection test timed out." });
    });

    it("keeps the timeout result distinct from ordinary network failures", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));

      const result = await invoke<JinaConnectionResult>("jinaApiKey:test", ctx());

      expect(result).toMatchObject({ ok: false, status: 0 });
      expect(result.message).toMatch(/fetch failed/i);
      expect(result.message).not.toMatch(/timed out/i);
    });

    it("cancels an over-limit probe body and still reports the response status", async () => {
      let cancelled = false;
      const chunk = new Uint8Array(64 * 1024);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": "text/plain" } })),
      );

      const result = await invoke<JinaConnectionResult>("jinaApiKey:test", ctx());

      expect(result).toEqual({ ok: true, status: 200, message: "Jina connection successful" });
      expect(cancelled).toBe(true);
    });
  });

  // Audit 2026-07-08 #2: default profile cannot be password-locked (Option A).
  describe("audit 2026-07-08: default profile lock policy", () => {
    const ctx = () =>
      ({ sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents });

    it("profilePassword:set rejects the reserved default id without writing", async () => {
      const event = ctx();
      const result = await invoke<IpcActionResult>("profilePassword:set", event, { profileId: "work", password: "secret" });
      expect(result).toMatchObject({ ok: false });
      expectErrorResult(result);
      expect(result.error).toMatch(/default profile cannot be password-protected/);
      // MUST NOT have written a verifier row to secure-prefs.
      expect(setProfilePassword).not.toHaveBeenCalled();
    });

    it("profilePassword:set still works for non-default valid ids", async () => {
      const handler = capturedHandlers.get("profilePassword:set");
      const event = ctx();
      setProfileSessionId(event.sender, "work");
      const result = await handler!(event, { profileId: "default", password: "secret" });
      expect(result).toEqual({ ok: true });
      expect(setProfilePassword).toHaveBeenCalledWith("secret", "work");
    });
  });

  describe("sync:acknowledgeOperation", () => {
    it("rejects an operationId that is not 64 lowercase hex characters", async () => {
      const handler = capturedHandlers.get("sync:acknowledgeOperation");
      const result = await handler!(null, { operationId: "op-abc", ok: true });
      expect(result).toEqual({ ok: false, error: "Invalid operationId." });
    });

    it("delegates a valid 64-hex operationId to acknowledgeOperation", async () => {
      const handler = capturedHandlers.get("sync:acknowledgeOperation");
      const validOpId = "a".repeat(64);
      const result = await handler!(null, { operationId: validOpId, ok: true });
      expect(result).toEqual({ ok: false, error: "No such in-flight operation." });
    });
  });

  describe("sync:applyRemoteMutation", () => {
    beforeEach(() => __resetRemoteApplyGrantsForTests());

    it("rejects renderer-claimed remote sync without a main-issued grant", async () => {
      const handler = capturedHandlers.get("sync:applyRemoteMutation");
      const result = await handler?.(null, {
        storeName: "conversations",
        id: "conv-unauthorized",
        recordJson: JSON.stringify({ id: "conv-unauthorized" }),
        remoteApplyToken: "renderer-invented",
      });
      expect(result).toEqual({ ok: false, error: "Remote mutation authority rejected." });
    });

    it("accepts only the exact store and record bound to the grant", async () => {
      const handler = capturedHandlers.get("sync:applyRemoteMutation");
      const token = issueRemoteApplyGrant("f".repeat(64), "conversations", "conv-authorized");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "work");
      const result = await handler?.({ sender }, {
        storeName: "conversations",
        id: "conv-authorized",
        recordJson: JSON.stringify({ id: "conv-authorized", title: "Remote" }),
        remoteApplyToken: token,
      });
      expect(result).toEqual({ ok: true });
      const storage = await import("../services/chatStorage");
      expect(storage.saveConversation).toHaveBeenCalledWith(
        expect.objectContaining({ id: "conv-authorized" }),
        "work",
      );
    });

    // VERIFY-134: pre-fix, applyRemoteMutation returned { ok: true }
    // regardless of whether the storage layer accepted the write or
    // delete, masking partial application on the renderer side. Each
    // store arm now bubbles the failure through the IPC response.
    it("surfaces conversations save failure as {ok:false}", async () => {
      const handler = capturedHandlers.get("sync:applyRemoteMutation");
      const storage = await import("../services/chatStorage");
      vi.mocked(storage.saveConversation).mockResolvedValueOnce({ ok: false, error: "schema rejected" });
      const token = issueRemoteApplyGrant("a".repeat(64), "conversations", "conv-bubbles");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "default");
      const result = await handler?.({ sender }, {
        storeName: "conversations",
        id: "conv-bubbles",
        recordJson: JSON.stringify({ id: "conv-bubbles", title: "Remote" }),
        remoteApplyToken: token,
      });
      expect(result).toEqual({ ok: false, error: "conversations(save): schema rejected" });
    });

    it("surfaces conversations delete failure as {ok:false}", async () => {
      const handler = capturedHandlers.get("sync:applyRemoteMutation");
      const storage = await import("../services/chatStorage");
      vi.mocked(storage.deleteConversation).mockResolvedValueOnce({ ok: false });
      const token = issueRemoteApplyGrant("b".repeat(64), "conversations", "conv-bubbles-del");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "default");
      const result = await handler?.({ sender }, {
        storeName: "conversations",
        id: "conv-bubbles-del",
        delete: true,
        remoteApplyToken: token,
      });
      expect(result).toEqual({ ok: false, error: "conversations(delete): rejected" });
    });

    it("surfaces character_cards save failure as {ok:false}", async () => {
      const handler = capturedHandlers.get("sync:applyRemoteMutation");
      const storage = await import("../services/characterCardStorage");
      vi.mocked(storage.saveCharacterCard).mockResolvedValueOnce({ ok: false, error: "atomic-write failed" });
      const token = issueRemoteApplyGrant("c".repeat(64), "character_cards", "card-bubbles");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "default");
      const result = await handler?.({ sender }, {
        storeName: "character_cards",
        id: "card-bubbles",
        recordJson: JSON.stringify({ id: "card-bubbles", name: "Card" }),
        remoteApplyToken: token,
      });
      expect(result).toEqual({ ok: false, error: "character_cards(save): atomic-write failed" });
    });

    it("surfaces rp_chats delete failure as {ok:false}", async () => {
      const handler = capturedHandlers.get("sync:applyRemoteMutation");
      const storage = await import("../services/rpChatStorage");
      vi.mocked(storage.deleteRpChat).mockResolvedValueOnce({ ok: false });
      const token = issueRemoteApplyGrant("d".repeat(64), "rp_chats", "chat-bubbles");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "default");
      const result = await handler?.({ sender }, {
        storeName: "rp_chats",
        id: "chat-bubbles",
        delete: true,
        remoteApplyToken: token,
      });
      expect(result).toEqual({ ok: false, error: "rp_chats(delete): rejected" });
    });

    it("surfaces rpStores persona save failure as {ok:false}", async () => {
      const handler = capturedHandlers.get("sync:applyRemoteMutation");
      const stores = await import("../services/rpStores");
      vi.mocked(stores.personaStore.save).mockResolvedValueOnce({ ok: false, error: "disk full" });
      const token = issueRemoteApplyGrant("e".repeat(64), "personas", "persona-bubbles");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "default");
      const result = await handler?.({ sender }, {
        storeName: "personas",
        id: "persona-bubbles",
        recordJson: JSON.stringify({ id: "persona-bubbles", name: "P" }),
        remoteApplyToken: token,
      });
      expect(result).toEqual({ ok: false, error: "personas(save): disk full" });
    });

    it("surfaces rpStores lorebooks remove failure as {ok:false}", async () => {
      const handler = capturedHandlers.get("sync:applyRemoteMutation");
      const stores = await import("../services/rpStores");
      vi.mocked(stores.lorebookStore.remove).mockResolvedValueOnce({ ok: false });
      const token = issueRemoteApplyGrant("0".repeat(64), "lorebooks", "lore-bubbles");
      const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
      setProfileSessionId(sender, "default");
      const result = await handler?.({ sender }, {
        storeName: "lorebooks",
        id: "lore-bubbles",
        delete: true,
        remoteApplyToken: token,
      });
      expect(result).toEqual({ ok: false, error: "lorebooks(delete): rejected" });
    });
  });

  describe("sender-frame validation on privileged channels", () => {
    function untrustedEvent(senderExtras = {}) {
      return {
        senderFrame: { url: "http://evil.com/attacker.html" },
        sender: { isDestroyed: () => false, send: vi.fn(), getURL: () => "http://evil.com/attacker.html", ...senderExtras } as unknown as Electron.WebContents,
      };
    }

    it.each([
      ["apiKey:isConfigured", ["default"]],
      ["apiKey:getStatus", ["default"]],
    ])("rejects secret API access from an untrusted frame on %s", async (channel, args) => {
      const handler = capturedHandlers.get(channel);
      await expect(handler!(untrustedEvent(), ...args)).rejects.toThrow(/untrusted/i);
    });

    it.each([
      ["config:writeSanitized", [{ theme: "dark" }]],
      ["safety:setFamilySafeMode", [{ enabled: true, masterPassword: "secret" }]],
    ])("rejects config mutation from an untrusted frame on %s", async (channel, args) => {
      const handler = capturedHandlers.get(channel);
      await expect(handler!(untrustedEvent(), ...args)).rejects.toThrow(/untrusted/i);
    });

    it.each([
      ["app:saveJsonFile", ["{}", "export.json"]],
    ])("rejects file operation from an untrusted frame on %s", async (channel, args) => {
      const handler = capturedHandlers.get(channel);
      await expect(handler!(untrustedEvent(), ...args)).rejects.toThrow(/untrusted/i);
    });

    it.each([
      ["replicate:generateImage", [{ model: "black-forest-labs/flux-schnell", input: { prompt: "test" } }]],
      ["huggingface:getModelCatalog", [{}]],
    ])("rejects provider dispatch from an untrusted frame on %s", async (channel, args) => {
      const handler = capturedHandlers.get(channel);
      await expect(handler!(untrustedEvent(), ...args)).rejects.toThrow(/untrusted/i);
    });

    it("rejects paid generation submission from an untrusted frame", async () => {
      const handler = capturedHandlers.get("backgroundTask:submitPaidQueue");
      await expect(handler!(untrustedEvent(), {
        operation: "video",
        wirePayload: { model: "test", prompt: "test" },
      })).rejects.toThrow(/untrusted/i);
    });

    it("allows a trusted dev sender to invoke a privileged handler", async () => {
      const handler = capturedHandlers.get("apiKey:isConfigured");
      const trusted = {
        senderFrame: { url: "http://localhost:5173" },
        sender: { isDestroyed: () => false, send: vi.fn(), getURL: () => "http://localhost:5173" } as unknown as Electron.WebContents,
      };
      vi.mocked(isApiKeyConfigured).mockReturnValueOnce(true);
      await expect(handler!(trusted, "default")).resolves.toBe(true);
    });
  });
});
