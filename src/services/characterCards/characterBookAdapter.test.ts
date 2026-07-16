import { describe, expect, it } from "vitest";
import { mapCharacterBookV2ToLorebookV1, mapLorebookV1ToCharacterBookV2 } from "./characterBookAdapter";
import type { CharacterBookV2Dto } from "../../types/character-card-spec";

describe("character book interoperability", () => {
  it("maps V2 entries through the canonical LorebookV1 matcher shape and back", () => {
    const input: CharacterBookV2Dto = { name: "World", extensions: { future: true }, entries: [{ keys: ["Ada"], secondary_keys: ["engineer"], content: "Ada builds.", extensions: { venice_forge: { match_whole_words: false } }, enabled: true, insertion_order: 4, case_sensitive: true, constant: false, position: "before_char" }] };
    const linked = mapCharacterBookV2ToLorebookV1(input, { id: "book-1", characterId: "card-1", now: 1 });
    expect(linked.entries[0]).toMatchObject({ matchWholeWords: false, insertionMode: "before_char", caseSensitive: true });
    const output = mapLorebookV1ToCharacterBookV2(linked);
    expect(output.entries[0]).toMatchObject({ keys: ["Ada"], secondary_keys: ["engineer"], position: "before_char" });
    expect(output.entries[0].extensions).toEqual({ venice_forge: { match_whole_words: false } });
  });
});
