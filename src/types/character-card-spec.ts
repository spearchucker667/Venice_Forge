export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface TavernCardV1Dto {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
}

export interface CharacterCardV2Dto {
  spec: "chara_card_v2";
  spec_version: "2.0";
  data: CharacterCardV2DataDto;
}

export interface CharacterCardV2DataDto {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  character_book?: CharacterBookV2Dto;
  tags: string[];
  creator: string;
  character_version: string;
  extensions: JsonObject;
}

export interface CharacterBookV2Dto {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  extensions: JsonObject;
  entries: CharacterBookEntryV2Dto[];
}

export interface CharacterBookEntryV2Dto {
  keys: string[];
  content: string;
  extensions: JsonObject;
  enabled: boolean;
  insertion_order: number;
  case_sensitive?: boolean;
  name?: string;
  priority?: number;
  id?: number;
  comment?: string;
  selective?: boolean;
  secondary_keys?: string[];
  constant?: boolean;
  position?: "before_char" | "after_char";
}

export interface CharacterCardValidationIssue {
  severity: "error" | "warning" | "info";
  path?: string;
  message: string;
}

export interface CharacterCardAuthoringFields {
  name: string;
  description: string;
  firstMessage?: string;
}

/** Lightweight authoring/readiness checks for renderer UI. Format validation
 * remains authoritative in the character-card adapter. */
export function validateCharacterCardAuthoring(
  card: CharacterCardAuthoringFields,
): CharacterCardValidationIssue[] {
  const issues: CharacterCardValidationIssue[] = [];
  if (!card.name.trim()) {
    issues.push({ severity: "warning", path: "data.name", message: "Format valid, but a name is required before chat." });
  }
  if (!card.description.trim()) {
    issues.push({ severity: "info", path: "data.description", message: "Description is recommended for Venice Forge authoring." });
  }
  if (!card.firstMessage?.trim()) {
    issues.push({ severity: "info", path: "data.first_mes", message: "A primary greeting is recommended for chat readiness." });
  }
  return issues;
}
