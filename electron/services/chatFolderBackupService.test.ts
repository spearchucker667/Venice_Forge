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
}));

vi.mock("./chatStorage", () => ({
  listConversations: vi.fn(),
}));

import { readChatFolder } from "./chatFolderStorage";
import { listConversations } from "./chatStorage";
import { exportBackup, previewImport, importBackup } from "./chatFolderBackupService";
import type { ChatFolder } from "../../src/shared/chatFolderContracts";

const mockedReadChatFolder = vi.mocked(readChatFolder);
const mockedListConversations = vi.mocked(listConversations);

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
  mockedListConversations.mockResolvedValue({ conversations: [], total: 0, hasMore: false });
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
    expect(onDisk.publicHeader.sourceFolderName).toBe("Persona Creation");
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
