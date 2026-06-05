/**
 * @fileoverview VERIFY-012 — RP chat storage invariants.
 *
 * Regression guard for `electron/services/rpChatStorage.ts`. Locks:
 *   - Atomic write under `<userData>/rp-chats/<id>.json`
 *   - ID validation against VALID_ID_RE
 *   - `MAX_ACTIVE_CHARACTERS` (8) cap on `characterIds`
 *   - Round-trip: save → list → get → delete is consistent
 *   - Corruption recovery
 */

// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
}));

import {
  getRpChatsDir,
  listRpChats,
  readRpChat,
  saveRpChat,
  deleteRpChat,
} from "../../electron/services/rpChatStorage";
import type { RpChatV1 } from "../../src/types/rp";

async function cleanDir() {
  const dir = getRpChatsDir();
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      await fs.rm(path.join(dir, entry), { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}

function makeChat(id: string, characterIds: string[] = ["a"]): RpChatV1 {
  return {
    schema: "RpChatV1",
    id,
    title: "Test",
    characterIds,
    lorebookIds: [],
    modelId: "venice-uncensored",
    messages: [],
    adult: false,
    metadata: { pinned: false, archived: false, tags: [] },
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

describe("VERIFY-012 rpChatStorage", () => {
  beforeEach(async () => {
    await cleanDir();
  });
  afterEach(async () => {
    await cleanDir();
  });

  it("round-trips a chat", async () => {
    const r = await saveRpChat(makeChat("c1"));
    expect(r.ok).toBe(true);
    const read = await readRpChat("c1");
    expect(read).not.toBeNull();
    expect(read!.id).toBe("c1");
    expect(read!.modelId).toBe("venice-uncensored");
  });

  it("rejects chats exceeding MAX_ACTIVE_CHARACTERS", async () => {
    const ids = Array.from({ length: 9 }, (_, i) => `c${i}`);
    const result = await saveRpChat(makeChat("c4", ids));
    expect(result.ok).toBe(false);
  });

  it("rejects IDs that violate VALID_ID_RE", async () => {
    expect((await saveRpChat(makeChat(".."))).ok).toBe(false);
    expect((await saveRpChat(makeChat("with/slash"))).ok).toBe(false);
    expect((await saveRpChat(makeChat("a".repeat(200)))).ok).toBe(false);
  });

  it("lists saved chats", async () => {
    await saveRpChat(makeChat("a"));
    await saveRpChat(makeChat("b"));
    const { chats, truncated } = await listRpChats();
    expect(chats.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(truncated).toBe(false);
  });

  it("deletes a chat", async () => {
    await saveRpChat(makeChat("z"));
    const r = await deleteRpChat("z");
    expect(r.ok).toBe(true);
    expect(await readRpChat("z")).toBeNull();
  });

  it("survives a corrupted chat.json (renames to .backup.<ts>.<uuid>)", async () => {
    await saveRpChat(makeChat("corrupt"));
    const filePath = path.join(getRpChatsDir(), "corrupt.json");
    await fs.writeFile(filePath, "{ not valid json");
    const { chats } = await listRpChats();
    expect(chats.find((c) => c.id === "corrupt")).toBeUndefined();
    // The backup file should exist (next to the original)
    const dirEntries = await fs.readdir(getRpChatsDir());
    const backup = dirEntries.find((e) => e.startsWith("corrupt.json.backup."));
    expect(backup).toBeDefined();
  });
});
