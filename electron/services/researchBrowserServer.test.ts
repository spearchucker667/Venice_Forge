// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Store registered handlers
const ipcHandlers = new Map<string, (...args: any[]) => Promise<any> | any>();

// Mock electron module with self-contained definitions and test-only exports
vi.mock("electron", () => {
  const mockPopup = vi.fn();
  const mockMenuBuildFromTemplate = vi.fn((template) => ({ popup: mockPopup, template }));
  const mockWebContents = {
    getURL: vi.fn(() => "https://example.com"),
    getTitle: vi.fn(() => "Example Page"),
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    isLoading: vi.fn(() => false),
    on: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    loadFile: vi.fn(async () => {}),
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
    Menu: {
      buildFromTemplate: mockMenuBuildFromTemplate,
    },
    clipboard: {
      writeText: vi.fn(),
    },
    app: {
      isPackaged: false,
      getAppPath: vi.fn(() => "/repo"),
    },
    // Test-only exports for direct validation access
    _mockWebContents: mockWebContents,
    _mockSession: mockSession,
    _mockWebContentsView: mockWebContentsView,
    _mockPopup: mockPopup,
    _mockMenuBuildFromTemplate: mockMenuBuildFromTemplate,
  };
});

// Mock security dependencies
vi.mock("../security/researchBrowserNetworkPolicy", () => ({
  validateResearchBrowserNetworkUrl: vi.fn(async (url: string) => {
    if (
      url.includes("blocked") ||
      url.startsWith("javascript:") ||
      url.startsWith("file:") ||
      url.startsWith("data:")
    ) {
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

vi.mock("./configService", () => ({
  getCurrentConfig: vi.fn(() => ({
    research: {
      live_browser_persist_session: true,
      live_browser_javascript_enabled: true,
      max_browser_extract_chars: 40_000,
    },
  })),
}));

// Now setup imports from electron (retrieves the mock instances) and the server setup
import { 
  _mockWebContents as mockWebContents, 
  _mockWebContentsView as mockWebContentsView,
  _mockSession as mockSession, 
  _mockPopup as mockPopup,
  BrowserWindow,
  shell,
  Menu,
  clipboard,
} from "electron";
import { validateResearchBrowserNetworkUrl } from "../security/researchBrowserNetworkPolicy";
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
      expect(session.fromPartition).toHaveBeenCalledWith("persist:venice-forge-research-browser");

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

    it("loads the bundled splash page on create", async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      await createHandler();

      expect(mockWebContents.loadFile).toHaveBeenCalledTimes(1);
      expect((mockWebContents.loadFile as any).mock.calls[0][0]).toMatch(/research-browser-home\.html$/);
    });

    it("should tear down the view on destroy", async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      await createHandler();

      const destroyHandler = ipcHandlers.get("researchBrowser:destroy");
      const result = await destroyHandler();
      expect(result).toEqual({ ok: true });
      expect(mockWebContents.close).toHaveBeenCalled();
    });

    it("should tear down an existing view when setup is called for a recreated window", async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      await createHandler();

      expect(mockWebContentsView).toHaveBeenCalledTimes(1);

      const recreatedWindow = new (BrowserWindow as any)();
      setupResearchBrowserIpc(recreatedWindow);

      expect(mockWebContents.close).toHaveBeenCalled();

      const result = await createHandler();
      expect(result).toEqual({ ok: true });
      expect(mockWebContentsView).toHaveBeenCalledTimes(2);
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

    it("does not re-add the WebContentsView when setVisible(true) follows visible bounds", async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      await createHandler();

      const setBoundsHandler = ipcHandlers.get("researchBrowser:setBounds");
      const setVisibleHandler = ipcHandlers.get("researchBrowser:setVisible");

      await setBoundsHandler(null, { x: 50, y: 50, width: 600, height: 400, visible: true });
      await setVisibleHandler(null, true);

      expect(mockWindow.contentView.addChildView).toHaveBeenCalledTimes(1);
    });

    it("detaches the WebContentsView when visibility is disabled", async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      await createHandler();

      const setBoundsHandler = ipcHandlers.get("researchBrowser:setBounds");
      const setVisibleHandler = ipcHandlers.get("researchBrowser:setVisible");

      await setBoundsHandler(null, { x: 50, y: 50, width: 600, height: 400, visible: true });
      await setVisibleHandler(null, false);

      expect(mockWindow.contentView.removeChildView).toHaveBeenCalledTimes(1);
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

    it("allows file:// requests so the splash page can load without hitting the network policy", async () => {
      const onBeforeRequestHandler = (mockSession.webRequest.onBeforeRequest as any).mock.calls[0][1];
      const callback = vi.fn();
      onBeforeRequestHandler(
        { url: "file:///Applications/Venice Forge.app/Contents/Resources/app.asar/dist/research-browser-home.html" },
        callback,
      );

      expect(callback).toHaveBeenCalledWith({ cancel: false });
      expect(validateResearchBrowserNetworkUrl).not.toHaveBeenCalled();
    });

    it("should load URL when validation passes", async () => {
      const navigateHandler = ipcHandlers.get("researchBrowser:navigate");
      mockWebContents.loadURL.mockClear();
      const result = await navigateHandler(null, { urlOrQuery: "https://safe.com" });

      expect(result.ok).toBe(true);
      expect(mockWebContents.loadURL).toHaveBeenCalledWith("https://safe.com");
    });

    it("should block loading when URL validation fails", async () => {
      const navigateHandler = ipcHandlers.get("researchBrowser:navigate");
      mockWebContents.loadURL.mockClear();
      const result = await navigateHandler(null, { urlOrQuery: "https://blocked-site.com" });

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Blocked unsafe URL");
      expect(mockWebContents.loadURL).not.toHaveBeenCalled();
    });

    it("should construct search queries for non-URLs", async () => {
      const navigateHandler = ipcHandlers.get("researchBrowser:navigate");
      mockWebContents.loadURL.mockClear();
      await navigateHandler(null, { urlOrQuery: "quantum computing research", searchProvider: "google" });

      expect(mockWebContents.loadURL).toHaveBeenCalledWith(
        "https://www.google.com/search?q=quantum%20computing%20research"
      );
    });

    it("normalizes bare domains to HTTPS URLs", async () => {
      const navigateHandler = ipcHandlers.get("researchBrowser:navigate");
      mockWebContents.loadURL.mockClear();

      await navigateHandler(null, { urlOrQuery: "venice.ai" });

      expect(mockWebContents.loadURL).toHaveBeenCalledWith("https://venice.ai");
    });

    it("constructs Brave search URLs when requested", async () => {
      const navigateHandler = ipcHandlers.get("researchBrowser:navigate");
      mockWebContents.loadURL.mockClear();

      await navigateHandler(null, { urlOrQuery: "venice ai api docs", searchProvider: "brave" });

      expect(mockWebContents.loadURL).toHaveBeenCalledWith(
        "https://search.brave.com/search?q=venice%20ai%20api%20docs",
      );
    });

    it.each([
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,hello",
    ])("blocks unsafe scheme input instead of converting it to search: %s", async (urlOrQuery) => {
      const navigateHandler = ipcHandlers.get("researchBrowser:navigate");
      mockWebContents.loadURL.mockClear();

      const result = await navigateHandler(null, { urlOrQuery });

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Blocked unsafe URL");
      expect(mockWebContents.loadURL).not.toHaveBeenCalled();
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

  describe("context menu behavior", () => {
    beforeEach(async () => {
      const createHandler = ipcHandlers.get("researchBrowser:create");
      await createHandler();
    });

    it("shows a context menu with explicit coordinates relative to the parent window", () => {
      const contextMenuHandler = (mockWebContents.on as any).mock.calls.find(
        (call: any[]) => call[0] === "context-menu",
      )?.[1];
      expect(contextMenuHandler).toBeDefined();

      const event = { preventDefault: vi.fn() };
      const params = { x: 120, y: 80, linkURL: "https://example.com", selectionText: "hello" };
      contextMenuHandler(event, params);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(Menu.buildFromTemplate).toHaveBeenCalled();
      expect(mockPopup).toHaveBeenCalledWith({
        window: mockWindow,
        x: 120,
        y: 80,
      });
    });

    it("does not show a context menu when there are no actionable items", () => {
      const contextMenuHandler = (mockWebContents.on as any).mock.calls.find(
        (call: any[]) => call[0] === "context-menu",
      )?.[1];

      const event = { preventDefault: vi.fn() };
      const params = { x: 0, y: 0 };
      contextMenuHandler(event, params);

      expect(Menu.buildFromTemplate).not.toHaveBeenCalled();
      expect(mockPopup).not.toHaveBeenCalled();
    });

    it("copies the link URL when the Copy Link item is clicked", () => {
      const contextMenuHandler = (mockWebContents.on as any).mock.calls.find(
        (call: any[]) => call[0] === "context-menu",
      )?.[1];

      const event = { preventDefault: vi.fn() };
      const params = { x: 10, y: 20, linkURL: "https://venice.ai/characters/alan" };
      contextMenuHandler(event, params);

      const builtTemplate = (Menu.buildFromTemplate as any).mock.calls[0][0];
      const copyLinkItem = builtTemplate.find((item: any) => item.label === "Copy Link");
      expect(copyLinkItem).toBeDefined();
      copyLinkItem.click();
      expect(clipboard.writeText).toHaveBeenCalledWith("https://venice.ai/characters/alan");
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
