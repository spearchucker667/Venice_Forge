/** @fileoverview Shared type definitions for the Venice Forge Encrypted Conversation Vault. */

import type { CharacterSceneGenerationResult } from "./characterSceneGeneration";
import type { ContentPart } from "./venice";

export type ConversationSource =
  | "chat"
  | "playground"
  | "cli"
  | "import"
  | "migration"
  | "character"
  | "localCharacter";

export type ConversationRole =
  | "system"
  | "user"
  | "assistant"
  | "tool";

/** Minimal Venice character metadata persisted alongside a conversation.
 *  The full `VeniceCharacter` object is intentionally NOT persisted — only
 *  the fields needed to render the active-character pill and to re-build a
 *  chat request. The slug alone is sufficient to re-fetch the canonical
 *  record. */
export interface ConversationCharacterMeta {
  /** Venice.ai-hosted character slug. Required for hosted characters;
   *  omitted for local RP characters. */
  slug?: string;
  /** Venice.ai character id (hosted) or local character card id. */
  id?: string;
  name: string;
  description?: string;
  photoUrl?: string;
  shareUrl?: string;
  modelId?: string;
  adult?: boolean;
  webEnabled?: boolean;
  /** Set when this conversation was started from a local RP character card
   *  so the app never tries to resolve it through Venice.ai. */
  localCharacterId?: string;
  /** Local character system prompt / personality text injected as the
   *  first system message. */
  systemPrompt?: string;
  tags?: string[];
  stats?: {
    averageRating?: number;
    imports?: number;
    ratingCount?: number;
    ratingSum?: number;
    userRating?: number;
  };
}


export interface ChatMediaReference {
  /** Stable per-message attachment id (uNanoId-shaped). */
  id: string;
  /** Media Studio asset id (matches `MediaItem.id`). */
  mediaId: string;
  /** Coarse MIME bucket that drives the render strategy. */
  mediaType: "image" | "video" | "audio";
  /** Originating operation — drives lineage + history filters. */
  operation: "generate" | "edit" | "upscale" | "transcribe" | "audio";
  /** Safe renderer-consumable URL (`venice-media://…`, `venice-character-cache://…`, `data:…`). */
  displayUrl: string;
  thumbnailUrl?: string;
  altText?: string;
  modelId?: string;
  createdAt: number;
  deletedFromChatAt?: number;
  orphanedFromChat?: boolean;
}

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string | ContentPart[];
  reasoning_content?: string;
  tool_calls?: import("./venice").AssistantToolCall[];
  tool_call_id?: string;
  timestamp: number;
  updatedAt?: number;
  metadata?: {
    model?: string;
    safetyDecisionId?: string;
    tokenEstimate?: number;
    attachments?: string[];
    injectedContext?: string;
    injectedContextSource?: "memory" | "prior_context" | "approved_context" | "mixed";
    sceneGeneration?: CharacterSceneGenerationResult;
    generatedMedia?: ChatMediaReference[];
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      estimated?: boolean;
      contextLimit?: number;
      contextPercent?: number;
    };
  };
}

export interface MemoryFact {
  id: string;
  text: string;
  confidence: number;
  sourceMessageIds: string[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  forgotten?: boolean;
}

export interface ConversationRecordV1 {
  version: 1;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  systemPrompt?: string;
  parentConversationId?: string;
  forkedFromMessageIds?: string[];
  forkedFrom?: {
    conversationId: string;
    messageId: string;
    createdAt: number;
  };
  messages: ConversationMessage[];
  metadata: {
    tags: string[];
    pinned: boolean;
    archived: boolean;
    source: ConversationSource;
    messageCount: number;
    tokenEstimate?: number;
    lastSummaryAt?: number;
    migratedFrom?: {
      oldPath: string;
      oldId: string;
      migratedAt: number;
    };
    character?: ConversationCharacterMeta;
    memoryRetrievalEnabled?: boolean;
    includePriorConversationContext?: boolean;
    autoReadEnabled?: boolean;
    systemPromptMode?: "inherit" | "override" | "disabled";
  };
  memory: {
    summary: string;
    topics: string[];
    entities: string[];
    userFacts: MemoryFact[];
    projectRefs: string[];
  };
}

export interface VaultKeyFileV1 {
  version: 1;
  keyId: string;
  wrappedKey: string;
  wrappedWith: "electron.safeStorage" | "plaintext";
  createdAt: number;
  updatedAt: number;
}

export interface EncryptedVaultFileV1 {
  version: 1;
  algorithm: "aes-256-gcm";
  keyId: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  aad?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryIndexEntryV1 {
  id: string;
  title: string;
  recordPath: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  tags: string[];
  summary: string;
  topics: string[];
  entities: string[];
  keywords: string[];
  messageCount: number;
  pinned: boolean;
  archived: boolean;
  /** Optional character binding so character-scoped retrieval can filter
   *  before applying the result limit. */
  characterId?: string;
}

export interface MemoryIndexV1 {
  version: 1;
  updatedAt: number;
  records: MemoryIndexEntryV1[];
}

export interface MemoryIndexEntryV2 extends Omit<MemoryIndexEntryV1, "characterId"> {
  /** Explicitly null for non-character conversations so scoped retrieval is stable after migration. */
  characterId: string | null;
}

export interface MemoryIndexV2 {
  version: 2;
  updatedAt: number;
  records: MemoryIndexEntryV2[];
}

export interface SearchResult {
  id: string;
  title: string;
  score: number;
  matchedFields: Array<
    | "title"
    | "tags"
    | "entities"
    | "topics"
    | "keywords"
    | "summary"
    | "recency"
    | "pinned"
  >;
  summary: string;
  updatedAt: number;
}

export interface PulledMemoryContext {
  injectedText: string;
  facts: MemoryFact[];
  summaries: string[];
  tokenEstimate: number;
  message?: string;
  conversationId?: string;
  requestId?: string;
}

// ---------------------------------------------------------------------------
// ChatMediaReference — canonical schema shared across renderer + vault types.
// Work-order Phase 6 makes this list-shaped (`metadata.generatedMedia?: T[]`),
// adds operation / mediaType visibility, and exposes the soft tombstone
// (`deletedFromChatAt`) and rollback flag (`orphanedFromChat`) so the renderer
// can offer a transparent undo path without dropping the underlying asset.
// ---------------------------------------------------------------------------

const CHAT_MEDIA_TYPES = new Set(["image", "video", "audio"]);
const CHAT_MEDIA_OPERATIONS = new Set([
  "generate",
  "edit",
  "upscale",
  "transcribe",
  "audio",
]);
const CHAT_MEDIA_REF_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;

/** Narrow predicate for a single `ChatMediaReference`. */
export function isChatMediaReference(value: unknown): value is ChatMediaReference {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !CHAT_MEDIA_REF_ID_RE.test(v.id)) return false;
  if (typeof v.mediaId !== "string" || !CHAT_MEDIA_REF_ID_RE.test(v.mediaId)) {
    return false;
  }
  if (typeof v.mediaType !== "string" || !CHAT_MEDIA_TYPES.has(v.mediaType)) {
    return false;
  }
  if (typeof v.operation !== "string" || !CHAT_MEDIA_OPERATIONS.has(v.operation)) {
    return false;
  }
  if (typeof v.displayUrl !== "string" || v.displayUrl.length === 0) return false;
  if (typeof v.createdAt !== "number" || !Number.isFinite(v.createdAt)) return false;
  if (
    v.thumbnailUrl !== undefined &&
    (typeof v.thumbnailUrl !== "string" || v.thumbnailUrl.length === 0)
  ) {
    return false;
  }
  if (
    v.altText !== undefined &&
    (typeof v.altText !== "string" || v.altText.length === 0)
  ) {
    return false;
  }
  if (
    v.modelId !== undefined &&
    (typeof v.modelId !== "string" || v.modelId.length === 0)
  ) {
    return false;
  }
  if (
    v.deletedFromChatAt !== undefined &&
    (typeof v.deletedFromChatAt !== "number" ||
      !Number.isFinite(v.deletedFromChatAt))
  ) {
    return false;
  }
  if (v.orphanedFromChat !== undefined && typeof v.orphanedFromChat !== "boolean") {
    return false;
  }
  return true;
}

/** Narrow predicate for the list shape used by `metadata.generatedMedia`. */
export function isChatMediaReferenceArray(
  value: unknown,
): value is ChatMediaReference[] {
  return Array.isArray(value) && value.every(isChatMediaReference);
}

export interface CreateChatMediaReferenceInput {
  id: string;
  mediaId: string;
  mediaType: ChatMediaReference["mediaType"];
  operation: ChatMediaReference["operation"];
  displayUrl: string;
  thumbnailUrl?: string;
  altText?: string;
  modelId?: string;
  createdAt?: number;
}

/** Tiny idempotent suffix generator so two callers never collide on clone(). */
function safeNanoSuffix(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return hex === "00000000" ? "0001" : hex;
}

function isValidChatMediaReferenceId(value: string): boolean {
  return typeof value === "string" && CHAT_MEDIA_REF_ID_RE.test(value);
}

/** Constructor. Throws on every invalid field so call sites fail loud at startup. */
export function createChatMediaReference(
  input: CreateChatMediaReferenceInput,
): ChatMediaReference {
  if (!isValidChatMediaReferenceId(input.id)) {
    throw new Error("createChatMediaReference: invalid id");
  }
  if (!isValidChatMediaReferenceId(input.mediaId)) {
    throw new Error("createChatMediaReference: invalid mediaId");
  }
  if (!CHAT_MEDIA_TYPES.has(input.mediaType)) {
    throw new Error(`createChatMediaReference: invalid mediaType ${input.mediaType}`);
  }
  if (!CHAT_MEDIA_OPERATIONS.has(input.operation)) {
    throw new Error(`createChatMediaReference: invalid operation ${input.operation}`);
  }
  if (typeof input.displayUrl !== "string" || input.displayUrl.length === 0) {
    throw new Error("createChatMediaReference: displayUrl is required");
  }
  const ref: ChatMediaReference = {
    id: input.id,
    mediaId: input.mediaId,
    mediaType: input.mediaType,
    operation: input.operation,
    displayUrl: input.displayUrl,
    createdAt: input.createdAt ?? Date.now(),
  };
  if (input.thumbnailUrl !== undefined) ref.thumbnailUrl = input.thumbnailUrl;
  if (input.altText !== undefined) ref.altText = input.altText;
  if (input.modelId !== undefined) ref.modelId = input.modelId;
  return ref;
}

/** Clone with a deterministic new id (used by the toast-undo restore path). */
export function cloneChatMediaReference(
  ref: ChatMediaReference,
  overrides: Partial<ChatMediaReference> = {},
): ChatMediaReference {
  const id = overrides.id ?? `${ref.id}-r${safeNanoSuffix(ref.id)}`;
  return createChatMediaReference({
    id,
    mediaId: overrides.mediaId ?? ref.mediaId,
    mediaType: overrides.mediaType ?? ref.mediaType,
    operation: overrides.operation ?? ref.operation,
    displayUrl: overrides.displayUrl ?? ref.displayUrl,
    thumbnailUrl: overrides.thumbnailUrl ?? ref.thumbnailUrl,
    altText: overrides.altText ?? ref.altText,
    modelId: overrides.modelId ?? ref.modelId,
    createdAt: overrides.createdAt ?? ref.createdAt,
  });
}

/**
 * Coerce an unknown value (legacy single object, list, or undefined) into a
 * canonical `ChatMediaReference[]`. Drops malformed entries rather than
 * throwing — full reconciliation is the migrator's responsibility.
 */
export function coerceToChatMediaReferenceArray(
  value: unknown,
): ChatMediaReference[] {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.filter(isChatMediaReference);
}
