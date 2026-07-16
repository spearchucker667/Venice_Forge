import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CharacterCardV2Dto } from "../../types/character-card-spec";
import { normalizeCard } from "../rp/characterCardService";
import {
  CHARACTER_CARD_JSON_MAX_DEPTH,
  detectCharacterCardFormat,
  mapInternalToV2,
  parseCharacterCardJson,
  preserveExtensions,
  validateCharacterCardV2,
  type CharacterCardImportWarning,
} from "./characterCardAdapter";

function fixture(name: "full" | "minimal"): CharacterCardV2Dto {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `tests/fixtures/character-cards/v2/${name}.json`), "utf8"),
  ) as CharacterCardV2Dto;
}

describe("characterCardAdapter", () => {
  it("detects V1 and V2 without treating unknown specs as V2", () => {
    expect(detectCharacterCardFormat(fixture("full")).format).toBe("card-v2-json");
    expect(detectCharacterCardFormat({ name: "V1", description: "test" }).format).toBe("tavern-v1-json");
    expect(detectCharacterCardFormat({ spec: "chara_card_v3", spec_version: "3.0", data: {} }).format).toBe("unknown");
  });

  it("round-trips every recognized V2 field and nested extension semantically", () => {
    const source = fixture("full");
    const parsed = parseCharacterCardJson(source);
    expect(parsed?.format).toBe("card-v2-json");
    expect(parsed?.warnings).toEqual([]);
    expect(mapInternalToV2(parsed!.card)).toEqual(source);
    const persisted = normalizeCard(parsed!.card);
    expect(persisted).not.toBeNull();
    expect(mapInternalToV2(persisted!)).toEqual(source);
  });

  it("preserves required empty strings and reports authoring readiness separately", () => {
    const source = fixture("minimal");
    const parsed = parseCharacterCardJson(source);
    expect(parsed).not.toBeNull();
    expect(mapInternalToV2(parsed!.card)).toEqual(source);
    const issues = validateCharacterCardV2(source);
    expect(issues.some((issue) => issue.severity === "error")).toBe(false);
    expect(issues.some((issue) => issue.path === "data.name" && issue.severity === "warning")).toBe(true);
  });

  it("keeps personality distinct from description and greetings distinct from examples", () => {
    const parsed = parseCharacterCardJson(fixture("full"))!;
    expect(parsed.card.description).toBe("A synthetic fixture character.");
    expect(parsed.card.personality).toBe("Patient and observant.");
    expect(parsed.card.alternateGreetings).toEqual(["The archive lights flicker on."]);
    expect(parsed.card.exampleDialogues).toHaveLength(1);
    expect(parsed.card.rawExampleDialogue).toContain("{{user}}");
  });

  it("removes prototype-pollution keys and non-finite values", () => {
    const warnings: CharacterCardImportWarning[] = [];
    const value = JSON.parse('{"safe":1,"__proto__":{"polluted":true}}') as Record<string, unknown>;
    value.nonFinite = Number.POSITIVE_INFINITY;
    expect(preserveExtensions(value, warnings)).toEqual({ safe: 1 });
    expect(warnings.some((warning) => warning.code === "EXTENSION_DROPPED")).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("drops extension trees deeper than the configured limit", () => {
    let value: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < CHARACTER_CARD_JSON_MAX_DEPTH + 2; index += 1) value = { child: value };
    const warnings: CharacterCardImportWarning[] = [];
    preserveExtensions(value, warnings);
    expect(warnings.some((warning) => warning.message.includes("maximum depth"))).toBe(true);
  });
});
