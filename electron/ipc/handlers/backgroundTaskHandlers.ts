/** @fileoverview Background task IPC handlers. Bridges the persistent
 *  main-process task manager to the renderer process.
 */

import { ipcMain, type WebContents } from "electron";
import type { BackgroundTaskCreateInput, BackgroundTaskIpcEnvelope, BackgroundTaskUpdate } from "../../../src/types/background-task";
import { isValidTaskType, isValidTaskStatus, isValidVideoTaskStage } from "../../../src/types/background-task";
import {
  initBackgroundTaskManager,
  createBackgroundTaskInMain,
  updateBackgroundTaskInMain,
  cancelBackgroundTaskInMain,
  retryBackgroundTaskInMain,
  clearBackgroundTaskInMain,
  getBackgroundTask,
  listBackgroundTasks,
  subscribeToBackgroundTasks,
} from "../../services/backgroundTaskManager";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { safeSendToRenderer } from "./common";
import { getProfileSessionId } from "../../services/profileSession";

const subscribers = new Set<WebContents>();

function broadcast(envelope: BackgroundTaskIpcEnvelope, profileId: string): void {
  for (const webContents of subscribers) {
    if (webContents.isDestroyed()) {
      subscribers.delete(webContents);
      continue;
    }
    if (getProfileSessionId(webContents) !== profileId) continue;
    safeSendToRenderer(webContents, "backgroundTask:update", envelope);
  }
}

function sendSnapshot(webContents: WebContents): void {
  if (webContents.isDestroyed()) return;
  safeSendToRenderer(webContents, "backgroundTask:update", {
    kind: "snapshot",
    tasks: listBackgroundTasks().filter((task) => task.profileId === getProfileSessionId(webContents)),
  } as BackgroundTaskIpcEnvelope);
}

let listenerRegistered = false;

export function __resetBackgroundTaskHandlersForTests(): void {
  subscribers.clear();
  listenerRegistered = false;
}

function registerBroadcastListener(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;
  subscribeToBackgroundTasks((taskId, task, profileId) => {
    if (task) {
      broadcast({ kind: task.status === "queued" && !task.metadata?.__pollAttempts ? "created" : "updated", taskId, tasks: [task] }, profileId);
    } else {
      broadcast({ kind: "removed", taskId }, profileId);
    }
  });
}

function isTaskOwnedBySender(sender: WebContents, taskId: string): boolean {
  const task = getBackgroundTask(taskId);
  return task !== null && task.profileId === getProfileSessionId(sender);
}

function taskNotFound(): { ok: false; error: string } {
  return { ok: false, error: "Background task not found." };
}

export function registerBackgroundTaskHandlers(): void {
  registerBroadcastListener();

  ipcMain.handle("backgroundTask:subscribe", async (event) => {
    try {
      await initBackgroundTaskManager();
      subscribers.add(event.sender);
      sendSnapshot(event.sender);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:unsubscribe", async (event) => {
    subscribers.delete(event.sender);
    return { ok: true };
  });

  ipcMain.handle("backgroundTask:create", async (event, input: unknown) => {
    try {
      await initBackgroundTaskManager();
      if (!input || typeof input !== "object") {
        return { ok: false, error: "Invalid task input." };
      }
      const createInput = input as BackgroundTaskCreateInput;
      if (!isValidTaskType(createInput.type)) {
        return { ok: false, error: "Invalid task type." };
      }
      if (createInput.id && (typeof createInput.id !== 'string' || createInput.id.length > 128)) {
        return { ok: false, error: "Invalid task ID." };
      }
      if (createInput.queueId && typeof createInput.queueId !== 'string') {
        return { ok: false, error: "Invalid queue ID." };
      }
      const task = await createBackgroundTaskInMain({
        ...createInput,
        profileId: getProfileSessionId(event.sender),
      });
      return { ok: true, task };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:update", async (event, input: unknown) => {
    try {
      await initBackgroundTaskManager();
      if (!input || typeof input !== "object") {
        return { ok: false, error: "Invalid update input." };
      }
      const { taskId, updates } = input as { taskId: unknown; updates: unknown };
      if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
        return { ok: false, error: "Invalid task ID." };
      }
      if (!updates || typeof updates !== "object") {
        return { ok: false, error: "Invalid updates." };
      }
      const updatePayload = updates as BackgroundTaskUpdate;
      if (updatePayload.status && !isValidTaskStatus(updatePayload.status)) {
        return { ok: false, error: "Invalid status." };
      }
      if (updatePayload.stage !== undefined && !isValidVideoTaskStage(updatePayload.stage)) {
        return { ok: false, error: "Invalid video task stage." };
      }
      if (!isTaskOwnedBySender(event.sender, taskId)) return taskNotFound();
      const task = await updateBackgroundTaskInMain(taskId, updatePayload);
      return { ok: true, task };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:list", async (event) => {
    try {
      await initBackgroundTaskManager();
      const profileId = getProfileSessionId(event.sender);
      return { ok: true, tasks: listBackgroundTasks().filter((task) => task.profileId === profileId) };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:cancel", async (event, taskId: unknown) => {
    try {
      await initBackgroundTaskManager();
      if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
        return { ok: false, error: "Invalid task ID." };
      }
      if (!isTaskOwnedBySender(event.sender, taskId)) return taskNotFound();
      const task = await cancelBackgroundTaskInMain(taskId);
      return { ok: true, task };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:retry", async (event, taskId: unknown) => {
    try {
      await initBackgroundTaskManager();
      if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
        return { ok: false, error: "Invalid task ID." };
      }
      if (!isTaskOwnedBySender(event.sender, taskId)) return taskNotFound();
      const task = await retryBackgroundTaskInMain(taskId);
      return { ok: true, task };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:clear", async (event, taskId: unknown) => {
    try {
      await initBackgroundTaskManager();
      if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
        return { ok: false, error: "Invalid task ID." };
      }
      if (!isTaskOwnedBySender(event.sender, taskId)) return taskNotFound();
      await clearBackgroundTaskInMain(taskId);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });
}

export function __backgroundTaskSubscribersForTests(): Set<WebContents> {
  return subscribers;
}
