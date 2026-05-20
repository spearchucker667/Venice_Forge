/**
 * IPC handlers registered in the Electron main process.
 * Renderers call these via contextBridge / ipcRenderer.invoke().
 * All Venice API traffic flows through the local proxy server — not through IPC.
 */
import { ipcMain, app } from "electron";
import {
  isApiKeyConfigured,
  setApiKey,
  deleteApiKey,
  isEncryptionAvailable,
} from "../services/secureStore";
import { getProxyPort } from "../services/veniceProxy";
import https from "https";
import type { IncomingMessage } from "http";

const VENICE_TEST_URL = "https://api.venice.ai/api/v1/models";

/** Test Venice connectivity using the stored API key */
function testVeniceConnection(apiKey: string): Promise<{ ok: boolean; status: number; message: string }> {
  return new Promise((resolve) => {
    const req = https.get(
      VENICE_TEST_URL,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": `VeniceForge/${app.getVersion()}`,
        },
        timeout: 8000,
      },
      (res: IncomingMessage) => {
        // Consume body to free socket
        res.resume();
        const ok = res.statusCode !== undefined && res.statusCode < 400;
        resolve({
          ok,
          status: res.statusCode ?? 0,
          message: ok ? "Connection successful" : `HTTP ${res.statusCode}`,
        });
      }
    );
    req.on("error", (err: Error) => {
      resolve({ ok: false, status: 0, message: err.message });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, message: "Connection timed out" });
    });
  });
}

export function registerIpcHandlers(): void {
  // Returns the local proxy URL for the renderer
  ipcMain.handle("venice:getProxyUrl", () => {
    const port = getProxyPort();
    if (!port) throw new Error("Venice proxy has not started yet.");
    return `http://127.0.0.1:${port}/api/venice`;
  });

  // API key management
  ipcMain.handle("apiKey:isConfigured", () => isApiKeyConfigured());

  ipcMain.handle("apiKey:set", (_event, key: unknown) => {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error("Invalid API key supplied.");
    }
    const trimmed = key.trim();
    if (trimmed.length > 512) throw new Error("API key too long.");
    setApiKey(trimmed);
    return { ok: true };
  });

  ipcMain.handle("apiKey:delete", () => {
    deleteApiKey();
    return { ok: true };
  });

  ipcMain.handle("apiKey:test", async () => {
    if (!isApiKeyConfigured()) {
      return { ok: false, message: "No API key configured." };
    }
    const { getApiKey } = await import("../services/secureStore");
    const key = getApiKey();
    if (!key) return { ok: false, message: "Could not read API key." };
    return testVeniceConnection(key);
  });

  // App information
  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("app:getDataPath", () => app.getPath("userData"));
  ipcMain.handle("app:isEncryptionAvailable", () => isEncryptionAvailable());

  // Export/import stubs — actual data is in IndexedDB in the renderer
  // The renderer serialises its own data and passes it here for file save
  ipcMain.handle("app:showSaveDialog", async (_event, options: { defaultPath?: string }) => {
    const { dialog } = await import("electron");
    const result = await dialog.showSaveDialog({
      title: "Export Venice Forge data",
      defaultPath: options?.defaultPath ?? "venice-forge-export.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    return result;
  });

  ipcMain.handle("app:showOpenDialog", async () => {
    const { dialog } = await import("electron");
    const result = await dialog.showOpenDialog({
      title: "Import Venice Forge data",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    return result;
  });

  ipcMain.handle("app:writeFile", async (_event, filePath: unknown, data: unknown) => {
    if (typeof filePath !== "string" || typeof data !== "string") {
      throw new Error("Invalid arguments to app:writeFile");
    }
    const fs = await import("fs/promises");
    await fs.writeFile(filePath, data, "utf-8");
    return { ok: true };
  });

  ipcMain.handle("app:readFile", async (_event, filePath: unknown) => {
    if (typeof filePath !== "string") throw new Error("Invalid path");
    const fs = await import("fs/promises");
    return fs.readFile(filePath, "utf-8");
  });
}
