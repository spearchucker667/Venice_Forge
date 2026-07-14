import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { app } from "electron";

const PACKET_NAME_RE = /^[a-f0-9]{64}\.json$/;
const MAX_OUTBOX_ENTRY_BYTES = 55 * 1024 * 1024;

interface SyncOutboxEntry {
  version: 1;
  filename: string;
  manifestJson: string;
  objectFilename: string;
  createdAt: string;
}

function outboxDirectory(): string {
  return path.join(app.getPath("userData"), "sync", "outbox");
}

function validateFilename(filename: string): void {
  if (!PACKET_NAME_RE.test(filename)) throw new Error("Invalid sync outbox filename.");
}

export async function persistSyncOutboxEntry(filename: string, manifestJson: string, objectFilename = filename): Promise<void> {
  validateFilename(filename);
  validateFilename(objectFilename);
  if (Buffer.byteLength(manifestJson, "utf8") > MAX_OUTBOX_ENTRY_BYTES) {
    throw new Error("Sync outbox entry exceeds maximum size.");
  }
  const directory = outboxDirectory();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, filename);
  try {
    await fs.access(destination);
    return;
  } catch {
    // No durable copy exists yet.
  }
  const temporary = `${destination}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const entry: SyncOutboxEntry = {
    version: 1,
    filename,
    manifestJson,
    objectFilename,
    createdAt: new Date().toISOString(),
  };
  try {
    await fs.writeFile(temporary, JSON.stringify(entry), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function removeSyncOutboxEntry(filename: string): Promise<void> {
  validateFilename(filename);
  await fs.rm(path.join(outboxDirectory(), filename), { force: true });
}

async function publishManifest(directory: string, filename: string, manifestJson: string, replace: boolean): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(directory, filename);
  if (!replace) {
    try {
      await fs.access(destination);
      return;
    } catch {
      // Publish the missing immutable event.
    }
  }
  const temporary = `${destination}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporary, manifestJson, { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (replace) await fs.rm(destination, { force: true });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function drainSyncOutbox(blobsDirectory: string, objectsDirectory = blobsDirectory): Promise<number> {
  await fs.mkdir(blobsDirectory, { recursive: true });
  let names: string[];
  try {
    names = await fs.readdir(outboxDirectory());
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }

  let drained = 0;
  for (const name of names.sort()) {
    if (!PACKET_NAME_RE.test(name)) continue;
    const entryPath = path.join(outboxDirectory(), name);
    const raw = await fs.readFile(entryPath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_OUTBOX_ENTRY_BYTES) continue;
    const parsed = JSON.parse(raw) as Partial<SyncOutboxEntry>;
    if (parsed.version !== 1 || parsed.filename !== name || typeof parsed.manifestJson !== "string"
      || typeof parsed.objectFilename !== "string" || !PACKET_NAME_RE.test(parsed.objectFilename)) continue;

    await publishManifest(blobsDirectory, name, parsed.manifestJson, false);
    await publishManifest(objectsDirectory, parsed.objectFilename, parsed.manifestJson, true);
    await fs.rm(entryPath, { force: true });
    drained += 1;
  }
  return drained;
}
