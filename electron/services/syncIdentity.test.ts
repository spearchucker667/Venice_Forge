// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { ensureSyncIdentity, packetMatchesSyncIdentity } from "./syncIdentity";

const root = "/tmp/vf-sync-identity";

describe("syncIdentity", () => {
  beforeEach(async () => fs.rm(root, { recursive: true, force: true }));

  it("creates and reopens one encrypted folder identity", async () => {
    const created = await ensureSyncIdentity(root, "correct horse battery staple");
    const reopened = await ensureSyncIdentity(root, "correct horse battery staple");
    expect(reopened).toEqual(created);
    const stored = await fs.readFile(`${root}/sync-identity.json`, "utf8");
    expect(stored).not.toContain(created.syncSetId);
    expect(stored).not.toContain(created.keyId);
  });

  it("fails closed when a different key attempts to join", async () => {
    await ensureSyncIdentity(root, "first passphrase");
    await expect(ensureSyncIdentity(root, "wrong passphrase")).rejects.toThrow();
  });

  it("rejects packets from another sync set or key", () => {
    const identity = { syncSetId: randomUUID(), keyId: randomUUID() };
    expect(packetMatchesSyncIdentity({ _syncSetId: identity.syncSetId, _keyId: identity.keyId }, identity)).toBe(true);
    expect(packetMatchesSyncIdentity({ _syncSetId: randomUUID(), _keyId: identity.keyId }, identity)).toBe(false);
    expect(packetMatchesSyncIdentity({ _syncSetId: identity.syncSetId, _keyId: randomUUID() }, identity)).toBe(false);
  });
});
