/** @fileoverview Background task IPC handlers. Bridges the persistent
 *  main-process task manager to the renderer process.
 */

import { ipcMain, type WebContents } from "electron";
import type { BackgroundTaskCreateInput, BackgroundTaskIpcEnvelope, BackgroundTaskUpdate } from "../../../src/types/background-task";
import {
  initBackgroundTaskManager,
  createBackgroundTaskInMain,
  updateBackgroundTaskInMain,
  cancelBackgroundTaskInMain,
  retryBackgroundTaskInMain,
  clearBackgroundTaskInMain,
  listBackgroundTasks,
  subscribeToBackgroundTasks,
} from "../../services/backgroundTaskManager";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { safeSendToRenderer } from "./common";

const subscribers = new Set<WebContents>();

function broadcast(envelope: BackgroundTaskIpcEnvelope): void {
  for (const webContents of subscribers) {
    if (webContents.isDestroyed()) {
      subscribers.delete(webContents);
      continue;
    }
    safeSendToRenderer(webContents, "backgroundTask:update", envelope);
  }
}

function sendSnapshot(webContents: WebContents): void {
  if (webContents.isDestroyed()) return;
  safeSendToRenderer(webContents, "backgroundTask:update", {
    kind: "snapshot",
    tasks: listBackgroundTasks(),
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
  subscribeToBackgroundTasks((taskId, task) => {
    if (task) {
      broadcast({ kind: task.status === "queued" && !task.metadata?.__pollAttempts ? "created" : "updated", taskId, tasks: [task] });
    } else {
      broadcast({ kind: "removed", taskId });
    }
  });
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

  ipcMain.handle("backgroundTask:create", async (_event, input: unknown) => {
    try {
      await initBackgroundTaskManager();
      if (!input || typeof input !== "object") {
        return { ok: false, error: "Invalid task input." };
      }
      const createInput = input as BackgroundTaskCreateInput;
      if (!createInput.type) {
        return { ok: false, error: "Task type is required." };
      }
      const task = await createBackgroundTaskInMain(createInput);
      return { ok: true, task };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:update", async (_event, input: unknown) => {
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
      const task = await updateBackgroundTaskInMain(taskId, updates as BackgroundTaskUpdate);
      return { ok: true, task };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:list", async () => {
    try {
      await initBackgroundTaskManager();
      return { ok: true, tasks: listBackgroundTasks() };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:cancel", async (_event, taskId: unknown) => {
    try {
      await initBackgroundTaskManager();
      if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
        return { ok: false, error: "Invalid task ID." };
      }
      const task = await cancelBackgroundTaskInMain(taskId);
      return { ok: true, task };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:retry", async (_event, taskId: unknown) => {
    try {
      await initBackgroundTaskManager();
      if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
        return { ok: false, error: "Invalid task ID." };
      }
      const task = await retryBackgroundTaskInMain(taskId);
      return { ok: true, task };
    } catch (err: unknown) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("backgroundTask:clear", async (_event, taskId: unknown) => {
    try {
      await initBackgroundTaskManager();
      if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
        return { ok: false, error: "Invalid task ID." };
      }
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
