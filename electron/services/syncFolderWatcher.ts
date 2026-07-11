import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import crypto from "crypto";
import { promises as fs } from "fs";
import { logInfo, logError } from "./logger";
import { redactErrorMessage } from "../../src/shared/redaction";
import { BrowserWindow, app } from "electron";
import { encryptPayload, decryptPayload, EncryptedBackupManifest } from "./backupCrypto";
import { getSyncPath, setSyncPath, getDeviceId } from "./syncConfig";
import { enqueueRemoteApply } from "./syncApplyQueue";
import { initSyncRetryQueue, scheduleRetry, stopSyncRetryQueue } from "./syncRetryQueue";
import { validateTombstone } from "../../src/shared/syncProtocol";

let watcher: FSWatcher | null = null;
let currentSyncPath: string | null = null;
let mainWindowRef: BrowserWindow | null = null;
let currentPassword: string | null = null;
let syncStatus: "stopped" | "paused" | "running" | "error" = "stopped";
let rendererSessionAttached = false;
let authenticated = false;
let degradedReason: string | undefined;
let localEmissionSuppressed = false;
interface InFlightOperation {
  storeName: string;
  sourceDeviceId?: string;
  filePath: string;
  attempts: number;
  complete?: () => void;
}

const inFlightOperations = new Map<string, InFlightOperation>();
const inFlightTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const ACK_TIMEOUT_MS = 30_000;
const MAX_PACKET_BYTES = 50 * 1024 * 1024;

const JOURNAL_VERSION = 1;
export const MAX_JOURNAL_ENTRIES = 50_000;
const JOURNAL_COMPACTION_DAYS = 7;

class AsyncSerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

const journalQueue = new AsyncSerialQueue();

const JOURNAL_FLUSH_DEBOUNCE_MS = 50;
let appliedOperationFlushTimeout: ReturnType<typeof setTimeout> | null = null;

interface AppliedOperationEntry {
  operationId: string;
  storeName: string;
  appliedAt: string;
  sourceDeviceId?: string;
  result: "applied" | "ignored" | "conflict-preserved";
}

interface AppliedOperationsJournal {
  version: number;
  operations: AppliedOperationEntry[];
  lastCompactedAt?: string;
}

let appliedOperationsJournal: AppliedOperationsJournal = { version: JOURNAL_VERSION, operations: [] };
let journalLoaded = false;
let journalPath: string | null = null;
const appliedOperationIds = new Set<string>();

export const SYNC_STORE_ALLOWLIST = new Set([
  "images", "chats", "settings", "conversations", "ai_memory", "files", "character_cards",
  "personas", "lorebooks", "rp_chats", "rp_assets", "projects", "promptLibrary", "scenes",
  "rpScenarios", "workflowTemplates", "researchSessions", "visualWorkflows", "playground", "tombstones",
]);

function getJournalDirectory(): string {
  return path.join(app.getPath("userData"), "sync");
}

function getJournalPath(): string {
  if (!journalPath) {
    journalPath = path.join(getJournalDirectory(), "applied-operations.json");
  }
  return journalPath;
}

export async function loadAppliedOperationsJournal(): Promise<AppliedOperationsJournal> {
  if (journalLoaded) return appliedOperationsJournal;
  try {
    const filePath = getJournalPath();
    await fs.mkdir(getJournalDirectory(), { recursive: true });
    const data = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(data) as AppliedOperationsJournal;
    if (parsed.version !== JOURNAL_VERSION || !Array.isArray(parsed.operations)) {
      throw new Error("Corrupt applied-operations journal");
    }
    appliedOperationsJournal = parsed;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logError("syncFolderWatcher", `Failed to load applied-operations journal: ${redactErrorMessage(err)}`);
    }
    appliedOperationsJournal = { version: JOURNAL_VERSION, operations: [] };
  }
  appliedOperationIds.clear();
  for (const op of appliedOperationsJournal.operations) {
    appliedOperationIds.add(op.operationId);
  }
  journalLoaded = true;
  return appliedOperationsJournal;
}

async function saveAppliedOperationsJournal(): Promise<void> {
  const filePath = getJournalPath();
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.mkdir(getJournalDirectory(), { recursive: true });
    await fs.writeFile(tmpPath, JSON.stringify(appliedOperationsJournal, null, 2), { encoding: "utf8", flag: "wx" });
    await fs.rename(tmpPath, filePath);
  } catch (err: unknown) {
    logError("syncFolderWatcher", `Failed to save applied-operations journal: ${redactErrorMessage(err)}`);
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
}

function compactJournal(): void {
  const total = appliedOperationsJournal.operations.length;
  if (total <= MAX_JOURNAL_ENTRIES) return;

  const cutoff = Date.now() - JOURNAL_COMPACTION_DAYS * 24 * 60 * 60 * 1000;

  // Prefer tombstone entries younger than JOURNAL_COMPACTION_DAYS, newest
  // first when the tombstone set alone exceeds the journal's hard bound.
  const youngTombstones: AppliedOperationEntry[] = [];
  const nonTombstones: AppliedOperationEntry[] = [];

  for (const entry of appliedOperationsJournal.operations) {
    if (entry.storeName === "tombstones") {
      if (new Date(entry.appliedAt).getTime() >= cutoff) {
        youngTombstones.push(entry);
      }
    } else {
      nonTombstones.push(entry);
    }
  }

  const keptYoungTombstones = youngTombstones.slice(-MAX_JOURNAL_ENTRIES);
  const tombstoneCount = keptYoungTombstones.length;

  // Rule 2: for non-tombstone applied operations, keep the most recent
  // MAX_JOURNAL_ENTRIES - tombstoneCount entries.
  const nonTombstoneBudget = Math.max(0, MAX_JOURNAL_ENTRIES - tombstoneCount);
  // Operations are appended as they are applied, so appliedAt is monotonically
  // increasing. Keep the tail (most recent) without a full sort.
  const keptNonTombstones = nonTombstones.slice(-nonTombstoneBudget);

  // Rebuild the journal preserving original order and the runtime id set.
  const keptIds = new Set([...keptYoungTombstones, ...keptNonTombstones].map((entry) => entry.operationId));
  appliedOperationsJournal.operations = appliedOperationsJournal.operations.filter((entry) =>
    keptIds.has(entry.operationId)
  );
  appliedOperationIds.clear();
  for (const op of appliedOperationsJournal.operations) {
    appliedOperationIds.add(op.operationId);
  }
  appliedOperationsJournal.lastCompactedAt = new Date().toISOString();
}

function scheduleAppliedOperationsJournalFlush(): void {
  if (appliedOperationFlushTimeout) return;
  appliedOperationFlushTimeout = setTimeout(() => {
    appliedOperationFlushTimeout = null;
    flushAppliedOperationsJournal().catch((err) => {
      logError("syncFolderWatcher", `Scheduled journal flush failed: ${redactErrorMessage(err)}`);
    });
  }, JOURNAL_FLUSH_DEBOUNCE_MS);
}

export async function flushAppliedOperationsJournal(): Promise<void> {
  if (appliedOperationFlushTimeout) {
    clearTimeout(appliedOperationFlushTimeout);
    appliedOperationFlushTimeout = null;
  }
  return journalQueue.enqueue(async () => {
    await saveAppliedOperationsJournal();
  });
}

export async function recordAppliedOperation(
  operationId: string,
  storeName: string,
  result: AppliedOperationEntry["result"] = "applied",
  sourceDeviceId?: string,
  flush = true,
): Promise<void> {
  return journalQueue.enqueue(async () => {
    await loadAppliedOperationsJournal();
    if (appliedOperationIds.has(operationId)) return;

    appliedOperationsJournal.operations.push({
      operationId,
      storeName,
      appliedAt: new Date().toISOString(),
      sourceDeviceId,
      result,
    });
    appliedOperationIds.add(operationId);

    compactJournal();

    if (flush) {
      await saveAppliedOperationsJournal();
    } else {
      scheduleAppliedOperationsJournalFlush();
    }
  });
}

export function isOperationApplied(operationId: string): boolean {
  return appliedOperationIds.has(operationId);
}

export function resetAppliedOperationsJournal(): void {
  appliedOperationsJournal = { version: JOURNAL_VERSION, operations: [] };
  appliedOperationIds.clear();
  journalLoaded = false;
  journalPath = null;
}

export function isOperationInFlight(operationId: string): boolean {
  return inFlightOperations.has(operationId);
}

const OPERATION_ID_RE = /^[a-f0-9]{64}$/;

function clearAckTimeout(operationId: string): void {
  const timeout = inFlightTimeouts.get(operationId);
  if (timeout) {
    clearTimeout(timeout);
    inFlightTimeouts.delete(operationId);
  }
}

function startAckTimeout(operationId: string, filePath: string, attempts: number): void {
  const timeout = setTimeout(() => {
    inFlightTimeouts.delete(operationId);
    const inFlight = inFlightOperations.get(operationId);
    if (inFlight) {
      inFlightOperations.delete(operationId);
      scheduleRetry(operationId, filePath, attempts, "Acknowledgment timeout");
      inFlight.complete?.();
    }
  }, ACK_TIMEOUT_MS);
  inFlightTimeouts.set(operationId, timeout);
}

function requeueInFlightOperations(lastError?: string): void {
  for (const [operationId, op] of inFlightOperations) {
    clearAckTimeout(operationId);
    scheduleRetry(operationId, op.filePath, op.attempts, lastError);
    op.complete?.();
  }
  inFlightOperations.clear();
}

export async function acknowledgeOperation(operationId: string, ok: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!OPERATION_ID_RE.test(operationId)) {
    return { ok: false, error: "operationId must be 64 lowercase hex characters." };
  }
  const inFlight = inFlightOperations.get(operationId);
  if (!inFlight) {
    return { ok: false, error: "No such in-flight operation." };
  }
  clearAckTimeout(operationId);
  if (!ok) {
    inFlightOperations.delete(operationId);
    scheduleRetry(operationId, inFlight.filePath, inFlight.attempts, "Negative acknowledgment");
    inFlight.complete?.();
    return { ok: true };
  }
  try {
    await recordAppliedOperation(operationId, inFlight.storeName, "applied", inFlight.sourceDeviceId);
    inFlightOperations.delete(operationId);
    inFlight.complete?.();
    return { ok: true };
  } catch (err: unknown) {
    inFlightOperations.delete(operationId);
    scheduleRetry(operationId, inFlight.filePath, inFlight.attempts, "Journal write failure");
    inFlight.complete?.();
    const rawMessage = err instanceof Error ? err.message : String(err);
    const redacted = redactErrorMessage(rawMessage);
    logError("syncFolderWatcher", `Failed to record applied operation ${operationId}: ${redacted}`);
    return { ok: false, error: redacted };
  }
}

/** Test-only helper to seed the in-flight operation map. */
export function __registerInFlightOperationForTests(
  operationId: string,
  storeName: string,
  sourceDeviceId?: string,
  filePath?: string,
  attempts?: number,
  startTimeout = false,
): void {
  const actualFilePath = filePath ?? "/dev/null/test.json";
  const actualAttempts = attempts ?? 0;
  inFlightOperations.set(operationId, {
    storeName,
    sourceDeviceId,
    filePath: actualFilePath,
    attempts: actualAttempts,
  });
  if (startTimeout) {
    startAckTimeout(operationId, actualFilePath, actualAttempts);
  }
}

function logicalQueueKey(parsed: Record<string, unknown>): string | null {
  if (parsed._storeName !== "tombstones") {
    return `${String(parsed._storeName)}:${String(parsed._id)}`;
  }
  const validation = validateTombstone(parsed.data);
  if (!validation.ok) return null;
  return `${validation.tombstone.storeName}:${validation.tombstone.recordId}`;
}

/** Test-only helper to clear the in-flight operation map. */
export function __clearInFlightOperationsForTests(): void {
  for (const operationId of inFlightOperations.keys()) {
    clearAckTimeout(operationId);
  }
  inFlightOperations.clear();
}

/** Initialize the watcher. Must provide the mainWindow to send events back. */
export async function initSyncFolderWatcher(mainWindow: BrowserWindow) {
  mainWindowRef = mainWindow;
  currentSyncPath = await getSyncPath();
  await loadAppliedOperationsJournal();
  initSyncRetryQueue((filePath, attempts) => handleRemoteChange(filePath, attempts));
}

export async function startSyncWatcher(password: string): Promise<{ ok: boolean; error?: string }> {
  if (!password) return { ok: false, error: "Sync passphrase is required." };
  currentPassword = password;
  authenticated = true;
  degradedReason = undefined;
  initSyncRetryQueue((filePath, attempts) => handleRemoteChange(filePath, attempts));
  if (!currentSyncPath) {
    stopSyncRetryQueue();
    currentPassword = null;
    authenticated = false;
    syncStatus = "error";
    degradedReason = "Sync folder not configured.";
    return { ok: false, error: degradedReason };
  }
  const result = await setSyncFolder(currentSyncPath);
  if (!result.ok) {
    stopSyncRetryQueue();
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    currentPassword = null;
    authenticated = false;
    syncStatus = "error";
    degradedReason = result.error;
    return { ok: false, error: result.error };
  }
  syncStatus = "running";
  return { ok: true };
}

export async function stopSyncWatcher(): Promise<{ ok: boolean; error?: string }> {
  currentPassword = null;
  authenticated = false;
  rendererSessionAttached = false;
  degradedReason = undefined;
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  requeueInFlightOperations("Watcher stopped");
  stopSyncRetryQueue();
  await flushAppliedOperationsJournal().catch(() => undefined);
  syncStatus = "stopped";
  return { ok: true };
}

export async function pauseSyncWatcher(): Promise<{ ok: boolean; error?: string }> {
  if (watcher) await watcher.close();
  watcher = null;
  currentPassword = null;
  authenticated = false;
  rendererSessionAttached = false;
  degradedReason = undefined;
  requeueInFlightOperations("Watcher paused");
  stopSyncRetryQueue();
  syncStatus = "paused";
  return { ok: true };
}

export function getSyncStatus() {
  return {
    configured: Boolean(currentSyncPath),
    mainWatcher: syncStatus,
    rendererSessionAttached,
    authenticated,
    degradedReason,
  };
}

/** Notifies the watcher whether the renderer sync session is attached. */
export function setRendererSessionAttached(attached: boolean): void {
  rendererSessionAttached = attached;
}

/** Temporarily suppresses local sync emission (used during bulk import). */
export function setSyncEmissionSuppressed(suppressed: boolean): void {
  localEmissionSuppressed = suppressed;
}

/** Returns whether local sync emission is currently suppressed. */
export function isSyncEmissionSuppressed(): boolean {
  return localEmissionSuppressed;
}

/** Set the sync folder and start watching. */
export async function setSyncFolder(syncPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }

    currentSyncPath = syncPath;
    await setSyncPath(syncPath);
    if (!syncPath) {
      return { ok: true };
    }

    // Ensure .vfbackup directory exists
    const vfbackupPath = path.join(syncPath, ".vfbackup");
    await fs.mkdir(vfbackupPath, { recursive: true });
    await fs.mkdir(path.join(vfbackupPath, "blobs"), { recursive: true });
    await fs.mkdir(path.join(vfbackupPath, "objects"), { recursive: true });
    for (const entry of await fs.readdir(path.join(vfbackupPath, "blobs"))) {
      if (entry.endsWith(".tmp")) await fs.rm(path.join(vfbackupPath, "blobs", entry), { force: true });
    }

    // Only start watching if we have a password
    if (currentPassword) {
      watcher = chokidar.watch(path.join(vfbackupPath, "blobs"), {
        ignored: /(^|[/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: false, // We DO want to process existing files on startup
        depth: 0 // only watch blobs directly in blobs folder
      });

      watcher.on("add", (filePath: string) => {
        handleRemoteChange(filePath, 0).catch((err: unknown) => {
          logError("syncFolderWatcher", `Remote change delivery failed: ${redactErrorMessage(err)}`);
        });
      });
      watcher.on("change", (filePath: string) => {
        handleRemoteChange(filePath, 0).catch((err: unknown) => {
          logError("syncFolderWatcher", `Remote change delivery failed: ${redactErrorMessage(err)}`);
        });
      });
      
      logInfo("syncFolderWatcher", "Started watching approved encrypted sync folder");
    } else {
      logInfo("syncFolderWatcher", "Encrypted sync folder configured; sync is paused");
    }

    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncFolderWatcher", `Failed to set sync folder: ${redactErrorMessage(errorMsg)}`);
    return { ok: false, error: redactErrorMessage(errorMsg) };
  }
}

/** Get current sync folder. */
export function getSyncFolder(): string | null {
  return currentSyncPath;
}

/** Handle incoming changes from the filesystem. */
export async function handleRemoteChange(filePath: string, attempts = 0): Promise<boolean> {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return false;
  if (!currentPassword) return false;

  const filename = path.basename(filePath);

  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_PACKET_BYTES) {
      logError("syncFolderWatcher", `Encrypted packet exceeds maximum size for ${filename}`);
      return true;
    }
    const data = await fs.readFile(filePath, "utf8");
    const manifest: EncryptedBackupManifest = JSON.parse(data);

    // Ensure valid version
    if (manifest.version !== 2 || typeof manifest.salt !== "string" || typeof manifest.iv !== "string" || typeof manifest.ciphertext !== "string") {
      logError("syncFolderWatcher", `Unsupported backup version for ${filename}`);
      return true;
    }

    const decrypted = await decryptPayload(manifest.ciphertext, manifest.salt, manifest.iv, currentPassword);
    const parsed = JSON.parse(decrypted);

    logInfo("syncFolderWatcher", `Detected remote change for ${filename}`);

    // We expect the parsed JSON to contain storeName and id
    if (!parsed._storeName || !SYNC_STORE_ALLOWLIST.has(parsed._storeName) || !parsed._id || !parsed.data
      || typeof parsed._operationId !== "string" || !/^[a-f0-9]{64}$/.test(parsed._operationId)) {
      logError("syncFolderWatcher", `Decrypted payload missing metadata for ${filename}`);
      return true;
    }

    const localDeviceId = await getDeviceId();
    if (parsed._sourceDeviceId === localDeviceId) {
      // Ignore our own echoes
      return true;
    }

    const queueKey = logicalQueueKey(parsed);
    if (!queueKey) {
      logError("syncFolderWatcher", `Malformed tombstone payload for ${filename}`);
      return true;
    }
    await enqueueRemoteApply(queueKey, async () => {
      if (!mainWindowRef || mainWindowRef.isDestroyed()) return;

      await loadAppliedOperationsJournal();
      if (isOperationApplied(parsed._operationId) || isOperationInFlight(parsed._operationId)) return;

      await new Promise<void>((resolve) => {
        inFlightOperations.set(parsed._operationId, {
          storeName: parsed._storeName,
          sourceDeviceId: parsed._sourceDeviceId,
          filePath,
          attempts,
          complete: resolve,
        });
        startAckTimeout(parsed._operationId, filePath, attempts);

        mainWindowRef?.webContents.send("sync:onRemoteChange", {
          storeName: parsed._storeName,
          id: parsed._id,
          operationId: parsed._operationId,
          recordJson: JSON.stringify(parsed.data)
        });
      });
    });
    return true;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncFolderWatcher", `Failed to read/decrypt changed sync file ${filename}: ${redactErrorMessage(errorMsg)}`);
    return true;
  }
}

/** Write an encrypted packet to the sync folder. */
export async function writePacket(storeName: string, id: string, recordJson: string): Promise<{ ok: boolean; error?: string }> {
  if (localEmissionSuppressed) return { ok: true };
  if (!currentSyncPath) return { ok: false, error: "Sync folder not configured." };
  if (!currentPassword) return { ok: false, error: "Sync is not active (no password)." };

  // Strict path traversal and semantic validation for storeName and id
  if (!SYNC_STORE_ALLOWLIST.has(storeName)) {
    return { ok: false, error: `Invalid storeName: ${storeName}` };
  }
  
  if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_.:-]{1,256}$/.test(id) || id.includes("..")) {
    return { ok: false, error: "Invalid id" };
  }

  try {
    if (Buffer.byteLength(recordJson, "utf8") > MAX_PACKET_BYTES) return { ok: false, error: "Payload exceeds maximum allowed size" };
    const parsedRecord = JSON.parse(recordJson);
    if (!parsedRecord || typeof parsedRecord !== "object" || Array.isArray(parsedRecord)) {
      return { ok: false, error: "recordJson must be a valid object" };
    }
    
    // Ensure the inner record id matches the wrapper id
    if (parsedRecord.id !== id) {
      return { ok: false, error: "Record ID mismatch between envelope and payload" };
    }

    const operationId = crypto.createHash("sha256").update(`${storeName}\0${id}\0${recordJson}`).digest("hex");
    const payload = JSON.stringify({
      _storeName: storeName,
      _id: id,
      _operationId: operationId,
      _sourceDeviceId: await getDeviceId(),
      data: parsedRecord
    });
    
    if (payload.length > 50 * 1024 * 1024) { // 50MB reasonable max
      return { ok: false, error: "Payload exceeds maximum allowed size" };
    }

    const encrypted = await encryptPayload(payload, currentPassword);

    const manifest: EncryptedBackupManifest = {
      version: 2,
      exportedAt: new Date().toISOString(),
      salt: encrypted.salt,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext
    };

    const manifestJson = JSON.stringify(manifest, null, 2);

    // Hash the canonical payload for idempotent naming
    const canonicalHash = crypto.createHash("sha256").update(payload).digest("hex");
    const filename = `${canonicalHash}.json`;

    const vfbackupPath = path.join(currentSyncPath, ".vfbackup");
    const blobsPath = path.join(vfbackupPath, "blobs");
    const filePath = path.join(blobsPath, filename);

    // Check if it already exists (content-addressed, so if hash matches, content matches)
    try {
      await fs.access(filePath);
      // Already exists, no need to write again
      return { ok: true };
    } catch {
      // File doesn't exist, proceed
    }

    // Atomic write
    const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    try {
      await fs.writeFile(tmpPath, manifestJson, { encoding: "utf8", flag: "wx" });
      await fs.rename(tmpPath, filePath);
    } finally {
      await fs.rm(tmpPath, { force: true });
    }

    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncFolderWatcher", `Failed to write packet: ${redactErrorMessage(errorMsg)}`);
    return { ok: false, error: redactErrorMessage(errorMsg) };
  }
}
