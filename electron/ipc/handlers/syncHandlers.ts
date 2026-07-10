import { ipcMain, dialog, BrowserWindow } from "electron";
import { setSyncFolder, getSyncFolder, writePacket } from "../../services/syncFolderWatcher";
import { redactErrorMessage } from "../../../src/shared/redaction";

export function registerSyncHandlers(): void {
  ipcMain.handle("sync:chooseSyncFolder", async (event) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) return { ok: false, error: "Main window not found." };
      
      // verify-no-native-dialogs: allow
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Select Sync Folder",
        properties: ["openDirectory", "createDirectory"],
        message: "Select an empty folder to use for Encrypted Sync."
      });
      
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, canceled: true };
      }
      
      return { ok: true, path: result.filePaths[0] };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: redactErrorMessage(errorMsg) };
    }
  });

  ipcMain.handle("sync:getSyncFolder", async () => {
    return { ok: true, path: getSyncFolder() };
  });

  ipcMain.handle("sync:setSyncFolder", async (_event, input: { path: string }) => {
    return await setSyncFolder(input.path);
  });

  ipcMain.handle("sync:startSync", async (_event, params: { password: string }) => {
    const { startSyncEngine } = await import("../../services/syncFolderWatcher");
    return await startSyncEngine(params.password);
  });

  ipcMain.handle("sync:stopSync", async () => {
    const { stopSyncEngine } = await import("../../services/syncFolderWatcher");
    return await stopSyncEngine();
  });

  ipcMain.handle("sync:writePacket", async (_event, input: { storeName: string; id: string; recordJson: string }) => {
    return await writePacket(input.storeName, input.id, input.recordJson);
  });
}
