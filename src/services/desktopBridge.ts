import "../types/desktop";
import type { VeniceForgeDiagnostics, VeniceForgeRequest, VeniceForgeResponse } from "../types/desktop";

export function isElectron(): boolean {
  return typeof window !== "undefined" && window.veniceForge?.isDesktop === true;
}

export async function initDesktopBridge(): Promise<void> {
  if (!isElectron()) return;
  await window.veniceForge!.app.getDiagnostics();
}

function createSignalId(): string {
  return crypto.randomUUID();
}

function attachAbort(signalId: string, signal?: AbortSignal): (() => void) | undefined {
  if (!signal) return undefined;
  const abort = () => {
    window.veniceForge?.venice.abort(signalId).catch(() => {});
  };
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}

export const desktopVenice = {
  async request(input: VeniceForgeRequest, signal?: AbortSignal): Promise<VeniceForgeResponse> {
    if (!isElectron()) throw new Error("Venice desktop transport is only available in desktop mode.");
    const signalId = input.signalId || createSignalId();
    const cleanup = attachAbort(signalId, signal);
    try {
      return await window.veniceForge!.venice.request({ ...input, signalId });
    } finally {
      cleanup?.();
    }
  },

  async streamChat(
    input: VeniceForgeRequest,
    onDelta: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<VeniceForgeResponse> {
    if (!isElectron()) throw new Error("Venice desktop transport is only available in desktop mode.");
    const signalId = input.signalId || createSignalId();
    const cleanup = attachAbort(signalId, signal);
    try {
      return await window.veniceForge!.venice.streamChat({ ...input, signalId }, onDelta);
    } finally {
      cleanup?.();
    }
  },
};

export const desktopApiKey = {
  isConfigured(): Promise<boolean> {
    if (!isElectron()) return Promise.resolve(false);
    return window.veniceForge!.apiKey.isConfigured();
  },
  set(key: string): Promise<{ ok: boolean }> {
    if (!isElectron()) return Promise.resolve({ ok: false });
    return window.veniceForge!.apiKey.set(key);
  },
  delete(): Promise<{ ok: boolean }> {
    if (!isElectron()) return Promise.resolve({ ok: false });
    return window.veniceForge!.apiKey.delete();
  },
  test(): Promise<{ ok: boolean; status?: number; message: string }> {
    if (!isElectron()) return Promise.resolve({ ok: false, message: "Not in desktop mode" });
    return window.veniceForge!.apiKey.test();
  },
};

export const desktopApp = {
  getVersion(): Promise<string> {
    if (!isElectron()) return Promise.resolve("web");
    return window.veniceForge!.app.getVersion();
  },
  getDataPath(): Promise<string> {
    if (!isElectron()) return Promise.resolve("IndexedDB (browser)");
    return window.veniceForge!.app.getDataPath();
  },
  isEncryptionAvailable(): Promise<boolean> {
    if (!isElectron()) return Promise.resolve(false);
    return window.veniceForge!.app.isEncryptionAvailable();
  },
  getDiagnostics(): Promise<VeniceForgeDiagnostics> {
    if (!isElectron()) {
      return Promise.resolve({
        isDesktop: false,
        appVersion: "web",
        userDataPath: "IndexedDB (browser)",
        storageMode: "web",
        secureStorageAvailable: false,
        apiKeyConfigured: false,
        transport: "web-proxy",
      });
    }
    return window.veniceForge!.app.getDiagnostics();
  },
  openLogsFolder(): Promise<{ ok: boolean; path: string }> {
    if (!isElectron()) return Promise.resolve({ ok: false, path: "" });
    return window.veniceForge!.app.openLogsFolder();
  },
};

export const desktopFiles = {
  async exportJson(data: unknown, defaultPath = "venice-forge-export.json"): Promise<boolean> {
    const json = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    if (!isElectron()) {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultPath;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    }
    const result = await window.veniceForge!.files.saveJsonFile(json, defaultPath);
    return result.ok;
  },

  async importJsonString(): Promise<string | null> {
    if (!isElectron()) return null;
    const result = await window.veniceForge!.files.loadJsonFile();
    if (result.canceled || !result.data) return null;
    return result.data;
  },
};
