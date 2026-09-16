# Character Card Mappings

The authoritative external adapter is `src/services/characterCards/characterCardAdapter.ts`. External DTOs live in `src/types/character-card-spec.ts`; persisted records remain `CharacterCardV1`.

V2 `first_mes` maps to `firstMessage`; `alternate_greetings` to `alternateGreetings`; `mes_example` to `rawExampleDialogue`; `creator_notes` to `creatorNotes`; `post_history_instructions` to `postHistoryInstructions`; and `character_book` to `embeddedCharacterBook`. Unknown safe `extensions` remain JSON values. No compatibility field is inferred from another semantic field.

`characterBookAdapter.ts` maps embedded V2 books into `LorebookV1` for the canonical matcher. Venice-only whole-word behavior is retained under `extensions.venice_forge.match_whole_words`. Local lorebook identifiers never enter standard exports.
