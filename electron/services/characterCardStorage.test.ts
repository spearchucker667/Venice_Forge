// @vitest-environment node

/** @fileoverview Unit tests for Electron main-process character card storage. */

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
  getCharactersDir,
  listCharacterCards,
  readCharacterCard,
  saveCharacterCard,
  deleteCharacterCard,
  isValidId,
} from "./characterCardStorage";
import type { CharacterCardV1 } from "../../src/types/rp";

function makeCard(overrides: Partial<CharacterCardV1> = {}): CharacterCardV1 {
  const id = overrides.id ?? "card-aaa111";
  return {
    schema: "CharacterCardV1",
    id,
    name: "Aria",
    description: "A friendly test character.",
    systemPrompt: "You are Aria.",
    scenario: "A test scenario.",
    tags: ["test", "friendly"],
    adult: false,
    exampleDialogues: [
      { speaker: "Aria", text: "Hello, traveller." },
    ],
    modelId: "venice-uncensored",
    author: "tester",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

async function cleanDir() {
  const dir = getCharactersDir();
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      await fs.rm(path.join(dir, entry), { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}

describe("characterCardStorage", () => {
  beforeEach(async () => {
    await cleanDir();
  });
  afterEach(async () => {
    await cleanDir();
  });

  describe("isValidId", () => {
    it("accepts alphanumerics, dot, dash, underscore", () => {
      expect(isValidId("a")).toBe(true);
      expect(isValidId("a".repeat(128))).toBe(true);
      expect(isValidId("card_v1.test-x")).toBe(true);
    });
    it("rejects path traversal attempts and empty strings", () => {
      expect(isValidId("")).toBe(false);
      expect(isValidId(".")).toBe(false);
      expect(isValidId("..")).toBe(false);
      expect(isValidId("a/b")).toBe(false);
      expect(isValidId("..a")).toBe(false);
      expect(isValidId(".hidden")).toBe(false);
      expect(isValidId("a".repeat(129))).toBe(false);
      expect(isValidId(null)).toBe(false);
      expect(isValidId(undefined)).toBe(false);
      expect(isValidId(42)).toBe(false);
    });
    it("rejects Windows reserved basenames and prototype pollution ids", () => {
      const invalidIds = [
        "con",
        "CON",
        "nul",
        "NUL",
        "prn",
        "aux",
        "com1",
        "lpt1",
        "con.txt",
        "nul.json",
        "__proto__",
        "constructor",
        "prototype",
      ];
      for (const id of invalidIds) {
        expect(isValidId(id)).toBe(false);
      }
    });
  });

  describe("saveCharacterCard + readCharacterCard", () => {
    it("round-trips a card without an avatar", async () => {
      const card = makeCard();
      const result = await saveCharacterCard(card);
      expect(result).toEqual({ ok: true });
      const loaded = await readCharacterCard(card.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(card.id);
      expect(loaded!.name).toBe(card.name);
      expect(loaded!.description).toBe(card.description);
      expect(loaded!.systemPrompt).toBe(card.systemPrompt);
      expect(loaded!.tags).toEqual(card.tags);
      expect(loaded!.exampleDialogues).toEqual(card.exampleDialogues);
      expect(loaded!.avatar).toBeUndefined();
    });

    it("round-trips Character Card V2 compatibility fields and version snapshots", async () => {
      const card = makeCard({
        id: "card-v2-roundtrip",
        personality: "Careful and curious",
        creatorNotes: "Display only",
        postHistoryInstructions: "Answer the latest message",
        firstMessage: "Hello",
        alternateGreetings: ["Welcome", "Good evening"],
        characterVersion: "2.0.1",
        tavernExtensions: { "fixture.namespace": { enabled: true } },
        embeddedCharacterBook: {
          extensions: {},
          entries: [{ keys: ["archive"], content: "Synthetic lore", extensions: {}, enabled: true, insertion_order: 1 }],
        },
        rawExampleDialogue: "{{user}}: Hi\n{{char}}: Hello",
        sourceFormat: "card-v2-json",
        versions: [{
          id: "version-1",
          createdAt: 1,
          snapshot: {
            name: "Aria",
            description: "Original",
            systemPrompt: "Original prompt",
            tags: [],
            adult: false,
            exampleDialogues: [],
            personality: "Original personality",
            tavernExtensions: { "fixture.version": 1 },
          },
        }],
        currentVersionId: "version-1",
      });
      expect(await saveCharacterCard(card)).toEqual({ ok: true });
      const loaded = await readCharacterCard(card.id);
      expect(loaded).toMatchObject({
        personality: card.personality,
        creatorNotes: card.creatorNotes,
        postHistoryInstructions: card.postHistoryInstructions,
        alternateGreetings: card.alternateGreetings,
        characterVersion: card.characterVersion,
        tavernExtensions: card.tavernExtensions,
        rawExampleDialogue: card.rawExampleDialogue,
        sourceFormat: card.sourceFormat,
        currentVersionId: "version-1",
        schemaVersion: 3,
      });
      expect(loaded?.embeddedCharacterBook?.entries).toHaveLength(1);
      expect(loaded?.versions?.[0]?.snapshot.personality).toBe("Original personality");
    });

    it("persists avatar bytes to a separate avatar.png file", async () => {
      // 1x1 transparent PNG base64.
      const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      const card = makeCard({
        id: "card-avatar-1",
        avatar: { data: png, mimeType: "image/png", byteLength: png.length },
      });
      const result = await saveCharacterCard(card);
      expect(result).toEqual({ ok: true });

      const loaded = await readCharacterCard(card.id);
      expect(loaded!.avatar).toBeDefined();
      expect(loaded!.avatar!.data).toBe(png);
      expect(loaded!.avatar!.byteLength).toBeGreaterThan(0);

      // The avatar file exists on disk and matches the decoded buffer.
      const avatarPath = path.join(getCharactersDir(), card.id, "avatar.png");
      const buf = await fs.readFile(avatarPath);
      expect(buf.length).toBe(loaded!.avatar!.byteLength);
    });

    it("rejects an avatar that exceeds MAX_AVATAR_BYTES", async () => {
      const card = makeCard({
        id: "card-big-avatar",
        avatar: { data: "A".repeat(10), mimeType: "image/png", byteLength: 2_000_000_000 },
      });
      const result = await saveCharacterCard(card);
      expect(result.ok).toBe(false);
    });

    it("rejects invalid id", async () => {
      const card = makeCard({ id: "..bad" });
      const result = await saveCharacterCard(card);
      expect(result.ok).toBe(false);
    });

    it("truncates oversized fields to CARD_FIELD_MAX", async () => {
      const card = makeCard({
        name: "x".repeat(40_000),
        description: "y".repeat(40_000),
      });
      const result = await saveCharacterCard(card);
      expect(result).toEqual({ ok: true });
      const loaded = await readCharacterCard(card.id);
      expect(loaded!.name.length).toBe(32_000);
      expect(loaded!.description.length).toBe(32_000);
    });

    it("deduplicates tags case-insensitively and caps at MAX_TAGS", async () => {
      const card = makeCard({
        tags: ["A", "a", "A", "b", "b", ...Array.from({ length: 40 }, (_, i) => `t${i}`)],
      });
      const result = await saveCharacterCard(card);
      expect(result).toEqual({ ok: true });
      const loaded = await readCharacterCard(card.id);
      expect(loaded!.tags.length).toBeLessThanOrEqual(32);
      const seen = new Set(loaded!.tags.map((t) => t.toLowerCase()));
      expect(seen.size).toBe(loaded!.tags.length);
    });
  });

  describe("listCharacterCards", () => {
    it("returns cards sorted by updatedAt desc", async () => {
      const a = makeCard({ id: "card-list-a", updatedAt: 100 });
      const b = makeCard({ id: "card-list-b", updatedAt: 200 });
      const c = makeCard({ id: "card-list-c", updatedAt: 150 });
      await saveCharacterCard(a);
      await saveCharacterCard(b);
      await saveCharacterCard(c);
      const result = await listCharacterCards();
      expect(result.cards.map((x) => x.id)).toEqual(["card-list-b", "card-list-c", "card-list-a"]);
      expect(result.truncated).toBe(false);
    });

    it("skips directories that do not match the id pattern", async () => {
      const dir = getCharactersDir();
      await fs.mkdir(path.join(dir, "not-an-id"), { recursive: true });
      await fs.writeFile(path.join(dir, "not-an-id", "character.json"), "{}", "utf-8");
      const card = makeCard({ id: "card-valid-1" });
      await saveCharacterCard(card);
      const result = await listCharacterCards();
      expect(result.cards.some((c) => c.id === "card-valid-1")).toBe(true);
      expect(result.cards.some((c) => c.id === "not-an-id")).toBe(false);
    });
  });

  describe("deleteCharacterCard", () => {
    it("removes the card directory", async () => {
      const card = makeCard({ id: "card-del-1" });
      await saveCharacterCard(card);
      const result = await deleteCharacterCard(card.id);
      expect(result.ok).toBe(true);
      const loaded = await readCharacterCard(card.id);
      expect(loaded).toBeNull();
    });

    it("returns ok for a missing id", async () => {
      const result = await deleteCharacterCard("card-missing");
      expect(result.ok).toBe(true);
    });

    it("rejects invalid id", async () => {
      const result = await deleteCharacterCard("..");
      expect(result.ok).toBe(false);
    });
  });
});
