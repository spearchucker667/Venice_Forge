import { contextBridge, ipcRenderer } from "electron";

type VeniceRequest = {
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signalId?: string;
};

const veniceForge = {
  isDesktop: true as const,

  venice: {
    request(input: VeniceRequest) {
      return ipcRenderer.invoke("venice:request", input);
    },
    streamChat(input: VeniceRequest, onDelta: (delta: string) => void) {
      const signalId = input.signalId || crypto.randomUUID();
      const listener = (_event: Electron.IpcRendererEvent, payload: { signalId: string; delta: string }) => {
        if (payload.signalId === signalId && typeof payload.delta === "string") {
          onDelta(payload.delta);
        }
      };
      ipcRenderer.on("venice:streamDelta", listener);
      return ipcRenderer
        .invoke("venice:streamChat", { ...input, signalId })
        .finally(() => ipcRenderer.removeListener("venice:streamDelta", listener));
    },
    abort(signalId: string) {
      return ipcRenderer.invoke("venice:abort", signalId);
    },
  },

  apiKey: {
    isConfigured(): Promise<boolean> {
      return ipcRenderer.invoke("apiKey:isConfigured");
    },
    set(key: string): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("apiKey:set", key);
    },
    delete(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("apiKey:delete");
    },
    test(): Promise<{ ok: boolean; status?: number; message: string }> {
      return ipcRenderer.invoke("apiKey:test");
    },
  },

  app: {
    getVersion(): Promise<string> {
      return ipcRenderer.invoke("app:getVersion");
    },
    getDataPath(): Promise<string> {
      return ipcRenderer.invoke("app:getDataPath");
    },
    isEncryptionAvailable(): Promise<boolean> {
      return ipcRenderer.invoke("app:isEncryptionAvailable");
    },
    getDiagnostics() {
      return ipcRenderer.invoke("app:getDiagnostics");
    },
    openLogsFolder(): Promise<{ ok: boolean; path: string }> {
      return ipcRenderer.invoke("app:openLogsFolder");
    },
  },

  files: {
    saveJsonFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }> {
      return ipcRenderer.invoke("app:saveJsonFile", data, defaultPath);
    },
    loadJsonFile(): Promise<{ canceled: boolean; data?: string }> {
      return ipcRenderer.invoke("app:loadJsonFile");
    },
  },
};

contextBridge.exposeInMainWorld("veniceForge", veniceForge);
