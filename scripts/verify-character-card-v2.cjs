#!/usr/bin/env node
const { existsSync, readFileSync } = require("node:fs");
const required = ["src/types/character-card-spec.ts", "src/services/characterCards/characterCardAdapter.ts", "src/shared/characterCardCompatibility.ts", "tests/fixtures/character-cards/v1/basic.json", "tests/fixtures/character-cards/v2/full.json", "tests/fixtures/character-cards/v2/minimal.json", "tests/fixtures/character-cards/v2/extensions.json", "tests/fixtures/character-cards/v2/character-book.json"];
for (const file of required) if (!existsSync(file)) throw new Error(`Missing Character Card V2 artifact: ${file}`);
const types = readFileSync(required[0], "utf8");
for (const token of ["CharacterCardV2Dto", "CharacterCardV2DataDto", "alternate_greetings", "character_book", "extensions: JsonObject"]) if (!types.includes(token)) throw new Error(`V2 DTO contract missing ${token}`);
const adapter = readFileSync(required[1], "utf8");
for (const token of ["mapV1ToInternal", "mapV2ToInternal", "mapInternalToV2", "validateCharacterCardV2", "parseCharacterCardJson", "preserveExtensions"]) if (!adapter.includes(token)) throw new Error(`V2 adapter contract missing ${token}`);
for (const file of ["src/components/rp-studio/CharacterBookEditor.tsx", "src/services/characterCards/characterCardGenerationService.ts", "src/services/characterCards/characterCardSyncMerge.ts", "src/services/characterCards/characterCardDraftService.ts"]) if (!existsSync(file)) throw new Error(`Missing ST Card Studio artifact: ${file}`);
console.log("[verify:character-card-v2] OK");
