import { app, shell } from "electron";
import fs from "fs";
import path from "path";

const LOG_FILE = "venice-forge.log";
const MAX_LOG_BYTES = 1024 * 1024;
let lastApiError = "";

function redact(value: unknown): string {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(api[-_ ]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi, "$1=[REDACTED]")
    .replace(/\bvn-[A-Za-z0-9._~+/=-]{8,}\b/gi, "[REDACTED]");
}

export function getLogsDir(): string {
  return path.join(app.getPath("userData"), "logs");
}

export function getLogPath(): string {
  return path.join(getLogsDir(), LOG_FILE);
}

function ensureLogFile(): void {
  fs.mkdirSync(getLogsDir(), { recursive: true });
  const logPath = getLogPath();
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_BYTES) {
    fs.renameSync(logPath, `${logPath}.1`);
  }
}

export function logInfo(message: string, meta?: unknown): void {
  writeLog("INFO", message, meta);
}

export function logError(message: string, error?: unknown): void {
  const normalized = error instanceof Error ? `${error.name}: ${error.message}` : error;
  writeLog("ERROR", message, normalized);
}

function writeLog(level: "INFO" | "ERROR", message: string, meta?: unknown): void {
  try {
    ensureLogFile();
    const metaText = meta === undefined ? "" : ` ${redact(typeof meta === "string" ? meta : JSON.stringify(meta))}`;
    fs.appendFileSync(getLogPath(), `${new Date().toISOString()} ${level} ${redact(message)}${metaText}\n`, "utf-8");
  } catch {
    // Logging must never break app startup or API requests.
  }
}

export function setLastApiError(error: unknown): void {
  lastApiError = redact(error instanceof Error ? error.message : String(error || ""));
}

export function getLastApiError(): string {
  return lastApiError;
}

export async function openLogsFolder(): Promise<{ ok: boolean; path: string }> {
  ensureLogFile();
  await shell.openPath(getLogsDir());
  return { ok: true, path: getLogsDir() };
}
