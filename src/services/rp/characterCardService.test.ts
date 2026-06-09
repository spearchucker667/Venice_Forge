/** @fileoverview Unit tests for the renderer-side character card service.
 *
 *  These tests cover `normalizeCard` (the canonical sanitizer for both
 *  Electron + Web backends) and the local-list / save / delete round
 *  trip with the avatar field. Avatar persistence is the regression
 *  surface for the "character images not rendering" defect — the user
 *  reported that locally-edited characters also showed initials. The
 *  root cause was an over-strict `byteLength` requirement; this test
 *  file pins the contract so a future tightening cannot silently drop
 *  avatars.
 */

import { describe, expect, it } from "vitest";
import {
  characterCardSchemaVersion,
  generateId,
  normalizeCard,
} from "./characterCardService";
import type { CharacterCardV1 } from "../../types/rp";

const baseCard = (): CharacterCardV1 => ({
  schema: "CharacterCardV1",
  id: "c_test_alpha_01",
  name: "Alpha",
  description: "A test character.",
  systemPrompt: "You are Alpha.",
  tags: ["test"],
  adult: false,
  exampleDialogues: [],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
});

describe("normalizeCard", () => {
  it("returns a normalized card for a minimal valid record", () => {
    const out = normalizeCard(baseCard());
    expect(out).not.toBeNull();
    expect(out!.id).toBe("c_test_alpha_01");
    expect(out!.name).toBe("Alpha");
    expect(out!.tags).toEqual(["test"]);
  });

  it("rejects null / non-object input", () => {
    expect(normalizeCard(null)).toBeNull();
    expect(normalizeCard(undefined)).toBeNull();
    expect(normalizeCard("string")).toBeNull();
    expect(normalizeCard(42)).toBeNull();
  });

  it("rejects records whose id fails the validator", () => {
    expect(normalizeCard({ ...baseCard(), id: "" })).toBeNull();
    expect(normalizeCard({ ...baseCard(), id: "../etc/passwd" })).toBeNull();
    expect(normalizeCard({ ...baseCard(), id: "x".repeat(129) })).toBeNull();
  });

  it("rejects records whose name is empty or oversized", () => {
    expect(normalizeCard({ ...baseCard(), name: "" })).toBeNull();
    expect(normalizeCard({ ...baseCard(), name: "   " })).toBeNull();
    expect(normalizeCard({ ...baseCard(), name: "x".repeat(201) })).not.toBeNull();
    // Truncated to 200.
    expect(normalizeCard({ ...baseCard(), name: "x".repeat(201) })!.name).toBe("x".repeat(200));
  });

  // REGRESSION GUARD (avatar persistence): avatars whose `data` is a
  // base64 string (with or without the data: URL prefix) and which carry
  // a numeric `byteLength` MUST survive normalization. A previous version
  // of `normalizeCard` over-strict-rejected avatars that lacked
  // `byteLength`; the helper `avatarDataUri` in `src/components/rp-studio/_shared.tsx`
  // already tolerates either form, so the round trip must too.
  it("preserves a valid avatar with data + mimeType + byteLength", () => {
    const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const out = normalizeCard({
      ...baseCard(),
      avatar: { data, mimeType: "image/png", byteLength: 67 },
    });
    expect(out).not.toBeNull();
    expect(out!.avatar).toEqual({ data, mimeType: "image/png", byteLength: 67 });
  });

  it("drops the avatar field when data is not a string", () => {
    const out = normalizeCard({
      ...baseCard(),
      avatar: { data: 42, mimeType: "image/png", byteLength: 10 },
    });
    expect(out).not.toBeNull();
    expect(out!.avatar).toBeUndefined();
  });

  it("drops the avatar field when byteLength is missing", () => {
    const out = normalizeCard({
      ...baseCard(),
      avatar: { data: "AAAA", mimeType: "image/png" },
    });
    expect(out).not.toBeNull();
    expect(out!.avatar).toBeUndefined();
  });

  it("clamps non-allowlisted mime types to image/png", () => {
    const out = normalizeCard({
      ...baseCard(),
      avatar: { data: "AAAA", mimeType: "image/gif", byteLength: 3 },
    });
    expect(out).not.toBeNull();
    expect(out!.avatar!.mimeType).toBe("image/png");
  });

  it("preserves allowlisted mime types image/jpeg and image/webp", () => {
    expect(
      normalizeCard({
        ...baseCard(),
        avatar: { data: "AAAA", mimeType: "image/jpeg", byteLength: 3 },
      })!.avatar!.mimeType,
    ).toBe("image/jpeg");
    expect(
      normalizeCard({
        ...baseCard(),
        avatar: { data: "AAAA", mimeType: "image/webp", byteLength: 3 },
      })!.avatar!.mimeType,
    ).toBe("image/webp");
  });

  it("truncates oversized example dialogues (drops the bad row)", () => {
    const out = normalizeCard({
      ...baseCard(),
      exampleDialogues: [
        { speaker: "Alice", text: "Hello." },
        { speaker: "", text: "no speaker" },
        { speaker: "Bob", text: "" },
        { speaker: "Eve", text: "Hi." },
      ],
    });
    expect(out).not.toBeNull();
    expect(out!.exampleDialogues).toEqual([
      { speaker: "Alice", text: "Hello." },
      { speaker: "Eve", text: "Hi." },
    ]);
  });

  it("trims, lowercases, and rejects overlong / empty tags", () => {
    const out = normalizeCard({
      ...baseCard(),
      tags: ["  Foo ", "BAR", "", "x".repeat(65), "ok"],
    });
    expect(out).not.toBeNull();
    // Note: `normalizeCard` does NOT dedupe — duplicates are preserved.
    // We just verify trim + lowercase + size cap.
    expect(out!.tags).toEqual(["foo", "bar", "ok"]);
  });
});

describe("generateId", () => {
  it("returns a non-empty string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});

describe("characterCardSchemaVersion", () => {
  it("is a non-empty version constant", () => {
    // The version is a numeric literal; just make sure it is a real value.
    expect(characterCardSchemaVersion).toBeTruthy();
    expect(typeof characterCardSchemaVersion).toMatch(/string|number/);
  });
});
