/** @fileoverview Bootstraps the Venice Forge Electron main process, creates the
 *  BrowserWindow with security hardening, and manages navigation guards. */

// Code Owner: fayeblade (@spearchucker667)
// Primary maintainer and security gatekeeper for the Electron main process.
import { app, BrowserWindow, dialog, shell, session, protocol } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { registerIpcHandlers } from "./ipc/handlers";
import { initializeConfig } from "./services/configService";
import { initSyncFolderWatcher } from "./services/syncFolderWatcher";
import { flushBackgroundTasks, initBackgroundTaskManager } from "./services/backgroundTaskManager";
import { flushLogs, logError, logInfo } from "./services/logger";
import { redactErrorMessage } from "../src/shared/redaction";
import { checkPathContained } from "./utils/navigation";
import { isTrustedExternalUrl } from "./utils/urlSecurity";
import { applyRendererCspHeaders } from "./utils/rendererCsp";
import {
  buildCorsHeaders,
  evaluateCustomProtocolAccess,
} from "./utils/customProtocolAccess";
import { startBridgeServer, stopBridgeServer, validateHeadlessBridgeToken } from "./services/bridgeServer";
import { stopSyncWatcher } from "./services/syncFolderWatcher";
import { isValidBridgeHost } from "./utils/bridgeHost";
import { detectImageFormat, getCharacterImageCacheDir } from "./services/characterImageCache";
import {
  auditGeneratedMediaIntegrity,
  createGeneratedMediaResponse,
  GENERATED_MEDIA_SCHEME,
  recoverPendingGeneratedMediaWrites,
  startGeneratedMediaIntegrityMonitor,
} from './services/generatedMediaStore';
import {
  authorizeCustomProtocolCapability,
} from "./utils/customProtocolAccess";
import { getCustomProtocolCapabilityManager } from "./services/customProtocolCapabilities";
import { readRegularFileNoFollow } from "./utils/secureFile";
import { createShutdownCoordinator } from "./services/appShutdownCoordinator";
import { migrateLegacyFolders } from "./services/chatFolderService";
import { setProfileSessionId, getProfileSessionId } from "./services/profileSession";
import { getAgentServices, RUNTIME_SESSION_ID } from "./agent/runtime/agent-services";

export { isValidBridgeHost };

/** Best-effort revocation of attachment records for a renderer that is
 *  closing, crashing, or reloading. Safe to call multiple times. */
function cleanupRendererAttachments(contents: Electron.WebContents): void {
  try {
    getCustomProtocolCapabilityManager().revokeSession(String(contents.id));
  } catch {
    // Cleanup must never break window lifecycle.
  }
  try {
    const profileId = getProfileSessionId(contents);
    getAgentServices().attachmentRegistry.revokeRendererSession(
      RUNTIME_SESSION_ID,
      profileId,
      contents.id,
    );
  } catch {
    // Cleanup must never break window lifecycle.
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "venice-character-cache",
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    scheme: "venice-tts",
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
  {
    scheme: GENERATED_MEDIA_SCHEME,
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

/** Indicates whether the app is running in development mode. */
const isDev = !app.isPackaged;
/** Absolute path to the packaged renderer root, used for `file://` referrer checks. */
const packagedRendererRoot = path.resolve(__dirname, "../../dist");

/** Whether to allow DevTools in packaged production builds. */
const allowProdDevTools = process.env.VENICE_FORGE_DEBUG_DEVTOOLS === "true";
if (allowProdDevTools) {
  logInfo("VENICE_FORGE_DEBUG_DEVTOOLS is enabled — DevTools will be available in production builds.");
}

// Electron does not consistently translate POSIX termination signals into an
// app quit on macOS, and a renderer can delay `app.quit()`. Perform bounded
// main-process cleanup and then force the requested process exit.
const shutdown = createShutdownCoordinator({
  stopBridgeServer,
  stopSyncWatcher,
  flushBackgroundTasks,
  flushLogs,
  compactVaultJournals: async () => {
    const { compactAllManifestJournals } = await import("./services/conversationVault");
    await compactAllManifestJournals();
  },
});
let finalExitStarted = false;

function reportShutdownResult(result: Awaited<ReturnType<typeof shutdown>>): void {
  if (!result.timedOut && result.failures.length === 0) return;
  process.stderr.write(`[shutdown] ${result.failures.join("; ")}\n`);
}

async function exitForSignal(): Promise<void> {
  if (finalExitStarted) return;
  finalExitStarted = true;
  try {
    getCustomProtocolCapabilityManager().revokeAll();
  } catch {
    /* ignore */
  }
  reportShutdownResult(await shutdown());
  app.exit(0);
}
process.once("SIGTERM", () => { void exitForSignal(); });
process.once("SIGINT", () => { void exitForSignal(); });

/** Maximum length for displaying a URL in the external link confirmation dialog. */
const MAX_DISPLAY_URL_LENGTH = 60;

/** Prompts the user with a native dialog before opening an external URL.
 *  SEC-001: Prevents AI-generated or attacker-controlled links from silently
 *  navigating the user to phishing sites or explicit local-network admin pages.
 *  NOTE: This relies on `isTrustedExternalUrl` which blocks literal private/loopback 
 *  hostnames, but explicitly performs no DNS resolution and thus cannot perfectly 
 *  prevent private-IP routing via DNS tricks (e.g. DNS rebinding).
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
    width: 2019,
    height: 1306,
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
  setProfileSessionId(win.webContents, "default");

  win.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppNavigation(url)) return;
    event.preventDefault();
    if (isTrustedExternalUrl(url)) promptExternalLink(win, url);
  });
  win.webContents.on("will-redirect", (event, url) => {
    if (isAllowedAppNavigation(url)) return;
    event.preventDefault();
    if (isTrustedExternalUrl(url)) promptExternalLink(win, url);
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    logError("did-fail-load", { errorCode, errorDescription });
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    logError("render-process-gone", details);
    cleanupRendererAttachments(win.webContents);
  });
  win.webContents.on("destroyed", () => {
    cleanupRendererAttachments(win.webContents);
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (isDev) {
      process.stdout.write(`[renderer:${level}] ${message} (${sourceId}:${line})\n`);
    }
    const levelStr = ["verbose", "info", "warning", "error"][level] ?? "info";
    const src = sourceId ? ` [${path.basename(sourceId)}:${line}]` : "";
    const truncated = message && message.length > 10000 ? message.slice(0, 10000) + "…" : message;
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

  // Migrate legacy chat folders (those without kind field) by inspecting conversations
  try {
    await migrateLegacyFolders("default");
  } catch (err) {
    logError("Chat folder legacy migration failed", err);
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
      responseHeaders: applyRendererCspHeaders(details, isDev).responseHeaders,
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
    const configuredBridgeToken = process.env.VENICE_BRIDGE_TOKEN;
    const tokenError = validateHeadlessBridgeToken(configuredBridgeToken);
    if (tokenError) {
      logError("Headless bridge refused to start without a usable operator token", { reason: tokenError });
      console.error(`[Bridge Server] ${tokenError}. Set a strong VENICE_BRIDGE_TOKEN before launch.`);
      app.quit();
      return;
    }
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
      // SECURITY: never log the bearer token to console or logs. Headless
      // startup requires an operator-supplied VENICE_BRIDGE_TOKEN.
      // eslint-disable-next-line no-console
      console.log(`[Bridge Server] Started in headless mode at http://${host}:${port}`);
      // eslint-disable-next-line no-console
      console.log(`[Bridge Server] Token: (redacted — sourced from VENICE_BRIDGE_TOKEN)`);
      logInfo("Bridge server started in headless mode", { host, port, tokenSource: "env" });
    } catch (err) {
      logError("Failed to start bridge server in headless mode", String(err));
      console.error(`[Bridge Server] Failed to start:`, err);
      app.quit();
    }
  } else {
    createWindow();
  }

  if (process.env.VENICE_FORGE_SMOKE_TEST === "true") {
    setTimeout(() => app.exit(0), 1_500);
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

  app.whenReady().then(async () => {
    try {
      const recovery = await recoverPendingGeneratedMediaWrites();
      if (recovery.recovered > 0 || recovery.failed > 0) {
        logInfo('Generated media startup recovery', recovery);
      }
    } catch (error) {
      logError('Generated media startup recovery could not run', error);
    }
    void auditGeneratedMediaIntegrity()
      .then((result) => {
        if (result.failed > 0) logError('Generated media startup integrity audit found failures', result);
      })
      .catch((error) => logError('Generated media startup integrity audit failed', error));
    startGeneratedMediaIntegrityMonitor();
    protocol.handle(GENERATED_MEDIA_SCHEME, async (request) => {
      const parsedUrl = new URL(request.url);
      const id = parsedUrl.hostname || parsedUrl.pathname.replace(/^\/+/, '');
      const cap = authorizeCustomProtocolCapability({
        requestUrl: request.url,
        objectId: id,
        manager: getCustomProtocolCapabilityManager(),
      });
      if (!cap.allowed) return new Response("Forbidden", { status: 403 });
      return createGeneratedMediaResponse(id, request, {
        isDev,
        origin: request.headers.get("origin"),
        referrer: request.referrer,
        rendererRoot: packagedRendererRoot,
      });
    });
    protocol.handle("venice-tts", async (request) => {
      const parsedUrl = new URL(request.url);
      const profileId = parsedUrl.hostname;
      const id = parsedUrl.pathname.replace(/^\/+/, '').replace(/\.mp3$/, '');
      if (!profileId || !/^[a-f0-9]{64}$/.test(id)) return new Response('Not found', { status: 404 });
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profileId)) return new Response('Not found', { status: 404 });
      const ttsCap = authorizeCustomProtocolCapability({
        requestUrl: request.url,
        objectId: id,
        manager: getCustomProtocolCapabilityManager(),
        expectedProfileId: profileId,
      });
      if (!ttsCap.allowed) return new Response("Forbidden", { status: 403 });
      const ttsPath = path.join(app.getPath('userData'), 'tts-cache', 'profiles', profileId, `${id}.mp3`);
      const cacheRoot = path.join(app.getPath('userData'), 'tts-cache', 'profiles', profileId);
      if (!checkPathContained(ttsPath, cacheRoot)) {
        return new Response('Not found', { status: 404 });
      }
      const ttsAccessDecision = evaluateCustomProtocolAccess({
        isDev,
        origin: request.headers.get("origin"),
        referrer: request.referrer,
        rendererRoot: packagedRendererRoot,
      });
      if (!ttsAccessDecision.allowed) return new Response('Forbidden', { status: 403 });
      try {
        const bytes = await readRegularFileNoFollow(ttsPath);
        return new Response(bytes, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'private, max-age=31536000, immutable',
            ...buildCorsHeaders(ttsAccessDecision),
          },
        });
      } catch {
        return new Response('Not found', { status: 403 });
      }
    });
    protocol.handle("venice-character-cache", async (request) => {
      const accessDecision = evaluateCustomProtocolAccess({
        isDev,
        origin: request.headers.get("origin"),
        referrer: request.referrer,
        rendererRoot: packagedRendererRoot,
      });
      if (!accessDecision.allowed) {
        return new Response("Forbidden", { status: 403 });
      }

      const parsedUrl = new URL(request.url);
      const key = parsedUrl.hostname ? parsedUrl.hostname : parsedUrl.pathname.replace(/^\/+/, "");

      if (!/^[a-f0-9]{64}$/.test(key)) {
        return new Response("Invalid image key", { status: 400 });
      }
      const imageCap = authorizeCustomProtocolCapability({
        requestUrl: request.url,
        objectId: key,
        manager: getCustomProtocolCapabilityManager(),
      });
      if (!imageCap.allowed) return new Response("Forbidden", { status: 403 });

      const cacheDir = getCharacterImageCacheDir();
      const dp = path.join(cacheDir, `${key}.bin`);
      if (!checkPathContained(dp, cacheDir)) {
        return new Response("Forbidden", { status: 403 });
      }

      // Descriptor-safe read: validation (fstat) and consumption (readFile) share
      // the same open descriptor, closing the TOCTOU window that existed between
      // the previous `fs.promises.stat(dp)` and `fs.createReadStream(dp)` calls.
      // Character image entries are bounded to 4 MiB
      // by the cache writer, so reading the whole entry into memory is safe.
      let bytes: Buffer;
      try {
        bytes = await readRegularFileNoFollow(dp);
      } catch {
        return new Response("Not found", { status: 404 });
      }

      // Determine the response type from the bytes, not the untrusted upstream
      // header or a potentially stale metadata sidecar.
      const contentType = detectImageFormat(bytes);
      if (!contentType) {
        return new Response("Unsupported Media Type", { status: 415 });
      }

      return new Response(bytes, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=604800",
          ...buildCorsHeaders(accessDecision),
        },
      });
    });

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

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

  app.on("before-quit", (event) => {
    if (finalExitStarted) return;
    event.preventDefault();
    finalExitStarted = true;
    try {
      getCustomProtocolCapabilityManager().revokeAll();
    } catch {
      /* ignore */
    }
    void shutdown().then((result) => {
      reportShutdownResult(result);
      // Resume Electron's normal quit path so renderer beforeunload/unload
      // handlers can flush renderer-owned state. The guard above prevents the
      // second before-quit event from starting cleanup again.
      app.quit();
    });
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
    contents.on("will-redirect", (event, url) => {
      if (isAllowedAppNavigation(url)) return;
      event.preventDefault();
      if (isTrustedExternalUrl(url)) {
        const win = BrowserWindow.fromWebContents(contents);
        if (win) promptExternalLink(win, url);
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
    contents.on("destroyed", () => {
      cleanupRendererAttachments(contents);
    });
  });
}
