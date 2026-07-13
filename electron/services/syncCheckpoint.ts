import path from "node:path";
import { promises as fs } from "node:fs";

const DEVICE_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;
const OPERATION_ID_RE = /^[a-f0-9]{64}$/;

function assertDeviceId(deviceId: string): void {
  if (!DEVICE_ID_RE.test(deviceId)) throw new Error("Invalid sync device ID.");
}

function assertOperationId(operationId: string): void {
  if (!OPERATION_ID_RE.test(operationId)) throw new Error("Invalid sync operation ID.");
}

export async function registerSyncDevice(vfbackupDirectory: string, deviceId: string): Promise<void> {
  assertDeviceId(deviceId);
  const directory = path.join(vfbackupDirectory, "devices");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${deviceId}.json`), JSON.stringify({ version: 1, deviceId }), { flag: "w", mode: 0o600 });
}

export async function acknowledgeSyncOperation(vfbackupDirectory: string, deviceId: string, operationId: string): Promise<void> {
  assertDeviceId(deviceId);
  assertOperationId(operationId);
  const directory = path.join(vfbackupDirectory, "acks", deviceId);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${operationId}.ack`), "1", { flag: "w", mode: 0o600 });
}

export async function collectAcknowledgedEvent(
  vfbackupDirectory: string,
  operationId: string,
  eventFilePath: string,
  checkpointFilePath: string,
): Promise<boolean> {
  assertOperationId(operationId);
  try {
    await fs.access(checkpointFilePath);
  } catch {
    return false;
  }
  let deviceEntries: string[];
  try {
    deviceEntries = await fs.readdir(path.join(vfbackupDirectory, "devices"));
  } catch {
    return false;
  }
  const deviceIds = deviceEntries.filter((entry) => entry.endsWith(".json")).map((entry) => entry.slice(0, -5));
  if (deviceIds.length === 0) return false;
  for (const deviceId of deviceIds) {
    assertDeviceId(deviceId);
    try {
      await fs.access(path.join(vfbackupDirectory, "acks", deviceId, `${operationId}.ack`));
    } catch {
      return false;
    }
  }
  await fs.rm(eventFilePath, { force: true });
  return true;
}
