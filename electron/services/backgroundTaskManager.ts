/** @fileoverview Persistent main-process background task manager.
 *  Owns queued video/music/image/research/document tasks, polls async
 *  endpoints from the main process, and persists state across renderer
 *  reloads and application restarts.
 */

import { app } from "electron";
import fs from "fs/promises";
import fsSync from "fs";
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
import type { MusicRetrieveResponse } from "../../src/types/venice";
import { performVeniceRequest } from "./veniceClient";
import { logError } from "./logger";

const TASKS_DIR = path.join(app.getPath("userData"), "background-tasks");
const TASKS_FILE = path.join(TASKS_DIR, "tasks.json");

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 200;
const MAX_VIDEO_GENERATION_MS = 300000; // 5 minutes
const MAX_NON_VIDEO_GENERATION_MS = 120000; // 2 minutes

export interface BackgroundTaskManagerState {
  tasks: Record<string, BackgroundTask>;
  activePolls: Record<string, ReturnType<typeof setTimeout>>;
}

export type BackgroundTaskChangeListener = (taskId: string, task: BackgroundTask | null) => void;

const listeners = new Set<BackgroundTaskChangeListener>();
const state: BackgroundTaskManagerState = { tasks: {}, activePolls: {} };

let initialized = false;
let initializationPromise: Promise<void> | null = null;

function emit(taskId: string, task: BackgroundTask | null): void {
  for (const listener of listeners) {
    try {
      listener(taskId, task);
    } catch (err) {
      logError("Background task listener failed", sanitizeErrorText(String(err)));
    }
  }
}

function writeTasksFile(): void {
  fsSync.mkdirSync(TASKS_DIR, { recursive: true, mode: 0o700 });
  const payload = serializeTasks(Object.values(state.tasks));
  const tempFile = `${TASKS_FILE}.tmp.${crypto.randomBytes(8).toString("hex")}`;
  try {
    fsSync.writeFileSync(tempFile, payload, { encoding: "utf-8", mode: 0o600 });
    fsSync.renameSync(tempFile, TASKS_FILE);
  } catch (err) {
    try {
      fsSync.unlinkSync(tempFile);
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }
}

function persist(): void {
  try {
    writeTasksFile();
  } catch (err) {
    logError("Failed to persist background tasks", sanitizeErrorText(String(err)));
  }
}

export async function loadBackgroundTasks(): Promise<void> {
  try {
    await fs.access(TASKS_FILE);
  } catch {
    state.tasks = {};
    return;
  }
  try {
    const raw = await fs.readFile(TASKS_FILE, "utf-8");
    const tasks = parseTasks(raw);
    state.tasks = Object.fromEntries(tasks.map((t) => [t.id, t]));
  } catch (err) {
    logError("Failed to load background tasks", sanitizeErrorText(String(err)));
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
  const updated: BackgroundTask = {
    ...task,
    ...updates,
    id: task.id,
    type: task.type,
    createdAt: task.createdAt,
    updatedAt: Date.now(),
  };
  state.tasks[taskId] = updated;
  persist();
  emit(taskId, updated);
  return updated;
}

export async function createBackgroundTaskInMain(
  input: BackgroundTaskCreateInput,
): Promise<BackgroundTask> {
  await initBackgroundTaskManager();
  const task = createBackgroundTask(input);
  state.tasks[task.id] = task;
  persist();
  emit(task.id, task);
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
  stopPolling(taskId);
  return applyUpdate(taskId, { status: "aborted", error: "Cancelled by user" });
}

export async function retryBackgroundTaskInMain(taskId: string): Promise<BackgroundTask | null> {
  await initBackgroundTaskManager();
  const task = state.tasks[taskId];
  if (!task || !task.queueId) return null;
  const updated = await applyUpdate(taskId, { status: "queued", error: undefined, progress: undefined });
  if (updated && (updated.type === "video" || updated.type === "music")) {
    startPolling(taskId);
  }
  return updated;
}

export async function clearBackgroundTaskInMain(taskId: string): Promise<void> {
  await initBackgroundTaskManager();
  stopPolling(taskId);
  delete state.tasks[taskId];
  persist();
  emit(taskId, null);
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
  const attempts = task.metadata?.__pollAttempts as number | undefined ?? 0;

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
        body: {
          model: (task.metadata?.model as string) || "default-video-model",
          queue_id: task.queueId,
          delete_media_on_completion: false,
        },
      });

      const latestTask = state.tasks[taskId];
      if (!latestTask || isTerminalStatus(latestTask.status)) return;

      if (!response.ok) {
        const body = response.body as Record<string, unknown> | undefined;
        const message = typeof body?.error === "string" ? body.error : "Video retrieve failed";
        throw Object.assign(new Error(message), { status: response.status });
      }

      const normalized = normalizeVideoRetrieveResult(response.body, response.headers);
      if (normalized.kind === "completed") {
        await applyUpdate(taskId, { status: "completed", progress: 1, resultUrl: normalized.mediaUrl });
        stopPolling(taskId);
      } else if (normalized.kind === "failed") {
        await applyUpdate(taskId, { status: "failed", error: toUserFacingVideoError(normalized.error, "Video generation failed") });
        stopPolling(taskId);
      } else {
        await applyUpdate(taskId, { status: "processing", progress: normalized.progressRatio, metadata: { ...task.metadata, __pollAttempts: attempts + 1 } });
        schedulePoll(taskId, POLL_INTERVAL_MS);
      }
    } else if (task.type === "music") {
      const response = await performVeniceRequest({
        endpoint: "/audio/retrieve",
        method: "POST",
        body: { id: task.queueId },
      });

      const latestTask = state.tasks[taskId];
      if (!latestTask || isTerminalStatus(latestTask.status)) return;

      if (!response.ok) {
        const body = response.body as Record<string, unknown> | undefined;
        const message = typeof body?.error === "string" ? body.error : "Audio retrieve failed";
        throw Object.assign(new Error(message), { status: response.status });
      }

      const data = response.body as MusicRetrieveResponse;
      const s = data.status.toLowerCase() as BackgroundTaskStatus;
      await applyUpdate(taskId, { status: s, metadata: { ...task.metadata, __pollAttempts: attempts + 1 } });

      if (s === "completed") {
        if (!data.audio_url?.trim()) {
          await applyUpdate(taskId, { status: "failed", error: MUSIC_SAFE_ERROR_MESSAGES.empty });
        } else {
          await applyUpdate(taskId, { status: "completed", resultUrl: data.audio_url.trim() });
        }
        stopPolling(taskId);
      } else if (s === "failed") {
        await applyUpdate(taskId, { error: toUserFacingMusicError(data.error, MUSIC_SAFE_ERROR_MESSAGES.generation) });
        stopPolling(taskId);
      } else {
        schedulePoll(taskId, POLL_INTERVAL_MS);
      }
    }
  } catch (err: unknown) {
    const latestTask = state.tasks[taskId];
    if (!latestTask || isTerminalStatus(latestTask.status)) return;

    const status = err !== null && typeof err === "object" && "status" in err ? (err as { status?: unknown }).status : undefined;
    if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) {
      await applyUpdate(taskId, { status: "failed", error: "Generation failed" });
      stopPolling(taskId);
      return;
    }

    const consecutiveFailures = (task.metadata?.__consecutiveFailures as number | undefined) ?? 0;
    const nextFailures = consecutiveFailures + 1;
    const retryDelayMs = Math.min(30000, POLL_INTERVAL_MS * 2 ** Math.min(nextFailures, 4));
    await applyUpdate(taskId, { metadata: { ...task.metadata, __consecutiveFailures: nextFailures } });
    schedulePoll(taskId, retryDelayMs);
  }
}

export function __resetBackgroundTaskManagerForTests(): void {
  for (const poll of Object.values(state.activePolls)) {
    clearTimeout(poll);
  }
  state.activePolls = {};
  state.tasks = {};
  initialized = false;
  initializationPromise = null;
  listeners.clear();
}

export function __getBackgroundTaskManagerStateForTests(): BackgroundTaskManagerState {
  return state;
}
