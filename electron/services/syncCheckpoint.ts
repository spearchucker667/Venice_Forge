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

const STALE_DEVICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface SyncDeviceRecord {
  version: 1;
  deviceId: string;
  lastSeenAt: number;
}

async function writeDeviceRecord(vfbackupDirectory: string, deviceId: string, lastSeenAt: number): Promise<void> {
  const directory = path.join(vfbackupDirectory, "devices");
  await fs.mkdir(directory, { recursive: true });
  const record: SyncDeviceRecord = { version: 1, deviceId, lastSeenAt };
  await fs.writeFile(path.join(directory, `${deviceId}.json`), JSON.stringify(record), { flag: "w", mode: 0o600 });
}

export async function registerSyncDevice(vfbackupDirectory: string, deviceId: string): Promise<void> {
  assertDeviceId(deviceId);
  await writeDeviceRecord(vfbackupDirectory, deviceId, Date.now());
}

export async function acknowledgeSyncOperation(vfbackupDirectory: string, deviceId: string, operationId: string): Promise<void> {
  assertDeviceId(deviceId);
  assertOperationId(operationId);
  const directory = path.join(vfbackupDirectory, "acks", deviceId);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${operationId}.ack`), "1", { flag: "w", mode: 0o600 });
  await writeDeviceRecord(vfbackupDirectory, deviceId, Date.now());
}

export async function pruneStaleSyncDevices(
  vfbackupDirectory: string,
  now = Date.now(),
  maxAgeMs = STALE_DEVICE_MAX_AGE_MS,
): Promise<string[]> {
  const devicesDir = path.join(vfbackupDirectory, "devices");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(devicesDir);
  } catch {
    return [];
  }
  const pruned: string[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json"))) {
    const deviceId = entry.slice(0, -5);
    if (!DEVICE_ID_RE.test(deviceId)) continue;
    const filePath = path.join(devicesDir, entry);
    let lastSeenAt: number;
    try {
      const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as Partial<SyncDeviceRecord>;
      if (typeof raw.lastSeenAt === "number" && Number.isFinite(raw.lastSeenAt)) {
        lastSeenAt = raw.lastSeenAt;
      } else {
        await writeDeviceRecord(vfbackupDirectory, deviceId, now);
        continue;
      }
    } catch {
      continue;
    }
    if (now - lastSeenAt < maxAgeMs) continue;
    await fs.rm(filePath, { force: true });
    await fs.rm(path.join(vfbackupDirectory, "acks", deviceId), { recursive: true, force: true });
    pruned.push(deviceId);
  }
  return pruned;
}

export async function collectAcknowledgedEvent(
  vfbackupDirectory: string,
  operationId: string,
  eventFilePath: string,
  checkpointFilePath: string,
): Promise<boolean> {
  assertOperationId(operationId);
  await pruneStaleSyncDevices(vfbackupDirectory);
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
