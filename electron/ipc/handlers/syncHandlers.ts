import { ipcMain, dialog, BrowserWindow } from "electron";
import { setSyncFolder, getSyncFolder, getSyncStatus, setSyncEmissionSuppressed, setRendererSessionAttached, startSyncWatcher, stopSyncWatcher, pauseSyncWatcher, acknowledgeOperation } from "../../services/syncFolderWatcher";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { isValidProfileStorageId } from "../../../src/utils/profileIdValidation";
import { validateMutationAuthority } from "../../services/remoteApplyAuthority";
import { isValidId } from "../../../src/utils/idValidation";
import { getProfileSessionId } from "../../services/profileSession";
import crypto from "node:crypto";
import { validateBackupPayloadProfile } from "../../../src/shared/backupProfile";

const BACKUP_EXPORT_LEASE_MS = 5 * 60 * 1000;
const backupExportLeases = new WeakMap<Electron.WebContents, { token: string; profileId: string; expiresAt: number }>();

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

  ipcMain.handle("sync:startSync", async (_event, params: { password: string; profileId: string }) => {
    if (!params || typeof params.password !== "string" || !isValidProfileStorageId(params.profileId)) {
      return { ok: false, error: "Invalid sync start payload." };
    }
    return await startSyncWatcher(params.password, params.profileId);
  });

  ipcMain.handle("sync:stopSync", async () => {
    return await stopSyncWatcher();
  });
  ipcMain.handle("sync:pauseSync", async () => pauseSyncWatcher());
  ipcMain.handle("sync:getStatus", async () => ({ ok: true, ...getSyncStatus() }));

  ipcMain.handle("sync:rendererSessionAttached", async (_event, input: { attached: boolean }) => {
    try {
      setRendererSessionAttached(input.attached === true);
      return { ok: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: redactErrorMessage(errorMsg) };
    }
  });

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

  ipcMain.handle("sync:applyRemoteMutation", async (event, input: { storeName?: unknown; id?: unknown; recordJson?: unknown; delete?: unknown; remoteApplyToken?: unknown }) => {
    if (!input || typeof input.storeName !== "string" || typeof input.id !== "string" || !isValidId(input.id)) {
      return { ok: false, error: "Invalid remote mutation payload." };
    }
    if (!validateMutationAuthority("remote-sync", input.remoteApplyToken, input.storeName, input.id)) {
      return { ok: false, error: "Remote mutation authority rejected." };
    }
    try {
      const deleting = input.delete === true;
      const record = deleting ? null : JSON.parse(typeof input.recordJson === "string" ? input.recordJson : "null");
      if (!deleting && (!record || typeof record !== "object" || Array.isArray(record) || record.id !== input.id)) {
        return { ok: false, error: "Remote record ID mismatch." };
      }
      switch (input.storeName) {
        case "conversations": {
          const storage = await import("../../services/chatStorage");
          const profileId = getProfileSessionId(event.sender);
          if (deleting) await storage.deleteConversation(input.id, profileId);
          else await storage.saveConversation(record, profileId);
          break;
        }
        case "character_cards": {
          const storage = await import("../../services/characterCardStorage");
          if (deleting) await storage.deleteCharacterCard(input.id);
          else await storage.saveCharacterCard(record);
          break;
        }
        case "personas":
        case "lorebooks":
        case "rp_assets":
        case "rpScenarios": {
          const stores = await import("../../services/rpStores");
          const target = input.storeName === "personas" ? stores.personaStore
            : input.storeName === "lorebooks" ? stores.lorebookStore
              : input.storeName === "rp_assets" ? stores.rpAssetStore : stores.scenarioStore;
          if (deleting) await target.remove(input.id);
          else await target.save(record);
          break;
        }
        case "rp_chats": {
          const storage = await import("../../services/rpChatStorage");
          if (deleting) await storage.deleteRpChat(input.id);
          else await storage.saveRpChat(record);
          break;
        }
        default:
          return { ok: false, error: "Remote mutation store is not main-process managed." };
      }
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
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
  ipcMain.handle("sync:beginBackupExport", async (event) => {
    const profileId = getProfileSessionId(event.sender);
    const token = crypto.randomUUID();
    backupExportLeases.set(event.sender, {
      token,
      profileId,
      expiresAt: Date.now() + BACKUP_EXPORT_LEASE_MS,
    });
    return { ok: true, token, profileId };
  });

  ipcMain.handle("sync:encryptBackup", async (event, params: { payload: string, password: string, token: string }) => {
    try {
      const lease = backupExportLeases.get(event.sender);
      backupExportLeases.delete(event.sender);
      if (
        !lease ||
        typeof params?.token !== "string" ||
        params.token !== lease.token ||
        lease.expiresAt < Date.now() ||
        getProfileSessionId(event.sender) !== lease.profileId ||
        typeof params.payload !== "string" ||
        !validateBackupPayloadProfile(params.payload, lease.profileId)
      ) {
        return { ok: false, error: "Backup export profile session is invalid or expired." };
      }
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
