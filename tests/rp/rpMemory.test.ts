/**
 * @fileoverview Tests for the RP memory service.
 *
 * Covers:
 *   - `isValidRpMemory`: schema, scope, content cap, source shape
 *   - `normalizeRpMemory`: trims, clamps, defaults
 *   - `selectMemoriesForChat`: per-scope cap, character filtering, ordering by recency
 *
 * REGRESSION: VERIFY-013 — RP memory scoping is bound by per-scope caps and the prompt builder
 * receives memories in scope order: pinned, character, long-term.
 */

import { describe, it, expect } from "vitest";
import {
  isValidRpMemory,
  normalizeRpMemory,
  selectMemoriesForChat,
  RP_MEMORY_MAX_CHARS,
} from "../../src/services/rp/rpMemoryService";
import type { RpMemoryV1 } from "../../src/types/rp";

function makeMemory(overrides: Partial<RpMemoryV1> = {}): RpMemoryV1 {
  return {
    schema: "RpMemoryV1",
    id: "m1",
    scope: "long-term",
    content: "Alice likes apples.",
    tags: ["food"],
    source: { kind: "user-stated", messageIds: [] },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("rpMemoryService.isValidRpMemory", () => {
  it("accepts a valid memory", () => {
    expect(isValidRpMemory(makeMemory())).toBe(true);
  });

  it("rejects wrong schema", () => {
    expect(isValidRpMemory({ ...makeMemory(), schema: "Other" as unknown as "RpMemoryV1" })).toBe(false);
  });

  it("rejects invalid id", () => {
    expect(isValidRpMemory(makeMemory({ id: ".." }))).toBe(false);
  });

  it("rejects invalid scope", () => {
    expect(isValidRpMemory(makeMemory({ scope: "global" as unknown as "long-term" }))).toBe(false);
  });

  it("rejects character scope without characterId", () => {
    expect(isValidRpMemory(makeMemory({ scope: "character" }))).toBe(false);
  });

  it("rejects content over MAX chars", () => {
    expect(isValidRpMemory(makeMemory({ content: "x".repeat(RP_MEMORY_MAX_CHARS + 1) }))).toBe(false);
  });

  it("rejects non-string source.kind", () => {
    expect(isValidRpMemory(makeMemory({ source: { kind: 42 as unknown as "user-stated", messageIds: [] } }))).toBe(false);
  });
});

describe("rpMemoryService.normalizeRpMemory", () => {
  it("returns null on invalid scope", () => {
    expect(normalizeRpMemory({ id: "m1", scope: "global", content: "x", source: { kind: "user-stated", messageIds: [] } })).toBeNull();
  });

  it("clamps content to MAX chars", () => {
    const out = normalizeRpMemory({ id: "m1", scope: "pinned", content: "x".repeat(RP_MEMORY_MAX_CHARS + 100), source: { kind: "user-stated", messageIds: [] } });
    expect(out).not.toBeNull();
    expect(out!.content.length).toBe(RP_MEMORY_MAX_CHARS);
  });

  it("lowercases and trims tags", () => {
    const out = normalizeRpMemory({
      id: "m1",
      scope: "pinned",
      content: "x",
      tags: ["  Foo  ", "BAR"],
      source: { kind: "user-stated", messageIds: [] },
    });
    expect(out!.tags).toEqual(["foo", "bar"]);
  });

  it("preserves characterId on character scope", () => {
    const out = normalizeRpMemory({
      id: "m1",
      scope: "character",
      characterId: "card_a",
      content: "x",
      source: { kind: "user-stated", messageIds: [] },
    });
    expect(out!.characterId).toBe("card_a");
  });

  it("returns null on invalid characterId for character scope", () => {
    expect(
      normalizeRpMemory({
        id: "m1",
        scope: "character",
        characterId: "../bad",
        content: "x",
        source: { kind: "user-stated", messageIds: [] },
      })
    ).toBeNull();
  });
});

describe("rpMemoryService.selectMemoriesForChat", () => {
  it("returns memories in scope order: pinned, character, long-term", () => {
    const pinned = makeMemory({ id: "p1", scope: "pinned", updatedAt: 1 });
    const character = makeMemory({ id: "c1", scope: "character", characterId: "card_a", updatedAt: 2 });
    const longTerm = makeMemory({ id: "l1", scope: "long-term", updatedAt: 3 });
    const out = selectMemoriesForChat({
      memories: [longTerm, character, pinned],
      activeCharacterIds: ["card_a"],
    });
    expect(out.map((m) => m.id)).toEqual(["p1", "c1", "l1"]);
  });

  it("filters character memories to active characters only", () => {
    const active = makeMemory({ id: "a", scope: "character", characterId: "card_a" });
    const other = makeMemory({ id: "b", scope: "character", characterId: "card_b" });
    const out = selectMemoriesForChat({
      memories: [active, other],
      activeCharacterIds: ["card_a"],
    });
    expect(out.map((m) => m.id)).toEqual(["a"]);
  });

  it("sorts within a scope by updatedAt desc", () => {
    const older = makeMemory({ id: "lo", scope: "pinned", updatedAt: 1 });
    const newer = makeMemory({ id: "ln", scope: "pinned", updatedAt: 100 });
    const out = selectMemoriesForChat({ memories: [older, newer], activeCharacterIds: [] });
    expect(out.map((m) => m.id)).toEqual(["ln", "lo"]);
  });

  it("applies per-scope caps", () => {
    const pinned = Array.from({ length: 30 }, (_, i) =>
      makeMemory({ id: `p${i}`, scope: "pinned", updatedAt: i })
    );
    const out = selectMemoriesForChat({
      memories: pinned,
      activeCharacterIds: [],
      pinnedCap: 5,
    });
    expect(out.length).toBe(5);
  });

  it("returns empty for no memories", () => {
    expect(selectMemoriesForChat({ memories: [], activeCharacterIds: [] })).toEqual([]);
  });
});
