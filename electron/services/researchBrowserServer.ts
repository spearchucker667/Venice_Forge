import { BrowserWindow, WebContentsView, ipcMain, session, app, Menu, clipboard } from "electron";
import type { 
  ResearchBrowserState, 
  ResearchBrowserBoundsInput, 
  ResearchBrowserNavigateInput, 
  ResearchBrowserScrapeResult, 
  ResearchBrowserPageMetadata,
  ResearchBrowserBoundsTelemetry,
} from "../../src/types/researchBrowser";

let researchView: WebContentsView | null = null;
let mainWindowRef: BrowserWindow | null = null;
let currentBounds: ResearchBrowserBoundsInput | null = null;
let researchViewAttached = false;

let lastBlockedError: string | null = null;

const INTERNAL_RESEARCH_HOME_DISPLAY = "Venice Research Home";

function buildResearchBrowserHomeHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none';">
  <title>${INTERNAL_RESEARCH_HOME_DISPLAY}</title>
  <style>
    :root {
      color-scheme: light dark;
      --vf-bg: var(--surface-sunken, #f7f8fb);
      --vf-panel: var(--surface-raised, #ffffff);
      --vf-text: var(--text-primary, #172033);
      --vf-muted: var(--text-muted, #5d697d);
      --vf-accent: var(--brand-primary, #b42318);
      --vf-border: var(--border-subtle, #d7dce5);
      --vf-link-bg: color-mix(in srgb, var(--vf-accent) 10%, transparent);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --vf-bg: var(--surface-sunken, #101318);
        --vf-panel: var(--surface-raised, #171c24);
        --vf-text: var(--text-primary, #eef2f7);
        --vf-muted: var(--text-muted, #a9b3c2);
        --vf-accent: var(--brand-primary, #f97066);
        --vf-border: var(--border-subtle, #2d3542);
      }
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body {
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--vf-bg);
      color: var(--vf-text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    main {
      width: min(520px, 100%);
      padding: 22px;
      border: 1px solid var(--vf-border);
      border-radius: 8px;
      background: var(--vf-panel);
    }
    h1 { margin: 0; font-size: 1.35rem; line-height: 1.2; letter-spacing: 0; }
    p { margin: 8px 0 0; color: var(--vf-muted); font-size: 0.94rem; line-height: 1.45; }
    nav {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
      gap: 8px;
      margin-top: 18px;
    }
    a {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 8px 10px;
      border: 1px solid var(--vf-border);
      border-radius: 6px;
      background: var(--vf-link-bg);
      color: var(--vf-text);
      font-size: 0.88rem;
      font-weight: 650;
      text-decoration: none;
    }
    a:focus-visible { outline: 2px solid var(--vf-accent); outline-offset: 2px; }
  </style>
</head>
<body>
  <main>
    <h1>Research Browser</h1>
    <p>Search or open a site from the address bar.</p>
    <nav aria-label="Research Browser quick links">
      <a href="https://www.google.com/">Google</a>
      <a href="https://search.brave.com/">Brave</a>
      <a href="https://duckduckgo.com/">DuckDuckGo</a>
      <a href="https://venice.ai/">Venice</a>
      <a href="https://jina.ai/">Jina</a>
    </nav>
  </main>
</body>
</html>`;
}

const researchHomeDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(buildResearchBrowserHomeHtml())}`;

function isInternalResearchHomeUrl(url: string): boolean {
  return url === researchHomeDataUrl;
}

function attachResearchView(): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed() || !researchView || researchViewAttached) return;
  mainWindowRef.contentView.addChildView(researchView);
  researchViewAttached = true;
}

function detachResearchView(): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed() || !researchView || !researchViewAttached) return;
  try {
    mainWindowRef.contentView.removeChildView(researchView);
  } finally {
    researchViewAttached = false;
  }
}

function teardownResearchView(parentWindow: BrowserWindow | null): void {
  if (!researchView) return;

  if (parentWindow && !parentWindow.isDestroyed() && researchViewAttached) {
    try {
      parentWindow.contentView.removeChildView(researchView);
    } catch {
      // The view may already have been detached during BrowserWindow teardown.
    } finally {
      researchViewAttached = false;
    }
  }

  try {
    researchView.webContents.close();
  } catch {
    // Ignore close failures during app/window shutdown.
  }

  researchView = null;
  currentBounds = null;
  researchViewAttached = false;
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
  const isHome = isInternalResearchHomeUrl(url);

  let securityLabel: ResearchBrowserState["securityLabel"] = "secure";
  if (lastBlockedError) securityLabel = "blocked";
  else if (isHome) securityLabel = "internal";
  else if (url.startsWith("http://")) securityLabel = "insecure";
  else if (!url.startsWith("http")) securityLabel = "internal";

  return {
    visible: currentBounds?.visible ?? false,
    url: url || null,
    displayUrl: isHome ? INTERNAL_RESEARCH_HOME_DISPLAY : (url || null),
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

function isMainFrameRequest(details: { resourceType?: string }): boolean {
  return details.resourceType === "mainFrame" || details.resourceType === "main-frame";
}

function isSubFrameRequest(details: { resourceType?: string }): boolean {
  return details.resourceType === "subFrame" || details.resourceType === "sub-frame";
}

function isAllowedSubresourceUrl(url: string): boolean {
  if (isInternalResearchHomeUrl(url)) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return assertSafeUrl(url);
    }
    if (parsed.protocol === "data:" || parsed.protocol === "blob:") {
      return true;
    }
    if (parsed.protocol === "about:" && parsed.href === "about:blank") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function validateTopLevelNavigation(url: string): Promise<{ ok: boolean; error?: string }> {
  if (isInternalResearchHomeUrl(url)) return { ok: true };
  const decision = await validateResearchBrowserNetworkUrl(url);
  if (!decision.allowed) {
    return { ok: false, error: decision.reason ?? "Blocked by Research Browser policy." };
  }
  return { ok: true };
}

async function navigateCurrentViewIfSafe(url: string): Promise<void> {
  if (!researchView) return;
  const decision = await validateTopLevelNavigation(url);
  if (!decision.ok) {
    setBlockedState("Popup blocked. Open externally if you trust this site.");
    return;
  }
  clearBlockedState();
  try {
    await researchView.webContents.loadURL(url);
    broadcastState();
  } catch {
    setBlockedState("Popup blocked. Open externally if you trust this site.");
  }
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

function normalizeResearchBrowserBounds(input: ResearchBrowserBoundsInput): ResearchBrowserBoundsInput {
  return {
    x: Math.max(0, Math.floor(input.x)),
    y: Math.max(0, Math.floor(input.y)),
    width: Math.max(1, Math.floor(input.width)),
    height: Math.max(1, Math.floor(input.height)),
    visible: input.visible,
    ...(input.geometry ? { geometry: input.geometry } : {}),
  };
}

function isResearchBrowserBoundsDebugEnabled(): boolean {
  return !app.isPackaged && process.env.VITE_RESEARCH_BROWSER_DEBUG_BOUNDS === "1";
}

function validateBoundsTelemetry(
  input: ResearchBrowserBoundsInput,
  geometry: ResearchBrowserBoundsTelemetry | undefined,
): string | null {
  if (!geometry) return null;
  if (geometry.toolbar.height < 32) {
    return "Invalid Research Browser bounds: toolbar is too small.";
  }
  if (geometry.viewport.width < 100 || geometry.viewport.height < 100) {
    return "Invalid Research Browser bounds: viewport is too small.";
  }
  if (geometry.viewport.top < geometry.toolbar.bottom) {
    return "Invalid Research Browser bounds: viewport overlaps toolbar.";
  }
  if (input.y < geometry.toolbar.bottom) {
    return "Invalid Research Browser bounds: native view would cover toolbar.";
  }
  if (input.x < geometry.shell.left || input.y < geometry.shell.top) {
    return "Invalid Research Browser bounds: native view starts outside shell.";
  }
  if (input.x + input.width > geometry.shell.right || input.y + input.height > geometry.shell.bottom) {
    return "Invalid Research Browser bounds: native view exceeds shell.";
  }
  return null;
}

let ipcHandlersRegistered = false;

export function resetResearchBrowserIpcForTesting(): void {
  ipcHandlersRegistered = false;
  researchView = null;
  mainWindowRef = null;
  currentBounds = null;
  researchViewAttached = false;
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

  /**
   * Creates the research WebContentsView if it does not already exist.
   * Extracted so both the `create` and `navigate` IPC handlers can call it,
   * enabling navigate-before-create to succeed (the renderer may call navigate
   * before the Browser subtab has mounted and triggered `create`).
   */
  async function createResearchViewIfNeeded(): Promise<{ ok: boolean; error?: string }> {
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

    // Gate top-level browsing strictly, but avoid DNS-gating every script,
    // stylesheet, image, or XHR request; modern sites depend on those assets.
    researchSession.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
      if (isMainFrameRequest(details)) {
        void validateTopLevelNavigation(details.url).then((decision) => {
          if (!decision.ok) {
            callback({ cancel: true });
            setBlockedState("Blocked by Research Browser policy.");
            return;
          }
          callback({ cancel: false });
        }).catch(() => {
          callback({ cancel: true });
          setBlockedState("Blocked by Research Browser policy.");
        });
        return;
      }

      if (isSubFrameRequest(details) || details.resourceType) {
        if (!isAllowedSubresourceUrl(details.url)) {
          callback({ cancel: true });
          setBlockedState("Blocked by Research Browser policy.");
          return;
        }
      }
      callback({ cancel: false });
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
      if (isInternalResearchHomeUrl(details.url)) return;
      if (!assertSafeUrl(details.url)) {
        details.preventDefault();
        setBlockedState("Blocked by Research Browser policy.");
      }
    });

    // Block sub-frame navigation to unsafe URLs while allowing the browser
    // primitives modern sites commonly use for empty/blob/data frames.
    wc.on("will-frame-navigate", (details) => {
      if (isInternalResearchHomeUrl(details.url)) return;
      if (!isAllowedSubresourceUrl(details.url)) {
        details.preventDefault();
        setBlockedState("Blocked by Research Browser policy.");
      }
    });

    // Block redirects to unsafe URLs
    wc.on("will-redirect", (details) => {
      if (isInternalResearchHomeUrl(details.url)) return;
      if (!assertSafeUrl(details.url)) {
        details.preventDefault();
        setBlockedState("Blocked by Research Browser policy.");
      }
    });

    wc.setWindowOpenHandler(({ url }) => {
      if (assertSafeUrl(url)) {
        void navigateCurrentViewIfSafe(url);
      } else {
        setBlockedState("Popup blocked. Open externally if you trust this site.");
      }
      return { action: "deny" };
    });

    try {
      await wc.loadURL(researchHomeDataUrl);
    } catch {
      wc.loadURL("about:blank");
    }

    return { ok: true };
  }

  handleIpc("researchBrowser:create", async () => {
    return createResearchViewIfNeeded();
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
        attachResearchView();
        researchView.setBounds({
          x: currentBounds.x,
          y: currentBounds.y,
          width: currentBounds.width,
          height: currentBounds.height,
        });
      } else {
        detachResearchView();
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
    const safeBounds = input.geometry
      ? normalizeResearchBrowserBounds(input)
      : clampResearchBrowserBounds(input, {
          width: contentBounds.width,
          height: contentBounds.height,
        });

    const telemetryError = validateBoundsTelemetry(safeBounds, input.geometry);
    if (isResearchBrowserBoundsDebugEnabled()) {
      // eslint-disable-next-line no-console -- opt-in dev-only geometry telemetry; never logs URLs or page text.
      console.debug("[research-browser] main bounds", {
        contentBounds,
        requestedBounds: {
          x: input.x,
          y: input.y,
          width: input.width,
          height: input.height,
          visible: input.visible,
        },
        finalBounds: safeBounds,
        geometry: input.geometry,
        telemetryError,
      });
    }
    if (telemetryError && input.visible) {
      currentBounds = { ...safeBounds, visible: false };
      detachResearchView();
      setBlockedState(telemetryError);
      return { ok: false, error: telemetryError };
    }

    currentBounds = safeBounds;

    if (safeBounds.visible) {
      attachResearchView();
    } else {
      detachResearchView();
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

    // Auto-create the WebContentsView if it does not exist yet. This allows
    // navigate to be called before the Browser subtab has mounted (and therefore
    // before the renderer has called create). The renderer-side pending-URL
    // pattern (initialUrl prop) already handles the common case, but this
    // belt-and-suspenders fix ensures the main process never returns
    // "Not initialized" for a normal navigation request.
    if (!researchView) {
      const createResult = await createResearchViewIfNeeded();
      if (!createResult.ok) {
        return { ok: false, error: createResult.error ?? "Failed to initialize browser" };
      }
    }

    let finalUrl = input.urlOrQuery.trim();
    const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(finalUrl);

    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      let isAllowedUrl = false;
      try {
        const parsed = new URL(finalUrl);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          isAllowedUrl = true;
        } else if (hasExplicitScheme) {
          isAllowedUrl = true;
        }
      } catch {
        // ignore
      }

      if (!isAllowedUrl && !hasExplicitScheme) {
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
      
      if (!isAllowedUrl && !hasExplicitScheme) {
        if (input.searchProvider === "brave") {
          finalUrl = `https://search.brave.com/search?q=${encodeURIComponent(input.urlOrQuery)}`;
        } else {
          finalUrl = `https://www.google.com/search?q=${encodeURIComponent(input.urlOrQuery)}`;
        }
      }
    }

    const decision = await validateTopLevelNavigation(finalUrl);
    if (!decision.ok) {
      setBlockedState("Blocked by Research Browser policy.");
      return { ok: false, error: decision.error ?? "Blocked by Research Browser policy." };
    }

    // Narrow the type — auto-create above guarantees researchView is non-null here.
    if (!researchView) return { ok: false, error: "Failed to initialize browser" };

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
