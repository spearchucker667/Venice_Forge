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

/** Maximum avatar bytes (5 MiB). */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Schema version constant. Bump on breaking changes.
 *  v2 (Phase 2F) added optional `versions`/`currentVersionId`/`firstMessage`/
 *      `metadata` to `CharacterCardV1`, optional `projectId`/`scope` to
 *      `UserPersonaV1`, and optional `projectId`/`characterId`/`scope` to
 *      `LorebookV1`. v2 is fully backward-compatible — v1 records load unchanged. */
export const RP_SCHEMA_VERSION = 2;

/** Phase 2F scenario export envelope version. */
export const RP_SCENARIO_VERSION = 1;

/** Phase 2F character card export envelope version. */
export const RP_CARD_EXPORT_VERSION = 1;

/** Phase 2F lorebook export envelope version. */
export const RP_LOREBOOK_EXPORT_VERSION = 1;

/** Phase 2F persona export envelope version. */
export const RP_PERSONA_EXPORT_VERSION = 1;

/** Phase 2F RP prompt compile result version. */
export const RP_PROMPT_COMPILE_VERSION = 1;

/** Centralised id-validation regex. Must start alphanumeric (rejects "." and "..").
 *  Mirrored in electron/services/{characterCardStorage,rpChatStorage,rpSingleFileStore}.ts. */
export const VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

/** Type-guard wrapper. */
export function isValidRpId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id);
}

export interface CharacterContextFile {
  id: string;
  name: string;
  content: string;
  size: number;
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

/**
 * URL-scraping provider for a character. Replaces the legacy
 * `urlScraping: boolean` field (VERIFY-048 migration surface).
 *
 *   | Value    | Meaning                                                     |
 *   |----------|-------------------------------------------------------------|
 *   | `off`    | URL scraping disabled (legacy `false` or missing)           |
 *   | `brave`  | Use the Brave search/scraping endpoint (legacy `true`)      |
 *   | `google` | Use the Google custom-search endpoint                       |
 */
export type CharacterUrlScrapingProvider = "off" | "brave" | "google";

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

  // Special Character Settings
  contextFiles?: CharacterContextFile[];
  /** Free-form creator instructions injected before the system prompt.
   *  Optional additive field — older CharacterCardV1 records load unchanged. */
  instructions?: string;
  webSearch?: boolean;
  /** URL-scraping provider. Replaces the legacy `urlScraping: boolean`
   *  (boolean loader still supports backcompat via `normalizeCard` / `clampCard`). */
  urlScrapingProvider?: CharacterUrlScrapingProvider;
  enableThoughts?: boolean;
  temperature?: number;
  topP?: number;
  /** Unix ms created. */
  createdAt: number;
  /** Unix ms last updated. */
  updatedAt: number;
  // ---- Phase 2F additions (all OPTIONAL — v1 records load unchanged) ----
  /** Optional greeting shown on the first assistant turn. */
  firstMessage?: string;
  /** Append-only version chain. When present, the live "current" view is the
   *  entry referenced by `currentVersionId` (or the last entry if absent). */
  versions?: CharacterCardVersion[];
  /** Id of the version currently exposed as the "live" card. */
  currentVersionId?: string;
  /** Free-form metadata key/value bag for cross-feature handoffs
   *  (e.g. `attachedSceneId`, `attachedPromptId`, `sourceMediaId`).
   *  NEVER includes API keys, bearer tokens, or raw prompt text. */
  metadata?: Record<string, unknown>;
  /** Unix ms. `undefined` = active; non-null = archived at that time. */
  archivedAt?: number | null;
  // ---- Phase 2G Sync Metadata ----
  deletedAt?: number | null;
  schemaVersion?: number;
  revisionId?: string;
  baseRevisionId?: string;
  deviceId?: string;
}

/** One immutable snapshot in a character card's revision history. */
export interface CharacterCardVersion {
  id: string;
  /** Unix ms. */
  createdAt: number;
  /** Human-readable reason (e.g. "imported from Tavern card"). */
  reason?: string;
  /** Snapshot of the editable fields at this point in time. */
  snapshot: {
    name: string;
    description: string;
    systemPrompt: string;
    scenario?: string;
    tags: string[];
    modelId?: string;
    author?: string;
    adult: boolean;
    exampleDialogues: CharacterExampleDialogue[];
    firstMessage?: string;
  };
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
  image?: PersonaImage;
  createdAt: number;
  updatedAt: number;
  // ---- Phase 2F additions (OPTIONAL — v1 records load unchanged) ----
  /** `null`/undefined = global, otherwise the project this persona is scoped to. */
  projectId?: string | null;
  /** Phase 2F scope discriminator. `undefined` is treated as `"global"`. */
  scope?: "global" | "project";
  // ---- Phase 2G Sync Metadata ----
  deletedAt?: number | null;
  schemaVersion?: number;
  revisionId?: string;
  baseRevisionId?: string;
  deviceId?: string;
}

export interface PersonaImage {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  data: string;
  byteLength: number;
  contentHash?: string;
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
  // ---- Phase 2G Sync Metadata ----
  deletedAt?: number | null;
  schemaVersion?: number;
  revisionId?: string;
  baseRevisionId?: string;
  deviceId?: string;
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
  // ---- Phase 2F additions (OPTIONAL — v1 records load unchanged) ----
  /** `null`/undefined = global lorebook; otherwise the project this lorebook is scoped to. */
  projectId?: string | null;
  /** When set, the lorebook is character-scoped and is only considered when that
   *  character is active. Implies `scope === "character"`. */
  characterId?: string | null;
  /** Phase 2F scope discriminator. `undefined` is treated as `"global"`. */
  scope?: "global" | "project" | "character";
  // ---- Phase 2G Sync Metadata ----
  deletedAt?: number | null;
  schemaVersion?: number;
  revisionId?: string;
  baseRevisionId?: string;
  deviceId?: string;
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

// ---------------------------------------------------------------------------
// Phase 2F — RP Studio Polish
// ---------------------------------------------------------------------------

/** A standalone RP scenario/opener that can be attached to a character card
 *  via `metadata.attachedScenarioId`, or directly to a chat. */
export interface ScenarioV1 {
  schema: "ScenarioV1";
  id: string;
  /** Discriminator for filtering. `undefined` is treated as `"global"`. */
  scope: "global" | "project" | "character";
  /** When `scope === "project"`, the project this scenario belongs to. */
  projectId?: string | null;
  /** When `scope === "character"`, the character card this scenario belongs to. */
  characterId?: string | null;
  /** Optional reference to a scene in the Scene Composer. */
  sceneId?: string | null;
  name: string;
  description: string;
  /** Body content (the scenario / setting text). */
  content: string;
  /** Optional suggested first user message to seed the chat. */
  firstUserMessage?: string;
  tags: string[];
  favorite: boolean;
  /** Unix ms. `undefined` = active; non-null = archived at that time. */
  archivedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  // ---- Phase 2G Sync Metadata ----
  deletedAt?: number | null;
  schemaVersion?: number;
  revisionId?: string;
  baseRevisionId?: string;
  deviceId?: string;
}

/** Sanitized export envelope for character cards (Phase 2F). */
export interface CharacterCardExport {
  version: typeof RP_CARD_EXPORT_VERSION;
  app: "Venice Forge";
  exportedAt: number;
  cards: CharacterCardV1[];
}

/** Sanitized export envelope for lorebooks (Phase 2F). */
export interface LorebookExport {
  version: typeof RP_LOREBOOK_EXPORT_VERSION;
  app: "Venice Forge";
  exportedAt: number;
  lorebooks: LorebookV1[];
}

/** Sanitized export envelope for personas (Phase 2F). */
export interface PersonaExport {
  version: typeof RP_PERSONA_EXPORT_VERSION;
  app: "Venice Forge";
  exportedAt: number;
  personas: UserPersonaV1[];
}

/** Sanitized export envelope for scenarios (Phase 2F). */
export interface ScenarioExport {
  version: typeof RP_SCENARIO_VERSION;
  app: "Venice Forge";
  exportedAt: number;
  scenarios: ScenarioV1[];
}

/** Coerces an unknown value into a valid ScenarioV1, or returns null. */
export function normalizeScenario(input: unknown): ScenarioV1 | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!isValidRpId(id)) return null;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 200) : "";
  if (!name) return null;
  const description = typeof r.description === "string" ? r.description.slice(0, CARD_FIELD_MAX) : "";
  const content = typeof r.content === "string" ? r.content.slice(0, CARD_FIELD_MAX) : "";
  const firstUserMessage =
    typeof r.firstUserMessage === "string" ? r.firstUserMessage.slice(0, CARD_FIELD_MAX) : undefined;
  const tags = Array.isArray(r.tags)
    ? (r.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 64))
    : [];
  if (tags.length > MAX_TAGS) tags.length = MAX_TAGS;
  const scopeRaw = r.scope;
  const scope: ScenarioV1["scope"] =
    scopeRaw === "project" || scopeRaw === "character" ? scopeRaw : "global";
  const projectId = typeof r.projectId === "string" ? r.projectId : null;
  const characterId = typeof r.characterId === "string" ? r.characterId : null;
  const sceneId = typeof r.sceneId === "string" ? r.sceneId : null;
  const favorite = r.favorite === true;
  const archivedAt = typeof r.archivedAt === "number" ? r.archivedAt : null;
  const createdAt = typeof r.createdAt === "number" ? r.createdAt : Date.now();
  const updatedAt = typeof r.updatedAt === "number" ? r.updatedAt : createdAt;
  const out: ScenarioV1 = {
    schema: "ScenarioV1",
    id,
    scope,
    name,
    description,
    content,
    tags,
    favorite,
    createdAt,
    updatedAt,
  };
  if (projectId) out.projectId = projectId;
  if (characterId) out.characterId = characterId;
  if (sceneId) out.sceneId = sceneId;
  if (firstUserMessage) out.firstUserMessage = firstUserMessage;
  if (archivedAt !== null) out.archivedAt = archivedAt;
  return out;
}

/** Maximum number of scenarios allowed in a list. */
export const MAX_LIST_SCENARIOS = 1_000;

export type CharacterPresetSource = "venice-hosted" | "local" | "imported";

export interface CharacterPreset {
  id: string;
  source: CharacterPresetSource;
  slug?: string;
  card?: CharacterCardV1;
}
