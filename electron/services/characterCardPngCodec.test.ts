// @vitest-environment node
import { describe, expect, it } from "vitest";
import { embedCharacterCardInPng, inspectCharacterCardPng } from "./characterCardPngCodec";
import type { CharacterCardV2Dto } from "../../src/types/character-card-spec";
import fs from "node:fs";
import path from "node:path";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const CARD: CharacterCardV2Dto = {
  spec: "chara_card_v2", spec_version: "2.0",
  data: { name: "Ada", description: "Engineer", personality: "Direct", scenario: "Lab", first_mes: "Hello", mes_example: "", creator_notes: "", system_prompt: "", post_history_instructions: "", alternate_greetings: [], tags: ["test"], creator: "VF", character_version: "1", extensions: { future: { kept: true } } },
};

describe("characterCardPngCodec", () => {
  it("exports a CRC-valid V2 card and reimports it losslessly", () => {
    const exported = embedCharacterCardInPng(PNG, CARD);
    const inspected = inspectCharacterCardPng(exported);
    expect(inspected.card).toEqual(CARD);
    expect(inspected.width).toBe(1);
    expect(inspected.visiblePng).toEqual(PNG);
  });

  it("replaces stale chara metadata instead of duplicating it", () => {
    const once = embedCharacterCardInPng(PNG, CARD);
    const changed = { ...CARD, data: { ...CARD.data, name: "Grace" } };
    const twice = embedCharacterCardInPng(once, changed);
    expect(inspectCharacterCardPng(twice).card.data.name).toBe("Grace");
  });

  it("rejects missing metadata, truncation, trailing bytes, and bad CRC", () => {
    expect(() => inspectCharacterCardPng(PNG)).toThrow(/no SillyTavern/);
    expect(() => inspectCharacterCardPng(PNG.subarray(0, -2))).toThrow(/Truncated|IEND/);
    expect(() => inspectCharacterCardPng(Buffer.concat([PNG, Buffer.from([0])]))).toThrow(/end exactly/);
    const corrupt = Buffer.from(PNG); corrupt[29] ^= 1;
    expect(() => inspectCharacterCardPng(corrupt)).toThrow(/CRC/);
  });

  it("accepts the synthetic ASCII and Unicode golden PNG fixtures", () => {
    const root = path.join(process.cwd(), "tests/fixtures/character-cards/png");
    expect(inspectCharacterCardPng(fs.readFileSync(path.join(root, "basic-v2.png"))).card.data.name).toBe("Aster Fixture");
    expect(inspectCharacterCardPng(fs.readFileSync(path.join(root, "non-ascii-v2.png"))).card.data.name).toBe("星のミラ");
  });

  it("rejects committed malformed and oversized hostile fixtures", () => {
    const root = path.join(process.cwd(), "tests/fixtures/character-cards/png");
    expect(() => inspectCharacterCardPng(fs.readFileSync(path.join(root, "malformed-chunk.png")))).toThrow(/CRC/);
    expect(() => inspectCharacterCardPng(fs.readFileSync(path.join(root, "oversized-metadata.png")))).toThrow(/metadata|base64/i);
  });
});
