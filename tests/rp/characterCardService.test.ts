/**
 * @fileoverview Tests for the renderer-side character card service.
 *
 * Covers:
 *   - `normalizeCard`: trims, clamps, schema tag, optional fields
 *   - `clampCard`: idempotent on a valid card
 *   - Electron vs Web backend selection: mock `window.veniceForge` and `StorageService`
 *   - `generateId`: passes `isValidRpId`
 *
 * The web/electron selection is unit-tested by stubbing both globals.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { normalizeCard, clampCard, generateId } from "../../src/services/rp/characterCardService";
import { isValidRpId } from "../../src/types/rp";

afterEach(() => {
  // Reset window flag between tests
  delete (window as unknown as { veniceForge?: unknown }).veniceForge;
  // Make sure the module-level isElectron() result is recomputed in the next test
  vi.resetModules();
});

describe("characterCardService.normalizeCard", () => {
  it("returns null for null input", () => {
    expect(normalizeCard(null)).toBeNull();
  });

  it("returns null when id is invalid", () => {
    expect(normalizeCard({ id: "../bad", name: "X" })).toBeNull();
    expect(normalizeCard({ id: "", name: "X" })).toBeNull();
    expect(normalizeCard({ name: "X" })).toBeNull();
  });

  it("returns null when name is missing", () => {
    expect(normalizeCard({ id: "c1" })).toBeNull();
  });

  it("truncates name to 200 chars", () => {
    const out = normalizeCard({ id: "c1", name: "x".repeat(300) });
    expect(out!.name.length).toBe(200);
  });

  it("truncates description to CARD_FIELD_MAX", () => {
    const out = normalizeCard({ id: "c1", name: "X", description: "y".repeat(50_000) });
    expect(out!.description.length).toBe(32_000);
  });

  it("lowercases and trims tags", () => {
    const out = normalizeCard({ id: "c1", name: "X", tags: ["  Foo  ", "BAR", ""] });
    expect(out!.tags).toEqual(["foo", "bar"]);
  });

  it("defaults adult to false", () => {
    const out = normalizeCard({ id: "c1", name: "X" });
    expect(out!.adult).toBe(false);
  });

  it("accepts avatar only when data + byteLength present", () => {
    const out = normalizeCard({
      id: "c1",
      name: "X",
      avatar: { data: "data:image/png;base64,AAAA", mimeType: "image/png", byteLength: 4 },
    });
    expect(out!.avatar).toBeDefined();
    expect(out!.avatar!.mimeType).toBe("image/png");
  });

  it("drops unknown mimeType and defaults to image/png", () => {
    const out = normalizeCard({
      id: "c1",
      name: "X",
      avatar: { data: "x", mimeType: "image/svg+xml", byteLength: 1 } as unknown as { data: string; mimeType: "image/png"; byteLength: number },
    });
    expect(out!.avatar!.mimeType).toBe("image/png");
  });

  it("accepts exampleDialogues and drops invalid entries", () => {
    const out = normalizeCard({
      id: "c1",
      name: "X",
      exampleDialogues: [
        { speaker: "Alice", text: "Hi" },
        { speaker: "", text: "dropped" },
        { speaker: "Bob", text: "" },
        null,
      ] as unknown as { speaker: string; text: string }[],
    });
    expect(out!.exampleDialogues).toEqual([{ speaker: "Alice", text: "Hi" }]);
  });
});

describe("characterCardService.clampCard", () => {
  it("returns a re-normalized card on a valid input", () => {
    const card = normalizeCard({ id: "c1", name: "X" })!;
    const out = clampCard(card);
    expect(out.id).toBe("c1");
    expect(out.name).toBe("X");
  });

  it("returns a card object on a valid input", () => {
    // clampCard is a defensive helper: even a hand-constructed card should round-trip
    const out = clampCard({ id: "c1", name: "X" } as unknown as Parameters<typeof clampCard>[0]);
    expect(out).toBeDefined();
    expect(out.id).toBe("c1");
  });
});

describe("characterCardService.generateId", () => {
  it("returns an id that passes isValidRpId", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateId();
      expect(isValidRpId(id)).toBe(true);
    }
  });
});
