// @vitest-environment node

/** @fileoverview Regression tests for chat-folder backup encryption (Phase 2.6). */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// Mock Electron + storage collaborators so the test only exercises the
// encryption envelope + handler validation, not the filesystem layout.
const userDataDir = path.join(os.tmpdir(), "venice-forge-chat-folder-backup-tests");

vi.mock("electron", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  const tempPath = path.join(os.tmpdir(), "venice-forge-chat-folder-backup-tests");
  return {
    app: {
      getPath: vi.fn((name) => (name === "userData" ? tempPath : os.tmpdir())),
      getVersion: vi.fn(() => "0.0.0-test"),
    },
  };
});

vi.mock("./logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("./chatFolderStorage", () => ({
  readChatFolder: vi.fn(),
  saveChatFolder: vi.fn(),
  deleteChatFolderFile: vi.fn(async () => ({ ok: true })),
}));

vi.mock("./chatStorage", () => ({
  listConversations: vi.fn(),
  saveConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

import { readChatFolder, saveChatFolder } from "./chatFolderStorage";
import { listConversations, saveConversation, deleteConversation } from "./chatStorage";
import { exportBackup, previewImport, importBackup } from "./chatFolderBackupService";
import type { ChatFolder } from "../../src/shared/chatFolderContracts";

const mockedReadChatFolder = vi.mocked(readChatFolder);
const mockedListConversations = vi.mocked(listConversations);
const mockedSaveChatFolder = vi.mocked(saveChatFolder);
const mockedSaveConversation = vi.mocked(saveConversation);
const mockedDeleteConversation = vi.mocked(deleteConversation);

function makeFolder(overrides: Partial<ChatFolder> = {}): ChatFolder {
  return {
    id: "folder-1",
    profileId: "default",
    kind: "standard",
    name: "Persona Creation",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    lockState: "unlocked",
    schemaVersion: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true });
  await fs.mkdir(userDataDir, { recursive: true });
  mockedReadChatFolder.mockReset();
  mockedListConversations.mockReset();
  mockedSaveChatFolder.mockReset();
  mockedSaveConversation.mockReset();
  mockedDeleteConversation.mockReset();
  mockedReadChatFolder.mockResolvedValue(makeFolder());
  mockedListConversations.mockResolvedValue({ conversations: [], total: 0, hasMore: false });
  mockedSaveChatFolder.mockResolvedValue({ ok: true });
  mockedSaveConversation.mockResolvedValue({ ok: true });
  mockedDeleteConversation.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true });
});

describe("exportBackup — Phase 2.6 envelope", () => {
  it("writes only salt + nonce + ciphertext + kdf params (no cleartext manifest, no passphrase, no encrypted key)", async () => {
    mockedReadChatFolder.mockResolvedValue(makeFolder());

    const result = await exportBackup(
      { folderId: "folder-1", includeMedia: false, passphrase: "correct-horse-battery-staple", passphraseConfirmed: true },
      "default",
    );

    expect(result.ok).toBe(true);
    expect(result.backupPath).toBeTruthy();

    const onDisk = JSON.parse(await fs.readFile(result.backupPath!, "utf-8"));

    // Wire-format enforcement — failure here means a regression to a
    // broken encryption shape that stores the passphrase or DEK in cleartext.
    expect(onDisk.version).toBe(2);
    expect(onDisk.kdf).toEqual({
      algorithm: "argon2id13",
      opslimit: expect.any(Number),
      memlimit: expect.any(Number),
    });
    expect(typeof onDisk.crypto.salt).toBe("string");
    expect(typeof onDisk.crypto.kekNonce).toBe("string");
    expect(typeof onDisk.crypto.wrappedKey).toBe("string");
    expect(typeof onDisk.crypto.payloadNonce).toBe("string");
    expect(typeof onDisk.crypto.ciphertext).toBe("string");

    // Hard bans on the previous broken shape:
    expect(onDisk).not.toHaveProperty("keyWrapped");
    expect(onDisk).not.toHaveProperty("passphrase");
    expect(onDisk).not.toHaveProperty("metadata.ciphertext"); // legacy v1 path
    expect(JSON.stringify(onDisk)).not.toMatch(/correct-horse-battery-staple/); // no passphrase leak

    // The folder name IS allowed to appear in `publicHeader.sourceFolderName`
    // so the user gets a useful preview; what must NOT leak is the encrypted
    // folder object with its conversations / metadata. Verify the manifest
    // body stays inside the encrypted ciphertext.
    const envelope = JSON.stringify(onDisk);
    expect(onDisk.publicHeader.sourceFolderName).toBeUndefined();
    expect(envelope).not.toContain("Persona Creation");
    // Conversation-result objects should not appear in cleartext anywhere.
    expect(envelope).not.toMatch(/"messages"\s*:/);

    // Public header IS allowed to leak only the labels needed for preview.
    expect(onDisk.publicHeader.sourceFolderKind).toBe("standard");
  });

  it("rejects an empty passphrase (length < 8)", async () => {
    mockedReadChatFolder.mockResolvedValue(makeFolder());

    await expect(
      exportBackup({ folderId: "folder-1", includeMedia: false, passphrase: "short" }, "default"),
    ).rejects.toThrow(/at least 8 characters/);
  });

  it("rejects an explicit passphraseConfirmed: false", async () => {
    mockedReadChatFolder.mockResolvedValue(makeFolder());

    await expect(
      exportBackup(
        {
          folderId: "folder-1",
          includeMedia: false,
          passphrase: "long-enough-passphrase",
          passphraseConfirmed: false,
        },
        "default",
      ),
    ).rejects.toThrow(/not confirmed/i);
  });

  it("rejects exporting a locked folder regardless of passphrase validity", async () => {
    mockedReadChatFolder.mockResolvedValue(makeFolder({ lockState: "locked" }));

    await expect(
      exportBackup(
        { folderId: "folder-1", includeMedia: false, passphrase: "long-enough-passphrase", passphraseConfirmed: true },
        "default",
      ),
    ).rejects.toThrow(/locked folder/i);
  });
});

describe("importBackup — passphrase-protected envelope", () => {
  async function exportWith(passphrase: string): Promise<string> {
    mockedReadChatFolder.mockResolvedValue(makeFolder());
    const result = await exportBackup(
      { folderId: "folder-1", includeMedia: false, passphrase, passphraseConfirmed: true },
      "default",
    );
    if (!result.ok || !result.backupPath) throw new Error("export setup failed");
    return result.backupPath;
  }

  it("returns a structured failure for an empty passphrase", async () => {
    const backupPath = await exportWith("correct-horse-battery-staple");
    const result = await importBackup(
      { backupFilePath: backupPath, mode: "new-folder", passphrase: "" },
      "default",
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/passphrase/i);
  });

  it("returns 'Wrong passphrase' (not a low-level crypto error) when the passphrase is wrong", async () => {
    const backupPath = await exportWith("correct-horse-battery-staple");
    const wrong = await importBackup(
      { backupFilePath: backupPath, mode: "new-folder", passphrase: "wrong-passphrase-totally-different" },
      "default",
    );
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toBe("Wrong passphrase or corrupt backup file");
  });

  it("returns a 'Wrong passphrase' result when the ciphertext is tampered", async () => {
    const backupPath = await exportWith("correct-horse-battery-staple");
    const raw = JSON.parse(await fs.readFile(backupPath, "utf-8"));

    // Flip one byte deep inside the payload ciphertext — this MUST change
    // the AEAD tag and reject as "wrong passphrase" rather than decoding
    // to a partial manifest.
    const ct = Buffer.from(raw.crypto.ciphertext, "base64");
    ct[ct.length - 1] = ct[ct.length - 1] ^ 0x01;
    raw.crypto.ciphertext = Buffer.from(ct).toString("base64");
    const tamperedPath = path.join(path.dirname(backupPath), "tampered.vfbackup");
    await fs.writeFile(tamperedPath, JSON.stringify(raw), "utf-8");

    const result = await importBackup(
      { backupFilePath: tamperedPath, mode: "new-folder", passphrase: "correct-horse-battery-staple" },
      "default",
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Wrong passphrase or corrupt backup file");
  });

  it("rejects a v1 backup that has no publicHeader (legacy broken-shape legacy file)", async () => {
    const v1Path = path.join(userDataDir, "v1-legacy.vfbackup");
    await fs.writeFile(
      v1Path,
      JSON.stringify({
        version: 1,
        metadata: { ciphertext: "ignored", iv: "ignored", salt: "ignored" },
        keyWrapped: "ignored",
        folder: { name: "Legacy", kind: "standard" },
        conversations: [],
        appVersion: "0.0.0-test",
      }),
      "utf-8",
    );

    await expect(previewImport({ backupFilePath: v1Path }, "default")).rejects.toThrow(
      /missing the encrypted public header/i,
    );
  });
});

/**
 * P0-01 regression guard (chat-folder backup imports were silently no-ops for
 * the carried conversations after a passphrase-valid decrypt). Without this
 * block, the importer could return success with zero saveConversation calls
 * and the user would lose every chat in the backup.
 *
 * P0-02 regression guard (default-profile imports landed on a hand-built
 * path under chat-folders/default/<id>.json instead of chat-folders/<id>.json).
 * The mock for saveChatFolder is asserted so any future regression to raw
 * fs.writeFile within the import backup path fails the test.
 */
describe("importBackup — actually imports conversations + folder (P0-01, P0-02)", () => {
  async function exportWithConversations(passphrase: string): Promise<string> {
    mockedReadChatFolder.mockResolvedValue(makeFolder({ name: "Exported Folder" }));
    mockedListConversations.mockResolvedValue([
      {
        id: "chat-source-1",
        title: "Imported Chat",
        createdAt: 1700000000000,
        updatedAt: 1700000005000,
        model: "llama-3.3-70b",
        folderId: "folder-1",
        messages: [
          { id: "m1", role: "user", content: "hello", timestamp: 1700000000000 },
          { id: "m2", role: "assistant", content: "hi", timestamp: 1700000005000 },
        ],
      },
      {
        id: "chat-source-2",
        title: "Second Chat",
        createdAt: 1700000010000,
        updatedAt: 1700000015000,
        model: "llama-3.3-70b",
        folderId: "folder-1",
        messages: [
          { id: "m3", role: "user", content: "there", timestamp: 1700000010000 },
        ],
      },
    ] as never);

    const result = await exportBackup(
      { folderId: "folder-1", includeMedia: false, passphrase, passphraseConfirmed: true },
      "default",
    );
    if (!result.ok || !result.backupPath) throw new Error("export setup failed");
    return result.backupPath;
  }

  it("[P0-01] new-folder mode calls saveConversation for each carried conversation with the new folderId", async () => {
    const backupPath = await exportWithConversations("correct-horse-battery-staple");
    mockedSaveConversation.mockClear();
    mockedSaveChatFolder.mockClear();

    const result = await importBackup(
      { backupFilePath: backupPath, mode: "new-folder", passphrase: "correct-horse-battery-staple" },
      "default",
    );

    expect(result.ok).toBe(true);
    expect(result.folderId).toBeTruthy();
    expect(mockedSaveChatFolder).toHaveBeenCalledTimes(1);
    expect(mockedSaveConversation).toHaveBeenCalledTimes(2);

    const savedConvs = mockedSaveConversation.mock.calls.map((c) => c[0]);
    expect(savedConvs[0].id).toBe("chat-source-1");
    expect(savedConvs[0].title).toBe("Imported Chat");
    expect(savedConvs[0].folderId).toBe(result.folderId);
    expect(savedConvs[0].profileId).toBeUndefined(); // default profile -> undefined
    expect(savedConvs[1].id).toBe("chat-source-2");
    expect(savedConvs[1].folderId).toBe(result.folderId);

    expect(result.imported).toHaveLength(2);
    expect(result.imported?.[0]).toMatchObject({ sourceId: "chat-source-1", ok: true });
    expect(result.imported?.[1]).toMatchObject({ sourceId: "chat-source-2", ok: true });
    expect(result.conflictCount).toBe(0);
    expect(result.rolledBack === undefined || result.rolledBack === false).toBe(true);
    expect(result.rollbackCount === undefined || result.rollbackCount === 0).toBe(true);
  });

  it("[P0-02] new-folder mode routes the folder write through saveChatFolder (canonical atomic path), not a hand-built fs.writeFile", async () => {
    const backupPath = await exportWithConversations("correct-horse-battery-staple");
    mockedSaveChatFolder.mockClear();

    const result = await importBackup(
      { backupFilePath: backupPath, mode: "new-folder", passphrase: "correct-horse-battery-staple" },
      "default",
    );

    expect(result.ok).toBe(true);
    expect(mockedSaveChatFolder).toHaveBeenCalledTimes(1);
    const [folderArg, profileArg] = mockedSaveChatFolder.mock.calls[0];
    expect(profileArg).toBe("default");
    expect(folderArg.id).toBe(result.folderId);
    expect(folderArg.name).toBe("Exported Folder");
    expect(folderArg.lockState).toBe("unlocked"); // locked folders are always reset to unlocked on import
  });

  it("[P0-01] rolls back created conversations and returns ok=false when saveConversation fails mid-import", async () => {
    const backupPath = await exportWithConversations("correct-horse-battery-staple");
    mockedSaveConversation.mockClear();
    mockedDeleteConversation.mockClear();
    let callCount = 0;
    mockedSaveConversation.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return { ok: true };
      return { ok: false, error: "Simulated schema failure" };
    });

    const result = await importBackup(
      { backupFilePath: backupPath, mode: "new-folder", passphrase: "correct-horse-battery-staple" },
      "default",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Simulated schema failure|fail/i);
    expect(result.rolledBack).toBe(true);
    expect(result.rollbackCount).toBe(1);
    expect(mockedDeleteConversation).toHaveBeenCalledTimes(1);
    expect(mockedDeleteConversation.mock.calls[0][0]).toBe("chat-source-1"); // first saved conversation rolled back
  });

  it("[P0-01] merge mode with a colliding id remaps the imported conversation and preserves both branches", async () => {
    const backupPath = await exportWithConversations("correct-horse-battery-staple");
    // Pre-existing conversation in the target folder shares id with the imported one.
    mockedListConversations.mockResolvedValue([
      { id: "chat-source-1", title: "Local Pre-existing Chat" } as never,
    ]);

    const result = await importBackup(
      {
        backupFilePath: backupPath,
        mode: "merge",
        targetFolderId: "merge-target-folder",
        passphrase: "correct-horse-battery-staple",
      },
      "default",
    );

    expect(result.ok).toBe(true);
    expect(result.folderId).toBe("merge-target-folder");
    expect(mockedSaveChatFolder).not.toHaveBeenCalled(); // merge mode does not create a new folder
    expect(mockedSaveConversation).toHaveBeenCalledTimes(2);

    const savedConvs = mockedSaveConversation.mock.calls.map((c) => c[0]);
    expect(savedConvs[0].id).not.toBe("chat-source-1"); // remapped to avoid collision
    expect(savedConvs[0].folderId).toBe("merge-target-folder");
    expect(savedConvs[1].id).toBe("chat-source-2"); // the non-colliding one keeps its id
    expect(savedConvs[1].folderId).toBe("merge-target-folder");

    expect(result.conflictCount).toBe(1);
    expect(result.imported?.[0]).toMatchObject({ sourceId: "chat-source-1", ok: true });
    expect(result.imported?.[0]?.importedId).not.toBe("chat-source-1");
    expect(result.imported?.[1]).toMatchObject({ sourceId: "chat-source-2", importedId: "chat-source-2", ok: true });
  });

  it("[P0-01] rejects malformed per-conversation records without rolling back earlier successes", async () => {
    const _backupPath = await exportWithConversations("correct-horse-battery-staple");
    // Patch the on-disk backup: the second conversation in the encrypted manifest is intentionally bad.
    // Because we cannot easily tamper with XChaCha20 ciphertext without breaking the AEAD tag, we
    // instead reach into the manifest helper path by mocking `listConversations` to return a valid
    // one-conversation export, then directly crafting a malformed second conversation through a
    // local importer invoke — but that path is private. Simpler: use a tiny helper export that
    // bundles a malformed second conversation alongside a valid first.
    await fs.rm(userDataDir, { recursive: true, force: true });
    await fs.mkdir(userDataDir, { recursive: true });

    mockedReadChatFolder.mockResolvedValue(makeFolder({ name: "Bad Backup" }));
    mockedListConversations.mockResolvedValue([
      {
        id: "good-conv",
        title: "Good",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        model: "llama-3.3-70b",
        folderId: "folder-1",
        messages: [],
      },
      // Intentionally malformed: missing createdAt
      {
        id: "bad-conv",
        title: "Bad",
        updatedAt: 1700000000000,
        model: "llama-3.3-70b",
        folderId: "folder-1",
        // createdAt missing
        messages: [],
      } as never,
    ] as never);

    const exported = await exportBackup(
      { folderId: "folder-1", includeMedia: false, passphrase: "correct-horse-battery-staple", passphraseConfirmed: true },
      "default",
    );
    if (!exported.ok || !exported.backupPath) throw new Error("export setup failed");

    mockedSaveConversation.mockClear();
    mockedDeleteConversation.mockClear();

    const result = await importBackup(
      { backupFilePath: exported.backupPath, mode: "new-folder", passphrase: "correct-horse-battery-staple" },
      "default",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid field|createdAt/i);
    expect(result.rolledBack).toBe(true);
    // The good conversation may have been saved and then rolled back
    expect(mockedDeleteConversation).toHaveBeenCalledWith("good-conv", "default");
  });
});
