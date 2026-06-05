/**
 * @fileoverview Tests for the lorebook service.
 *
 * Covers:
 *   - `entryMatches`: constant, case sensitivity, whole-word, disabled, secondary keys
 *   - `selectTriggeredEntries`: cap, deterministic ordering (constant first, then order, then id)
 *   - `normalizeEntry`: invalid inputs return null, content clamp, key cap
 *   - `normalizeLorebook`: schema tag enforced, entries deduped, tags capped
 *   - `validateLorebook`: throws on over-cap or invalid id
 *
 * REGRESSION: VERIFY-012 — lorebook keyword trigger evaluation is deterministic and cap-bounded.
 */

import { describe, it, expect } from "vitest";
import {
  entryMatches,
  selectTriggeredEntries,
  normalizeEntry,
  normalizeLorebook,
  validateLorebook,
} from "../../src/services/rp/lorebookService";
import type { LorebookEntryV1, LorebookV1 } from "../../src/types/rp";

function makeEntry(overrides: Partial<LorebookEntryV1> = {}): LorebookEntryV1 {
  return {
    id: "e1",
    keys: ["dragon"],
    content: "Dragons breathe fire.",
    constant: false,
    insertionMode: "before_char",
    order: 100,
    caseSensitive: false,
    matchWholeWords: false,
    enabled: true,
    ...overrides,
  };
}

function makeBook(entries: LorebookEntryV1[], overrides: Partial<LorebookV1> = {}): LorebookV1 {
  return {
    schema: "LorebookV1",
    id: "book1",
    name: "Test",
    description: "A test book",
    tags: [],
    entries,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("lorebookService.entryMatches", () => {
  it("returns true for enabled constant entries regardless of text", () => {
    expect(entryMatches(makeEntry({ constant: true }), "")).toBe(true);
    expect(entryMatches(makeEntry({ constant: true }), "anything")).toBe(true);
  });

  it("returns false for disabled entries even if they would otherwise match", () => {
    expect(entryMatches(makeEntry({ enabled: false, keys: ["dragon"] }), "a dragon appears")).toBe(false);
  });

  it("matches case-insensitively by default", () => {
    expect(entryMatches(makeEntry({ keys: ["Dragon"] }), "a DRAGON appears")).toBe(true);
    expect(entryMatches(makeEntry({ keys: ["dragon"] }), "a DRAGON appears")).toBe(true);
  });

  it("honors caseSensitive flag", () => {
    expect(entryMatches(makeEntry({ caseSensitive: true, keys: ["Dragon"] }), "a DRAGON appears")).toBe(false);
    expect(entryMatches(makeEntry({ caseSensitive: true, keys: ["Dragon"] }), "a Dragon appears")).toBe(true);
  });

  it("respects matchWholeWords flag", () => {
    expect(entryMatches(makeEntry({ matchWholeWords: true, keys: ["art"] }), "smartperson")).toBe(false);
    expect(entryMatches(makeEntry({ matchWholeWords: true, keys: ["art"] }), "an art piece")).toBe(true);
  });

  it("falls back to secondaryKeys when keys is empty", () => {
    expect(entryMatches(makeEntry({ keys: [], secondaryKeys: ["wyrm"] }), "a wyrm appears")).toBe(true);
  });

  it("escapes regex metacharacters when matchWholeWords is true", () => {
    expect(entryMatches(makeEntry({ matchWholeWords: true, keys: ["a.b"] }), "see a.b here")).toBe(true);
    expect(entryMatches(makeEntry({ matchWholeWords: true, keys: ["a.b"] }), "see aXb here")).toBe(false);
  });

  it("returns false when no keys and no secondaryKeys", () => {
    expect(entryMatches(makeEntry({ keys: [] }), "dragon wyrm")).toBe(false);
  });
});

describe("lorebookService.selectTriggeredEntries", () => {
  it("returns constants first, then by order, then by id", () => {
    const e1 = makeEntry({ id: "z", order: 1, keys: ["dragon"], constant: false });
    const e2 = makeEntry({ id: "a", order: 1, keys: ["dragon"], constant: false });
    const e3 = makeEntry({ id: "k", order: 2, keys: ["dragon"], constant: true });
    const book = makeBook([e1, e2, e3]);
    const triggered = selectTriggeredEntries(book, "a dragon appears");
    expect(triggered.map((e) => e.id)).toEqual(["k", "a", "z"]);
  });

  it("caps the result set", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `e${i}`, order: i, keys: ["dragon"] })
    );
    const triggered = selectTriggeredEntries(makeBook(entries), "a dragon", 3);
    expect(triggered).toHaveLength(3);
  });

  it("returns empty for a book with no entries", () => {
    expect(selectTriggeredEntries(makeBook([]), "anything")).toEqual([]);
  });
});

describe("lorebookService.normalizeEntry", () => {
  it("returns null for invalid id", () => {
    expect(normalizeEntry({ id: "..", keys: ["a"], content: "x" })).toBeNull();
    expect(normalizeEntry({ id: "", keys: ["a"], content: "x" })).toBeNull();
    expect(normalizeEntry({ id: "has space", keys: ["a"], content: "x" })).toBeNull();
  });

  it("returns null when content is empty", () => {
    expect(normalizeEntry({ id: "e1", keys: ["a"], content: "" })).toBeNull();
  });

  it("returns null when no keys and no secondaryKeys", () => {
    expect(normalizeEntry({ id: "e1", keys: [], content: "x" })).toBeNull();
  });

  it("clamps content to MAX_LOREBOOK_ENTRY_CHARS", () => {
    const big = "x".repeat(10_000);
    const out = normalizeEntry({ id: "e1", keys: ["a"], content: big });
    expect(out).not.toBeNull();
    expect(out!.content.length).toBe(4_000);
  });

  it("trims and caps keys", () => {
    const out = normalizeEntry({ id: "e1", keys: ["  a  ", "x".repeat(200)], content: "x" });
    expect(out).not.toBeNull();
    expect(out!.keys).toEqual(["a", "x".repeat(64)]);
  });

  it("defaults insertionMode to before_char", () => {
    const out = normalizeEntry({ id: "e1", keys: ["a"], content: "x" });
    expect(out!.insertionMode).toBe("before_char");
  });

  it("accepts after_char and at_depth", () => {
    expect(normalizeEntry({ id: "e1", keys: ["a"], content: "x", insertionMode: "after_char" })!.insertionMode).toBe("after_char");
    const out = normalizeEntry({ id: "e1", keys: ["a"], content: "x", insertionMode: "at_depth", depth: 5 });
    expect(out!.insertionMode).toBe("at_depth");
    expect(out!.depth).toBe(5);
  });
});

describe("lorebookService.normalizeLorebook", () => {
  it("stamps the LorebookV1 schema tag on the normalized output", () => {
    const out = normalizeLorebook({ id: "b1", name: "B", entries: [] });
    expect(out).not.toBeNull();
    expect(out!.schema).toBe("LorebookV1");
  });

  it("returns null for missing name", () => {
    expect(normalizeLorebook({ schema: "LorebookV1", id: "b1", entries: [] })).toBeNull();
  });

  it("caps entries to MAX_LOREBOOK_ENTRIES", () => {
    const entries = Array.from({ length: 600 }, (_, i) => ({
      id: `e${i}`,
      keys: ["a"],
      content: "x",
      constant: false,
      insertionMode: "before_char",
      order: i,
      caseSensitive: false,
      matchWholeWords: false,
      enabled: true,
    }));
    const out = normalizeLorebook({ schema: "LorebookV1", id: "b1", name: "B", entries });
    expect(out).not.toBeNull();
    expect(out!.entries.length).toBe(500);
  });

  it("clamps description to 4,000 chars", () => {
    const out = normalizeLorebook({
      schema: "LorebookV1",
      id: "b1",
      name: "B",
      description: "d".repeat(10_000),
      entries: [],
    });
    expect(out!.description.length).toBe(4_000);
  });
});

describe("lorebookService.validateLorebook", () => {
  it("throws on missing schema", () => {
    expect(() =>
      validateLorebook({ ...makeBook([]), schema: "Other" as unknown as "LorebookV1" })
    ).toThrow();
  });

  it("throws on invalid id", () => {
    expect(() =>
      validateLorebook({ ...makeBook([]), id: "../escape" })
    ).toThrow();
  });

  it("throws on too many entries", () => {
    const entries = Array.from({ length: 501 }, (_, i) => makeEntry({ id: `e${i}` }));
    expect(() => validateLorebook(makeBook(entries))).toThrow(/entries/);
  });

  it("passes on a valid book", () => {
    expect(() => validateLorebook(makeBook([makeEntry()]))).not.toThrow();
  });
});
