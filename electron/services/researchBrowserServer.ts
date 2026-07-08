import { BrowserWindow, WebContentsView, ipcMain, session, app, Menu, clipboard } from "electron";
import path from "node:path";
import type { 
  ResearchBrowserState, 
  ResearchBrowserBoundsInput, 
  ResearchBrowserNavigateInput, 
  ResearchBrowserScrapeResult, 
  ResearchBrowserPageMetadata 
} from "../../src/types/researchBrowser";

let researchView: WebContentsView | null = null;
let mainWindowRef: BrowserWindow | null = null;
let currentBounds: ResearchBrowserBoundsInput | null = null;

let lastBlockedError: string | null = null;

function teardownResearchView(parentWindow: BrowserWindow | null): void {
  if (!researchView) return;

  if (parentWindow && !parentWindow.isDestroyed() && currentBounds?.visible) {
    try {
      parentWindow.contentView.removeChildView(researchView);
    } catch {
      // The view may already have been detached during BrowserWindow teardown.
    }
  }

  try {
    researchView.webContents.close();
  } catch {
    // Ignore close failures during app/window shutdown.
  }

  researchView = null;
  currentBounds = null;
  lastBlockedError = null;
}

function getViewState(): ResearchBrowserState {
  if (!researchView) {
    return {
      visible: false,
      url: null,
      title: "",
      canGoBack: false,
      canGoForward: false,
      loading: false,
      error: lastBlockedError,
      securityLabel: "internal",
    };
  }

  const wc = researchView.webContents;
  const url = wc.getURL();

  let securityLabel: ResearchBrowserState["securityLabel"] = "secure";
  if (lastBlockedError) securityLabel = "blocked";
  else if (url.startsWith("http://")) securityLabel = "insecure";
  else if (!url.startsWith("http")) securityLabel = "internal";

  return {
    visible: currentBounds?.visible ?? false,
    url: url || null,
    title: wc.getTitle() || "",
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    loading: wc.isLoading(),
    error: lastBlockedError,
    securityLabel,
  };
}

function clearBlockedState() {
  lastBlockedError = null;
}

function setBlockedState(reason: string) {
  lastBlockedError = reason;
  broadcastState();
}

function broadcastState() {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.webContents.send("researchBrowser:onStateChanged", getViewState());
}

import { isAllowedResearchBrowserUrl, isTrustedExternalUrl } from "../utils/urlSecurity";
import { promptExternalLink } from "../utils/externalLinks";

import { screenResponseBody } from "../../src/shared/safety";
import { getRuntimeLocalFamilySafeModeEnabled } from "./runtimeSafetySettings";
import { validateResearchBrowserNetworkUrl } from "../security/researchBrowserNetworkPolicy";
import { rateLimitIpcHandler } from "../utils/rateLimit";
import { getCurrentConfig } from "./configService";

function assertSafeUrl(url: string): boolean {
  return isAllowedResearchBrowserUrl(url);
}

function clampResearchBrowserBounds(input: ResearchBrowserBoundsInput, host: { width: number; height: number }): ResearchBrowserBoundsInput {
  const maxWidth = Math.max(0, Math.floor(host.width));
  const maxHeight = Math.max(0, Math.floor(host.height));
  const width = Math.min(Math.max(1, Math.floor(input.width)), maxWidth);
  const height = Math.min(Math.max(1, Math.floor(input.height)), maxHeight);
  const x = Math.min(Math.max(0, Math.floor(input.x)), Math.max(0, maxWidth - width));
  const y = Math.min(Math.max(0, Math.floor(input.y)), Math.max(0, maxHeight - height));
  return { x, y, width, height, visible: input.visible };
}

let ipcHandlersRegistered = false;

export function resetResearchBrowserIpcForTesting(): void {
  ipcHandlersRegistered = false;
  researchView = null;
  mainWindowRef = null;
  currentBounds = null;
  lastBlockedError = null;
}

export function setupResearchBrowserIpc(mainWindow: BrowserWindow): void {
  if (mainWindowRef && mainWindowRef !== mainWindow) {
    teardownResearchView(mainWindowRef);
  }
  mainWindowRef = mainWindow;

  if (ipcHandlersRegistered) {
    return;
  }
  ipcHandlersRegistered = true;

  const handleIpc = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
    ipcMain.handle(channel, rateLimitIpcHandler(channel, handler));
  };

  handleIpc("researchBrowser:create", async () => {
    if (researchView) return { ok: true };

    const config = getCurrentConfig();
    const researchSession = config.research.live_browser_persist_session
      ? session.fromPartition("persist:venice-forge-research-browser")
      : session.fromPartition("venice-forge-research-browser");

    // Block all permission requests (camera, microphone, geolocation, notifications, etc.)
    researchSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    // Block permission check requests (required for some APIs)
    researchSession.setPermissionCheckHandler((_webContents, _permission) => {
      return false;
    });

    // Block navigation to disallowed URLs before the network request is made.
    // Local file:// requests are allowed here so the splash page loaded via
    // loadFile() can render; navigation to file:// URLs is still blocked by
    // will-navigate / will-frame-navigate below.
    researchSession.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
      if (details.url.startsWith("file:")) {
        callback({ cancel: false });
        return;
      }
      void validateResearchBrowserNetworkUrl(details.url).then((decision) => {
        if (!decision.allowed) {
          callback({ cancel: true });
          setBlockedState(`Blocked navigation: ${decision.reason ?? details.url}`);
          return;
        }
        callback({ cancel: false });
      }).catch(() => {
        callback({ cancel: true });
        setBlockedState("Blocked navigation: DNS safety check failed.");
      });
    });

    researchView = new WebContentsView({
      webPreferences: {
        session: researchSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        navigateOnDragDrop: false,
        safeDialogs: true,
        javascript: config.research.live_browser_javascript_enabled,
      },
    });

    const wc = researchView.webContents;

    wc.on("context-menu", (e, params) => {
      e.preventDefault();
      const template: Electron.MenuItemConstructorOptions[] = [];
      let hasActionableItems = false;
      if (params.linkURL) {
        hasActionableItems = true;
        template.push({
          label: 'Copy Link',
          click: () => {
            clipboard.writeText(params.linkURL);
          }
        });
      }

      if (params.isEditable) {
        hasActionableItems = true;
        template.push({ role: 'undo' });
        template.push({ role: 'redo' });
        template.push({ type: 'separator' });
        template.push({ role: 'cut' });
        template.push({ role: 'copy' });
        template.push({ role: 'paste' });
      } else if (params.selectionText) {
        hasActionableItems = true;
        template.push({ role: 'copy' });
      }

      if (!hasActionableItems || !mainWindowRef || mainWindowRef.isDestroyed()) {
        return;
      }

      template.push({ type: 'separator' });
      template.push({ role: 'selectAll' });

      const menu = Menu.buildFromTemplate(template);
      // WebContentsView menus must be positioned explicitly relative to the
      // parent BrowserWindow; omitting coordinates can leave the menu stuck
      // open or unresponsive on macOS.
      menu.popup({
        window: mainWindowRef,
        x: Math.round(params.x),
        y: Math.round(params.y),
      });
    });

    wc.on("did-start-loading", () => {
      clearBlockedState();
      broadcastState();
    });
    wc.on("did-stop-loading", () => broadcastState());
    wc.on("page-title-updated", () => broadcastState());
    wc.on("did-navigate", () => broadcastState());
    wc.on("did-navigate-in-page", () => broadcastState());

    // Block main-frame navigation to unsafe URLs
    wc.on("will-navigate", (details) => {
      if (!assertSafeUrl(details.url)) {
        details.preventDefault();
        setBlockedState("Navigation blocked by the Research Browser URL policy.");
      }
    });

    // Block sub-frame navigation to unsafe URLs
    wc.on("will-frame-navigate", (details) => {
      if (!assertSafeUrl(details.url)) {
        details.preventDefault();
        setBlockedState("Frame navigation blocked by the Research Browser URL policy.");
      }
    });

    // Block redirects to unsafe URLs
    wc.on("will-redirect", (details) => {
      if (!assertSafeUrl(details.url)) {
        details.preventDefault();
        setBlockedState("Redirect blocked by the Research Browser URL policy.");
      }
    });

    wc.setWindowOpenHandler(() => {
      setBlockedState("Popup blocked. Use Open externally or paste the URL manually if you trust it.");
      return { action: "deny" };
    });

    try {
      const splashPath = path.join(app.isPackaged ? path.join(app.getAppPath(), "dist") : path.join(app.getAppPath(), "public"), "research-browser-home.html");
      await wc.loadFile(splashPath);
    } catch {
      wc.loadURL("about:blank");
    }

    return { ok: true };
  });

  handleIpc("researchBrowser:destroy", async () => {
    if (!researchView) return { ok: true };
    teardownResearchView(mainWindowRef);
    broadcastState();
    return { ok: true };
  });

  handleIpc("researchBrowser:setVisible", async (_event, visible: boolean) => {
    if (typeof visible !== "boolean") return { ok: false, error: "Invalid boolean" };
    if (!researchView || !mainWindowRef || mainWindowRef.isDestroyed()) {
      return { ok: false, error: "Not initialized" };
    }
    if (currentBounds) {
      currentBounds.visible = visible;
      if (visible) {
        mainWindowRef.contentView.addChildView(researchView);
        researchView.setBounds({
          x: currentBounds.x,
          y: currentBounds.y,
          width: currentBounds.width,
          height: currentBounds.height,
        });
      } else {
        mainWindowRef.contentView.removeChildView(researchView);
      }
    }
    broadcastState();
    return { ok: true };
  });

  handleIpc("researchBrowser:setBounds", async (_event, input: ResearchBrowserBoundsInput) => {
    if (!input || typeof input !== "object") return { ok: false, error: "Invalid input" };
    if (typeof input.x !== "number" || !Number.isFinite(input.x) ||
        typeof input.y !== "number" || !Number.isFinite(input.y) ||
        typeof input.width !== "number" || !Number.isFinite(input.width) ||
        typeof input.height !== "number" || !Number.isFinite(input.height) ||
        typeof input.visible !== "boolean") {
      return { ok: false, error: "Invalid bounds parameters" };
    }
    if (!researchView || !mainWindowRef || mainWindowRef.isDestroyed()) {
      return { ok: false, error: "Not initialized" };
    }

    const contentBounds = mainWindowRef.getContentBounds();
    const safeBounds = clampResearchBrowserBounds(input, {
      width: contentBounds.width,
      height: contentBounds.height,
    });
    const wasVisible = currentBounds?.visible ?? false;
    currentBounds = safeBounds;

    if (safeBounds.visible && !wasVisible) {
      mainWindowRef.contentView.addChildView(researchView);
    } else if (!safeBounds.visible && wasVisible) {
      mainWindowRef.contentView.removeChildView(researchView);
    }

    if (safeBounds.visible) {
      researchView.setBounds({
        x: safeBounds.x,
        y: safeBounds.y,
        width: safeBounds.width,
        height: safeBounds.height,
      });
    }

    return { ok: true };
  });

  handleIpc("researchBrowser:navigate", async (_event, input: ResearchBrowserNavigateInput) => {
    if (!input || typeof input.urlOrQuery !== "string") return { ok: false, error: "Invalid input" };
    if (!researchView) return { ok: false, error: "Not initialized" };
    let finalUrl = input.urlOrQuery.trim();

    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      let isAllowedUrl = false;
      try {
        const parsed = new URL(finalUrl);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          isAllowedUrl = true;
        }
      } catch {
        // ignore
      }

      if (!isAllowedUrl) {
        if (!finalUrl.includes(" ") && finalUrl.includes(".")) {
          try {
            new URL(`https://${finalUrl}`);
            finalUrl = `https://${finalUrl}`;
            isAllowedUrl = true;
          } catch {
            // ignore
          }
        }
      }
      
      if (!isAllowedUrl) {
        if (input.searchProvider === "brave") {
          finalUrl = `https://search.brave.com/search?q=${encodeURIComponent(input.urlOrQuery)}`;
        } else {
          finalUrl = `https://www.google.com/search?q=${encodeURIComponent(input.urlOrQuery)}`;
        }
      }
    }

    const decision = await validateResearchBrowserNetworkUrl(finalUrl);
    if (!decision.allowed) {
      setBlockedState(`Blocked unsafe URL: ${decision.reason ?? finalUrl}`);
      return { ok: false, error: decision.reason ?? "Blocked unsafe URL" };
    }

    try {
      await researchView.webContents.loadURL(finalUrl);
      broadcastState();
      return { ok: true, state: getViewState() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Load failed" };
    }
  });

  handleIpc("researchBrowser:back", async () => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    if (researchView.webContents.canGoBack()) {
      researchView.webContents.goBack();
    }
    return { ok: true, state: getViewState() };
  });

  handleIpc("researchBrowser:forward", async () => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    if (researchView.webContents.canGoForward()) {
      researchView.webContents.goForward();
    }
    return { ok: true, state: getViewState() };
  });

  handleIpc("researchBrowser:reload", async () => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    researchView.webContents.reload();
    return { ok: true, state: getViewState() };
  });

  handleIpc("researchBrowser:stop", async () => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    researchView.webContents.stop();
    return { ok: true, state: getViewState() };
  });

  handleIpc("researchBrowser:getState", async () => {
    return { ok: true, state: getViewState() };
  });

  handleIpc("researchBrowser:openExternal", async (_event, url: string) => {
    if (typeof url !== "string") return { ok: false, error: "Invalid url type" };
    if (!mainWindowRef || mainWindowRef.isDestroyed()) return { ok: false, error: "Window unavailable" };
    if (!isTrustedExternalUrl(url)) {
      return { ok: false, error: "Blocked URL" };
    }
    const result = await promptExternalLink(mainWindowRef, url);
    if (result.error) return { ok: false, error: result.error };
    if (result.canceled) return { ok: false, error: "Canceled" };
    return { ok: result.opened };
  });

  handleIpc("researchBrowser:scrapeCurrent", async (): Promise<{ ok: boolean; source?: ResearchBrowserScrapeResult; error?: string }> => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    try {
      const extractConfig = getCurrentConfig().research;
      const maxExtractChars = extractConfig.max_browser_extract_chars;
      const result = await researchView.webContents.executeJavaScript(`
        (() => {
          const title = document.title;
          const url = window.location.href;
          const canonicalElement = document.querySelector('link[rel="canonical"]');
          const canonicalUrl = canonicalElement ? canonicalElement.href : undefined;
          const metaDescription = document.querySelector('meta[name="description"]');
          const description = metaDescription ? metaDescription.content : undefined;

          // Basic text extraction stripping scripts and styles
          const clone = document.body.cloneNode(true);
          const scripts = clone.querySelectorAll('script, style, noscript');
          scripts.forEach(s => s.remove());
          const text = clone.innerText || clone.textContent || "";
          let maxExcerpt = text;
          if (maxExcerpt.length > ${maxExtractChars}) {
            maxExcerpt = maxExcerpt.slice(0, ${maxExtractChars});
          }
          return {
            title,
            url,
            canonicalUrl,
            description,
            text: maxExcerpt,
            wordCount: maxExcerpt.split(/\\s+/).filter(Boolean).length
          };
        })();
      `);

      const source = {
        provider: "browser" as const,
        url: result.url,
        title: result.title,
        text: result.text,
        markdown: result.text,
        retrievedAt: new Date().toISOString(),
        metadata: {
          canonicalUrl: result.canonicalUrl,
          description: result.description,
          wordCount: result.wordCount,
          extractionMethod: "DOM execution",
        }
      };

      const serialized = JSON.stringify(source);
      const screenResult = screenResponseBody(
        serialized,
        { endpoint: result.url, method: "GET", source: "ipc" },
        getRuntimeLocalFamilySafeModeEnabled(),
      );

      if (!screenResult.allowed) {
        return { ok: false, error: screenResult.userMessage };
      }

      return {
        ok: true,
        source
      };
    } catch {
      return { ok: false, error: "Failed to scrape page DOM" };
    }
  });

  handleIpc("researchBrowser:captureMetadata", async (): Promise<{ ok: boolean; metadata?: ResearchBrowserPageMetadata; error?: string }> => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    try {
      const result = await researchView.webContents.executeJavaScript(`
        (() => {
          const title = document.title;
          const url = window.location.href;
          const canonicalElement = document.querySelector('link[rel="canonical"]');
          const canonicalUrl = canonicalElement ? canonicalElement.href : undefined;
          const metaDescription = document.querySelector('meta[name="description"]');
          const description = metaDescription ? metaDescription.content : undefined;
          return { title, url, canonicalUrl, description };
        })();
      `);

      const metadata = {
        url: result.url,
        title: result.title,
        canonicalUrl: result.canonicalUrl,
        description: result.description
      };

      const serialized = JSON.stringify(metadata);
      const screenResult = screenResponseBody(
        serialized,
        { endpoint: result.url, method: "GET", source: "ipc" },
        getRuntimeLocalFamilySafeModeEnabled(),
      );

      if (!screenResult.allowed) {
        return { ok: false, error: screenResult.userMessage };
      }

      return {
        ok: true,
        metadata
      };
    } catch {
      return { ok: false, error: "Failed to capture metadata" };
    }
  });
}
