/** @fileoverview Shared type definitions for the Venice Forge Encrypted Conversation Vault. */

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

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string | ContentPart[];
  reasoning_content?: string;
  timestamp: number;
  metadata?: {
    model?: string;
    safetyDecisionId?: string;
    tokenEstimate?: number;
    attachments?: string[];
    injectedContext?: string;
    injectedContextSource?: "memory" | "prior_context" | "approved_context" | "mixed";
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
    memoryRetrievalDisabled?: boolean;
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
}

export interface MemoryIndexV1 {
  version: 1;
  updatedAt: number;
  records: MemoryIndexEntryV1[];
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
}
