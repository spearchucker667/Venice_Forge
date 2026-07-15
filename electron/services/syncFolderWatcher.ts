import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import crypto from "crypto";
import { constants as fsConstants, promises as fs, type Dirent } from "fs";
import { logInfo, logError } from "./logger";
import { redactErrorMessage } from "../../src/shared/redaction";
import { BrowserWindow, app } from "electron";
import { encryptPayload, decryptPayload, EncryptedBackupManifest } from "./backupCrypto";
import { getSyncPath, setSyncPath, getDeviceId } from "./syncConfig";
import { enqueueRemoteApply } from "./syncApplyQueue";
import { initSyncRetryQueue, scheduleRetry, stopSyncRetryQueue } from "./syncRetryQueue";
import { validateTombstone } from "../../src/shared/syncProtocol";
import { drainSyncOutbox, persistSyncOutboxEntry } from "./syncOutbox";
import { ensureSyncIdentity, packetMatchesSyncIdentity, type SyncIdentity } from "./syncIdentity";
import { isValidProfileStorageId } from "../../src/utils/profileIdValidation";
import { issueRemoteApplyGrant, revokeRemoteApplyGrant } from "./remoteApplyAuthority";
import { acknowledgeSyncOperation, collectAcknowledgedEvent, registerSyncDevice } from "./syncCheckpoint";

let watcher: FSWatcher | null = null;
let currentSyncPath: string | null = null;
let mainWindowRef: BrowserWindow | null = null;
let currentPassword: string | null = null;
let syncStatus: "stopped" | "paused" | "running" | "error" = "stopped";
let rendererSessionAttached = false;
let authenticated = false;
let degradedReason: string | undefined;
let localEmissionSuppressed = false;
let currentSyncIdentity: SyncIdentity | null = null;
let currentProfileId: string | null = null;
interface InFlightOperation {
  storeName: string;
  sourceDeviceId?: string;
  filePath: string;
  attempts: number;
  complete?: () => void;
  remoteApplyToken?: string;
  checkpointFilePath?: string;
}

const inFlightOperations = new Map<string, InFlightOperation>();
const inFlightTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const ACK_TIMEOUT_MS = 30_000;
const MAX_PACKET_BYTES = 50 * 1024 * 1024;
const RETRYABLE_SYNC_READ_CODES = new Set(["EBUSY", "EAGAIN", "EINTR", "ENOENT", "ESTALE", "ETIMEDOUT"]);

function isRetryableRemoteReadError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && RETRYABLE_SYNC_READ_CODES.has(code);
}

function transientReadOperationId(filePath: string): string {
  return crypto.createHash("sha256").update(`sync-read\0${filePath}`).digest("hex");
}

function isWithinDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

async function canonicalizeSyncRoot(syncPath: string): Promise<string> {
  const rootStat = await fs.lstat(syncPath);
  if (rootStat.isSymbolicLink()) throw new Error("Sync folder must not be a symbolic link.");
  if (!rootStat.isDirectory()) throw new Error("Sync folder must be a directory.");
  return path.resolve(await fs.realpath(syncPath));
}

async function ensureSecureDirectory(root: string, target: string): Promise<string> {
  const relative = path.relative(root, target);
  if (!isWithinDirectory(root, target) || relative === "") return root;
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const existing = await fs.lstat(current);
      if (existing.isSymbolicLink()) throw new Error(`Sync custody path is a symbolic link: ${segment}`);
      if (!existing.isDirectory()) throw new Error(`Sync custody path is not a directory: ${segment}`);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await fs.mkdir(current, { mode: 0o700 });
    }
    const resolved = await fs.realpath(current);
    if (!isWithinDirectory(root, resolved)) throw new Error("Sync custody path escapes the approved root.");
  }
  return current;
}

async function assertNotSymlinkIfPresent(filePath: string): Promise<void> {
  try {
    if ((await fs.lstat(filePath)).isSymbolicLink()) {
      throw new Error(`Sync custody file is a symbolic link: ${path.basename(filePath)}`);
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function openSecureWatchedFile(filePath: string): Promise<Awaited<ReturnType<typeof fs.open>>> {
  if (!currentSyncPath) throw new Error("Sync folder not configured.");
  const vfbackupPath = path.join(currentSyncPath, ".vfbackup");
  const allowedParents = await Promise.all([
    ensureSecureDirectory(currentSyncPath, path.join(vfbackupPath, "blobs")),
    ensureSecureDirectory(currentSyncPath, path.join(vfbackupPath, "objects")),
  ]);
  const linkStat = await fs.lstat(filePath);
  if (linkStat.isSymbolicLink()) throw new Error("Sync packet must not be a symbolic link.");
  if (!linkStat.isFile()) throw new Error("Sync packet must be a regular file.");
  const requestedParent = await fs.realpath(path.dirname(filePath));
  if (!allowedParents.includes(requestedParent)) throw new Error("Sync packet path escapes the watched directories.");

  const handle = await fs.open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw new Error("Sync packet must be a regular file.");
    const resolvedFile = await fs.realpath(filePath);
    if (!allowedParents.includes(path.dirname(resolvedFile))) {
      throw new Error("Sync packet resolves outside the watched directories.");
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

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

const COMPACTION_BATCH = 1000;

function compactJournal(): void {
  const total = appliedOperationsJournal.operations.length;
  if (total <= MAX_JOURNAL_ENTRIES + COMPACTION_BATCH) return;

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
      revokeRemoteApplyGrant(inFlight.remoteApplyToken);
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
    revokeRemoteApplyGrant(op.remoteApplyToken);
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
  revokeRemoteApplyGrant(inFlight.remoteApplyToken);
  if (!ok) {
    inFlightOperations.delete(operationId);
    scheduleRetry(operationId, inFlight.filePath, inFlight.attempts, "Negative acknowledgment");
    inFlight.complete?.();
    return { ok: true };
  }
  try {
    await recordAppliedOperation(operationId, inFlight.storeName, "applied", inFlight.sourceDeviceId);
    if (currentSyncPath && inFlight.checkpointFilePath && path.basename(path.dirname(inFlight.filePath)) === "blobs") {
      const vfbackupPath = path.join(currentSyncPath, ".vfbackup");
      const deviceId = await getDeviceId();
      await acknowledgeSyncOperation(vfbackupPath, deviceId, operationId);
      await collectAcknowledgedEvent(vfbackupPath, operationId, inFlight.filePath, inFlight.checkpointFilePath);
    }
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

function objectCheckpointFilename(logicalKey: string): string {
  return `${crypto.createHash("sha256").update(logicalKey).digest("hex")}.json`;
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

export async function startSyncWatcher(password: string, profileId = "default"): Promise<{ ok: boolean; error?: string }> {
  if (!password) return { ok: false, error: "Sync passphrase is required." };
  if (!isValidProfileStorageId(profileId)) return { ok: false, error: "Invalid sync profileId." };
  currentPassword = password;
  currentSyncIdentity = null;
  currentProfileId = profileId;
  authenticated = true;
  degradedReason = undefined;
  initSyncRetryQueue((filePath, attempts) => handleRemoteChange(filePath, attempts));
  if (!currentSyncPath) {
    stopSyncRetryQueue();
    currentPassword = null;
    currentProfileId = null;
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
  currentSyncIdentity = null;
  currentProfileId = null;
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
  currentSyncIdentity = null;
  currentProfileId = null;
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
    profileId: currentProfileId ?? undefined,
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
  const previousSyncPath = currentSyncPath;
  const previousSyncIdentity = currentSyncIdentity;
  let candidateWatcher: typeof watcher = null;
  let persistenceAttempted = false;
  try {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }

    if (!syncPath) {
      currentSyncPath = null;
      await setSyncPath("");
      return { ok: true };
    }

    const canonicalRoot = await canonicalizeSyncRoot(syncPath);
    const vfbackupPath = await ensureSecureDirectory(canonicalRoot, path.join(canonicalRoot, ".vfbackup"));
    const blobsPath = await ensureSecureDirectory(canonicalRoot, path.join(vfbackupPath, "blobs"));
    const objectsPath = await ensureSecureDirectory(canonicalRoot, path.join(vfbackupPath, "objects"));
    await assertNotSymlinkIfPresent(path.join(vfbackupPath, "sync-identity.json"));
    for (const entry of await fs.readdir(blobsPath, { withFileTypes: true }) as Dirent[]) {
      if (!entry.name.endsWith(".tmp")) continue;
      if (entry.isSymbolicLink()) throw new Error(`Temporary sync blob is a symbolic link: ${entry.name}`);
      const temporaryPath = path.join(blobsPath, entry.name);
      const resolvedTemporary = await fs.realpath(temporaryPath);
      if (path.dirname(resolvedTemporary) !== blobsPath) throw new Error("Temporary sync blob escapes the approved directory.");
      await fs.rm(temporaryPath, { force: true });
    }
    let candidateIdentity: SyncIdentity | null = null;

    // Only start watching if we have a password
    if (currentPassword) {
      candidateIdentity = await ensureSyncIdentity(vfbackupPath, currentPassword);
      const deviceId = await getDeviceId();
      await registerSyncDevice(vfbackupPath, deviceId);
      await drainSyncOutbox(blobsPath, objectsPath);
      candidateWatcher = chokidar.watch([blobsPath, objectsPath], {
        ignored: /(^|[/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: false, // We DO want to process existing files on startup
        depth: 0 // only watch blobs directly in blobs folder
      });

      candidateWatcher.on("add", (filePath: string) => {
        handleRemoteChange(filePath, 0).catch((err: unknown) => {
          logError("syncFolderWatcher", `Remote change delivery failed: ${redactErrorMessage(err)}`);
        });
      });
      candidateWatcher.on("change", (filePath: string) => {
        handleRemoteChange(filePath, 0).catch((err: unknown) => {
          logError("syncFolderWatcher", `Remote change delivery failed: ${redactErrorMessage(err)}`);
        });
      });
      
    }

    // Commit in-memory and persisted configuration only after every setup step
    // has succeeded. This prevents a failed identity/outbox/watcher setup from
    // leaving a path that was never operational.
    currentSyncPath = canonicalRoot;
    currentSyncIdentity = candidateIdentity;
    watcher = candidateWatcher;
    persistenceAttempted = true;
    await setSyncPath(canonicalRoot);

    logInfo(
      "syncFolderWatcher",
      currentPassword ? "Started watching approved encrypted sync folder" : "Encrypted sync folder configured; sync is paused",
    );

    return { ok: true };
  } catch (err: unknown) {
    if (candidateWatcher) await candidateWatcher.close().catch(() => undefined);
    if (watcher === candidateWatcher) watcher = null;
    currentSyncPath = previousSyncPath;
    currentSyncIdentity = previousSyncIdentity;
    if (persistenceAttempted) {
      await setSyncPath(previousSyncPath ?? "").catch((rollbackError: unknown) => {
        logError("syncFolderWatcher", `Failed to roll back sync folder configuration: ${redactErrorMessage(rollbackError)}`);
      });
    }
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
  if (!currentSyncPath) return false;
  if (!currentSyncIdentity) return false;
  if (!currentProfileId) return false;

  const filename = path.basename(filePath);

  try {
    const fh = await openSecureWatchedFile(filePath);
    let data: string;
    try {
      const stat = await fh.stat();
      if (stat.size > MAX_PACKET_BYTES) {
        logError("syncFolderWatcher", `Encrypted packet exceeds maximum size for ${filename}`);
        return true;
      }
      data = await fh.readFile("utf8");
    } finally {
      await fh.close();
    }
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
    if (!packetMatchesSyncIdentity(parsed, currentSyncIdentity)) {
      logError("syncFolderWatcher", `Rejected packet outside the active sync set for ${filename}`);
      return true;
    }
    if (parsed._profileId !== currentProfileId) {
      logError("syncFolderWatcher", `Rejected packet outside the active profile for ${filename}`);
      return true;
    }
    if (typeof parsed._sourceDeviceId !== "string") {
      logError("syncFolderWatcher", `Rejected packet without a source device for ${filename}`);
      return true;
    }
    await registerSyncDevice(path.join(currentSyncPath, ".vfbackup"), parsed._sourceDeviceId);
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
        const remoteApplyToken = issueRemoteApplyGrant(parsed._operationId, parsed._storeName, parsed._id);
        inFlightOperations.set(parsed._operationId, {
          storeName: parsed._storeName,
          sourceDeviceId: parsed._sourceDeviceId,
          filePath,
          attempts,
          complete: resolve,
          remoteApplyToken,
          checkpointFilePath: path.join(currentSyncPath!, ".vfbackup", "objects", objectCheckpointFilename(queueKey)),
        });
        startAckTimeout(parsed._operationId, filePath, attempts);

        mainWindowRef?.webContents.send("sync:onRemoteChange", {
          storeName: parsed._storeName,
          id: parsed._id,
          operationId: parsed._operationId,
          recordJson: JSON.stringify(parsed.data),
          remoteApplyToken,
        });
      });
    });
    return true;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncFolderWatcher", `Failed to read/decrypt changed sync file ${filename}: ${redactErrorMessage(errorMsg)}`);
    if (isRetryableRemoteReadError(err)) {
      scheduleRetry(transientReadOperationId(filePath), filePath, attempts, "Remote sync file is not fully available yet");
      return false;
    }
    return true;
  }
}

/** Write an encrypted packet to the sync folder. */
export async function writePacket(storeName: string, id: string, recordJson: string): Promise<{ ok: boolean; error?: string }> {
  if (localEmissionSuppressed) return { ok: true };
  if (!currentSyncPath) return { ok: false, error: "Sync folder not configured." };
  if (!currentPassword) return { ok: false, error: "Sync is not active (no password)." };
  if (!currentSyncIdentity) return { ok: false, error: "Sync identity is not initialized." };
  if (!currentProfileId) return { ok: false, error: "Sync profile is not initialized." };

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
    const logicalKey = storeName === "tombstones"
      ? (() => {
          const validation = validateTombstone(parsedRecord);
          if (!validation.ok) throw new Error(validation.error);
          return `${validation.tombstone.storeName}:${validation.tombstone.recordId}`;
        })()
      : `${storeName}:${id}`;
    const objectFilename = objectCheckpointFilename(logicalKey);
    const payload = JSON.stringify({
      _storeName: storeName,
      _id: id,
      _operationId: operationId,
      _sourceDeviceId: await getDeviceId(),
      _syncSetId: currentSyncIdentity.syncSetId,
      _keyId: currentSyncIdentity.keyId,
      _profileId: currentProfileId,
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
    const blobsPath = await ensureSecureDirectory(currentSyncPath, path.join(vfbackupPath, "blobs"));
    const objectsPath = await ensureSecureDirectory(currentSyncPath, path.join(vfbackupPath, "objects"));
    await assertNotSymlinkIfPresent(path.join(vfbackupPath, "sync-identity.json"));
    // Persist the already-encrypted manifest locally before publishing it to
    // the sync folder. A crash or transient folder failure can then be drained
    // safely on the next authenticated watcher start.
    await persistSyncOutboxEntry(filename, manifestJson, objectFilename);
    await drainSyncOutbox(blobsPath, objectsPath);
    const deviceId = await getDeviceId();
    await registerSyncDevice(vfbackupPath, deviceId);
    await acknowledgeSyncOperation(vfbackupPath, deviceId, operationId);

    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logError("syncFolderWatcher", `Failed to write packet: ${redactErrorMessage(errorMsg)}`);
    return { ok: false, error: redactErrorMessage(errorMsg) };
  }
}
