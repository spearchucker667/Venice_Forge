import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { logError, logInfo } from "../services/logger";

/** Timeout (ms) for a manual update check before giving up. */
const UPDATE_CHECK_TIMEOUT_MS = 30_000;

// Do not auto-download; give user the choice via the UI.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

/** Broadcasts an IPC event to all open renderer windows. */
function broadcast(channel: string, payload?: unknown) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(channel, payload);
    } catch {
      // Window destroyed between check and send — ignore.
    }
  }
}

/** Registers IPC handlers and autoUpdater event listeners. */
export function registerUpdateHandlers(): void {
  // IPC Handlers
  ipcMain.handle("app:checkForUpdates", async () => {
    // In dev mode the app is not packaged so electron-updater cannot locate
    // the app-update.yml manifest. Return a friendly message instead of a
    // cryptic ENOENT stack trace.
    if (!app.isPackaged) {
      return { ok: false, error: "Update checks are only available in production builds." };
    }
    try {
      logInfo("Checking for updates manually");
      // Race the check against a 30-second timeout so a slow or unreachable
      // GitHub releases endpoint does not leave the button permanently disabled.
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Update check timed out after 30 s.")), UPDATE_CHECK_TIMEOUT_MS)
      );
      const result = await Promise.race([autoUpdater.checkForUpdates(), timeoutPromise]);
      return { ok: true, version: result?.updateInfo?.version };
    } catch (err) {
      logError("Check for updates failed", String(err));
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("app:downloadUpdate", async () => {
    try {
      logInfo("Triggering update download");
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Download timed out.")), 5 * 60_000)
      );
      await Promise.race([autoUpdater.downloadUpdate(), timeoutPromise]);
      return { ok: true };
    } catch (err) {
      logError("Download update failed", String(err));
      return { ok: false, error: String(err) };
    }
  });

  let updateDownloaded = false;

  ipcMain.handle("app:installUpdate", () => {
    if (!updateDownloaded) {
      logError("Install update called but no update was downloaded");
      return { ok: false, error: "No update downloaded." };
    }
    logInfo("Installing update and restarting");
    autoUpdater.quitAndInstall();
    return { ok: true };
  });

  autoUpdater.on("update-downloaded", () => {
    updateDownloaded = true;
  });

  // autoUpdater Events -> IPC Broadcasts
  autoUpdater.on("checking-for-update", () => {
    broadcast("updates:checking");
  });

  autoUpdater.on("update-available", (info) => {
    broadcast("updates:available", info);
  });

  autoUpdater.on("update-not-available", () => {
    broadcast("updates:not-available");
  });

  autoUpdater.on("download-progress", (progressObj) => {
    broadcast("updates:progress", progressObj);
  });

  autoUpdater.on("update-downloaded", () => {
    broadcast("updates:downloaded");
  });

  autoUpdater.on("error", (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    logError("AutoUpdater error", msg);
    broadcast("updates:error", msg);
  });
}
