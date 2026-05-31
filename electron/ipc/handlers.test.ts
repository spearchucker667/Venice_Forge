// @vitest-environment node
/** @fileoverview Unit tests for Electron IPC handler registration and safety guard enforcement. */

import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";
import path from "path";
import os from "os";

const capturedHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === "home") return os.homedir();
      if (name === "downloads") return path.join(os.homedir(), "Downloads");
      if (name === "documents") return path.join(os.homedir(), "Documents");
      if (name === "userData") return path.join(os.tmpdir(), "vf-test-data");
      return os.tmpdir();
    }),
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

vi.mock("../services/secureStore", () => ({
  deleteApiKey: vi.fn(),
  deleteJinaApiKey: vi.fn(),
  getJinaApiKey: vi.fn(() => null),
  getSecureStoreStatus: vi.fn(() => ({ encryptionAvailable: true, mode: "safeStorage", corrupted: false, error: null })),
  isApiKeyConfigured: vi.fn(() => false),
  isJinaApiKeyConfigured: vi.fn(() => false),
  setApiKey: vi.fn(),
  setJinaApiKey: vi.fn(),
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

vi.mock("../services/chatStorage", () => ({
  deleteConversation: vi.fn(async () => ({ ok: true })),
  getConversation: vi.fn(async () => null),
  listConversations: vi.fn(async () => []),
  saveConversation: vi.fn(async () => ({ ok: true })),
}));

import { registerIpcHandlers } from "./handlers";

describe("registerIpcHandlers", () => {
  beforeAll(() => {
    capturedHandlers.clear();
    registerIpcHandlers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
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
        statusText: "Blocked by local safety guard",
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
    it("rejects paths outside Downloads and Documents", async () => {
      const handler = capturedHandlers.get("app:readLocalFile");
      expect(handler).toBeDefined();

      // Use the home directory itself — it exists but is outside Downloads/Documents
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        os.homedir()
      );

      expect(result).toMatchObject({
        ok: false,
        error: "File must be inside Downloads or Documents.",
      });
    });

    it("rejects paths with null bytes", async () => {
      const handler = capturedHandlers.get("app:readLocalFile");
      const result = await handler!(
        { sender: { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents },
        "file\0.txt"
      );

      expect(result).toMatchObject({
        ok: false,
        error: "Invalid file path.",
      });
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
});
