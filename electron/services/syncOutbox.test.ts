// Regression guard: encrypted outbound packets survive publication interruption.
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";

vi.mock("electron", () => ({ app: { getPath: vi.fn(() => "/tmp/vf-sync-outbox-user") } }));

import { drainSyncOutbox, persistSyncOutboxEntry } from "./syncOutbox";

const filename = `${"a".repeat(64)}.json`;
const userRoot = "/tmp/vf-sync-outbox-user";
const blobs = "/tmp/vf-sync-outbox-target";
const objects = "/tmp/vf-sync-outbox-objects";

describe("syncOutbox", () => {
  beforeEach(async () => {
    await fs.rm(userRoot, { recursive: true, force: true });
    await fs.rm(blobs, { recursive: true, force: true });
    await fs.rm(objects, { recursive: true, force: true });
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
});
