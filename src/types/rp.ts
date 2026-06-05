/**
 * @fileoverview Type contracts for the local-first Character Roleplay Studio.
 *
 * Extends — does not replace — the existing `Conversation` / `VeniceCharacter`
 * shapes. The RP studio is a parallel, additive feature: legacy chat/character
 * code paths keep working unchanged.
 *
 * Storage IDs MUST pass `VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/`
 * (must start with an alphanumeric character — rejects "." and "..").
 * This is enforced at every persist boundary (services/rp/* and electron/services/*).
 */

/** Maximum length of any text field on a card before truncation. */
export const CARD_FIELD_MAX = 32_000;

/** Maximum tags per character / persona / lorebook. */
export const MAX_TAGS = 32;

/** Maximum number of lorebook entries per book. */
export const MAX_LOREBOOK_ENTRIES = 500;

/** Maximum characters per lorebook entry. */
export const MAX_LOREBOOK_ENTRY_CHARS = 4_000;

/** Maximum number of characters that can be active in a single RP chat turn. */
export const MAX_ACTIVE_CHARACTERS = 8;

/** Maximum avatar bytes. */
export const MAX_AVATAR_BYTES = 1_048_576;

/** Schema version constant. Bump on breaking changes. */
export const RP_SCHEMA_VERSION = 1;

/** Centralised id-validation regex. Must start alphanumeric (rejects "." and "..").
 *  Mirrored in electron/services/{characterCardStorage,rpChatStorage,rpSingleFileStore}.ts. */
export const VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

/** Type-guard wrapper. */
export function isValidRpId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id);
}

/** Persisted location for a single character card. */
export interface CharacterCardAvatar {
  /** Bytes; for desktop filesystem cards, this is the raw PNG. For web cards, a base64 data URL. */
  data: string;
  /** MIME type. Always `image/png` for v1. */
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  /** Byte length (decoded). */
  byteLength: number;
}

export interface CharacterCardV1 {
  schema: "CharacterCardV1";
  id: string;
  name: string;
  description: string;
  /** System prompt fragment for the character; prepended to the conversation. */
  systemPrompt: string;
  /** Optional RP scenario opener shown to the model on first turn. */
  scenario?: string;
  /** Free-form tags. */
  tags: string[];
  /** Default model for chat; falls back to a global default when unset. */
  modelId?: string;
  /** Author attribution; free text. */
  author?: string;
  /** Whether this card is flagged as adult. */
  adult: boolean;
  /** Optional example dialogue exchanges (few-shot). */
  exampleDialogues: CharacterExampleDialogue[];
  /** Optional avatar. */
  avatar?: CharacterCardAvatar;
  /** Unix ms created. */
  createdAt: number;
  /** Unix ms last updated. */
  updatedAt: number;
}

export interface CharacterExampleDialogue {
  /** Speaker label, e.g. "Alice" or "user". */
  speaker: string;
  text: string;
}

export interface UserPersonaV1 {
  schema: "UserPersonaV1";
  id: string;
  name: string;
  description: string;
  /** Optional third-person reference used by the model. Defaults to name. */
  reference?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type RpRole = "system" | "user" | "character" | "narrator" | "tool";

export interface RpMessageV1 {
  id: string;
  role: RpRole;
  /** Required when role === "character". Identifies the source card. */
  characterId?: string;
  content: string;
  /** Optional model reasoning trace (for reasoning-capable models). */
  reasoning?: string;
  /** Asset references attached to this message. */
  attachments?: RpAttachmentRef[];
  /** Unix ms. */
  createdAt: number;
  /** Free-form key/value bag for store-specific metadata. NEVER includes raw prompt text. */
  metadata?: Record<string, unknown>;
}

export interface RpAttachmentRef {
  /** Asset id from the rp_assets store. */
  assetId: string;
  /** Human-friendly label, e.g. "scene-1.png". */
  label: string;
}

export interface RpChatV1 {
  schema: "RpChatV1";
  id: string;
  title: string;
  /** Active characters in this chat. Order is meaningful for turn arbitration. */
  characterIds: string[];
  /** Active persona for the user. */
  personaId?: string;
  /** Optional scenario override; falls back to the active character(s) scenario. */
  scenario?: string;
  /** Bound lorebook ids. */
  lorebookIds: string[];
  /** Default model for the chat. */
  modelId: string;
  /** Messages. */
  messages: RpMessageV1[];
  /** Whether the chat is flagged as adult. Mirrors any adult characters. */
  adult: boolean;
  /** Pinned, archived, tags — non-destructive UX metadata. */
  metadata: {
    pinned: boolean;
    archived: boolean;
    tags: string[];
  };
  createdAt: number;
  updatedAt: number;
}

export type LorebookInsertionMode = "before_char" | "after_char" | "at_depth";

export interface LorebookEntryV1 {
  id: string;
  /** Triggers: at least one lowercase keyword required. */
  keys: string[];
  /** Optional secondary triggers. */
  secondaryKeys?: string[];
  /** The text that gets injected when triggered. */
  content: string;
  /** When true, the entry is always included regardless of trigger. */
  constant: boolean;
  /** Optional insertion selector. */
  insertionMode: LorebookInsertionMode;
  /** Used when insertionMode === "at_depth". 0 = before all, large = near end. */
  depth?: number;
  /** Order key, ascending. Ties resolved by id. */
  order: number;
  /** When true, triggers are case-sensitive. */
  caseSensitive: boolean;
  /** When true, triggers are matched as whole words only. */
  matchWholeWords: boolean;
  /** Disabled flag. */
  enabled: boolean;
}

export interface LorebookV1 {
  schema: "LorebookV1";
  id: string;
  name: string;
  description: string;
  tags: string[];
  entries: LorebookEntryV1[];
  createdAt: number;
  updatedAt: number;
}

export type RpMemoryScope = "pinned" | "long-term" | "character";

export interface RpMemoryV1 {
  schema: "RpMemoryV1";
  id: string;
  scope: RpMemoryScope;
  /** Required when scope === "character". */
  characterId?: string;
  /** The text content. */
  content: string;
  tags: string[];
  /** Free-form provenance: source message ids, etc. NEVER raw prompt text. */
  source: { messageIds: string[]; kind: "user-stated" | "model-summarized" | "editor-curated" };
  createdAt: number;
  updatedAt: number;
}

/** Reference to a routed image asset (see assetService). */
export interface RpAssetV1 {
  schema: "RpAssetV1";
  id: string;
  /** Owning chat id. */
  chatId: string;
  /** Source message id, if any. */
  messageId?: string;
  /** Characters visible in the asset. */
  characterIds: string[];
  /** Image model id. */
  model: string;
  /** Final prompt used. */
  prompt: string;
  /** Negative prompt, if any. */
  negativePrompt?: string;
  /** Generation seed, if any. */
  seed?: number;
  /** Resolved URL (e.g. file:// path or data URL). */
  url: string;
  /** Free-form metadata (width, height, etc.). NEVER raw prompt text. */
  meta?: Record<string, unknown>;
  createdAt: number;
}

/** Request shape for scene generation. */
export interface SceneGenerationRequest {
  rpChatId: string;
  messageId?: string;
  /** Override the extracted prompt. */
  promptOverride?: string;
  model?: string;
  negativePrompt?: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  /** Whether to run the safety guard before generation. Default true. */
  safetyAssessed?: boolean;
}

export interface SceneGenerationResult {
  ok: true;
  asset: RpAssetV1;
}

export interface SceneGenerationError {
  ok: false;
  error: string;
  /** True when blocked by the safety guard. */
  safetyBlocked: boolean;
}

export type SceneGenerationOutcome = SceneGenerationResult | SceneGenerationError;

/** Inputs to the prompt builder. */
export interface RpPromptContext {
  /** The active RP chat. */
  rpChat: RpChatV1;
  /** Active persona (resolved by id from the persona store). */
  persona?: UserPersonaV1;
  /** Active characters (resolved by id from the card store). */
  characters: CharacterCardV1[];
  /** Active lorebooks (resolved by id). */
  lorebooks: LorebookV1[];
  /** Active memories (pinned + character-scoped + top long-term). */
  memories: RpMemoryV1[];
  /** Model identity (system prompt). */
  modelSystemPrompt?: string;
  /** The user message about to be sent. */
  currentUserMessage: string;
  /** Maximum total characters of the assembled system block. */
  systemBlockBudget: number;
  /** Maximum number of recent messages to include. */
  recentMessageBudget: number;
  /** Optional override: which character id is expected to respond. */
  expectedCharacterId?: string;
}

/** One block in the assembly trace. */
export interface PromptAssemblyTraceEntry {
  id: string;
  kind:
    | "safety-preamble"
    | "model-identity"
    | "persona"
    | "character"
    | "scenario"
    | "lorebook-entry"
    | "memory"
    | "recent-message"
    | "active-turn-instruction"
    | "user-message";
  label: string;
  chars: number;
  included: boolean;
  /** Why it was excluded, when applicable. */
  reason?: "budget-exceeded" | "disabled" | "no-trigger" | "empty";
  /** Originating entity id, when applicable. */
  sourceId?: string;
}

export interface PromptAssemblyResult {
  /** System messages to inject (always in the same order as the trace). */
  systemMessages: { role: "system"; content: string; name?: string }[];
  /** User/assistant messages for the recent turn history. */
  recentMessages: { role: "user" | "assistant" | "character" | "narrator" | "tool"; content: string; characterId?: string; name?: string }[];
  /** The final user message (verbatim). */
  userMessage: { role: "user"; content: string };
  /** Trace entries, one per candidate block in deterministic order. */
  trace: PromptAssemblyTraceEntry[];
  /** Total characters of the system block after budget enforcement. */
  totalSystemChars: number;
  /** Whether the budget was exceeded and blocks were dropped. */
  budgetExceeded: boolean;
}
