import { BrowserWindow, WebContentsView, ipcMain, session } from "electron";
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

function getViewState(): ResearchBrowserState {
  if (!researchView) {
    return {
      visible: false,
      url: null,
      title: "",
      canGoBack: false,
      canGoForward: false,
      loading: false,
      error: null,
      securityLabel: "internal",
    };
  }
  
  const wc = researchView.webContents;
  const url = wc.getURL();
  
  let securityLabel: ResearchBrowserState["securityLabel"] = "secure";
  if (url.startsWith("http://")) securityLabel = "insecure";
  else if (!url.startsWith("http")) securityLabel = "internal";
  
  return {
    visible: currentBounds?.visible ?? false,
    url: url || null,
    title: wc.getTitle() || "",
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    loading: wc.isLoading(),
    error: null,
    securityLabel,
  };
}

function broadcastState() {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.webContents.send("researchBrowser:onStateChanged", getViewState());
}

import { isAllowedResearchBrowserUrl } from "../utils/urlSecurity";

function assertSafeUrl(url: string): boolean {
  return isAllowedResearchBrowserUrl(url);
}

export function setupResearchBrowserIpc(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;

  ipcMain.handle("researchBrowser:create", async () => {
    if (researchView) return { ok: true };

    const researchSession = session.fromPartition("persist:research");

    // Strict Permissions: Block all unneeded permissions
    researchSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(false);
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
      },
    });

    const wc = researchView.webContents;

    wc.on("did-start-loading", () => broadcastState());
    wc.on("did-stop-loading", () => broadcastState());
    wc.on("page-title-updated", () => broadcastState());
    wc.on("did-navigate", () => broadcastState());
    wc.on("did-navigate-in-page", () => broadcastState());

    wc.on("will-navigate", (details) => {
      if (!assertSafeUrl(details.url)) {
        details.preventDefault();
      }
    });

    wc.setWindowOpenHandler((details) => {
      if (assertSafeUrl(details.url)) {
        wc.loadURL(details.url);
      }
      return { action: "deny" };
    });

    return { ok: true };
  });

  ipcMain.handle("researchBrowser:destroy", async () => {
    if (!researchView) return { ok: true };
    if (mainWindowRef && !mainWindowRef.isDestroyed() && currentBounds?.visible) {
      mainWindowRef.contentView.removeChildView(researchView);
    }
    researchView.webContents.close();
    researchView = null;
    currentBounds = null;
    broadcastState();
    return { ok: true };
  });

  ipcMain.handle("researchBrowser:setVisible", async (_event, visible: boolean) => {
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

  ipcMain.handle("researchBrowser:setBounds", async (_event, input: ResearchBrowserBoundsInput) => {
    if (!researchView || !mainWindowRef || mainWindowRef.isDestroyed()) {
      return { ok: false, error: "Not initialized" };
    }
    
    const wasVisible = currentBounds?.visible ?? false;
    currentBounds = input;
    
    if (input.visible && !wasVisible) {
      mainWindowRef.contentView.addChildView(researchView);
    } else if (!input.visible && wasVisible) {
      mainWindowRef.contentView.removeChildView(researchView);
    }

    if (input.visible) {
      researchView.setBounds({
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
      });
    }
    
    broadcastState();
    return { ok: true };
  });

  ipcMain.handle("researchBrowser:navigate", async (_event, input: ResearchBrowserNavigateInput) => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    let finalUrl = input.urlOrQuery;
    
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      try {
        new URL(finalUrl);
        finalUrl = `https://${finalUrl}`;
      } catch {
        // It's a query
        if (input.searchProvider === "brave") {
          finalUrl = `https://search.brave.com/search?q=${encodeURIComponent(finalUrl)}`;
        } else {
          finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
        }
      }
    }

    if (!assertSafeUrl(finalUrl)) {
      return { ok: false, error: "Blocked insecure protocol" };
    }

    try {
      await researchView.webContents.loadURL(finalUrl);
      broadcastState();
      return { ok: true, state: getViewState() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Load failed" };
    }
  });

  ipcMain.handle("researchBrowser:back", async () => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    if (researchView.webContents.canGoBack()) {
      researchView.webContents.goBack();
    }
    return { ok: true, state: getViewState() };
  });

  ipcMain.handle("researchBrowser:forward", async () => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    if (researchView.webContents.canGoForward()) {
      researchView.webContents.goForward();
    }
    return { ok: true, state: getViewState() };
  });

  ipcMain.handle("researchBrowser:reload", async () => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    researchView.webContents.reload();
    return { ok: true, state: getViewState() };
  });

  ipcMain.handle("researchBrowser:stop", async () => {
    if (!researchView) return { ok: false, error: "Not initialized" };
    researchView.webContents.stop();
    return { ok: true, state: getViewState() };
  });

  ipcMain.handle("researchBrowser:getState", async () => {
    return { ok: true, state: getViewState() };
  });

  ipcMain.handle("researchBrowser:scrapeCurrent", async (): Promise<{ ok: boolean; source?: ResearchBrowserScrapeResult; error?: string }> => {
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
          
          // Basic text extraction stripping scripts and styles
          const clone = document.body.cloneNode(true);
          const scripts = clone.querySelectorAll('script, style, noscript');
          scripts.forEach(s => s.remove());
          const text = clone.innerText || clone.textContent || "";
          let maxExcerpt = text;
          if (maxExcerpt.length > 40000) {
            maxExcerpt = maxExcerpt.slice(0, 40000);
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

      return {
        ok: true,
        source: {
          provider: "browser",
          url: result.url,
          title: result.title,
          text: result.text,
          markdown: result.text, // Fallback to raw text
          retrievedAt: new Date().toISOString(),
          metadata: {
            canonicalUrl: result.canonicalUrl,
            description: result.description,
            wordCount: result.wordCount,
            extractionMethod: "DOM execution",
          }
        }
      };
    } catch {
      return { ok: false, error: "Failed to scrape page DOM" };
    }
  });

  ipcMain.handle("researchBrowser:captureMetadata", async (): Promise<{ ok: boolean; metadata?: ResearchBrowserPageMetadata; error?: string }> => {
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

      return {
        ok: true,
        metadata: {
          url: result.url,
          title: result.title,
          canonicalUrl: result.canonicalUrl,
          description: result.description
        }
      };
    } catch {
      return { ok: false, error: "Failed to capture metadata" };
    }
  });
}
