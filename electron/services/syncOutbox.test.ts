// Regression guard: encrypted outbound packets survive publication interruption.
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRoot = path.join(os.tmpdir(), `vf-sync-outbox-${Date.now()}`);
vi.mock("electron", () => ({ app: { getPath: vi.fn(() => tmpRoot) } }));

import { drainSyncOutbox, persistSyncOutboxEntry } from "./syncOutbox";

const filename = `${"a".repeat(64)}.json`;
const userRoot = tmpRoot;
const blobs = path.join(tmpRoot, "target");
const objects = path.join(tmpRoot, "objects");

describe("syncOutbox", () => {
  beforeEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.mkdir(userRoot, { recursive: true });
    await fs.mkdir(blobs, { recursive: true });
    await fs.mkdir(objects, { recursive: true });
  });

  it("persists then drains an encrypted manifest atomically", async () => {
    const manifest = JSON.stringify({ version: 2, salt: "salt", iv: "iv", ciphertext: "cipher" });
    await persistSyncOutboxEntry(filename, manifest);

    await expect(fs.access(`${userRoot}/sync/outbox/${filename}`)).resolves.toBeUndefined();
    await expect(drainSyncOutbox(blobs, objects)).resolves.toBe(1);
    await expect(fs.readFile(`${blobs}/${filename}`, "utf8")).resolves.toBe(manifest);
    await expect(fs.readFile(`${objects}/${filename}`, "utf8")).resolves.toBe(manifest);
    await expect(fs.access(`${userRoot}/sync/outbox/${filename}`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects traversal and malformed packet names", async () => {
    await expect(persistSyncOutboxEntry("../../packet.json", "{}"))
      .rejects.toThrow(/invalid sync outbox filename/i);
  });

  it("safely cleans up and skips corrupt outbox entries during drain", async () => {
    const corruptFile = `${"b".repeat(64)}.json`;
    await fs.mkdir(`${userRoot}/sync/outbox`, { recursive: true });
    await fs.writeFile(`${userRoot}/sync/outbox/${corruptFile}`, "not valid json {", "utf8");

    const validManifest = JSON.stringify({ version: 2, salt: "salt", iv: "iv", ciphertext: "cipher" });
    await persistSyncOutboxEntry(filename, validManifest);

    await expect(drainSyncOutbox(blobs, objects)).resolves.toBe(1);
    await expect(fs.readFile(`${blobs}/${filename}`, "utf8")).resolves.toBe(validManifest);
    await expect(fs.access(`${userRoot}/sync/outbox/${corruptFile}`)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
