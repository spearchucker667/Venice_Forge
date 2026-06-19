// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Store registered handlers
const ipcHandlers = new Map<string, (...args: any[]) => Promise<any> | any>();

// Mock electron module with self-contained definitions and test-only exports
vi.mock("electron", () => {
  const mockWebContents = {
    getURL: vi.fn(() => "https://example.com"),
    getTitle: vi.fn(() => "Example Page"),
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    isLoading: vi.fn(() => false),
    on: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    loadURL: vi.fn(async () => {}),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    close: vi.fn(),
    executeJavaScript: vi.fn(),
  };

  const mockSession = {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    webRequest: {
      onBeforeRequest: vi.fn(),
    },
  };

  const mockWebContentsView = vi.fn().mockImplementation(function() {
    return {
      webContents: mockWebContents,
      setBounds: vi.fn(),
    };
  });

  return {
    BrowserWindow: vi.fn().mockImplementation(function() {
      return {
        getContentBounds: vi.fn(() => ({ width: 1000, height: 800 })),
        contentView: {
          addChildView: vi.fn(),
          removeChildView: vi.fn(),
        },
        webContents: {
          send: vi.fn(),
        },
        isDestroyed: vi.fn(() => false),
      };
    }),
    WebContentsView: mockWebContentsView,
    ipcMain: {
      handle: vi.fn((channel, handler) => {
        ipcHandlers.set(channel, handler);
      }),
    },
    session: {
      fromPartition: vi.fn(() => mockSession),
    },
    dialog: {
      showMessageBox: vi.fn(async () => ({ response: 0 })),
    },
    shell: {
      openExternal: vi.fn(async () => {}),
    },
    // Test-only exports for direct validation access
    _mockWebContents: mockWebContents,
    _mockSession: mockSession,
    _mockWebContentsView: mockWebContentsView,
  };
});

// Mock security dependencies
vi.mock("../security/researchBrowserNetworkPolicy", () => ({
  validateResearchBrowserNetworkUrl: vi.fn(async (url: string) => {
    if (url.includes("blocked")) {
      return { allowed: false, reason: "Blocked unsafe URL" };
    }
    return { allowed: true, url };
  }),
}));

vi.mock("../utils/urlSecurity", () => ({
  isAllowedResearchBrowserUrl: vi.fn((url: string) => {
    if (url.startsWith("file://") || url.startsWith("chrome://")) return false;
    return true;
  }),
  isTrustedExternalUrl: vi.fn((url: string) => {
    return url.startsWith("https://trusted.com");
  }),
}));

vi.mock("../../src/shared/safety", () => ({
  screenResponseBody: vi.fn((body: string) => {
    if (body.includes("secret-token")) {
      return { allowed: false, userMessage: "Blocked due to safety violation" };
    }
    return { allowed: true, value: body };
  }),
}));

vi.mock("./runtimeSafetySettings", () => ({
  getRuntimeLocalFamilySafeModeEnabled: vi.fn(() => true),
}));

// Now setup imports from electron (retrieves the mock instances) and the server setup
import { 
  _mockWebContents as mockWebContents, 
  _mockSession as mockSession, 
  BrowserWindow,
  shell
} from "electron";
import { setupResearchBrowserIpc, resetResearchBrowserIpcForTesting } from "./researchBrowserServer";

describe("Research Browser Server Main Process Integration", () => {
  let mockWindow: any;

  beforeEach(() => {
    vi.clearAllMocks();
    ipcHandlers.clear();
    resetResearchBrowserIpcForTesting();
    mockWindow = new (BrowserWindow as any)();
    setupResearchBrowserIpc(mockWindow);
  });

  it("should register all expected IPC handlers on startup", () => {
    const expectedChannels = [
      "researchBrowser:create",
      "researchBrowser:destroy",
      "researchBrowser:setVisible",
      "researchBrowser:setBounds",
      "researchBrowser:navigate",
      "researchBrowser:back",
      "researchBrowser:forward",
      "researchBrowser:reload",
      "researchBrowser:stop",
      "researchBrowser:getState",
      "researchBrowser:openExternal",
      "researchBrowser:scrapeCurrent",
      "researchBrowser:captureMetadata",
    ];

    for (const channel of expectedChannels) {
      expect(ipcHandlers.has(channel)).toBe(true);
    }
  });

  describe("researchBrowser:create and destroy lifecycle", () => {
    it("should initialize WebContentsView and set sandboxed preferences", async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      expect(createHandler).toBeDefined();

      const result = await createHandler();
      expect(result).toEqual({ ok: true });

      const { session } = await import("electron");
      expect(session.fromPartition).toHaveBeenCalledWith("venice-forge-research-browser");

      // Verifies that permission handler blocks camera/microphone/notifications/etc.
      expect(mockSession.setPermissionRequestHandler).toHaveBeenCalled();
      const permissionCallback = (mockSession.setPermissionRequestHandler as any).mock.calls[0][0];
      const mockPermissionCb = vi.fn();
      permissionCallback(null, "geolocation", mockPermissionCb);
      expect(mockPermissionCb).toHaveBeenCalledWith(false);

      // Verifies permission check handler returns false
      expect(mockSession.setPermissionCheckHandler).toHaveBeenCalled();
      const checkHandler = (mockSession.setPermissionCheckHandler as any).mock.calls[0][0];
      expect(checkHandler(null, "notifications")).toBe(false);

      // Verifies that popup window handlers are registered and deny popups
      expect(mockWebContents.setWindowOpenHandler).toHaveBeenCalled();
      const popupHandler = (mockWebContents.setWindowOpenHandler as any).mock.calls[0][0];
      expect(popupHandler()).toEqual({ action: "deny" });
    });

    it("should tear down the view on destroy", async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      await createHandler();

      const destroyHandler = ipcHandlers.get("researchBrowser:destroy");
      const result = await destroyHandler();
      expect(result).toEqual({ ok: true });
      expect(mockWebContents.close).toHaveBeenCalled();
    });
  });

  describe("bounds and visibility constraints", () => {
    it("should clamp and position bounds within main window constraints", async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      await createHandler();

      const setBoundsHandler = ipcHandlers.get("researchBrowser:setBounds");

      // Set valid visible bounds
      const boundsInput = { x: 50, y: 50, width: 600, height: 400, visible: true };
      const result = await setBoundsHandler(null, boundsInput);
      expect(result).toEqual({ ok: true });

      // Verify that children are properly added and bounds set
      expect(mockWindow.contentView.addChildView).toHaveBeenCalled();
    });

    it("should reject invalid parameter types on setBounds", async () => {
      const setBoundsHandler = ipcHandlers.get("researchBrowser:setBounds");
      const badInput = { x: "invalid", y: 50, width: 600, height: 400, visible: true };
      const result = await setBoundsHandler(null, badInput);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Invalid bounds parameters/);
    });

    it("should enforce boolean visibility check on setVisible", async () => {
      const setVisibleHandler = ipcHandlers.get("researchBrowser:setVisible");
      const result = await setVisibleHandler(null, "not-a-boolean");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Invalid boolean/);
    });
  });

  describe("navigation and URL rules execution", () => {
    beforeEach(async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      await createHandler();
    });

    it("should load URL when validation passes", async () => {
      const navigateHandler = ipcHandlers.get("researchBrowser:navigate");
      const result = await navigateHandler(null, { urlOrQuery: "https://safe.com" });

      expect(result.ok).toBe(true);
      expect(mockWebContents.loadURL).toHaveBeenCalledWith("https://safe.com");
    });

    it("should block loading when URL validation fails", async () => {
      const navigateHandler = ipcHandlers.get("researchBrowser:navigate");
      const result = await navigateHandler(null, { urlOrQuery: "https://blocked-site.com" });

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Blocked unsafe URL");
      expect(mockWebContents.loadURL).not.toHaveBeenCalled();
    });

    it("should construct search queries for non-URLs", async () => {
      const navigateHandler = ipcHandlers.get("researchBrowser:navigate");
      await navigateHandler(null, { urlOrQuery: "quantum computing research", searchProvider: "google" });

      expect(mockWebContents.loadURL).toHaveBeenCalledWith(
        "https://www.google.com/search?q=quantum%20computing%20research"
      );
    });

  it("should restrict external navigation to trusted HTTPS destinations", async () => {
      const { dialog } = await import("electron");
      const openExternalHandler = ipcHandlers.get("researchBrowser:openExternal");

      // Blocked untrusted URL
      const untrustedResult = await openExternalHandler(null, "http://untrusted.com");
      expect(untrustedResult.ok).toBe(false);
      expect(untrustedResult.error).toBe("Blocked URL");

      // Allowed trusted URL
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 0 } as any);
      const trustedResult = await openExternalHandler(null, "https://trusted.com/home");
      expect(trustedResult.ok).toBe(true);
      expect(shell.openExternal).toHaveBeenCalledWith("https://trusted.com/home");
    });

    it("should not open trusted external links when confirmation is canceled", async () => {
      const { dialog, shell } = await import("electron");
      const openExternalHandler = ipcHandlers.get("researchBrowser:openExternal");

      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 1 } as any);
      const result = await openExternalHandler(null, "https://trusted.com/home");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Canceled");
      expect(shell.openExternal).not.toHaveBeenCalledWith("https://trusted.com/home");
    });
  });

  describe("data scraping and content safety filters", () => {
    beforeEach(async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      await createHandler();
    });

    it("should scrape current page content and execute safety screening", async () => {
      (mockWebContents.executeJavaScript as any).mockResolvedValueOnce({
        title: "Clean page",
        url: "https://safe.com",
        text: "This is safe body text.",
        canonicalUrl: "https://safe.com",
        description: "description text",
        wordCount: 5,
      });

      const scrapeHandler = ipcHandlers.get("researchBrowser:scrapeCurrent");
      const result = await scrapeHandler();

      expect(result.ok).toBe(true);
      expect(result.source.text).toBe("This is safe body text.");
    });

    it("should reject scraped content containing flagged sensitive data", async () => {
      (mockWebContents.executeJavaScript as any).mockResolvedValueOnce({
        title: "Flagged page",
        url: "https://safe.com",
        text: "This body has a secret-token in it.",
        canonicalUrl: "https://safe.com",
        description: "description text",
        wordCount: 5,
      });

      const scrapeHandler = ipcHandlers.get("researchBrowser:scrapeCurrent");
      const result = await scrapeHandler();

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Blocked due to safety violation");
    });

    it("should capture and screen metadata properly", async () => {
      (mockWebContents.executeJavaScript as any).mockResolvedValueOnce({
        title: "Metadata check",
        url: "https://safe.com",
        canonicalUrl: "https://safe.com",
        description: "Nothing special here",
      });

      const captureHandler = ipcHandlers.get("researchBrowser:captureMetadata");
      const result = await captureHandler();

      expect(result.ok).toBe(true);
      expect(result.metadata.description).toBe("Nothing special here");
    });

    it("should fail metadata capture if description contains flagged patterns", async () => {
      (mockWebContents.executeJavaScript as any).mockResolvedValueOnce({
        title: "Metadata check",
        url: "https://safe.com",
        canonicalUrl: "https://safe.com",
        description: "This page has a secret-token",
      });

      const captureHandler = ipcHandlers.get("researchBrowser:captureMetadata");
      const result = await captureHandler();

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Blocked due to safety violation");
    });
  });
});
