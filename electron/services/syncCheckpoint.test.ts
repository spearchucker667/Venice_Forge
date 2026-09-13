// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { acknowledgeSyncOperation, collectAcknowledgedEvent, pruneStaleSyncDevices, registerSyncDevice } from "./syncCheckpoint";

import os from "node:os";
import path from "node:path";

let root: string;
const operationId = "a".repeat(64);
let eventPath: string;
let checkpointPath: string;

describe("syncCheckpoint", () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "vf-sync-checkpoint-"));
    eventPath = path.join(root, "blobs", "event.json");
    checkpointPath = path.join(root, "objects", "current.json");
    await fs.mkdir(path.join(root, "blobs"), { recursive: true });
    await fs.mkdir(path.join(root, "objects"), { recursive: true });
    await fs.writeFile(eventPath, "event");
    await fs.writeFile(checkpointPath, "checkpoint");
  });

  it("retains history until every registered device acknowledges", async () => {
    await registerSyncDevice(root, "11111111-1111-4111-8111-111111111111");
    await registerSyncDevice(root, "22222222-2222-4222-8222-222222222222");
    await acknowledgeSyncOperation(root, "11111111-1111-4111-8111-111111111111", operationId);
    await expect(collectAcknowledgedEvent(root, operationId, eventPath, checkpointPath)).resolves.toBe(false);
    await acknowledgeSyncOperation(root, "22222222-2222-4222-8222-222222222222", operationId);
    await expect(collectAcknowledgedEvent(root, operationId, eventPath, checkpointPath)).resolves.toBe(true);
  });

  it("prunes stale devices so remaining acks can collect events", async () => {
    const live = "11111111-1111-4111-8111-111111111111";
    const stale = "22222222-2222-4222-8222-222222222222";
    await registerSyncDevice(root, live);
    await registerSyncDevice(root, stale);
    const stalePath = path.join(root, "devices", `${stale}.json`);
    await fs.writeFile(
      stalePath,
      JSON.stringify({ version: 1, deviceId: stale, lastSeenAt: Date.now() - 40 * 24 * 60 * 60 * 1000 }),
    );
    await acknowledgeSyncOperation(root, live, operationId);
    const pruned = await pruneStaleSyncDevices(root);
    expect(pruned).toContain(stale);
    await expect(collectAcknowledgedEvent(root, operationId, eventPath, checkpointPath)).resolves.toBe(true);
  });

  it("never collects without a durable current-object checkpoint", async () => {
    await registerSyncDevice(root, "11111111-1111-4111-8111-111111111111");
    await acknowledgeSyncOperation(root, "11111111-1111-4111-8111-111111111111", operationId);
    await fs.rm(checkpointPath);
    await expect(collectAcknowledgedEvent(root, operationId, eventPath, checkpointPath)).resolves.toBe(false);
  });
});
