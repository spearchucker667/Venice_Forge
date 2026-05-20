/**
 * TypeScript declarations for the Electron preload bridge.
 * Augments the Window interface so renderer code is fully typed.
 */

export interface VeniceForgeApiKey {
  isConfigured(): Promise<boolean>;
  set(key: string): Promise<{ ok: boolean }>;
  delete(): Promise<{ ok: boolean }>;
  test(): Promise<{ ok: boolean; status?: number; message: string }>;
}

export interface VeniceForgeApp {
  getVersion(): Promise<string>;
  getDataPath(): Promise<string>;
  isEncryptionAvailable(): Promise<boolean>;
}

export interface VeniceForgeFiles {
  showSaveDialog(options: { defaultPath?: string }): Promise<{
    canceled: boolean;
    filePath?: string;
  }>;
  showOpenDialog(): Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
  writeFile(filePath: string, data: string): Promise<{ ok: boolean }>;
  readFile(filePath: string): Promise<string>;
}

export interface VeniceForge {
  readonly isDesktop: true;
  getProxyUrl(): Promise<string>;
  apiKey: VeniceForgeApiKey;
  app: VeniceForgeApp;
  files: VeniceForgeFiles;
}

declare global {
  interface Window {
    veniceForge?: VeniceForge;
  }
}
