// @vitest-environment node

/** @fileoverview Unit tests for Electron main-process RP chat storage. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";

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
  isValidId,
} from "./rpChatStorage";
import type { RpChatV1, RpMessageV1 } from "../../src/types/rp";

function makeMessage(overrides: Partial<RpMessageV1> = {}): RpMessageV1 {
  return {
    id: "m1",
    role: "user",
    content: "hello",
    createdAt: 1700000000000,
    ...overrides,
  };
}

function makeChat(overrides: Partial<RpChatV1> = {}): RpChatV1 {
  return {
    schema: "RpChatV1",
    id: "chat-1",
    title: "Test RP",
    characterIds: ["card-aaa"],
    lorebookIds: [],
    modelId: "venice-uncensored",
    adult: false,
    messages: [makeMessage()],
    metadata: { pinned: false, archived: false, tags: [] },
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

async function cleanDir() {
  const dir = getRpChatsDir();
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      await fs.unlink(path.join(dir, entry));
    }
  } catch {
    // ignore
  }
}

describe("rpChatStorage", () => {
  beforeEach(async () => {
    await cleanDir();
  });
  afterEach(async () => {
    await cleanDir();
  });

  describe("isValidId", () => {
    it("accepts safe ids", () => {
      expect(isValidId("chat-1")).toBe(true);
      expect(isValidId("a")).toBe(true);
    });
    it("rejects path traversal", () => {
      expect(isValidId(".")).toBe(false);
      expect(isValidId("..")).toBe(false);
      expect(isValidId("a/b")).toBe(false);
      expect(isValidId("")).toBe(false);
    });
  });

  describe("saveRpChat + readRpChat", () => {
    it("round-trips a valid chat", async () => {
      const chat = makeChat();
      const r = await saveRpChat(chat);
      expect(r).toEqual({ ok: true });
      const loaded = await readRpChat(chat.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(chat.id);
      expect(loaded!.messages).toHaveLength(1);
    });

    it("rejects a chat with no active characters", async () => {
      const chat = makeChat({ characterIds: [] });
      const r = await saveRpChat(chat);
      expect(r.ok).toBe(false);
    });

    it("rejects too many active characters", async () => {
      const chat = makeChat({ characterIds: Array.from({ length: 9 }, (_, i) => `c${i}`) });
      const r = await saveRpChat(chat);
      expect(r.ok).toBe(false);
    });

    it("requires characterId on character-role messages", async () => {
      const chat = makeChat({
        messages: [
          { id: "m1", role: "character", content: "hi", createdAt: 1 } as RpMessageV1,
        ],
      });
      const r = await saveRpChat(chat);
      expect(r.ok).toBe(false);
    });

    it("accepts a character-role message with valid characterId", async () => {
      const chat = makeChat({
        messages: [
          {
            id: "m1",
            role: "character",
            characterId: "card-aaa",
            content: "hi",
            createdAt: 1,
          },
        ],
      });
      const r = await saveRpChat(chat);
      expect(r).toEqual({ ok: true });
      const loaded = await readRpChat(chat.id);
      expect(loaded!.messages[0].role).toBe("character");
      expect(loaded!.messages[0].characterId).toBe("card-aaa");
    });

    it("rejects invalid id", async () => {
      const chat = makeChat({ id: "..bad" });
      const r = await saveRpChat(chat);
      expect(r.ok).toBe(false);
    });
  });

  describe("listRpChats", () => {
    it("returns chats sorted by updatedAt desc", async () => {
      await saveRpChat(makeChat({ id: "chat-a", updatedAt: 100 }));
      await saveRpChat(makeChat({ id: "chat-b", updatedAt: 200 }));
      const r = await listRpChats();
      expect(r.chats.map((c) => c.id)).toEqual(["chat-b", "chat-a"]);
    });
  });

  describe("deleteRpChat", () => {
    it("removes the chat file", async () => {
      await saveRpChat(makeChat({ id: "chat-del" }));
      const r = await deleteRpChat("chat-del");
      expect(r.ok).toBe(true);
      const loaded = await readRpChat("chat-del");
      expect(loaded).toBeNull();
    });

    it("is ok for missing id", async () => {
      const r = await deleteRpChat("chat-missing");
      expect(r.ok).toBe(true);
    });

    it("rejects invalid id", async () => {
      const r = await deleteRpChat("..");
      expect(r.ok).toBe(false);
    });
  });
});
