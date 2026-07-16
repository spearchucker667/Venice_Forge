import type {
  CharacterBookEntryV2Dto,
  CharacterBookV2Dto,
  CharacterCardV2DataDto,
  CharacterCardV2Dto,
  CharacterCardValidationIssue,
  JsonObject,
  JsonValue,
  TavernCardV1Dto,
} from "../../types/character-card-spec";
import {
  CARD_FIELD_MAX,
  MAX_LOREBOOK_ENTRIES,
  MAX_TAGS,
  type CharacterCardV1,
  type CharacterExampleDialogue,
} from "../../types/rp";
import { isPromptSecretLike, redactPromptSecrets } from "../../types/prompt-library";

export const CHARACTER_CARD_JSON_MAX_BYTES = 8 * 1024 * 1024;
export const CHARACTER_CARD_EXTENSION_MAX_BYTES = 1024 * 1024;
export const CHARACTER_CARD_JSON_MAX_DEPTH = 32;
export const CHARACTER_CARD_MAX_ALTERNATE_GREETINGS = 32;
export const CHARACTER_BOOK_MAX_KEYS = 64;

const EXAMPLE_TEXT_MAX = CARD_FIELD_MAX;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export interface CharacterCardImportWarning {
  code:
    | "FIELD_TRUNCATED"
    | "UNKNOWN_SPEC"
    | "UNSUPPORTED_ASSET"
    | "EXTENSION_DROPPED"
    | "BOOK_ENTRY_LIMIT"
    | "SECRET_REDACTED"
    | "INVALID_GREETING"
    | "IMAGE_REENCODED";
  path: string;
  message: string;
}

export type DetectFormatResult =
  | { format: "card-v2-json"; data: CharacterCardV2Dto }
  | { format: "tavern-v1-json"; data: TavernCardV1Dto }
  | { format: "venice-forge"; data: CharacterCardV1 }
  | { format: "unknown" };

export interface ParsedCharacterCardJson {
  format: Exclude<DetectFormatResult["format"], "unknown">;
  card: CharacterCardV1;
  warnings: CharacterCardImportWarning[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function safeString(
  value: unknown,
  warnings: CharacterCardImportWarning[],
  path: string,
  max = CARD_FIELD_MAX,
  redact = true,
): string {
  if (typeof value !== "string") return "";
  const truncated = value.length > max ? value.slice(0, max) : value;
  if (truncated.length !== value.length) {
    warnings.push({ code: "FIELD_TRUNCATED", path, message: `Field was truncated to ${max} characters.` });
  }
  if (!redact) return truncated;
  if (isPromptSecretLike(truncated)) {
    warnings.push({ code: "SECRET_REDACTED", path, message: "Secret-like content was redacted." });
  }
  return redactPromptSecrets(truncated);
}

function sanitizeJsonValue(
  value: unknown,
  warnings: CharacterCardImportWarning[],
  path: string,
  depth = 0,
): JsonValue | undefined {
  if (depth > CHARACTER_CARD_JSON_MAX_DEPTH) {
    warnings.push({ code: "EXTENSION_DROPPED", path, message: "Extension data exceeded the maximum depth." });
    return undefined;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return safeString(value, warnings, path);
  if (Array.isArray(value)) {
    const out: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const item = sanitizeJsonValue(value[index], warnings, `${path}[${index}]`, depth + 1);
      if (item !== undefined) out.push(item);
    }
    return out;
  }
  if (!isPlainObject(value)) {
    warnings.push({ code: "EXTENSION_DROPPED", path, message: "Non-JSON extension value was removed." });
    return undefined;
  }
  const out: JsonObject = {};
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      warnings.push({ code: "EXTENSION_DROPPED", path: `${path}.${key}`, message: "Unsafe object key was removed." });
      continue;
    }
    const clean = sanitizeJsonValue(nested, warnings, `${path}.${key}`, depth + 1);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

export function preserveExtensions(
  value: unknown,
  warnings: CharacterCardImportWarning[],
  path = "data.extensions",
): JsonObject {
  const clean = sanitizeJsonValue(value, warnings, path);
  if (!clean || Array.isArray(clean) || typeof clean !== "object") return {};
  if (byteLength(JSON.stringify(clean)) > CHARACTER_CARD_EXTENSION_MAX_BYTES) {
    warnings.push({ code: "EXTENSION_DROPPED", path, message: "Extension data exceeded the 1 MiB limit." });
    return {};
  }
  return clean;
}

function stringArray(
  value: unknown,
  warnings: CharacterCardImportWarning[],
  path: string,
  maxItems: number,
  maxLength = CARD_FIELD_MAX,
): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item, index) => safeString(item, warnings, `${path}[${index}]`, maxLength));
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeBookEntry(
  value: unknown,
  warnings: CharacterCardImportWarning[],
  index: number,
): CharacterBookEntryV2Dto | null {
  if (!isPlainObject(value)) return null;
  const path = `data.character_book.entries[${index}]`;
  const position = value.position === "before_char" || value.position === "after_char" ? value.position : undefined;
  return {
    keys: stringArray(value.keys, warnings, `${path}.keys`, CHARACTER_BOOK_MAX_KEYS, 256),
    content: safeString(value.content, warnings, `${path}.content`, CARD_FIELD_MAX),
    extensions: preserveExtensions(value.extensions, warnings, `${path}.extensions`),
    enabled: value.enabled !== false,
    insertion_order: optionalFiniteNumber(value.insertion_order) ?? 0,
    ...(typeof value.case_sensitive === "boolean" ? { case_sensitive: value.case_sensitive } : {}),
    ...(typeof value.name === "string" ? { name: safeString(value.name, warnings, `${path}.name`, 256) } : {}),
    ...(optionalFiniteNumber(value.priority) !== undefined ? { priority: optionalFiniteNumber(value.priority) } : {}),
    ...(optionalFiniteNumber(value.id) !== undefined ? { id: optionalFiniteNumber(value.id) } : {}),
    ...(typeof value.comment === "string" ? { comment: safeString(value.comment, warnings, `${path}.comment`) } : {}),
    ...(typeof value.selective === "boolean" ? { selective: value.selective } : {}),
    ...(Array.isArray(value.secondary_keys)
      ? { secondary_keys: stringArray(value.secondary_keys, warnings, `${path}.secondary_keys`, CHARACTER_BOOK_MAX_KEYS, 256) }
      : {}),
    ...(typeof value.constant === "boolean" ? { constant: value.constant } : {}),
    ...(position ? { position } : {}),
  };
}

export function normalizeCharacterBook(
  value: unknown,
  warnings: CharacterCardImportWarning[],
): CharacterBookV2Dto | undefined {
  if (!isPlainObject(value)) return undefined;
  const rawEntries = Array.isArray(value.entries) ? value.entries : [];
  if (rawEntries.length > MAX_LOREBOOK_ENTRIES) {
    warnings.push({
      code: "BOOK_ENTRY_LIMIT",
      path: "data.character_book.entries",
      message: `Only the first ${MAX_LOREBOOK_ENTRIES} character-book entries were preserved.`,
    });
  }
  const entries = rawEntries
    .slice(0, MAX_LOREBOOK_ENTRIES)
    .map((entry, index) => normalizeBookEntry(entry, warnings, index))
    .filter((entry): entry is CharacterBookEntryV2Dto => entry !== null);
  return {
    ...(typeof value.name === "string" ? { name: safeString(value.name, warnings, "data.character_book.name", 256) } : {}),
    ...(typeof value.description === "string"
      ? { description: safeString(value.description, warnings, "data.character_book.description") }
      : {}),
    ...(optionalFiniteNumber(value.scan_depth) !== undefined ? { scan_depth: optionalFiniteNumber(value.scan_depth) } : {}),
    ...(optionalFiniteNumber(value.token_budget) !== undefined ? { token_budget: optionalFiniteNumber(value.token_budget) } : {}),
    ...(typeof value.recursive_scanning === "boolean" ? { recursive_scanning: value.recursive_scanning } : {}),
    extensions: preserveExtensions(value.extensions, warnings, "data.character_book.extensions"),
    entries,
  };
}

export function detectCharacterCardFormat(parsed: unknown): DetectFormatResult {
  if (!isPlainObject(parsed)) return { format: "unknown" };
  if (parsed.schema === "CharacterCardV1") {
    return { format: "venice-forge", data: parsed as unknown as CharacterCardV1 };
  }
  if (parsed.spec === "chara_card_v2" && parsed.spec_version === "2.0" && isPlainObject(parsed.data)) {
    return { format: "card-v2-json", data: parsed as unknown as CharacterCardV2Dto };
  }
  if (
    typeof parsed.name === "string" &&
    [parsed.description, parsed.personality, parsed.scenario, parsed.first_mes, parsed.mes_example].some(
      (field) => typeof field === "string",
    )
  ) {
    return { format: "tavern-v1-json", data: parsed as unknown as TavernCardV1Dto };
  }
  return { format: "unknown" };
}

function examplesFromRaw(raw: string): CharacterExampleDialogue[] {
  return raw ? [{ speaker: "Example", text: raw.slice(0, EXAMPLE_TEXT_MAX) }] : [];
}

export function mapV2ToInternal(
  dto: CharacterCardV2Dto,
  warnings: CharacterCardImportWarning[] = [],
): CharacterCardV1 | null {
  if (!isPlainObject(dto.data)) return null;
  if (validateCharacterCardV2(dto).some((issue) => issue.severity === "error")) return null;
  const data = dto.data as unknown as Record<string, unknown>;
  const now = Date.now();
  const rawExampleDialogue = safeString(data.mes_example, warnings, "data.mes_example", EXAMPLE_TEXT_MAX);
  const embeddedCharacterBook = normalizeCharacterBook(data.character_book, warnings);
  const card: CharacterCardV1 = {
    schema: "CharacterCardV1",
    id: newId(),
    name: safeString(data.name, warnings, "data.name", 200),
    description: safeString(data.description, warnings, "data.description"),
    personality: safeString(data.personality, warnings, "data.personality"),
    scenario: safeString(data.scenario, warnings, "data.scenario"),
    firstMessage: safeString(data.first_mes, warnings, "data.first_mes"),
    rawExampleDialogue,
    exampleDialogues: examplesFromRaw(rawExampleDialogue),
    creatorNotes: safeString(data.creator_notes, warnings, "data.creator_notes"),
    systemPrompt: safeString(data.system_prompt, warnings, "data.system_prompt"),
    postHistoryInstructions: safeString(data.post_history_instructions, warnings, "data.post_history_instructions"),
    alternateGreetings: stringArray(
      data.alternate_greetings,
      warnings,
      "data.alternate_greetings",
      CHARACTER_CARD_MAX_ALTERNATE_GREETINGS,
    ),
    tags: stringArray(data.tags, warnings, "data.tags", MAX_TAGS, 64),
    author: safeString(data.creator, warnings, "data.creator", 200),
    characterVersion: safeString(data.character_version, warnings, "data.character_version", 64),
    tavernExtensions: preserveExtensions(data.extensions, warnings),
    ...(embeddedCharacterBook ? { embeddedCharacterBook } : {}),
    adult: false,
    createdAt: now,
    updatedAt: now,
    sourceFormat: "card-v2-json",
    metadata: { importedSpec: dto.spec, importedSpecVersion: dto.spec_version },
  };
  return card;
}

export function mapV1ToInternal(
  dto: TavernCardV1Dto,
  warnings: CharacterCardImportWarning[] = [],
): CharacterCardV1 | null {
  const raw = dto as unknown as Record<string, unknown>;
  const name = safeString(raw.name, warnings, "name", 200);
  if (!name) return null;
  const now = Date.now();
  const rawExampleDialogue = safeString(raw.mes_example, warnings, "mes_example", EXAMPLE_TEXT_MAX);
  return {
    schema: "CharacterCardV1",
    id: newId(),
    name,
    description: safeString(raw.description ?? raw.personality, warnings, "description"),
    personality: safeString(raw.personality, warnings, "personality"),
    scenario: safeString(raw.scenario, warnings, "scenario"),
    firstMessage: safeString(raw.first_mes, warnings, "first_mes"),
    rawExampleDialogue,
    exampleDialogues: examplesFromRaw(rawExampleDialogue),
    systemPrompt: safeString(raw.system_prompt, warnings, "system_prompt"),
    creatorNotes: safeString(raw.creator_notes, warnings, "creator_notes"),
    alternateGreetings: stringArray(
      raw.alternate_greetings,
      warnings,
      "alternate_greetings",
      CHARACTER_CARD_MAX_ALTERNATE_GREETINGS,
    ),
    tags: stringArray(raw.tags, warnings, "tags", MAX_TAGS, 64),
    author: safeString(raw.creator, warnings, "creator", 200),
    characterVersion: safeString(raw.character_version, warnings, "character_version", 64),
    tavernExtensions: preserveExtensions(raw.extensions, warnings, "extensions"),
    adult: false,
    createdAt: now,
    updatedAt: now,
    sourceFormat: "tavern-v1-json",
    metadata: {
      importedFrom: "tavern",
      ...(typeof raw.creator === "string" || typeof raw.creator_notes === "string"
        ? { creator: safeString(raw.creator ?? raw.creator_notes, warnings, "creator", 200) }
        : {}),
      ...(typeof raw.character_version === "string"
        ? { importedVersion: safeString(raw.character_version, warnings, "character_version", 64) }
        : {}),
    },
  };
}

export function mapInternalToV2(card: CharacterCardV1): CharacterCardV2Dto {
  const warnings: CharacterCardImportWarning[] = [];
  const embeddedCharacterBook = normalizeCharacterBook(card.embeddedCharacterBook, warnings);
  const data: CharacterCardV2DataDto = {
    name: card.name ?? "",
    description: card.description ?? "",
    personality: card.personality ?? "",
    scenario: card.scenario ?? "",
    first_mes: card.firstMessage ?? "",
    mes_example:
      card.rawExampleDialogue ?? card.exampleDialogues.map((dialogue) => `${dialogue.speaker}: ${dialogue.text}`).join("\n\n"),
    creator_notes: card.creatorNotes ?? "",
    system_prompt: card.systemPrompt ?? "",
    post_history_instructions: card.postHistoryInstructions ?? "",
    alternate_greetings: [...(card.alternateGreetings ?? [])],
    ...(embeddedCharacterBook ? { character_book: embeddedCharacterBook } : {}),
    tags: [...(card.tags ?? [])],
    creator: card.author ?? "",
    character_version: card.characterVersion ?? "",
    extensions: preserveExtensions(card.tavernExtensions, warnings),
  };
  return { spec: "chara_card_v2", spec_version: "2.0", data };
}

export function validateCharacterCardV2(card: CharacterCardV1 | CharacterCardV2Dto): CharacterCardValidationIssue[] {
  const dto = isPlainObject(card) && isPlainObject(card.data)
    ? card as unknown as CharacterCardV2Dto
    : mapInternalToV2(card as CharacterCardV1);
  const issues: CharacterCardValidationIssue[] = [];
  if (dto.spec !== "chara_card_v2" || dto.spec_version !== "2.0") {
    issues.push({ severity: "error", path: "spec", message: "Only Character Card V2 spec version 2.0 is supported." });
  }
  const requiredStrings: Array<keyof CharacterCardV2DataDto> = [
    "name",
    "description",
    "personality",
    "scenario",
    "first_mes",
    "mes_example",
    "creator_notes",
    "system_prompt",
    "post_history_instructions",
    "creator",
    "character_version",
  ];
  for (const key of requiredStrings) {
    if (typeof dto.data[key] !== "string") {
      issues.push({ severity: "error", path: `data.${key}`, message: `${key} must be a string.` });
    }
  }
  if (!Array.isArray(dto.data.alternate_greetings)) {
    issues.push({ severity: "error", path: "data.alternate_greetings", message: "alternate_greetings must be an array." });
  }
  if (!Array.isArray(dto.data.tags)) {
    issues.push({ severity: "error", path: "data.tags", message: "tags must be an array." });
  }
  if (!isPlainObject(dto.data.extensions)) {
    issues.push({ severity: "error", path: "data.extensions", message: "extensions must be a plain JSON object." });
  }
  if (!dto.data.name.trim()) {
    issues.push({ severity: "warning", path: "data.name", message: "Format valid, but a name is required before chat." });
  }
  if (!dto.data.description.trim()) {
    issues.push({ severity: "info", path: "data.description", message: "Description is recommended for Venice Forge authoring." });
  }
  if (!dto.data.first_mes.trim()) {
    issues.push({ severity: "info", path: "data.first_mes", message: "A primary greeting is recommended for chat readiness." });
  }
  return issues;
}

export function parseCharacterCardJson(raw: string | unknown): ParsedCharacterCardJson | null {
  if (typeof raw === "string" && byteLength(raw) > CHARACTER_CARD_JSON_MAX_BYTES) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  const detected = detectCharacterCardFormat(parsed);
  const warnings: CharacterCardImportWarning[] = [];
  if (detected.format === "unknown" || detected.format === "venice-forge") return null;
  const card =
    detected.format === "card-v2-json"
      ? mapV2ToInternal(detected.data, warnings)
      : mapV1ToInternal(detected.data, warnings);
  return card ? { format: detected.format, card, warnings } : null;
}

export function createImportPreview(card: CharacterCardV1, warnings: CharacterCardImportWarning[]) {
  return {
    format: card.sourceFormat ?? "venice-forge",
    specificationVersion: typeof card.metadata?.importedSpecVersion === "string" ? card.metadata.importedSpecVersion : undefined,
    name: card.name,
    creator: card.author ?? "",
    characterVersion: card.characterVersion ?? "",
    greetingCount: (card.firstMessage ? 1 : 0) + (card.alternateGreetings?.length ?? 0),
    exampleDialogueCount: card.exampleDialogues.length,
    characterBookEntryCount: card.embeddedCharacterBook?.entries.length ?? 0,
    extensionNamespaceCount: Object.keys(card.tavernExtensions ?? {}).length,
    warnings: [...warnings],
  };
}
