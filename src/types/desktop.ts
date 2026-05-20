export interface VeniceForgeApiKey {
  isConfigured(): Promise<boolean>;
  set(key: string): Promise<{ ok: boolean }>;
  delete(): Promise<{ ok: boolean }>;
  test(): Promise<{ ok: boolean; status?: number; message: string }>;
}

export interface VeniceForgeRequest {
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signalId?: string;
}

export interface VeniceForgeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  contentType: string;
}

export interface VeniceForgeVenice {
  request(input: VeniceForgeRequest): Promise<VeniceForgeResponse>;
  streamChat(input: VeniceForgeRequest, onDelta: (delta: string) => void): Promise<VeniceForgeResponse>;
  abort(signalId: string): Promise<{ ok: boolean }>;
}

export interface VeniceForgeDiagnostics {
  isDesktop: boolean;
  appVersion: string;
  electronVersion?: string;
  chromeVersion?: string;
  nodeVersion?: string;
  userDataPath: string;
  logsPath?: string;
  storageMode: "encrypted" | "unavailable" | "plaintext-fallback" | "web";
  secureStorageAvailable: boolean;
  securePrefsCorrupted?: boolean;
  securePrefsError?: string | null;
  apiKeyConfigured: boolean;
  transport: "direct-ipc" | "web-proxy";
  lastApiError?: string;
}

export interface VeniceForgeApp {
  getVersion(): Promise<string>;
  getDataPath(): Promise<string>;
  isEncryptionAvailable(): Promise<boolean>;
  getDiagnostics(): Promise<VeniceForgeDiagnostics>;
  openLogsFolder(): Promise<{ ok: boolean; path: string }>;
}

export interface VeniceForgeFiles {
  saveJsonFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }>;
  loadJsonFile(): Promise<{ canceled: boolean; data?: string }>;
}

export interface VeniceForge {
  readonly isDesktop: true;
  venice: VeniceForgeVenice;
  apiKey: VeniceForgeApiKey;
  app: VeniceForgeApp;
  files: VeniceForgeFiles;
}

declare global {
  interface Window {
    veniceForge?: VeniceForge;
  }
}
