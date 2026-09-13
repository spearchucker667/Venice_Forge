import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitPaidQueueTaskInMain,
  __resetBackgroundTaskManagerForTests,
  __getBackgroundTaskManagerStateForTests,
  initBackgroundTaskManager,
  type BackgroundTaskManagerState,
} from './backgroundTaskManager';
import { performVeniceRequest } from './veniceClient';
import { serializeTasks, parseTasks } from '../../src/types/background-task';
import fs from 'fs/promises';
import {
  setRuntimeLocalFamilySafeModeEnabled,
  setRuntimeVeniceApiSafeMode,
} from './runtimeSafetySettings';

vi.mock('./veniceClient', () => ({
  performVeniceRequest: vi.fn(),
}));

vi.mock('./secureStore', () => ({
  getApiKey: vi.fn(() => 'mock-key'),
}));

vi.mock('./logger', () => ({
  logError: vi.fn(),
  setLastApiError: vi.fn(),
}));

vi.mock('./inspectorTelemetry', () => ({
  publishInspectorRequest: vi.fn(() => 'req-1'),
  publishInspectorCompletion: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/venice-test-userData'),
    getVersion: vi.fn(() => '3.0.0-beta.2'),
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue({ code: 'ENOENT' }),
    copyFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

// Task persistence routes through the canonical replace utility; keep this
// suite's no-real-filesystem contract by mocking it at the same boundary.
vi.mock('../utils/atomicFileReplace', () => ({
  atomicReplaceFile: vi.fn().mockResolvedValue(undefined),
}));

function clearActivePolls(state: BackgroundTaskManagerState): void {
  for (const poll of Object.values(state.activePolls)) {
    clearTimeout(poll);
  }
  state.activePolls = {};
}

describe('submitPaidQueueTaskInMain restart idempotency', () => {
  beforeEach(async () => {
    vi.mocked(performVeniceRequest).mockReset();
    setRuntimeLocalFamilySafeModeEnabled(false);
    setRuntimeVeniceApiSafeMode(false);
    await __resetBackgroundTaskManagerForTests();
  });

  afterEach(async () => {
    await __resetBackgroundTaskManagerForTests();
    setRuntimeLocalFamilySafeModeEnabled(true);
    setRuntimeVeniceApiSafeMode(true);
  });

  it('deduplicates across a simulated restart using requestFingerprint and payloadHash', async () => {
    const wirePayload = { model: 'seedance-v1', prompt: 'a dog' };
    const logicalRequestHash = 'hash-1';

    vi.mocked(performVeniceRequest).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: { model: 'seedance-v1', queue_id: 'queue-vid-456' },
      contentType: 'application/json',
    });

    const firstResult = await submitPaidQueueTaskInMain({
      operation: 'video',
      profileId: 'default',
      wirePayload,
      logicalRequestHash,
    });

    expect(performVeniceRequest).toHaveBeenCalledTimes(1);
    expect(firstResult.ok).toBe(true);
    expect(firstResult.task).toBeDefined();
    const persistedTaskId = firstResult.task!.id;

    // 1. Capture the in-memory journal as it would exist on disk after a flush.
    const preRestartState = __getBackgroundTaskManagerStateForTests();
    const serialized = serializeTasks(Object.values(preRestartState.tasks));

    // 2. Simulate application restart.
    await __resetBackgroundTaskManagerForTests();
    const postRestartState = __getBackgroundTaskManagerStateForTests();
    postRestartState.tasks = Object.fromEntries(
      parseTasks(serialized).map((t) => [t.id, t]),
    );

    // initBackgroundTaskManager reloads from disk; feed it the same journal so
    // the manually-loaded state is not wiped by the mocked ENOENT default.
    vi.mocked(fs.readFile).mockResolvedValueOnce(serialized);
    await initBackgroundTaskManager();
    clearActivePolls(postRestartState);

    // 3. Re-submit with identical logical key and payload -> reuse persisted task.
    const secondResult = await submitPaidQueueTaskInMain({
      operation: 'video',
      profileId: 'default',
      wirePayload,
      logicalRequestHash,
    });

    expect(performVeniceRequest).toHaveBeenCalledTimes(1);
    expect(secondResult.ok).toBe(true);
    expect(secondResult.task?.id).toBe(persistedTaskId);

    // 4. Same logical key but a different payload -> idempotency conflict.
    const conflictResult = await submitPaidQueueTaskInMain({
      operation: 'video',
      profileId: 'default',
      wirePayload: { model: 'seedance-v1', prompt: 'a cat' },
      logicalRequestHash,
    });

    expect(performVeniceRequest).toHaveBeenCalledTimes(1);
    expect(conflictResult.ok).toBe(false);
    expect(conflictResult.error).toContain('IDEMPOTENCY_CONFLICT');
  });
});
