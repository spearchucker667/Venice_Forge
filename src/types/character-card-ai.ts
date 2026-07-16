import type { JsonValue } from "./character-card-spec";

export interface CharacterLoreSuggestion { keys: string[]; content: string; confidence: number }
export interface CharacterAnalysisDraft {
  name?: string;
  visualDescription?: string;
  personalitySuggestions?: string[];
  scenarioSuggestions?: string[];
  greetingSuggestions?: string[];
  dialogueStyle?: string;
  tags?: string[];
  loreSuggestions?: CharacterLoreSuggestion[];
  uncertainty: Record<string, number>;
  warnings: string[];
}

export type CharacterEditablePath = "name" | "description" | "personality" | "scenario" | "firstMessage" | "systemPrompt" | "postHistoryInstructions" | "rawExampleDialogue" | "creatorNotes";
export type CharacterArrayPath = "tags" | "alternateGreetings";
export type CharacterCardPatchOperation =
  | { op: "replace"; path: CharacterEditablePath; value: JsonValue; reason?: string }
  | { op: "append"; path: CharacterArrayPath; value: JsonValue; reason?: string }
  | { op: "remove"; path: CharacterArrayPath; index: number; reason?: string };
export interface CharacterCardPatchProposal { summary: string; operations: CharacterCardPatchOperation[]; warnings: string[] }
