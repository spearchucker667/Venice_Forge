// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { acknowledgeSyncOperation, collectAcknowledgedEvent, registerSyncDevice } from "./syncCheckpoint";

const root = "/tmp/vf-sync-checkpoint";
const operationId = "a".repeat(64);
const eventPath = `${root}/blobs/event.json`;
const checkpointPath = `${root}/objects/current.json`;

describe("syncCheckpoint", () => {
  beforeEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(`${root}/blobs`, { recursive: true });
    await fs.mkdir(`${root}/objects`, { recursive: true });
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

  it("never collects without a durable current-object checkpoint", async () => {
    await registerSyncDevice(root, "11111111-1111-4111-8111-111111111111");
    await acknowledgeSyncOperation(root, "11111111-1111-4111-8111-111111111111", operationId);
    await fs.rm(checkpointPath);
    await expect(collectAcknowledgedEvent(root, operationId, eventPath, checkpointPath)).resolves.toBe(false);
  });
});
