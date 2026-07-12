// @vitest-environment node

/** @fileoverview Tests for background task IPC handlers. */
// VERIFY-094 regression guard: IPC CRUD/subscription and push broadcasts for persisted background tasks.

import { describe, it, expect, beforeEach, vi } from "vitest";
import os from "os";
import path from "path";

const capturedHandlers = new Map<string, (...args: unknown[]) => unknown>();
const sentEvents = new Array<{ channel: string; payload: unknown }>();
const mockWebContents = {
  isDestroyed: vi.fn(() => false),
  send: vi.fn((channel: string, payload: unknown) => {
    sentEvents.push({ channel, payload });
  }),
};

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === "userData") return path.join(os.tmpdir(), "vf-bg-task-ipc");
      return os.tmpdir();
    }),
    getVersion: vi.fn(() => "1.0.0-test"),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      capturedHandlers.set(channel, handler);
    }),
  },
  WebContents: {},
}));

vi.mock("../../services/backgroundTaskManager", () => ({
  initBackgroundTaskManager: vi.fn(),
  createBackgroundTaskInMain: vi.fn(),
  updateBackgroundTaskInMain: vi.fn(),
  cancelBackgroundTaskInMain: vi.fn(),
  retryBackgroundTaskInMain: vi.fn(),
  clearBackgroundTaskInMain: vi.fn(),
  listBackgroundTasks: vi.fn(),
  subscribeToBackgroundTasks: vi.fn(),
}));

import {
  createBackgroundTaskInMain as createTask,
  updateBackgroundTaskInMain as updateTask,
  cancelBackgroundTaskInMain as cancelTask,
  retryBackgroundTaskInMain as retryTask,
  clearBackgroundTaskInMain as clearTask,
  listBackgroundTasks as listTasks,
  subscribeToBackgroundTasks as subscribe,
} from "../../services/backgroundTaskManager";

vi.mock("./common", () => ({
  registerIpcChannel: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    capturedHandlers.set(channel, handler);
  }),
  safeSendToRenderer: vi.fn((_webContents, channel, payload) => {
    sentEvents.push({ channel, payload });
    return true;
  }),
}));

import { registerBackgroundTaskHandlers, __resetBackgroundTaskHandlersForTests } from "./backgroundTaskHandlers";

const createTaskMock = vi.mocked(createTask);
const updateTaskMock = vi.mocked(updateTask);
const cancelTaskMock = vi.mocked(cancelTask);
const retryTaskMock = vi.mocked(retryTask);
const clearTaskMock = vi.mocked(clearTask);
const listTasksMock = vi.mocked(listTasks);
const subscribeMock = vi.mocked(subscribe);

function invoke(channel: string, ...args: unknown[]) {
  const handler = capturedHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return handler({ sender: mockWebContents }, ...args);
}

describe("registerBackgroundTaskHandlers", () => {
  beforeEach(() => {
    capturedHandlers.clear();
    sentEvents.length = 0;
    createTaskMock.mockReset();
    updateTaskMock.mockReset();
    cancelTaskMock.mockReset();
    retryTaskMock.mockReset();
    clearTaskMock.mockReset();
    listTasksMock.mockReset();
    subscribeMock.mockReset();
    mockWebContents.isDestroyed.mockReturnValue(false);
    __resetBackgroundTaskHandlersForTests();
    registerBackgroundTaskHandlers();
  });

  it("registers the expected channels", () => {
    expect(capturedHandlers.has("backgroundTask:subscribe")).toBe(true);
    expect(capturedHandlers.has("backgroundTask:unsubscribe")).toBe(true);
    expect(capturedHandlers.has("backgroundTask:create")).toBe(true);
    expect(capturedHandlers.has("backgroundTask:update")).toBe(true);
    expect(capturedHandlers.has("backgroundTask:list")).toBe(true);
    expect(capturedHandlers.has("backgroundTask:cancel")).toBe(true);
    expect(capturedHandlers.has("backgroundTask:retry")).toBe(true);
    expect(capturedHandlers.has("backgroundTask:clear")).toBe(true);
  });

  it("subscribes a renderer and sends a snapshot", async () => {
    listTasksMock.mockReturnValue([
      { id: "t1", type: "video", status: "queued", queueId: "q1", createdAt: 1, updatedAt: 2 },
    ]);
    const result = await invoke("backgroundTask:subscribe");
    expect(result).toEqual({ ok: true });
    expect(sentEvents).toHaveLength(1);
    expect(sentEvents[0].channel).toBe("backgroundTask:update");
    expect((sentEvents[0].payload as { kind: string }).kind).toBe("snapshot");
  });

  it("creates a task and returns it", async () => {
    createTaskMock.mockResolvedValue({ id: "t1", type: "video", status: "queued", createdAt: 1, updatedAt: 2 });
    const result = await invoke("backgroundTask:create", { type: "video", queueId: "q1" });
    expect(result.ok).toBe(true);
    expect(createTaskMock).toHaveBeenCalledWith({ type: "video", queueId: "q1" });
  });

  it("rejects invalid task input", async () => {
    const result = await invoke("backgroundTask:create", null);
    expect(result.ok).toBe(false);
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("updates a task", async () => {
    updateTaskMock.mockResolvedValue({ id: "t1", type: "video", status: "completed" });
    const result = await invoke("backgroundTask:update", { taskId: "t1", updates: { status: "completed" } });
    expect(result.ok).toBe(true);
    expect(updateTaskMock).toHaveBeenCalledWith("t1", { status: "completed" });
  });

  it("lists tasks", async () => {
    listTasksMock.mockReturnValue([{ id: "t1", type: "video", status: "queued", createdAt: 1, updatedAt: 2 }]);
    const result = await invoke("backgroundTask:list");
    expect(result.ok).toBe(true);
    expect(result.tasks).toHaveLength(1);
  });

  it("cancels a task", async () => {
    cancelTaskMock.mockResolvedValue({ id: "t1", type: "video", status: "aborted" });
    const result = await invoke("backgroundTask:cancel", "t1");
    expect(result.ok).toBe(true);
    expect(cancelTaskMock).toHaveBeenCalledWith("t1");
  });

  it("retries a task", async () => {
    retryTaskMock.mockResolvedValue({ id: "t1", type: "video", status: "queued" });
    const result = await invoke("backgroundTask:retry", "t1");
    expect(result.ok).toBe(true);
    expect(retryTaskMock).toHaveBeenCalledWith("t1");
  });

  it("clears a task", async () => {
    clearTaskMock.mockResolvedValue(undefined);
    const result = await invoke("backgroundTask:clear", "t1");
    expect(result.ok).toBe(true);
    expect(clearTaskMock).toHaveBeenCalledWith("t1");
  });

  it("broadcasts task changes to subscribed renderers", async () => {
    await invoke("backgroundTask:subscribe");
    const listener = subscribeMock.mock.calls[0]?.[0] as (taskId: string, task: unknown) => void;
    expect(listener).toBeDefined();
    listener("t1", { id: "t1", type: "video", status: "processing" } as never);
    expect(sentEvents).toHaveLength(2);
    expect(sentEvents[1].channel).toBe("backgroundTask:update");
  });
});
