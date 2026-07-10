import { app } from "electron";
import path from "path";
import { promises as fs } from "fs";
import crypto from "crypto";
import { logError } from "./logger";

export interface SyncConfig {
  syncPath: string | null;
  deviceId: string;
}

let cachedConfig: SyncConfig | null = null;

function getConfigPath(): string {
  return path.join(app.getPath("userData"), "sync-config.json");
}

export async function loadSyncConfig(): Promise<SyncConfig> {
  if (cachedConfig) return cachedConfig;

  const configPath = getConfigPath();
  try {
    const data = await fs.readFile(configPath, "utf8");
    cachedConfig = JSON.parse(data) as SyncConfig;
    if (!cachedConfig.deviceId) {
      cachedConfig.deviceId = crypto.randomUUID();
      await saveSyncConfig(cachedConfig);
    }
  } catch {
    // Doesn't exist or corrupt, create a new one
    cachedConfig = {
      syncPath: null,
      deviceId: crypto.randomUUID()
    };
    await saveSyncConfig(cachedConfig);
  }

  return cachedConfig;
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  cachedConfig = { ...config };
  const configPath = getConfigPath();
  try {
    // Atomic write
    const tmpPath = `${configPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(cachedConfig, null, 2), "utf8");
    await fs.rename(tmpPath, configPath);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncConfig", `Failed to save sync config: ${errorMsg}`);
  }
}

export async function getSyncPath(): Promise<string | null> {
  const config = await loadSyncConfig();
  return config.syncPath;
}

export async function setSyncPath(syncPath: string | null): Promise<void> {
  const config = await loadSyncConfig();
  config.syncPath = syncPath;
  await saveSyncConfig(config);
}

export async function getDeviceId(): Promise<string> {
  const config = await loadSyncConfig();
  return config.deviceId;
}
