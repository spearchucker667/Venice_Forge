import { ipcMain, dialog } from "electron";
import { redactErrorMessage } from "../../src/shared/redaction";
import {
  exportConfigTemplate,
  getPaths,
  getSanitizedConfig,
  getStatus as getConfigStatus,
  initializeConfig,
  loadMergedThemes,
  openConfigFolder,
  reloadConfig,
  resetSecureStoreKeys,
  writeSanitizedConfig,
} from "../services/configService";

/**
 * Registers all IPC handlers related to local master YAML config
 * and theming.
 */
export function registerConfigIpcHandlers() {
  ipcMain.handle("config:get", () => {
    try {
      return { ok: true, payload: getSanitizedConfig() };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:getStatus", () => {
    try {
      return { ok: true, status: getConfigStatus(), paths: getPaths() };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:reload", async () => {
    try {
      const status = await reloadConfig();
      return { ok: true, status };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:initialize", async () => {
    try {
      const status = await initializeConfig();
      return { ok: true, status };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:openFolder", async () => {
    try {
      return await openConfigFolder();
    } catch (err) {
      return { ok: false, path: "", error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:writeSanitized", async (_event, patch: unknown) => {
    try {
      return await writeSanitizedConfig(patch);
    } catch (err) {
      return { ok: false, redactedFields: [], error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:exportTemplate", async () => {
    try {
      const result = await dialog.showSaveDialog({
        title: "Export Venice Forge config template",
        defaultPath: "venice-forge.config.example.yaml",
        filters: [{ name: "YAML", extensions: ["yaml", "yml"] }],
        properties: ["showOverwriteConfirmation", "createDirectory"],
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      return await exportConfigTemplate(result.filePath);
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:loadMergedThemes", async () => {
    try {
      return { ok: true, ...(await loadMergedThemes()) };
    } catch (err) {
      return { ok: false, themes: {}, warnings: [], error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("config:resetSecureStoreKeys", () => {
    try {
      const removed = resetSecureStoreKeys();
      return { ok: true, removed };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });
}
