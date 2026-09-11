/** @fileoverview Persistent main-process background task manager.
 *  Journals video/music/image/research/document work, polls durable video and
 *  music queues, and persists state across renderer reloads and restarts.
 */

import { app } from "electron";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type {
  BackgroundTask,
  BackgroundTaskCreateInput,
  BackgroundTaskStatus,
  BackgroundTaskUpdate,
} from "../../src/types/background-task";
import {
  createBackgroundTask,
  isProviderPolledBackgroundTaskType,
  parseTasksStrict,
  serializeTasks,
} from "../../src/types/background-task";
import { sanitizeErrorText } from "../../src/shared/redaction";
import { MUSIC_SAFE_ERROR_MESSAGES, toUserFacingMusicError, toUserFacingVideoError } from "../../src/services/task-errors";
import { performVeniceRequest, readResponseError } from "./veniceClient";
import { performGuardedVeniceRequest } from "./guardPipeline";
import { computePayloadHash } from "../../src/shared/venice-media-contract/payload-hash";
import { identifyAndValidateGeneratedMedia } from "../../src/shared/safety/mediaScreener";
import { getRuntimeLocalFamilySafeModeEnabled } from "./runtimeSafetySettings";
import { getProviderApiKey } from "./secureStore";

import { logError } from "./logger";
import { publishInspectorRequest, publishInspectorCompletion } from "./inspectorTelemetry";
import { buildAudioRetrieveRequest } from '../../src/services/media-request-adapter';
import { normalizeAudioRetrieveResponse } from '../../src/services/audio-retrieve-normalizer';
import { persistGeneratedMedia } from './generatedMediaStore';
import { retrieveVideoQueueResult, VideoRetrieveError } from './videoRetrieveService';
import {
  cancelReplicatePrediction,
  downloadReplicateOutput,
  pollReplicatePrediction,
} from "./replicateService";
import {
  normalizeVideoQueueResponse,
  normalizeAudioQueueResponse,
  normalizeSeedanceConsentChallenge,
} from '../../src/shared/venice-media-contract';

const TASKS_DIR = path.join(app.getPath("userData"), "background-tasks");
const TASKS_FILE = path.join(TASKS_DIR, "tasks.json");

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 200;
const MAX_VIDEO_GENERATION_MS = 180000; // 3 minutes — above documented video P80 (145s)
const MAX_NON_VIDEO_GENERATION_MS = 180000;
const DURABLE_RESULT_URL_RE = /^venice-media:\/\/[a-f0-9]{64}$/;

/** Ephemeral in-memory store for sensitive signed URLs (never persisted to tasks.json).
 *  Entries are cleared on terminal status, task deletion, or manager reset. */
const ephemeralSecrets = new Map<string, { queueDownloadUrl?: string; createdAt: number }>();

/** Maximum lifetime for an ephemeral signed URL entry (30 min). */
const EPHEMERAL_MAX_AGE_MS = 30 * 60 * 1000;

function clearEphemeralSecrets(taskId: string): void {
  ephemeralSecrets.delete(taskId);
}

/** Periodic purge of expired ephemeral entries; bound to the poll loop
 *  to avoid a standalone timer. */
function _purgeExpiredEphemeralSecrets(): void {
  const now = Date.now();
  for (const [id, entry] of ephemeralSecrets.entries()) {
    if (now - entry.createdAt > EPHEMERAL_MAX_AGE_MS) {
      ephemeralSecrets.delete(id);
    }
  }
}

export interface BackgroundTaskManagerState {
  tasks: Record<string, BackgroundTask>;
  activePolls: Record<string, ReturnType<typeof setTimeout>>;
}

export type TaskEventKind = 'created' | 'updated' | 'removed';

export type BackgroundTaskChangeListener = (taskId: string, task: BackgroundTask | null, kind: TaskEventKind, profileId: string) => void;

const listeners = new Set<BackgroundTaskChangeListener>();
const state: BackgroundTaskManagerState = { tasks: {}, activePolls: {} };

let initialized = false;
let initializationPromise: Promise<void> | null = null;

function emit(taskId: string, task: BackgroundTask | null, kind: TaskEventKind, profileId: string): void {
  for (const listener of listeners) {
    try {
      listener(taskId, task, kind, profileId);
    } catch (err) {
      logError("Background task listener failed", sanitizeErrorText(String(err)));
    }
  }
}

let pendingPersist = false;
let pendingPersistTimeout: NodeJS.Timeout | null = null;
let lastPersistTime = 0;
let activePersistPromise: Promise<void> | null = null;

async function writeTasksFile(): Promise<void> {
  await fs.mkdir(TASKS_DIR, { recursive: true, mode: 0o700 });
  const payload = serializeTasks(Object.values(state.tasks));
  const tempFile = `${TASKS_FILE}.tmp.${crypto.randomBytes(8).toString("hex")}`;
  try {
    await fs.writeFile(tempFile, payload, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tempFile, TASKS_FILE);
  } catch (err) {
    try {
      await fs.unlink(tempFile);
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }
}

async function flushPersist(): Promise<void> {
  if (activePersistPromise) {
    pendingPersist = true;
    return activePersistPromise;
  }

  activePersistPromise = (async () => {
    do {
      pendingPersist = false;
      try {
        await writeTasksFile();
        lastPersistTime = Date.now();
      } catch (err) {
        logError("Failed to persist background tasks", sanitizeErrorText(String(err)));
      }
    } while (pendingPersist);
  })().finally(() => {
    activePersistPromise = null;
  });

  return activePersistPromise;
}

/** Fatal variant of flushPersist that propagates write errors so callers
 *  can detect I/O failure before a billable provider dispatch.  Only use
 *  for task creation, finalization, and other ownership-critical writes. */
async function flushPersistFatal(): Promise<void> {
  if (activePersistPromise) {
    pendingPersist = true;
    try {
      await activePersistPromise;
    } catch {
      // Prior persist already failed; we will try again below.
    }
  }

  activePersistPromise = (async () => {
    do {
      pendingPersist = false;
      await writeTasksFile();
      lastPersistTime = Date.now();
    } while (pendingPersist);
  })().finally(() => {
    activePersistPromise = null;
  });

  return activePersistPromise;
}

function persist(debounceMs = 0): void {
  if (debounceMs > 0 && Date.now() - lastPersistTime < debounceMs) {
    if (!pendingPersistTimeout) {
      pendingPersist = true;
      pendingPersistTimeout = setTimeout(() => {
        pendingPersistTimeout = null;
        pendingPersist = false;
        void flushPersist();
      }, debounceMs - (Date.now() - lastPersistTime));
    }
    return;
  }
  void flushPersist();
}

/** Flushes pending task journal writes before controlled application shutdown. */
export async function flushBackgroundTasks(): Promise<void> {
  if (initializationPromise) await initializationPromise;
  if (!initialized) return;

  if (pendingPersistTimeout) {
    clearTimeout(pendingPersistTimeout);
    pendingPersistTimeout = null;
    pendingPersist = true;
  }
  await flushPersist();
}

export async function loadBackgroundTasks(): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(TASKS_FILE, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      state.tasks = {};
      return;
    }
    throw err;
  }
  const result = parseTasksStrict(raw);
  if (result.ok) {
    state.tasks = Object.fromEntries(result.tasks.map((t) => [t.id, t]));
    return;
  }
  // Corrupt journal detected — quarantine the original file before
  // overwriting, and start with an empty task slate. This prevents
  // silent data loss for paid-job records.
  logError(`Corrupt tasks journal: ${result.reason}.  Quarantining original.`);
  try {
    const timestamp = Date.now();
    await fs.copyFile(TASKS_FILE, `${TASKS_FILE}.corrupt.${timestamp}`);
    logError(`Quarantined corrupt tasks file`, `tasks.json.corrupt.${timestamp}`);
  } catch {
    logError("Failed to quarantine corrupt tasks file");
  }
  state.tasks = {};
}

export async function initBackgroundTaskManager(): Promise<void> {
  if (initialized) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    await loadBackgroundTasks();
    for (const task of Object.values(state.tasks)) {
      if (task.status === 'pending_finalize') {
        // Scavenge write-ahead intents that were journaled before
        // provider dispatch.  A pending_finalize task WITH a real queueId
        // means we crashed after provider acceptance: resume polling.
        // A pending_finalize task WITHOUT a queueId means we crashed
        // before the provider responded: acceptance-unknown, fail it.
        if (task.queueId && task.queueId !== 'pending') {
          task.status = 'queued';
          task.updatedAt = Date.now();
        } else {
          task.status = 'acceptance_unknown';
          task.error = 'Application restarted before provider accepted the request.  Acceptance unknown.';
          task.updatedAt = Date.now();
        }
      }
      // Classify explicit paid-submission lifecycle states.
      if (task.status === 'dispatching') {
        // We do not know whether the provider saw the request; never auto-redispatch.
        task.status = 'acceptance_unknown';
        if (!task.error) {
          task.error = 'Application restarted while dispatching to the provider. Acceptance unknown.';
        }
        task.updatedAt = Date.now();
      }
      if (task.status === 'intent_persisted' && task.dispatchStartedAt) {
        // Dispatching had started before the crash; treat as acceptance unknown.
        task.status = 'acceptance_unknown';
        if (!task.error) {
          task.error = 'Application restarted after dispatch started. Acceptance unknown.';
        }
        task.updatedAt = Date.now();
      }
      // intent_persisted with no dispatchStartedAt and acceptance_unknown are
      // retained as safe non-dispatching records.
      if (!isTerminalStatus(task.status) && task.status !== 'acceptance_unknown' && task.status !== 'intent_persisted') {
        if (isProviderPolledBackgroundTaskType(task.type, task.providerId)) {
          startPolling(task.id);
        } else {
          // image, research, document are synchronous/streaming connections that die on restart
          task.status = "failed";
          task.error = "Application restarted during generation.";
          task.updatedAt = Date.now();
        }
      }
    }
    persist();
    initialized = true;
  })();

  return initializationPromise;
}

export function subscribeToBackgroundTasks(listener: BackgroundTaskChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isTerminalStatus(status: BackgroundTaskStatus): boolean {
  return ["completed", "failed", "aborted", "timeout"].includes(status);
}

export function getBackgroundTask(taskId: string): BackgroundTask | null {
  return state.tasks[taskId] ?? null;
}

export function listBackgroundTasks(): BackgroundTask[] {
  return Object.values(state.tasks).sort((a, b) => b.updatedAt - a.updatedAt);
}

async function applyUpdate(taskId: string, updates: BackgroundTaskUpdate): Promise<BackgroundTask | null> {
  const task = state.tasks[taskId];
  if (!task) return null;

  // Strict parsing and size limits
  let hasChanges = false;
  const updated = { ...task };

  if ("status" in updates && updates.status !== task.status) {
    updated.status = updates.status as BackgroundTaskStatus;
    hasChanges = true;
  }
  if ("progress" in updates && updates.progress !== task.progress) {
    if (updates.progress === undefined) {
      delete updated.progress;
      hasChanges = true;
    } else {
      updated.progress = updates.progress;
      hasChanges = true;
    }
  }
  if ("error" in updates) {
    if (updates.error === undefined) {
      if (task.error !== undefined) {
        delete updated.error;
        hasChanges = true;
      }
    } else {
      const err = String(updates.error).slice(0, 1024);
      if (err !== task.error) {
        updated.error = err;
        hasChanges = true;
      }
    }
  }
  if ("resultUrl" in updates) {
    if (updates.resultUrl === undefined) {
      if (task.resultUrl !== undefined) {
        delete updated.resultUrl;
        hasChanges = true;
      }
    } else {
      const url = String(updates.resultUrl);
      if (!DURABLE_RESULT_URL_RE.test(url)) {
        throw new Error("Background task result URL must reference durable generated media.");
      }
      if (url !== task.resultUrl) {
        updated.resultUrl = url;
        hasChanges = true;
      }
    }
  }
  if ('resultMediaId' in updates) {
    if (updates.resultMediaId === undefined) delete updated.resultMediaId;
    else updated.resultMediaId = String(updates.resultMediaId).slice(0, 128);
    hasChanges = true;
  }
  if ('stage' in updates && updates.stage !== task.stage) {
    if (updates.stage === undefined) delete updated.stage;
    else updated.stage = updates.stage;
    hasChanges = true;
  }
  if ("queueId" in updates && updates.queueId !== task.queueId) {
    if (updates.queueId === undefined) {
      delete updated.queueId;
      hasChanges = true;
    } else {
      updated.queueId = String(updates.queueId).slice(0, 128);
      hasChanges = true;
    }
  }
  if (updates.dispatchStartedAt !== undefined && updates.dispatchStartedAt !== task.dispatchStartedAt) {
    updated.dispatchStartedAt = Number(updates.dispatchStartedAt);
    hasChanges = true;
  }
  if (updates.acceptedAt !== undefined && updates.acceptedAt !== task.acceptedAt) {
    updated.acceptedAt = Number(updates.acceptedAt);
    hasChanges = true;
  }
  if (updates.attemptStartedAt !== undefined && updates.attemptStartedAt !== task.attemptStartedAt) {
    updated.attemptStartedAt = Number(updates.attemptStartedAt);
    hasChanges = true;
  }
  if (updates.attemptNumber !== undefined && updates.attemptNumber !== task.attemptNumber) {
    updated.attemptNumber = Number(updates.attemptNumber);
    hasChanges = true;
  }
  if (updates.pollAttempts !== undefined && updates.pollAttempts !== task.pollAttempts) {
    updated.pollAttempts = Number(updates.pollAttempts);
    hasChanges = true;
  }
  if (updates.consecutiveFailures !== undefined && updates.consecutiveFailures !== task.consecutiveFailures) {
    updated.consecutiveFailures = Number(updates.consecutiveFailures);
    hasChanges = true;
  }
  if (updates.metadata !== undefined) {
    updated.metadata = { ...task.metadata, ...updates.metadata };
    hasChanges = true; // Object spread always creates new ref, but fine for now
  }

  if (!hasChanges) return task;

  updated.updatedAt = Date.now();
  state.tasks[taskId] = updated;

  // Fire-and-forget persist: poll loops must never block on I/O.
  // Terminal transitions use fatal persist (errors logged).
  const isProgressOnly = updates.status === undefined && updates.error === undefined && updates.resultUrl === undefined;
  const isTerminalTransition = typeof updates.status === 'string' && isTerminalStatus(updates.status as BackgroundTaskStatus);
  if (isTerminalTransition) {
    void flushPersistFatal().catch((err) => logError(`Failed to persist terminal transition for task ${taskId}`, sanitizeErrorText(String(err))));
  } else {
    persist(isProgressOnly ? 2000 : 0);
  }
  // Clear ephemeral signed URLs when the task reaches a terminal state.
  if (isTerminalTransition) {
    clearEphemeralSecrets(taskId);
  }
  emit(taskId, updated, 'updated', updated.profileId);
  return updated;
}

export async function createBackgroundTaskInMain(
  input: BackgroundTaskCreateInput,
): Promise<BackgroundTask> {
  await initBackgroundTaskManager();
  const task = createBackgroundTask(input);
  state.tasks[task.id] = task;
  await flushPersistFatal();
  emit(task.id, task, 'created', task.profileId);
  if (isProviderPolledBackgroundTaskType(task.type, task.providerId)) {
    startPolling(task.id);
  }
  return task;
}

export async function updateBackgroundTaskInMain(
  taskId: string,
  updates: BackgroundTaskUpdate,
): Promise<BackgroundTask | null> {
  await initBackgroundTaskManager();
  return applyUpdate(taskId, updates);
}

export async function cancelBackgroundTaskInMain(taskId: string): Promise<BackgroundTask | null> {
  await initBackgroundTaskManager();
  const task = state.tasks[taskId];
  stopPolling(taskId);
  if (task && isProviderPolledBackgroundTaskType(task.type, task.providerId)) {
    // For Replicate, attempt a real provider cancellation before marking aborted.
    if (task.providerId === "replicate" && task.queueId) {
      const apiToken = getProviderApiKey("replicate", task.profileId);
      if (apiToken) {
        try {
          await cancelReplicatePrediction(apiToken, task.queueId);
        } catch (err) {
          logError(`Failed to cancel Replicate prediction ${task.queueId}`, sanitizeErrorText(String(err)));
        }
      }
    }
    return applyUpdate(taskId, {
      status: "aborted",
      error: "Cancel requested (provider generation may still run)",
      metadata: { cancellationUnsupported: true },
    });
  }
  return applyUpdate(taskId, { status: "aborted", error: "Cancel requested" });
}

export async function retryBackgroundTaskInMain(taskId: string): Promise<BackgroundTask | null> {
  await initBackgroundTaskManager();
  const task = state.tasks[taskId];
  if (!task || !task.queueId) return null;
  // Synchronous task records intentionally do not persist request bodies, so
  // only their originating workspace can safely recreate them.
  if (!isProviderPolledBackgroundTaskType(task.type, task.providerId)) return task;
  const nextAttempt = (task.attemptNumber ?? 1) + 1;
  const updated = await applyUpdate(taskId, {
    status: "queued",
    stage: task.type === 'video' ? 'queued' : undefined,
    error: undefined,
    progress: 0,
    attemptStartedAt: Date.now(),
    attemptNumber: nextAttempt,
    pollAttempts: 0,
    consecutiveFailures: 0
  });
  if (updated) startPolling(taskId);
  return updated;
}

export async function clearBackgroundTaskInMain(taskId: string): Promise<void> {
  await initBackgroundTaskManager();
  const profileId = state.tasks[taskId]?.profileId ?? "default";
  stopPolling(taskId);
  delete state.tasks[taskId];
  clearEphemeralSecrets(taskId);
  await flushPersistFatal();
  emit(taskId, null, 'removed', profileId);
}

/** Fatal journal operations for provider-neutral paid submissions.
 *  Each transition writes to disk before returning so a crash can never leave
 *  a billable dispatch unrecorded. */
export async function persistPaidSubmissionIntent(input: BackgroundTaskCreateInput): Promise<BackgroundTask> {
  await initBackgroundTaskManager();
  const task = createBackgroundTask(input);
  (task as unknown as Record<string, unknown>).status = 'intent_persisted';
  state.tasks[task.id] = task;
  await flushPersistFatal();
  emit(task.id, task, 'created', task.profileId);
  return task;
}

export async function markPaidSubmissionDispatching(taskId: string): Promise<BackgroundTask> {
  await initBackgroundTaskManager();
  const updated = await applyUpdate(taskId, { status: 'dispatching', dispatchStartedAt: Date.now() });
  if (!updated) throw new Error(`Task ${taskId} not found when marking dispatching.`);
  await flushPersistFatal();
  return updated;
}

export async function markPaidSubmissionAccepted(taskId: string, remoteTaskId: string): Promise<BackgroundTask> {
  await initBackgroundTaskManager();
  const updated = await applyUpdate(taskId, {
    status: 'queued',
    queueId: remoteTaskId,
    acceptedAt: Date.now(),
  });
  if (!updated) throw new Error(`Task ${taskId} not found when marking accepted.`);
  await flushPersistFatal();
  if (isProviderPolledBackgroundTaskType(updated.type, updated.providerId)) {
    startPolling(updated.id);
  }
  return updated;
}

export async function markPaidSubmissionAcceptanceUnknown(taskId: string, error: string): Promise<BackgroundTask> {
  await initBackgroundTaskManager();
  const updated = await applyUpdate(taskId, { status: 'acceptance_unknown', error });
  if (!updated) throw new Error(`Task ${taskId} not found when marking acceptance unknown.`);
  await flushPersistFatal();
  return updated;
}

export function findActivePaidSubmission(query: {
  profileId: string;
  providerId: string;
  operation: string;
  requestFingerprint: string;
  payloadHash?: string;
}): BackgroundTask | undefined {
  const activeStatuses: BackgroundTaskStatus[] = ['intent_persisted', 'dispatching', 'queued', 'processing'];
  return Object.values(state.tasks).find((task) =>
    task.profileId === query.profileId &&
    task.providerId === query.providerId &&
    task.operation === query.operation &&
    task.requestFingerprint === query.requestFingerprint &&
    (query.payloadHash === undefined || task.payloadHash === query.payloadHash) &&
    activeStatuses.includes(task.status),
  );
}

function stopPolling(taskId: string): void {
  const poll = state.activePolls[taskId];
  if (poll) {
    clearTimeout(poll);
    delete state.activePolls[taskId];
  }
}

function schedulePoll(taskId: string, delayMs: number): void {
  stopPolling(taskId);
  state.activePolls[taskId] = setTimeout(() => runPoll(taskId), delayMs);
}

function startPolling(taskId: string): void {
  const task = state.tasks[taskId];
  if (!task || !task.queueId) return;
  if (!isProviderPolledBackgroundTaskType(task.type, task.providerId)) return;
  if (isTerminalStatus(task.status)) return;
  schedulePoll(taskId, 0);
}

async function runPoll(taskId: string): Promise<void> {
  const task = state.tasks[taskId];
  if (!task || !task.queueId || isTerminalStatus(task.status)) {
    stopPolling(taskId);
    return;
  }

  const startedAt = task.attemptStartedAt ?? task.createdAt;
  const effectiveTimeout = task.type === "video" ? MAX_VIDEO_GENERATION_MS : MAX_NON_VIDEO_GENERATION_MS;
  const attempts = task.pollAttempts ?? 0;
  const requestMetadata = task.metadata?.request && typeof task.metadata.request === 'object'
    ? task.metadata.request as Record<string, unknown>
    : undefined;
  const taskModel = String(task.metadata?.model || task.modelId || requestMetadata?.model || '');

  if (Date.now() - startedAt > effectiveTimeout) {
    await applyUpdate(taskId, { status: "timeout", error: "Status checks stopped. Resume checking or try again." });
    stopPolling(taskId);
    return;
  }

  if (attempts > MAX_ATTEMPTS) {
    await applyUpdate(taskId, { status: "timeout", error: "Generation took too long. Cancel and try again." });
    stopPolling(taskId);
    return;
  }

  try {
    if (task.type === "video") {
      await applyUpdate(taskId, { status: 'processing', stage: 'generating' });
      const ephemeral = ephemeralSecrets.get(taskId);
      const queueDownloadUrl = ephemeral?.queueDownloadUrl || (typeof task.metadata?.queueDownloadUrl === 'string' ? task.metadata.queueDownloadUrl : undefined);
      const normalized = await retrieveVideoQueueResult({
        queueId: task.queueId,
        model: taskModel,
        profileId: task.profileId,
        queueDownloadUrl,
        onStage: async (stage) => { await applyUpdate(taskId, { stage, progress: undefined }); },
      });

      const latestTask = state.tasks[taskId];
      if (!latestTask || isTerminalStatus(latestTask.status)) return;

      const currentPolls = (latestTask.pollAttempts ?? 0) + 1;

      if (normalized.kind === "completed") {
        await applyUpdate(taskId, { status: "completed", stage: 'completed', progress: 1, resultUrl: normalized.media.url, resultMediaId: normalized.media.id, metadata: { mimeType: normalized.media.mimeType }, pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
      } else if (normalized.kind === "failed") {
        await applyUpdate(taskId, { status: "failed", progress: undefined, error: toUserFacingVideoError(normalized.error, "Video generation failed"), pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
      } else {
        await applyUpdate(taskId, { status: "processing", stage: 'generating', progress: normalized.progressRatio, pollAttempts: currentPolls, consecutiveFailures: 0 });
        schedulePoll(taskId, POLL_INTERVAL_MS);
      }
    } else if (task.type === "music") {
      const musicTelemetryId = publishInspectorRequest({
        source: "main-background",
        transport: "venice",
        endpoint: "/audio/retrieve",
        method: "POST",
        summaries: { taskId, model: taskModel || undefined },
      });
      const response = await performVeniceRequest({
        endpoint: "/audio/retrieve",
        method: "POST",
        body: buildAudioRetrieveRequest(taskModel, task.queueId),
        profileId: task.profileId,
      });

      const latestTask = state.tasks[taskId];
      if (!latestTask || isTerminalStatus(latestTask.status)) {
        publishInspectorCompletion({
          source: "main-background",
          transport: "venice",
          endpoint: "/audio/retrieve",
          method: "POST",
          summaries: { taskId, model: taskModel || undefined },
          eventId: musicTelemetryId,
          error: "aborted",
        });
        return;
      }

      const currentPolls = (latestTask.pollAttempts ?? 0) + 1;

      if (!response.ok) {
        const body = response.body as Record<string, unknown> | undefined;
        const message = typeof body?.error === "string" ? body.error : "Audio retrieve failed";
        publishInspectorCompletion({
          source: "main-background",
          transport: "venice",
          endpoint: "/audio/retrieve",
          method: "POST",
          summaries: { taskId, model: taskModel || undefined },
          eventId: musicTelemetryId,
          status: response.status,
          error: message,
        });
        throw Object.assign(new Error(message), { status: response.status, currentPolls });
      }

      const normalized = normalizeAudioRetrieveResponse(response.body, response.headers);
      if (normalized.kind === 'completed') {
        const audioBuffer = Buffer.from(normalized.dataBase64, 'base64');
        // Screen completed audio bytes through FSM before persistence.
        const fsm = getRuntimeLocalFamilySafeModeEnabled();
        const screen = await identifyAndValidateGeneratedMedia(audioBuffer, normalized.mimeType, fsm);
        if (!screen.allowed) {
          const fsmError = screen.userMessage || 'Audio generation is not available while Family Safe Mode is enabled.';
          await applyUpdate(taskId, { status: 'failed', error: fsmError, pollAttempts: currentPolls, consecutiveFailures: 0 });
          stopPolling(taskId);
          publishInspectorCompletion({
            source: "main-background",
            transport: "venice",
            endpoint: "/audio/retrieve",
            method: "POST",
            summaries: { taskId, model: taskModel || undefined },
            eventId: musicTelemetryId,
            status: 451,
            error: fsmError,
          });
          return;
        }
        const media = await persistGeneratedMedia(audioBuffer, normalized.mimeType);
        await applyUpdate(taskId, { status: 'completed', progress: 1, resultUrl: media.url, resultMediaId: media.id, pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
        publishInspectorCompletion({
          source: "main-background",
          transport: "venice",
          endpoint: "/audio/retrieve",
          method: "POST",
          summaries: { taskId, model: taskModel || undefined, bytes: media.byteCount, durationMs: Date.now() - startedAt },
          eventId: musicTelemetryId,
          status: response.status,
        });
      } else if (normalized.kind === 'failed') {
        const userError = toUserFacingMusicError(normalized.error, MUSIC_SAFE_ERROR_MESSAGES.generation);
        await applyUpdate(taskId, { status: 'failed', error: userError, pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
        publishInspectorCompletion({
          source: "main-background",
          transport: "venice",
          endpoint: "/audio/retrieve",
          method: "POST",
          summaries: { taskId, model: taskModel || undefined },
          eventId: musicTelemetryId,
          error: userError,
        });
      } else {
        await applyUpdate(taskId, { status: 'processing', progress: normalized.progressRatio, pollAttempts: currentPolls, consecutiveFailures: 0 });
        schedulePoll(taskId, POLL_INTERVAL_MS);
        publishInspectorCompletion({
          source: "main-background",
          transport: "venice",
          endpoint: "/audio/retrieve",
          method: "POST",
          summaries: { taskId, model: taskModel || undefined, durationMs: Date.now() - startedAt },
          eventId: musicTelemetryId,
        });
      }
    } else if (task.providerId === "replicate") {
      const apiToken = getProviderApiKey("replicate", task.profileId);
      if (!apiToken) {
        await applyUpdate(taskId, { status: "failed", error: "Replicate API token is not configured.", pollAttempts: (task.pollAttempts ?? 0) + 1 });
        stopPolling(taskId);
        return;
      }

      await applyUpdate(taskId, { status: "processing", progress: undefined });
      const normalized = await pollReplicatePrediction(apiToken, task.queueId);

      const latestTask = state.tasks[taskId];
      if (!latestTask || isTerminalStatus(latestTask.status)) return;
      const currentPolls = (latestTask.pollAttempts ?? 0) + 1;

      if (normalized.kind === "completed") {
        const { buffer, mimeType } = await downloadReplicateOutput(normalized.outputUrl);
        const fsm = getRuntimeLocalFamilySafeModeEnabled();
        const screen = await identifyAndValidateGeneratedMedia(buffer, mimeType, fsm);
        if (!screen.allowed) {
          const fsmError = screen.userMessage || "Image generation is not available while Family Safe Mode is enabled.";
          await applyUpdate(taskId, { status: "failed", error: fsmError, pollAttempts: currentPolls, consecutiveFailures: 0 });
          stopPolling(taskId);
          return;
        }
        const media = await persistGeneratedMedia(buffer, mimeType);
        await applyUpdate(taskId, { status: "completed", progress: 1, resultUrl: media.url, resultMediaId: media.id, pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
      } else if (normalized.kind === "failed") {
        await applyUpdate(taskId, { status: "failed", error: normalized.error, pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
      } else if (normalized.kind === "canceled") {
        await applyUpdate(taskId, { status: "aborted", error: "Replicate prediction was canceled.", pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
      } else {
        await applyUpdate(taskId, { status: "processing", progress: undefined, pollAttempts: currentPolls, consecutiveFailures: 0 });
        schedulePoll(taskId, POLL_INTERVAL_MS);
      }
    }
  } catch (err: unknown) {
    const latestTask = state.tasks[taskId];
    if (!latestTask || isTerminalStatus(latestTask.status)) return;

    const status = err !== null && typeof err === "object" && "status" in err ? (err as { status?: unknown }).status : undefined;
    const currentPolls = err !== null && typeof err === "object" && "currentPolls" in err
      ? Number((err as { currentPolls?: unknown }).currentPolls)
      : ((latestTask.pollAttempts ?? 0) + 1);

    const explicitlyTerminal = err instanceof VideoRetrieveError && !err.retryable;
    if (explicitlyTerminal || (typeof status === "number" && status >= 400 && status < 500 && status !== 429)) {
      await applyUpdate(taskId, { status: "failed", progress: undefined, error: task.type === 'video' ? toUserFacingVideoError(err, 'Video retrieval failed') : "Generation failed", pollAttempts: currentPolls });
      stopPolling(taskId);
      return;
    }

    const consecutiveFailures = (latestTask.consecutiveFailures ?? 0) + 1;
    const retryDelayMs = Math.min(30000, POLL_INTERVAL_MS * 2 ** Math.min(consecutiveFailures, 4));
    await applyUpdate(taskId, { consecutiveFailures, pollAttempts: currentPolls });
    schedulePoll(taskId, retryDelayMs);
  }
}

export async function __flushBackgroundTaskPersistenceForTests(): Promise<void> {
  await flushPersist();
}

export async function __resetBackgroundTaskManagerForTests(): Promise<void> {
  for (const poll of Object.values(state.activePolls)) {
    clearTimeout(poll);
  }
  if (pendingPersistTimeout) {
    clearTimeout(pendingPersistTimeout);
    pendingPersistTimeout = null;
  }
  pendingPersist = false;
  if (activePersistPromise) {
    await activePersistPromise;
  }
  state.activePolls = {};
  state.tasks = {};
  initialized = false;
  initializationPromise = null;
  lastPersistTime = 0;
  listeners.clear();
  ephemeralSecrets.clear();
  inFlightPaidSubmissions.clear();
}

export interface PaidQueueSubmissionInput {
  operation: 'video' | 'audio';
  profileId: string;
  wirePayload: Record<string, unknown>;
  logicalRequestHash?: string;
}

const inFlightPaidSubmissions = new Map<string, Promise<{
  ok: boolean;
  task?: BackgroundTask;
  error?: string;
  challenge?: unknown;
}>>();

export async function submitPaidQueueTaskInMain(input: PaidQueueSubmissionInput): Promise<{
  ok: boolean;
  task?: BackgroundTask;
  error?: string;
  challenge?: unknown;
}> {
  await initBackgroundTaskManager();

  let mutexKey = "";
  let payloadHash = "";
  if (input.logicalRequestHash) {
    if (input.logicalRequestHash.length > 256) {
      return { ok: false, error: "logicalRequestHash exceeds 256 characters." };
    }
    payloadHash = computePayloadHash(input.wirePayload);
    // Compound idempotency key (profile, operation, logic, payloadHash)
    mutexKey = `${input.profileId}:${input.operation}:${input.logicalRequestHash}:${payloadHash}`;

    // Check existing tasks for idempotency conflict or reuse
    const existing = Object.values(state.tasks).find(
      t => t.requestFingerprint === input.logicalRequestHash &&
           t.type === (input.operation === 'video' ? 'video' : 'music') &&
           t.profileId === input.profileId &&
           !['failed', 'aborted', 'timeout'].includes(t.status)
    );
    if (existing) {
      // Legacy records created before payloadHash was introduced may lack it.
      // A missing hash means we cannot prove the stored payload matches the
      // new request, so we must NOT silently reuse the task.
      if (!existing.payloadHash) {
        return { ok: false, error: "IDEMPOTENCY_CONFLICT: existing task has no payload hash (legacy record). Cancel or retry the existing task first." };
      }
      if (existing.payloadHash !== payloadHash) {
        return { ok: false, error: "IDEMPOTENCY_CONFLICT: same logical key used with different payload." };
      }
      return { ok: true, task: existing };
    }

    // Check in-flight mutex
    if (inFlightPaidSubmissions.has(mutexKey)) {
      return await inFlightPaidSubmissions.get(mutexKey)!;
    }
  }

  const performSubmission = async () => {
    const taskId = `${input.operation}-${crypto.randomUUID()}`;

    // --- PHASE 1: Write-ahead journal before provider dispatch. ----
    // The task is persisted as `pending_finalize` so that a crash between
    // provider acceptance and local journaling cannot silently lose a
    // billable generation.  On restart, `initBackgroundTaskManager`
    // scavenges `pending_finalize` tasks: those with a queueId resume
    // polling; those without a queueId (pre-dispatch crash) are failed
    // with an "acceptance unknown" message and not blindly resubmitted.
    const intentTask = createBackgroundTask({
      id: taskId,
      type: input.operation === 'video' ? 'video' : 'music',
      // placeholder — real queueId comes from provider response
      queueId: 'pending',
      profileId: input.profileId,
      requestFingerprint: input.logicalRequestHash,
      payloadHash: input.logicalRequestHash ? payloadHash : undefined,
      metadata: {
        ...(input.wirePayload.duration ? { requestedDuration: String(input.wirePayload.duration) } : {}),
        ...(input.wirePayload.resolution ? { requestedResolution: String(input.wirePayload.resolution) } : {}),
        ...(input.wirePayload.aspect_ratio ? { requestedAspectRatio: String(input.wirePayload.aspect_ratio) } : {}),
      },
    });
    // Override status to the pre-dispatch sentinel.
    // pending_finalize is a valid runtime sentinel not in the type union.
    (intentTask as unknown as Record<string, unknown>).status = 'pending_finalize';
    state.tasks[intentTask.id] = intentTask;
    try {
      await flushPersistFatal();
    } catch {
      // Durable write failed — do not dispatch a billable request.
      delete state.tasks[intentTask.id];
      return { ok: false, error: 'Failed to journal task before provider dispatch.' };
    }
    emit(intentTask.id, intentTask, 'created', intentTask.profileId);

    // --- PHASE 2: Provider dispatch. ----
    const endpoint = input.operation === 'video' ? '/video/queue' : '/audio/queue';

    try {
      const guardedResult = await performGuardedVeniceRequest({
        endpoint,
        method: 'POST',
        body: input.wirePayload,
        profileId: input.profileId,
      });

      if (guardedResult.kind === 'blocked') {
        // Provider never saw this request — no billable submission occurred.
        // Delete the write-ahead intent rather than leaving a failed task.
        delete state.tasks[intentTask.id];
        void flushPersist();
        return { ok: false, error: 'Blocked by Family Safe Mode' };
      }

      const response = guardedResult.response;

      if (response.status === 409) {
        const challenge = normalizeSeedanceConsentChallenge(409, response.body);
        // Provider returned a consent challenge — no billable queue was created.
        delete state.tasks[intentTask.id];
        void flushPersist();
        if (challenge) {
          return { ok: false, challenge, error: challenge.error.message };
        }
        return { ok: false, error: 'Queue request returned 409 without a consent challenge.' };
      }

      if (response.status < 200 || response.status >= 300) {
        const msg = readResponseError(response);
        // Provider did not accept a billable job — clean up the intent.
        delete state.tasks[intentTask.id];
        void flushPersist();
        return { ok: false, error: msg };
      }

      let queueId = '';
      let model = String(input.wirePayload.model || '');
      let downloadUrl: string | undefined;

      if (input.operation === 'video') {
        const norm = normalizeVideoQueueResponse(response.body);
        queueId = norm.queueId;
        model = norm.model || model;
        downloadUrl = norm.downloadUrl;
      } else {
        const norm = normalizeAudioQueueResponse(response.body);
        queueId = norm.queueId;
        model = norm.model || model;
      }

      if (downloadUrl) {
        ephemeralSecrets.set(taskId, { queueDownloadUrl: downloadUrl, createdAt: Date.now() });
      }

      let downloadHost: string | undefined;
      if (downloadUrl) {
        try {
          downloadHost = new URL(downloadUrl).host;
        } catch {
          // ignore
        }
      }

      // --- PHASE 3: Atomically finalize the intent. ----
      const existing = state.tasks[intentTask.id];
      if (existing) {
        existing.status = 'queued';
        existing.queueId = queueId;
        existing.modelId = model;
        existing.payloadHash = input.logicalRequestHash ? payloadHash : existing.payloadHash;
        existing.metadata = {
          ...existing.metadata,
          model,
          ...(downloadUrl ? { queueDownloadUrlPresent: true, ...(downloadHost ? { downloadHost } : {}) } : {}),
          ...(input.wirePayload.duration ? { requestedDuration: String(input.wirePayload.duration) } : {}),
          ...(input.wirePayload.resolution ? { requestedResolution: String(input.wirePayload.resolution) } : {}),
          ...(input.wirePayload.aspect_ratio ? { requestedAspectRatio: String(input.wirePayload.aspect_ratio) } : {}),
        };
        existing.updatedAt = Date.now();
      }
      await flushPersistFatal();
      emit(intentTask.id, existing, 'updated', intentTask.profileId);
      startPolling(intentTask.id);

      return { ok: true, task: existing };
    } catch (err) {
      // Provider dispatch threw without a response. The write-ahead intent
      // journal still exists with status pending_finalize and no queueId.
      // On restart it will be failed with "acceptance unknown" — safer
      // than blind resubmission.
      logError('Paid queue dispatch failed after journaling intent', sanitizeErrorText(String(err)));
      throw err;
    }
  };

  if (mutexKey) {
    const promise = performSubmission();
    inFlightPaidSubmissions.set(mutexKey, promise);
    try {
      const result = await promise;
      return result;
    } finally {
      inFlightPaidSubmissions.delete(mutexKey);
    }
  } else {
    return performSubmission();
  }
}

export function __getBackgroundTaskManagerStateForTests(): BackgroundTaskManagerState {
  return state;
}

export function __getEphemeralSecretsForTests(): Map<string, { queueDownloadUrl?: string; createdAt: number }> {
  return ephemeralSecrets;
}
