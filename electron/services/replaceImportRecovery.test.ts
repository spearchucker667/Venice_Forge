// VERIFY-123 regression guard: replace-import recovery files are private, atomic,
// profile-bound, decryptable before use, and discoverable after restart.
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const decryptPayload = vi.hoisted(() => vi.fn());

vi.mock("./backupCrypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./backupCrypto")>();
  return { ...actual, decryptPayload };
});

import {
  getLatestReplaceImportRecovery,
  loadReplaceImportRecovery,
  persistReplaceImportRecovery,
} from "./replaceImportRecovery";

const manifest = {
  version: 2,
  exportedAt: "2026-07-15T00:00:00.000Z",
  salt: "c2FsdA==",
  iv: "aXY=",
  ciphertext: "Y2lwaGVy",
};

describe("replaceImportRecovery", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "vf-replace-recovery-"));
    decryptPayload.mockReset();
    decryptPayload.mockResolvedValue(JSON.stringify({
      _veniceForgeBackup: { profileId: "work" },
      conversations: [{ id: "conversation-1", profileId: "work" }],
    }));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("persists and reloads a verified private recovery artifact", async () => {
    const metadata = await persistReplaceImportRecovery(root, "work", manifest, "password");

    await expect(getLatestReplaceImportRecovery(root, "work")).resolves.toEqual(metadata);
    await expect(loadReplaceImportRecovery(root, "work", metadata.id, "password")).resolves.toEqual(manifest);

    const file = path.join(root, "replace-import-recovery", "work", `${metadata.id}.json`);
    const fileStat = await fs.stat(file);
    expect(fileStat.isFile()).toBe(true);
    // Windows does not implement POSIX permission bits and reports a synthetic
    // mode even when writeFile/chmod receive 0o600. Keep the security assertion
    // on platforms where the filesystem can actually enforce that contract.
    if (process.platform !== "win32") {
      expect(fileStat.mode & 0o777).toBe(0o600);
    }
    expect(decryptPayload).toHaveBeenCalledWith(manifest.ciphertext, manifest.salt, manifest.iv, "password");
  });

  it("rejects a recovery payload that belongs to another profile", async () => {
    decryptPayload.mockResolvedValueOnce(JSON.stringify({
      _veniceForgeBackup: { profileId: "default" },
      conversations: [{ id: "conversation-1", profileId: "default" }],
    }));

    await expect(persistReplaceImportRecovery(root, "work", manifest, "password"))
      .rejects.toThrow(/profile/i);
    await expect(getLatestReplaceImportRecovery(root, "work")).resolves.toBeNull();
  });

  it("fails closed when a persisted artifact cannot be decrypted", async () => {
    const metadata = await persistReplaceImportRecovery(root, "work", manifest, "password");
    decryptPayload.mockRejectedValueOnce(new Error("bad password"));

    await expect(loadReplaceImportRecovery(root, "work", metadata.id, "wrong"))
      .rejects.toThrow(/bad password/i);
  });
});
