/** @fileoverview Persistent main-process background task manager.
 *  Owns queued video/music/image/research/document tasks, polls async
 *  endpoints from the main process, and persists state across renderer
 *  reloads and application restarts.
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
import { createBackgroundTask, parseTasks, serializeTasks } from "../../src/types/background-task";
import { sanitizeErrorText } from "../../src/shared/redaction";
import { normalizeVideoRetrieveResult } from "../../src/services/video-retrieve-normalizer";
import { MUSIC_SAFE_ERROR_MESSAGES, toUserFacingMusicError, toUserFacingVideoError } from "../../src/services/task-errors";
import { performVeniceRequest } from "./veniceClient";
import { logError } from "./logger";
import { buildAudioRetrieveRequest, buildVideoRetrieveRequest } from '../../src/services/media-request-adapter';
import { normalizeAudioRetrieveResponse } from '../../src/services/audio-retrieve-normalizer';
import { persistGeneratedMedia } from './generatedMediaStore';
import { downloadGeneratedVideo } from './generatedVideoDownload';

const TASKS_DIR = path.join(app.getPath("userData"), "background-tasks");
const TASKS_FILE = path.join(TASKS_DIR, "tasks.json");

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 200;
const MAX_VIDEO_GENERATION_MS = 300000; // 5 minutes
const MAX_NON_VIDEO_GENERATION_MS = 120000; // 2 minutes
const DURABLE_RESULT_URL_RE = /^venice-media:\/\/[a-f0-9]{64}$/;

export interface BackgroundTaskManagerState {
  tasks: Record<string, BackgroundTask>;
  activePolls: Record<string, ReturnType<typeof setTimeout>>;
}

export type BackgroundTaskChangeListener = (taskId: string, task: BackgroundTask | null, profileId: string) => void;

const listeners = new Set<BackgroundTaskChangeListener>();
const state: BackgroundTaskManagerState = { tasks: {}, activePolls: {} };

let initialized = false;
let initializationPromise: Promise<void> | null = null;

function emit(taskId: string, task: BackgroundTask | null, profileId: string): void {
  for (const listener of listeners) {
    try {
      listener(taskId, task, profileId);
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
  try {
    const tasks = parseTasks(raw);
    state.tasks = Object.fromEntries(tasks.map((t) => [t.id, t]));
  } catch (err) {
    logError("Failed to load background tasks", sanitizeErrorText(String(err)));
    try {
      await fs.copyFile(TASKS_FILE, `${TASKS_FILE}.corrupt`);
      logError("Quarantined corrupt tasks file", "tasks.json.corrupt");
    } catch {
      // Ignore
    }
    state.tasks = {};
  }
}

export async function initBackgroundTaskManager(): Promise<void> {
  if (initialized) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    await loadBackgroundTasks();
    for (const task of Object.values(state.tasks)) {
      if (!isTerminalStatus(task.status)) {
        if (task.type === "video" || task.type === "music") {
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
  if ("queueId" in updates && updates.queueId !== task.queueId) {
    if (updates.queueId === undefined) {
      delete updated.queueId;
      hasChanges = true;
    } else {
      updated.queueId = String(updates.queueId).slice(0, 128);
      hasChanges = true;
    }
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

  // Debounce non-critical progress updates to avoid disk thrashing
  const isProgressOnly = updates.status === undefined && updates.error === undefined && updates.resultUrl === undefined;
  persist(isProgressOnly ? 2000 : 0);
  emit(taskId, updated, updated.profileId);
  return updated;
}

export async function createBackgroundTaskInMain(
  input: BackgroundTaskCreateInput,
): Promise<BackgroundTask> {
  await initBackgroundTaskManager();
  const task = createBackgroundTask(input);
  state.tasks[task.id] = task;
  persist();
  emit(task.id, task, task.profileId);
  if (task.type === "video" || task.type === "music") {
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
  if (task && (task.type === "video" || task.type === "music")) {
    return applyUpdate(taskId, {
      error: "Provider cancellation is unavailable; generation is still running.",
      metadata: { cancellationUnsupported: true },
    });
  }
  stopPolling(taskId);
  return applyUpdate(taskId, { status: "aborted", error: "Cancel requested" });
}

export async function retryBackgroundTaskInMain(taskId: string): Promise<BackgroundTask | null> {
  await initBackgroundTaskManager();
  const task = state.tasks[taskId];
  if (!task || !task.queueId) return null;
  const nextAttempt = (task.attemptNumber ?? 1) + 1;
  const updated = await applyUpdate(taskId, {
    status: "queued",
    error: undefined,
    progress: 0,
    attemptStartedAt: Date.now(),
    attemptNumber: nextAttempt,
    pollAttempts: 0,
    consecutiveFailures: 0
  });
  if (updated && (updated.type === "video" || updated.type === "music")) {
    startPolling(taskId);
  }
  return updated;
}

export async function clearBackgroundTaskInMain(taskId: string): Promise<void> {
  await initBackgroundTaskManager();
  const profileId = state.tasks[taskId]?.profileId ?? "default";
  stopPolling(taskId);
  delete state.tasks[taskId];
  persist();
  emit(taskId, null, profileId);
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
  if (task.type !== "video" && task.type !== "music") return;
  if (isTerminalStatus(task.status)) return;
  schedulePoll(taskId, 0);
}

async function runPoll(taskId: string): Promise<void> {
  const task = state.tasks[taskId];
  if (!task || !task.queueId || isTerminalStatus(task.status)) {
    stopPolling(taskId);
    return;
  }

  const startedAt = task.createdAt;
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
      const response = await performVeniceRequest({
        endpoint: "/video/retrieve",
        method: "POST",
        body: buildVideoRetrieveRequest(taskModel, task.queueId),
        profileId: task.profileId,
      });

      const latestTask = state.tasks[taskId];
      if (!latestTask || isTerminalStatus(latestTask.status)) return;

      const currentPolls = (latestTask.pollAttempts ?? 0) + 1;

      if (!response.ok) {
        const body = response.body as Record<string, unknown> | undefined;
        const message = typeof body?.error === "string" ? body.error : "Video retrieve failed";
        throw Object.assign(new Error(message), { status: response.status, currentPolls });
      }

      const queueDownloadUrl = typeof task.metadata?.queueDownloadUrl === 'string' ? task.metadata.queueDownloadUrl : undefined;
      const normalized = normalizeVideoRetrieveResult(response.body, response.headers, queueDownloadUrl);
      if (normalized.kind === "completed") {
        const match = /^data:video\/mp4;base64,(.+)$/i.exec(normalized.mediaUrl);
        if (!match) throw Object.assign(new Error('Video response was not durable binary media.'), { currentPolls });
        const media = await persistGeneratedMedia(Buffer.from(match[1], 'base64'), normalized.mimeType);
        await applyUpdate(taskId, { status: "completed", progress: 1, resultUrl: media.url, resultMediaId: media.id, pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
      } else if (normalized.kind === 'download') {
        const download = await downloadGeneratedVideo(normalized.downloadUrl)
          .catch((error: unknown) => { throw Object.assign(error instanceof Error ? error : new Error('Video download failed.'), { currentPolls }) })
        const media = await persistGeneratedMedia(download.bytes, download.mimeType);
        await applyUpdate(taskId, { status: 'completed', progress: 1, resultUrl: media.url, resultMediaId: media.id, pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
      } else if (normalized.kind === "failed") {
        await applyUpdate(taskId, { status: "failed", error: toUserFacingVideoError(normalized.error, "Video generation failed"), pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
      } else {
        await applyUpdate(taskId, { status: "processing", progress: normalized.progressRatio, pollAttempts: currentPolls, consecutiveFailures: 0 });
        schedulePoll(taskId, POLL_INTERVAL_MS);
      }
    } else if (task.type === "music") {
      const response = await performVeniceRequest({
        endpoint: "/audio/retrieve",
        method: "POST",
        body: buildAudioRetrieveRequest(taskModel, task.queueId),
        profileId: task.profileId,
      });

      const latestTask = state.tasks[taskId];
      if (!latestTask || isTerminalStatus(latestTask.status)) return;

      const currentPolls = (latestTask.pollAttempts ?? 0) + 1;

      if (!response.ok) {
        const body = response.body as Record<string, unknown> | undefined;
        const message = typeof body?.error === "string" ? body.error : "Audio retrieve failed";
        throw Object.assign(new Error(message), { status: response.status, currentPolls });
      }

      const normalized = normalizeAudioRetrieveResponse(response.body, response.headers);
      if (normalized.kind === 'completed') {
        const media = await persistGeneratedMedia(Buffer.from(normalized.dataBase64, 'base64'), normalized.mimeType);
        await applyUpdate(taskId, { status: 'completed', progress: 1, resultUrl: media.url, resultMediaId: media.id, pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
      } else if (normalized.kind === 'failed') {
        await applyUpdate(taskId, { status: 'failed', error: toUserFacingMusicError(normalized.error, MUSIC_SAFE_ERROR_MESSAGES.generation), pollAttempts: currentPolls, consecutiveFailures: 0 });
        stopPolling(taskId);
      } else {
        await applyUpdate(taskId, { status: 'processing', progress: normalized.progressRatio, pollAttempts: currentPolls, consecutiveFailures: 0 });
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

    if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) {
      await applyUpdate(taskId, { status: "failed", error: "Generation failed", pollAttempts: currentPolls });
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
}

export function __getBackgroundTaskManagerStateForTests(): BackgroundTaskManagerState {
  return state;
}
