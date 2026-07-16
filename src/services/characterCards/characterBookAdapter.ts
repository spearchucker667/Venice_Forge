import type { CharacterBookV2Dto } from "../../types/character-card-spec";
import type { LorebookV1 } from "../../types/rp";

function safeId(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 96);
  return clean && !clean.startsWith(".") ? clean : `book-${Date.now().toString(36)}`;
}

export function mapCharacterBookV2ToLorebookV1(book: CharacterBookV2Dto, options: { id: string; characterId?: string; now?: number }): LorebookV1 {
  const now = options.now ?? Date.now();
  const id = safeId(options.id);
  return {
    schema: "LorebookV1",
    id,
    name: book.name || "Embedded character book",
    description: book.description || "",
    tags: ["character-card", "embedded-import"],
    entries: book.entries.map((entry, index) => ({
      id: `${id}-entry-${index}`.slice(0, 128),
      keys: [...entry.keys],
      ...(entry.secondary_keys ? { secondaryKeys: [...entry.secondary_keys] } : {}),
      content: entry.content,
      constant: entry.constant === true,
      insertionMode: entry.position ?? "after_char",
      order: Number.isFinite(entry.insertion_order) ? entry.insertion_order : index,
      caseSensitive: entry.case_sensitive === true,
      matchWholeWords: entry.extensions?.venice_forge && typeof entry.extensions.venice_forge === "object" && !Array.isArray(entry.extensions.venice_forge)
        ? (entry.extensions.venice_forge as Record<string, unknown>).match_whole_words !== false
        : true,
      enabled: entry.enabled !== false,
    })),
    ...(options.characterId ? { characterId: options.characterId, scope: "character" as const } : { scope: "global" as const }),
    createdAt: now,
    updatedAt: now,
  };
}

export function mapLorebookV1ToCharacterBookV2(lorebook: LorebookV1): CharacterBookV2Dto {
  return {
    name: lorebook.name,
    description: lorebook.description,
    extensions: {},
    entries: lorebook.entries.map((entry, index) => ({
      keys: [...entry.keys],
      content: entry.content,
      extensions: { venice_forge: { match_whole_words: entry.matchWholeWords } },
      enabled: entry.enabled,
      insertion_order: Number.isFinite(entry.order) ? entry.order : index,
      case_sensitive: entry.caseSensitive,
      ...(entry.secondaryKeys ? { secondary_keys: [...entry.secondaryKeys] } : {}),
      constant: entry.constant,
      ...(entry.insertionMode === "before_char" || entry.insertionMode === "after_char" ? { position: entry.insertionMode } : {}),
    })),
  };
}
