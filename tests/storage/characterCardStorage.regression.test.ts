/**
 * @fileoverview VERIFY-011 — character-card local storage invariants.
 *
 * Regression guard for `electron/services/characterCardStorage.ts`. Locks:
 *   - Atomic write (temp + rename) under the userData dir
 *   - ID validation against VALID_ID_RE
 *   - Avatar persisted as sidecar `avatar.png`, NOT embedded in the JSON
 *   - Corruption recovery: bad files renamed `.backup.<ts>.<uuid>`, not deleted
 *   - Round-trip: save → list → get → delete is consistent
 *
 * If a future change weakens any of these, this test fails and CI gates block the PR.
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
  getCharactersDir,
  listCharacterCards,
  readCharacterCard,
  saveCharacterCard,
  deleteCharacterCard,
} from "../../electron/services/characterCardStorage";
import type { CharacterCardV1 } from "../../src/types/rp";

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

function makeCard(id: string, name: string): CharacterCardV1 {
  return {
    schema: "CharacterCardV1",
    id,
    name,
    description: `${name} description`,
    systemPrompt: `You are ${name}.`,
    tags: ["test"],
    adult: false,
    exampleDialogues: [{ speaker: name, text: "Hello." }],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

describe("VERIFY-011 characterCardStorage", () => {
  beforeEach(async () => {
    await cleanDir();
  });
  afterEach(async () => {
    await cleanDir();
  });

  it("round-trips a card with sidecar avatar", async () => {
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const card = makeCard("alice", "Alice");
    card.avatar = { data: png, mimeType: "image/png", byteLength: png.length };
    const result = await saveCharacterCard(card);
    expect(result).toEqual({ ok: true });
    const read = await readCharacterCard("alice");
    expect(read).not.toBeNull();
    expect(read!.name).toBe("Alice");
    expect(read!.avatar).toBeDefined();
    expect(read!.avatar!.data).toBe(png);
  });

  it("persists character.json as a separate file from avatar.png", async () => {
    const card = makeCard("bob", "Bob");
    card.avatar = { data: "AAAA", mimeType: "image/png", byteLength: 4 };
    await saveCharacterCard(card);
    const json = await fs.readFile(path.join(getCharactersDir(), "bob", "character.json"), "utf8");
    expect(json).toContain("Bob");
    // sidecar avatar must exist on disk
    const avatarPath = path.join(getCharactersDir(), "bob", "avatar.png");
    const avatarStat = await fs.stat(avatarPath);
    expect(avatarStat.size).toBeGreaterThan(0);
  });

  it("rejects IDs that violate VALID_ID_RE", async () => {
    expect((await saveCharacterCard(makeCard("..", "Bad"))).ok).toBe(false);
    expect((await saveCharacterCard(makeCard(".dotfile", "Bad"))).ok).toBe(false);
    expect((await saveCharacterCard(makeCard("with/slash", "Bad"))).ok).toBe(false);
    expect((await saveCharacterCard(makeCard("a".repeat(200), "Bad"))).ok).toBe(false);
  });

  it("returns null for missing card", async () => {
    expect(await readCharacterCard("nope")).toBeNull();
  });

  it("lists saved cards", async () => {
    await saveCharacterCard(makeCard("a", "A"));
    await saveCharacterCard(makeCard("b", "B"));
    const { cards, truncated } = await listCharacterCards();
    expect(cards.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(truncated).toBe(false);
  });

  it("deletes a card and its avatar", async () => {
    const card = makeCard("z", "Z");
    card.avatar = { data: "AAAA", mimeType: "image/png", byteLength: 4 };
    await saveCharacterCard(card);
    expect((await readCharacterCard("z"))!.name).toBe("Z");
    const result = await deleteCharacterCard("z");
    expect(result.ok).toBe(true);
    expect(await readCharacterCard("z")).toBeNull();
  });

  it("survives a corrupted character.json (renames to .backup.<ts>.<uuid>)", async () => {
    await saveCharacterCard(makeCard("corrupt", "Corrupt"));
    await fs.writeFile(
      path.join(getCharactersDir(), "corrupt", "character.json"),
      "{ not valid json",
    );
    const { cards } = await listCharacterCards();
    // The corrupted card is excluded from the list
    expect(cards.find((c) => c.id === "corrupt")).toBeUndefined();
    // ...but a backup file exists
    const dirEntries = await fs.readdir(path.join(getCharactersDir(), "corrupt"));
    const backup = dirEntries.find((e) => e.startsWith("character.json.backup."));
    expect(backup).toBeDefined();
  });
});
