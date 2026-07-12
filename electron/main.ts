/** @fileoverview Bootstraps the Venice Forge Electron main process, creates the
 *  BrowserWindow with security hardening, and manages navigation guards. */

// Code Owner: fayeblade (@spearchucker667)
// Primary maintainer and security gatekeeper for the Electron main process.
import { app, BrowserWindow, dialog, shell, session, protocol } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { registerIpcHandlers } from "./ipc/handlers";
import { initializeConfig } from "./services/configService";
import { initSyncFolderWatcher } from "./services/syncFolderWatcher";
import { initBackgroundTaskManager } from "./services/backgroundTaskManager";
import { logError, logInfo } from "./services/logger";
import { redactErrorMessage } from "../src/shared/redaction";
import { checkPathContained } from "./utils/navigation";
import { isTrustedExternalUrl } from "./utils/urlSecurity";
import { rendererCsp } from "./utils/rendererCsp";
import { isAllowedCharacterImageCacheProtocolAccess } from "./utils/characterImageCacheProtocol";
import { startBridgeServer, stopBridgeServer } from "./services/bridgeServer";
import { stopSyncWatcher } from "./services/syncFolderWatcher";
import { isValidBridgeHost } from "./utils/bridgeHost";
import { getCharacterImageCacheDir, ALLOWED_CONTENT_TYPES } from "./services/characterImageCache";
import { setupResearchBrowserIpc } from "./services/researchBrowserServer";

export { isValidBridgeHost };

protocol.registerSchemesAsPrivileged([
  { scheme: "venice-character-cache", privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

/** Indicates whether the app is running in development mode. */
const isDev = !app.isPackaged;

/** Whether to allow DevTools in packaged production builds. */
const allowProdDevTools = process.env.VENICE_FORGE_DEBUG_DEVTOOLS === "true";
if (allowProdDevTools) {
  logInfo("VENICE_FORGE_DEBUG_DEVTOOLS is enabled — DevTools will be available in production builds.");
}

/** Maximum length for displaying a URL in the external link confirmation dialog. */
const MAX_DISPLAY_URL_LENGTH = 60;

/** Prompts the user with a native dialog before opening an external URL.
 *  SEC-001: Prevents AI-generated or attacker-controlled links from silently
 *  navigating the user to phishing sites or local-network admin pages.
 *  @param win The parent BrowserWindow.
 *  @param url The external URL to potentially open.
 */
function promptExternalLink(win: BrowserWindow, url: string): void {
  let displayUrl: string;
  try {
    const parsed = new URL(url);
    const protocolAndHost = `${parsed.protocol}//${parsed.host}`;
    const fullPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const availableLength = Math.max(0, MAX_DISPLAY_URL_LENGTH - protocolAndHost.length);
    const truncatedPath =
      fullPath.length > availableLength
        ? `${fullPath.slice(0, Math.max(0, availableLength - 3))}…`
        : fullPath;
    displayUrl = `${protocolAndHost}${truncatedPath}`;
  } catch {
    displayUrl = url.slice(0, 120);
  }

  dialog
    .showMessageBox(win, {
      type: "question",
      buttons: ["Open in browser", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Open External Link",
      message: "Open this link in your system browser?",
      detail: displayUrl,
    })
    .then(({ response }) => {
      if (response === 0) {
        shell.openExternal(url).catch((err) => {
          logError("shell.openExternal failed", String(err));
        });
      }
    })
    .catch((err) => {
      logError("promptExternalLink dialog error", String(err));
    });
}

/** Validates that a navigation URL stays within the allowed app boundaries. */
function isAllowedAppNavigation(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (isDev) return parsed.origin === "http://localhost:5173";
    if (parsed.protocol !== "file:") return false;
    const rendererRoot = path.resolve(__dirname, "../../dist");
    return checkPathContained(fileURLToPath(parsed), rendererRoot);
  } catch {
    return false;
  }
}

/** Creates the main BrowserWindow with preload, CSP, and navigation guards. */
function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "preload.js");
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: "Venice Forge",
    backgroundColor: "#0d1117",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: isDev || allowProdDevTools,
    },
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppNavigation(url)) return;
    event.preventDefault();
    if (isTrustedExternalUrl(url)) promptExternalLink(win, url);
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    logError("did-fail-load", { errorCode, errorDescription });
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    logError("render-process-gone", details);
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const levelStr = ["verbose", "info", "warning", "error"][level] ?? "info";
    const src = sourceId ? ` [${path.basename(sourceId)}:${line}]` : "";
    const truncated = message.length > 10000 ? message.slice(0, 10000) + "…" : message;
    // SAFETY: redact any API keys, bearer tokens, or Venice key patterns from
    // console output before persisting to logs/venice-forge.log. The renderer
    // is sandboxed but a malicious model response or React error boundary
    // dump could include user-controlled prompt text or auth material.
    const safe = redactErrorMessage(truncated);
    if (level >= 2) {
      logError(`renderer-console-${levelStr}${src}`, safe);
    } else {
      logInfo(`renderer-console-${levelStr}${src}: ${safe}`);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedExternalUrl(url)) promptExternalLink(win, url);
    return { action: "deny" };
  });

  if (!isDev && !allowProdDevTools) {
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
    });
  }

  if (isDev) {
    win.loadURL("http://localhost:5173").catch((err) => {
      logError("Failed to load Vite dev server", err);
      win.loadURL(`data:text/html,<h1>Failed to load dev server</h1><p>${encodeURIComponent(err.message)}</p>`);
    });
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const prodHtmlPath = path.join(__dirname, "../../dist/index.html");
    // Keep index.html beside its relative ./assets and bootstrap-theme.js files.
    win.loadFile(prodHtmlPath).catch((err) => {
      logError("Failed to load production renderer", err);
      win.loadURL(`data:text/html,<h1>Failed to load application</h1><p>${encodeURIComponent(err.message)}</p><p>Please check the logs or reinstall the application.</p>`);
    });
  }

  win.once("ready-to-show", () => win.show());
  setupResearchBrowserIpc(win);
  initSyncFolderWatcher(win).catch((err: unknown) => logError("Failed to init sync folder watcher", err));
  return win;
}

/** Registers IPC handlers and creates the main application window. */
async function bootstrap(): Promise<void> {
  // SECURITY: initialize config BEFORE registering IPC handlers so that any
  // imported API keys are available in the secure store before the first
  // renderer request. If config initialization fails (corrupt YAML, missing
  // permissions, etc.) the app still boots with built-in defaults — we
  // surface the error in the Settings UI.
  try {
    await initializeConfig();
  } catch (err) {
    logError("Config bootstrap failed; continuing with defaults", err);
  }

  registerIpcHandlers();

  // Resume any persisted background tasks after a restart.
  initBackgroundTaskManager().catch((err) => {
    logError("Background task manager init failed", err);
  });

  // Register CSP once globally for the default session so it is not duplicated
  // when additional windows are created (M-008).
  //
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [rendererCsp(isDev)],
      },
    });
  });
  logInfo("Venice Forge startup", {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    mode: isDev ? "development" : "production",
    transport: "direct-ipc",
  });

  const args = process.argv;
  const isHeadless = args.includes("--headless");

  if (isHeadless) {
    let port = 5062;
    const portIndex = args.indexOf("--bridge-port");
    if (portIndex !== -1 && portIndex + 1 < args.length) {
      const parsedPort = parseInt(args[portIndex + 1], 10);
      if (!isNaN(parsedPort)) port = parsedPort;
    }

    let host = "127.0.0.1";
    const hostIndex = args.indexOf("--bridge-host");
    if (hostIndex !== -1 && hostIndex + 1 < args.length) {
      const candidate = args[hostIndex + 1];
      if (isValidBridgeHost(candidate)) {
        host = candidate;
      } else {
        logError("Invalid --bridge-host", candidate);
        console.error(`[Bridge Server] Invalid --bridge-host "${candidate}". Only 127.0.0.1, localhost, and ::1 are allowed.`);
        app.quit();
        return;
      }
    }

    try {
      await startBridgeServer(port, host);
      // SECURITY: never log the bearer token to console or logs. The token is
      // generated by startBridgeServer (or sourced from VENICE_BRIDGE_TOKEN)
      // and is the sole credential required to call /chat/completions etc.
      // If the operator needs the token, query it via the headless-mode IPC
      // channel `bridge:getToken` (not yet exposed) or read it from a
      // pre-set VENICE_BRIDGE_TOKEN env var.
      // eslint-disable-next-line no-console
      console.log(`[Bridge Server] Started in headless mode at http://${host}:${port}`);
      // eslint-disable-next-line no-console
      console.log(`[Bridge Server] Token: (redacted — read from VENICE_BRIDGE_TOKEN env var or set one before launch)`);
      logInfo("Bridge server started in headless mode", { host, port, tokenSource: process.env.VENICE_BRIDGE_TOKEN ? "env" : "generated" });
    } catch (err) {
      logError("Failed to start bridge server in headless mode", String(err));
      console.error(`[Bridge Server] Failed to start:`, err);
      app.quit();
    }
  } else {
    createWindow();
  }
}

/** Prevents multiple application instances from running simultaneously. */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
      const win = allWindows[0];
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle("venice-character-cache", async (request) => {
      const rendererRoot = path.resolve(__dirname, "../../dist");
      if (!isAllowedCharacterImageCacheProtocolAccess({
        isDev,
        origin: request.headers.get("origin"),
        referrer: request.referrer,
        rendererRoot,
      })) {
        return new Response("Forbidden", { status: 403 });
      }

      const parsedUrl = new URL(request.url);
      const key = parsedUrl.hostname ? parsedUrl.hostname : parsedUrl.pathname.replace(/^\/+/, "");

      if (!/^[a-f0-9]{64}$/.test(key)) {
        return new Response("Invalid image key", { status: 400 });
      }

      const dp = path.join(getCharacterImageCacheDir(), `${key}.bin`);
      if (!checkPathContained(dp, getCharacterImageCacheDir())) {
        return new Response("Forbidden", { status: 403 });
      }

      try {
        const stat = await fs.promises.stat(dp);
        if (!stat.isFile()) {
          return new Response("Not found", { status: 404 });
        }
      } catch {
        return new Response("Not found", { status: 404 });
      }

      let metaContentType = "application/octet-stream";
      try {
        const metaPath = path.join(getCharacterImageCacheDir(), `${key}.meta.json`);
        const metaRaw = await fs.promises.readFile(metaPath, "utf-8");
        const meta = JSON.parse(metaRaw);
        if (meta.contentType) {
          metaContentType = meta.contentType;
        }
      } catch {
        // Fallback to octet-stream if meta missing or invalid
      }

      if (!ALLOWED_CONTENT_TYPES.has(metaContentType)) {
        return new Response("Unsupported Media Type", { status: 415 });
      }

      const stream = fs.createReadStream(dp);
      return new Response(stream as unknown as ReadableStream, {
        headers: {
          "Content-Type": metaContentType,
          "Cache-Control": "private, max-age=604800"
        }
      });
    });

    return bootstrap();
  }).catch((err) => {
    logError("Bootstrap failed", err);
    app.quit();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    const isHeadless = process.argv.includes("--headless");
    if (!isHeadless && BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("will-quit", () => {
    stopBridgeServer();
    void stopSyncWatcher();
  });

  app.on("web-contents-created", (_event, contents) => {
    // Exclude research browser WebContents from the global policy
    // so it can handle its own in-app navigation and links.
    const researchBrowserSessions = [
      session.fromPartition("venice-forge-research-browser"),
      session.fromPartition("persist:venice-forge-research-browser"),
    ];
    if (researchBrowserSessions.includes(contents.session)) {
      return;
    }

    contents.on("will-navigate", (event, url) => {
      if (isAllowedAppNavigation(url)) return;
      event.preventDefault();
      if (isTrustedExternalUrl(url)) {
        const win = BrowserWindow.fromWebContents(contents);
        if (win) promptExternalLink(win, url);
        // Intentionally do nothing for windowless contents — block navigation.
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (isTrustedExternalUrl(url)) {
        const win = BrowserWindow.fromWebContents(contents);
        if (win) promptExternalLink(win, url);
        // Intentionally do nothing for windowless contents — block navigation.
      }
      return { action: "deny" };
    });
  });
}
