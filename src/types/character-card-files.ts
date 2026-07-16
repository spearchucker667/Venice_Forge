import type { CharacterCardImportWarning } from "../services/characterCards/characterCardAdapter";

export interface CharacterCardImportPreview {
  format: string;
  specificationVersion?: string;
  name: string;
  creator: string;
  characterVersion: string;
  greetingCount: number;
  exampleDialogueCount: number;
  characterBookEntryCount: number;
  extensionNamespaceCount: number;
  image?: { width: number; height: number; byteLength: number };
  warnings: CharacterCardImportWarning[];
}

export interface CharacterCardImportChoiceResult {
  ok: boolean;
  canceled?: boolean;
  handle?: string;
  expiresAt?: number;
  preview?: CharacterCardImportPreview;
  error?: string;
}

export interface CharacterCardImportApplyResult {
  ok: boolean;
  cardId?: string;
  error?: string;
  collision?: { existingCardId: string; name: string; creator: string };
  undoHandle?: string;
  startedChatRequested?: boolean;
}

export type CharacterCardImportMode = "create" | "create-copy" | "replace" | "merge" | "keep-existing";
export interface CharacterCardImportApplyOptions {
  handle: string;
  mode?: CharacterCardImportMode;
  existingCardId?: string;
  mergeFields?: Array<"name" | "description" | "personality" | "scenario" | "firstMessage" | "systemPrompt" | "postHistoryInstructions" | "alternateGreetings" | "exampleDialogues" | "rawExampleDialogue" | "tags" | "author" | "characterVersion" | "tavernExtensions" | "embeddedCharacterBook">;
  characterBook?: "none" | "embedded" | "linked" | "both";
  favorite?: boolean;
  startChat?: boolean;
}

export interface CharacterCardExportResult {
  ok: boolean;
  canceled?: boolean;
  error?: string;
  report?: CharacterCardExportReport;
}

export interface CharacterCardExportReport {
  format: "json" | "png";
  profile: "standard" | "privacy-reduced";
  validV2Fields: string[];
  warnings: string[];
  droppedInternalFields: string[];
  extensionNamespaces: string[];
  embeddedLorebookCount: number;
  outputBytes: number;
  image?: { width: number; height: number };
  roundTripVerified: true;
}
