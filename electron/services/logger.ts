/** @fileoverview Provides rotated file logging with automatic secret redaction
 *  for the Electron main process. */

import { app, shell } from "electron";
import fs from "fs";
import path from "path";
import { redactSecrets, sanitizeErrorText } from "../../src/shared/redaction";

/** Name of the log file written to the user data directory. */
const LOG_FILE = "venice-forge.log";

/** Maximum size in bytes before rotating the log file. */
const MAX_LOG_BYTES = 1024 * 1024;

/** Holds the most recent API error message for diagnostics display. */
let lastApiError = "";

/** Returns the directory path where log files are stored. */
export function getLogsDir(): string {
  return path.join(app.getPath("userData"), "logs");
}

/** Returns the full path to the current log file. */
export function getLogPath(): string {
  return path.join(getLogsDir(), LOG_FILE);
}

/** @internal exported for testing */
let logRotationLock = false;

const MAX_QUEUED_LINES = 1000;
const MAX_BATCH_LINES = 100;
const queuedLines: string[] = [];
let flushPromise: Promise<void> | null = null;

function getFileSize(filePath: string): number | null {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

function removeIfExists(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Rotation cleanup is best-effort; writeLog must still append if possible.
  }
}

function renameIfExists(from: string, to: string): void {
  try {
    if (fs.existsSync(from)) fs.renameSync(from, to);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "ENOENT") throw err;
  }
}

export function ensureLogFile(): void {
  fs.mkdirSync(getLogsDir(), { recursive: true });
  const logPath = getLogPath();
  const size = getFileSize(logPath);
  if (size !== null && size > MAX_LOG_BYTES) {
    if (logRotationLock) return; // Skip rotation if another thread is rotating
    logRotationLock = true;
    try {
      const b3 = `${logPath}.3`;
      const b2 = `${logPath}.2`;
      const b1 = `${logPath}.1`;
      removeIfExists(b3);
      renameIfExists(b2, b3);
      renameIfExists(b1, b2);
      renameIfExists(logPath, b1);
    } catch {
      // Rotation failure is non-fatal; continue logging to current file
    } finally {
      logRotationLock = false;
    }
  }
}

/** Writes an informational message to the log file.
 *  @param message The log message.
 *  @param meta Optional metadata to include.
 */
export function logInfo(message: string, meta?: unknown): void {
  writeLog("INFO", message, meta);
}

/** Writes a warning message to the log file.
 *  @param message The log message.
 *  @param meta Optional metadata to include.
 */
export function logWarn(message: string, meta?: unknown): void {
  writeLog("WARN", message, meta);
}

/** Writes an error message to the log file.
 *  @param message The log message.
 *  @param error Optional error object or message.
 */
export function logError(message: string, error?: unknown): void {
  const normalized = error instanceof Error ? `${error.name}: ${error.message}` : error;
  writeLog("ERROR", message, normalized);
}

/** Writes a log line at the specified level with optional metadata.
 *  @param level The severity level.
 *  @param message The log message.
 *  @param meta Optional metadata to append.
 */
function writeLog(level: "INFO" | "WARN" | "ERROR", message: string, meta?: unknown): void {
  try {
    const safeMessage = sanitizeErrorText(message).replace(/\r?\n/g, "\\n");
    const metaText = meta === undefined
      ? ""
      : ` ${sanitizeErrorText(typeof meta === "string" ? meta : JSON.stringify(redactSecrets(meta)))}`;
    const safeMeta = metaText.replace(/\r?\n/g, "\\n");
    if (queuedLines.length >= MAX_QUEUED_LINES) queuedLines.shift();
    queuedLines.push(`${new Date().toISOString()} ${level} ${safeMessage}${safeMeta}\n`);
    scheduleFlush();
  } catch {
    // Logging must never break app startup or API requests.
  }
}

async function prepareLogFileForAppend(): Promise<void> {
  const logsDir = getLogsDir();
  const logPath = getLogPath();
  await fs.promises.mkdir(logsDir, { recursive: true });
  let size = 0;
  try {
    size = (await fs.promises.stat(logPath)).size;
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
  if (size <= MAX_LOG_BYTES) return;
  for (const [from, to] of [
    [`${logPath}.2`, `${logPath}.3`],
    [`${logPath}.1`, `${logPath}.2`],
    [logPath, `${logPath}.1`],
  ] as const) {
    try {
      if (to.endsWith(".3")) await fs.promises.rm(to, { force: true });
      await fs.promises.rename(from, to);
    } catch (error: unknown) {
      if ((error as { code?: string }).code !== "ENOENT") throw error;
    }
  }
}

async function drainLogQueue(): Promise<void> {
  while (queuedLines.length > 0) {
    const batch = queuedLines.splice(0, MAX_BATCH_LINES).join("");
    try {
      await prepareLogFileForAppend();
      await fs.promises.appendFile(getLogPath(), batch, "utf-8");
    } catch {
      // Logging remains best-effort and must never break app work.
    }
  }
}

function scheduleFlush(): void {
  if (flushPromise) return;
  flushPromise = new Promise<void>((resolve) => setImmediate(resolve))
    .then(drainLogQueue)
    .finally(() => {
      flushPromise = null;
      if (queuedLines.length > 0) scheduleFlush();
    });
}

/** Flushes queued log writes; used by controlled shutdown and deterministic tests. */
export async function flushLogs(): Promise<void> {
  if (queuedLines.length > 0) scheduleFlush();
  while (flushPromise) await flushPromise;
}

/** Stores the last API error after redacting sensitive content.
 *  @param error The error to record.
 */
export function setLastApiError(error: unknown): void {
  lastApiError = sanitizeErrorText(error instanceof Error ? error.message : String(error || ""));
}

/** Retrieves the last stored API error message. */
export function getLastApiError(): string {
  return lastApiError;
}

/** Opens the log folder in the system file manager.
 *  @returns An object indicating success and the folder path.
 */
export async function openLogsFolder(): Promise<{ ok: boolean; path: string; error?: string }> {
  ensureLogFile();
  const result = await shell.openPath(getLogsDir());
  if (result) {
    return { ok: false, path: getLogsDir(), error: result };
  }
  return { ok: true, path: getLogsDir() };
}
