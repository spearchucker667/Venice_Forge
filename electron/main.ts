/** @fileoverview Bootstraps the Venice Forge Electron main process, creates the
 *  BrowserWindow with security hardening, and manages navigation guards. */

// Code Owner: fayeblade (@spearchucker667)
// Primary maintainer and security gatekeeper for the Electron main process.
import { app, BrowserWindow, dialog, shell, session } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { registerIpcHandlers } from "./ipc/handlers";
import { logError, logInfo } from "./services/logger";
import { redactErrorMessage } from "../src/services/redaction";
import { checkPathContained } from "./utils/navigation";
import { isTrustedExternalUrl } from "./utils/urlSecurity";
import { startBridgeServer, stopBridgeServer } from "./services/bridgeServer";

/** Indicates whether the app is running in development mode. */
const isDev = !app.isPackaged;

/** Whether to allow DevTools in packaged production builds. */
const allowProdDevTools = process.env.VENICE_FORGE_DEBUG_DEVTOOLS === "true";
if (allowProdDevTools) {
  logInfo("VENICE_FORGE_DEBUG_DEVTOOLS is enabled — DevTools will be available in production builds.");
}

/** Builds the Content-Security-Policy header string for the renderer.
 *  The theme bootstrap script lives in a separate file (bootstrap-theme.js)
 *  so production does not need 'unsafe-inline' for scripts.
 */
function rendererCsp(): string {
  const connectSrc = isDev ? "'self' http://localhost:5173 ws://localhost:5173" : "'self'";
  const styleSrc = isDev ? "'self' 'unsafe-inline' http://localhost:5173" : "'self' 'unsafe-inline'";
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173" : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSrc}`,
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
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
    win.loadFile(path.join(__dirname, "../../dist/index.html")).catch((err) => {
      logError("Failed to load production renderer", err);
      win.loadURL(`data:text/html,<h1>Failed to load application</h1><p>${encodeURIComponent(err.message)}</p><p>Please check the logs or reinstall the application.</p>`);
    });
  }

  win.once("ready-to-show", () => win.show());
  return win;
}

/** Registers IPC handlers and creates the main application window. */
async function bootstrap(): Promise<void> {
  registerIpcHandlers();
  // Register CSP once globally for the default session so it is not duplicated
  // when additional windows are created (M-008).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [rendererCsp()],
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
      host = args[hostIndex + 1];
    }

    try {
      const token = await startBridgeServer(port, host);
      // eslint-disable-next-line no-console
      console.log(`[Bridge Server] Started in headless mode at http://${host}:${port}`);
      // eslint-disable-next-line no-console
      console.log(`[Bridge Server] Token: ${token}`);
      logInfo("Bridge server started in headless mode", { host, port });
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

  app.whenReady().then(bootstrap).catch((err) => {
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
  });

  app.on("web-contents-created", (_event, contents) => {
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
