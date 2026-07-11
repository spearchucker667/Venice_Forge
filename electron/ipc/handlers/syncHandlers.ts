import { ipcMain, dialog, BrowserWindow } from "electron";
import { setSyncFolder, getSyncFolder, getSyncStatus, setSyncEmissionSuppressed, startSyncWatcher, stopSyncWatcher, pauseSyncWatcher, acknowledgeOperation } from "../../services/syncFolderWatcher";
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
      
      const configured = await setSyncFolder(result.filePaths[0]);
      return configured.ok ? { ok: true, path: result.filePaths[0] } : configured;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: redactErrorMessage(errorMsg) };
    }
  });

  ipcMain.handle("sync:getSyncFolder", async () => {
    return { ok: true, path: getSyncFolder(), ...getSyncStatus() };
  });

  ipcMain.handle("sync:setSyncFolder", async (_event, input: { path: string }) => {
    if (!input || typeof input.path !== "string" || input.path !== getSyncFolder()) {
      return { ok: false, error: "Sync folders must be approved through the main-process folder picker." };
    }
    return { ok: true };
  });

  ipcMain.handle("sync:startSync", async (_event, params: { password: string }) => {
    return await startSyncWatcher(params.password);
  });

  ipcMain.handle("sync:stopSync", async () => {
    return await stopSyncWatcher();
  });
  ipcMain.handle("sync:pauseSync", async () => pauseSyncWatcher());
  ipcMain.handle("sync:getStatus", async () => ({ ok: true, ...getSyncStatus() }));

  ipcMain.handle("sync:setEmissionSuppressed", async (_event, input: { suppressed: boolean }) => {
    try {
      setSyncEmissionSuppressed(input.suppressed === true);
      return { ok: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: redactErrorMessage(errorMsg) };
    }
  });

  ipcMain.handle("sync:writePacket", async (_event, input: { storeName: string; id: string; recordJson: string }) => {
    const { writePacket } = await import("../../services/syncFolderWatcher");
    return await writePacket(input.storeName, input.id, input.recordJson);
  });

  const OPERATION_ID_RE = /^[a-f0-9]{64}$/;

  ipcMain.handle("sync:acknowledgeOperation", async (_event, input: { operationId: string; ok: boolean }) => {
    if (!input || typeof input.operationId !== "string" || typeof input.ok !== "boolean") {
      return { ok: false, error: "Invalid acknowledgment payload." };
    }
    if (!OPERATION_ID_RE.test(input.operationId)) {
      return { ok: false, error: "Invalid operationId." };
    }
    return await acknowledgeOperation(input.operationId, input.ok);
  });

  // Manual Backup Support
  ipcMain.handle("sync:encryptBackup", async (_event, params: { payload: string, password: string }) => {
    try {
      const { encryptPayload } = await import("../../services/backupCrypto");
      const encrypted = await encryptPayload(params.payload, params.password);
      return { ok: true, data: encrypted };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: redactErrorMessage(errorMsg) };
    }
  });

  ipcMain.handle("sync:decryptBackup", async (_event, params: { ciphertext: string, salt: string, iv: string, password: string }) => {
    try {
      const { decryptPayload } = await import("../../services/backupCrypto");
      const decrypted = await decryptPayload(params.ciphertext, params.salt, params.iv, params.password);
      return { ok: true, data: decrypted };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: redactErrorMessage(errorMsg) };
    }
  });
}
