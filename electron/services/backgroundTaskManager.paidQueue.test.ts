import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitPaidQueueTaskInMain,
  __resetBackgroundTaskManagerForTests,
  __getBackgroundTaskManagerStateForTests,
  __getEphemeralSecretsForTests,
  initBackgroundTaskManager,
} from './backgroundTaskManager';
import { performVeniceRequest } from './veniceClient';

vi.mock('./veniceClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./veniceClient')>()),
  performVeniceRequest: vi.fn(),
}));

vi.mock('./secureStore', () => ({
  getApiKey: vi.fn(() => 'mock-venice-key'),
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

describe('Main-Process Paid Queue Submission & Recovery', () => {
  beforeEach(async () => {
    vi.mocked(performVeniceRequest).mockReset();
    await __resetBackgroundTaskManagerForTests();
  });

  afterEach(async () => {
    await __resetBackgroundTaskManagerForTests();
  });

  it('submits a video queue job, journals it, and stores signed URL in ephemeral secrets', async () => {
    vi.mocked(performVeniceRequest).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: {
        model: 'seedance-v1',
        queue_id: 'queue-vid-456',
        download_url: 'https://cdn.venice.ai/video/queue-vid-456.mp4?secret=token',
      },
      contentType: 'application/json',
    });

    const result = await submitPaidQueueTaskInMain({
      operation: 'video',
      profileId: 'default',
      wirePayload: {
        model: 'seedance-v1',
        prompt: 'a running dog',
        duration: '5s',
      },
      logicalRequestHash: 'hash-abc-123',
    });

    expect(result.ok).toBe(true);
    expect(result.task).toBeDefined();
    expect(result.task?.queueId).toBe('queue-vid-456');
    expect(result.task?.type).toBe('video');
    expect(result.task?.status).toBe('queued');

    // Ephemeral custody check: download URL is in memory map, not in persisted metadata
    const secrets = __getEphemeralSecretsForTests();
    expect(secrets.get(result.task!.id)?.queueDownloadUrl).toBe(
      'https://cdn.venice.ai/video/queue-vid-456.mp4?secret=token',
    );
    expect(result.task?.metadata?.queueDownloadUrl).toBeUndefined();
    expect(result.task?.metadata?.queueDownloadUrlPresent).toBe(true);
    expect(result.task?.metadata?.downloadHost).toBe('cdn.venice.ai');
  });

  it('handles Seedance 409 needs_consent challenge without creating a broken task', async () => {
    vi.mocked(performVeniceRequest).mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      headers: { 'content-type': 'application/json' },
      body: {
        error: { code: 'needs_consent', message: 'Face consent required' },
        consent_flow: 'seedance',
        face_media_roles: ['image'],
        consent: { policy_text: 'I confirm rights to face image.' },
      },
      contentType: 'application/json',
    });

    const result = await submitPaidQueueTaskInMain({
      operation: 'video',
      profileId: 'default',
      wirePayload: { model: 'seedance-v1', prompt: 'face video' },
    });

    expect(result.ok).toBe(false);
    expect(result.challenge).toBeDefined();
    expect((result.challenge as { consent_flow: string }).consent_flow).toBe('seedance');

    // No background task was stored
    const managerState = __getBackgroundTaskManagerStateForTests();
    expect(Object.keys(managerState.tasks)).toHaveLength(0);
  });

  it('returns upstream string details when a paid queue request fails', async () => {
    vi.mocked(performVeniceRequest).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'content-type': 'application/json' },
      body: {
        error: 'Video generation failed (status: 500)',
        details: 'Upstream processing returned an empty result.',
      },
      contentType: 'application/json',
    });

    const result = await submitPaidQueueTaskInMain({
      operation: 'video',
      profileId: 'default',
      wirePayload: {
        model: 'video-model',
        prompt: 'a lighthouse',
        duration: '5s',
      },
      logicalRequestHash: 'video-sha256:'.concat('a'.repeat(64)),
    });

    expect(result).toMatchObject({
      ok: false,
      error:
        'Video generation failed (status: 500): Upstream processing returned an empty result.',
    });
    expect(Object.keys(__getBackgroundTaskManagerStateForTests().tasks)).toHaveLength(0);
  });

  it('recovers pending_finalize tasks to queued state upon restart initialization', async () => {
    const rawSavedTasks = JSON.stringify({
      version: 1,
      tasks: [
        {
          id: 'task-pending-1',
          type: 'video',
          status: 'pending_finalize',
          queueId: 'q-recovered-777',
          profileId: 'default',
          modelId: 'seedance-v1',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    const fsPromises = await import('fs/promises');
    vi.mocked(fsPromises.default.readFile).mockResolvedValueOnce(rawSavedTasks);

    await initBackgroundTaskManager();

    const managerState = __getBackgroundTaskManagerStateForTests();
    expect(managerState.tasks['task-pending-1'].status).toBe('queued');
    expect(managerState.tasks['task-pending-1'].queueId).toBe('q-recovered-777');
  });
});
