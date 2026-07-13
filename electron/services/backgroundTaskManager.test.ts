// @vitest-environment node

/** @fileoverview Tests for the persistent main-process background task manager. */
// VERIFY-094 regression guard: main-process background-task persistence, recovery, and redaction.
// VERIFY-095 regression guard: reject noncanonical generated-media result URLs without mutation.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

// eslint-disable-next-line no-var
var TMP_USERDATA: string;

vi.mock("electron", () => {
  const tempRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), "vf-bg-task-"));
  fsSync.mkdirSync(path.join(tempRoot, "UserData"), { recursive: true });
  TMP_USERDATA = fsSync.realpathSync(path.join(tempRoot, "UserData"));
  return {
    app: {
      getPath: vi.fn((name: string) => {
        if (name === "userData") return TMP_USERDATA;
        return os.tmpdir();
      }),
    },
  };
});

vi.mock("./veniceClient", () => ({
  performVeniceRequest: vi.fn(),
}));

vi.mock('./generatedMediaStore', () => ({
  persistGeneratedMedia: vi.fn(async (_bytes: Buffer, mimeType: string) => ({
    id: 'a'.repeat(64),
    url: `venice-media://${'a'.repeat(64)}`,
    mimeType,
    byteCount: 4,
    sha256: 'a'.repeat(64),
  })),
}));

import { performVeniceRequest as performVeniceRequestMock } from "./veniceClient";
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
  __flushBackgroundTaskPersistenceForTests,
  __resetBackgroundTaskManagerForTests,
} from "./backgroundTaskManager";

const performVeniceRequest = vi.mocked(performVeniceRequestMock);

async function readPersistedTasks(): Promise<unknown[]> {
  const tasksFile = path.join(TMP_USERDATA, "background-tasks", "tasks.json");
  const raw = await fs.readFile(tasksFile, "utf-8");
  const parsed = JSON.parse(raw) as { version: number; tasks: unknown[] };
  return parsed.tasks;
}

describe("backgroundTaskManager", () => {
  beforeEach(async () => {
    await __resetBackgroundTaskManagerForTests();
    performVeniceRequest.mockReset();
    const tasksFile = path.join(TMP_USERDATA, "background-tasks", "tasks.json");
    try {
      await fs.unlink(tasksFile);
    } catch {
      // ignore
    }
  });

  afterEach(async () => {
    const dir = path.join(TMP_USERDATA, "background-tasks");
    try {
      const entries = await fs.readdir(dir);
      await Promise.all(entries.map((e) => fs.unlink(path.join(dir, e)).catch(() => undefined)));
    } catch {
      // directory may not exist
    }
  });

  it("creates and persists a task", async () => {
    const task = await createBackgroundTaskInMain({ type: "video", queueId: "q1", profileId: "p1" });
    expect(task.status).toBe("queued");
    expect(task.type).toBe("video");
    expect(task.queueId).toBe("q1");
    await __flushBackgroundTaskPersistenceForTests();
    const persisted = await readPersistedTasks();
    expect(persisted).toHaveLength(1);
    expect((persisted[0] as { id: string }).id).toBe(task.id);
  });

  it("lists tasks sorted by updatedAt descending", async () => {
    const t1 = await createBackgroundTaskInMain({ type: "music", queueId: "q1", profileId: "p1" });
    const t2 = await createBackgroundTaskInMain({ type: "video", queueId: "q2", profileId: "p1" });
    await updateBackgroundTaskInMain(t1.id, { status: "processing" });
    const list = listBackgroundTasks();
    expect(list[0].id).toBe(t1.id);
    expect(list[1].id).toBe(t2.id);
  });

  it("keeps monitoring a paid task when provider cancellation is unavailable", async () => {
    const task = await createBackgroundTaskInMain({ type: "video", queueId: "q1", profileId: "p1" });
    const cancelled = await cancelBackgroundTaskInMain(task.id);
    expect(cancelled?.status).toBe("queued");
    expect(cancelled?.error).toBe("Provider cancellation is unavailable; generation is still running.");
    expect(cancelled?.metadata?.cancellationUnsupported).toBe(true);
  });

  it("clears a task", async () => {
    const task = await createBackgroundTaskInMain({ type: "video", queueId: "q1", profileId: "p1" });
    await clearBackgroundTaskInMain(task.id);
    expect(listBackgroundTasks()).toHaveLength(0);
    await __flushBackgroundTaskPersistenceForTests();
    const persisted = await readPersistedTasks();
    expect(persisted).toHaveLength(0);
  });

  it("retries a timed-out task", async () => {
    const task = await createBackgroundTaskInMain({ type: "video", queueId: "q1", profileId: "p1" });
    await updateBackgroundTaskInMain(task.id, { status: "timeout", error: "too long" });
    const retried = await retryBackgroundTaskInMain(task.id);
    expect(retried?.status).toBe("queued");
    expect(retried?.error).toBeUndefined();
  });

  it("notifies subscribers on changes", async () => {
    const listener = vi.fn();
    subscribeToBackgroundTasks(listener);
    const task = await createBackgroundTaskInMain({ type: "video", queueId: "q1", profileId: "p1" });
    expect(listener).toHaveBeenCalledWith(task.id, expect.objectContaining({ status: "queued" }));
    await cancelBackgroundTaskInMain(task.id);
    expect(listener).toHaveBeenCalledWith(task.id, expect.objectContaining({
      status: "queued",
      metadata: expect.objectContaining({ cancellationUnsupported: true }),
    }));
  });

  it("recovers persisted tasks on init and resumes polling async tasks", async () => {
    const task = await createBackgroundTaskInMain({ type: "video", queueId: "q1", profileId: "p1" });
    await __flushBackgroundTaskPersistenceForTests();
    await __resetBackgroundTaskManagerForTests();
    await initBackgroundTaskManager();
    expect(listBackgroundTasks()).toHaveLength(1);
    expect(listBackgroundTasks()[0].id).toBe(task.id);
  });

  it("polls video tasks to completion", async () => {
    vi.useFakeTimers();
    await createBackgroundTaskInMain({ type: "video", queueId: "q1", profileId: "p1", metadata: { model: 'video-model' } });
    performVeniceRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { "content-type": "video/mp4" },
      body: { dataBase64: "AAAA" },
      contentType: "video/mp4",
    });
    await vi.advanceTimersByTimeAsync(0);
    const updated = listBackgroundTasks()[0];
    expect(updated?.status).toBe("completed");
    expect(updated?.resultUrl).toBe(`venice-media://${'a'.repeat(64)}`);
    expect(performVeniceRequest).toHaveBeenCalledWith(expect.objectContaining({ body: { model: 'video-model', queue_id: 'q1', delete_media_on_completion: false } }));
    vi.useRealTimers();
  });

  it("polls music tasks to completion", async () => {
    vi.useFakeTimers();
    await createBackgroundTaskInMain({ type: "music", queueId: "q1", profileId: "p1", metadata: { model: 'stable-audio' } });
    performVeniceRequest.mockImplementationOnce(() => Promise.resolve({
      ok: true,
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
      body: { dataBase64: 'SUQzAA==' },
      contentType: "audio/mpeg",
    }));
    await vi.advanceTimersByTimeAsync(0);
    const updated = listBackgroundTasks()[0];
    expect(updated?.status).toBe("completed");
    expect(updated?.resultUrl).toBe(`venice-media://${'a'.repeat(64)}`);
    expect(performVeniceRequest).toHaveBeenCalledWith(expect.objectContaining({ body: { model: 'stable-audio', queue_id: 'q1', delete_media_on_completion: false } }));
    vi.useRealTimers();
  });

  it("rejects noncanonical result URLs without mutating the task", async () => {
    const task = await createBackgroundTaskInMain({ type: "image", queueId: "sync-request", profileId: "p1" });

    await expect(updateBackgroundTaskInMain(task.id, {
      status: "completed",
      resultUrl: `data:audio/mpeg;base64,${"A".repeat(5000)}`,
    })).rejects.toThrow("must reference durable generated media");

    expect(getBackgroundTask(task.id)).toMatchObject({ status: "queued" });
    expect(getBackgroundTask(task.id)?.resultUrl).toBeUndefined();
  });

  it("accepts canonical durable generated-media URLs", async () => {
    const task = await createBackgroundTaskInMain({ type: "image", queueId: "sync-request", profileId: "p1" });
    const resultUrl = `venice-media://${"b".repeat(64)}`;

    const updated = await updateBackgroundTaskInMain(task.id, { status: "completed", resultUrl });

    expect(updated).toMatchObject({ status: "completed", resultUrl });
  });

  it("does not poll sync task types", async () => {
    vi.useFakeTimers();
    await createBackgroundTaskInMain({ type: "image", queueId: "sync-request", profileId: "p1" });
    await vi.advanceTimersByTimeAsync(10);
    expect(performVeniceRequest).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("redacts secrets in metadata before persisting", async () => {
    await createBackgroundTaskInMain({
      type: "video",
      queueId: "q1",
      profileId: "p1",
      metadata: { apiKey: "sk-1234567890abcdef", request: { prompt: "hello" } },
    });
    await __flushBackgroundTaskPersistenceForTests();
    const persisted = await readPersistedTasks();
    const raw = JSON.stringify(persisted);
    expect(raw).not.toContain("sk-1234567890abcdef");
  });
});
