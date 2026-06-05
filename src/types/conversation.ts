/** @fileoverview Type definitions for multi-conversation chat history. */

import type { ConversationSource, MemoryFact } from "./conversationVault";

/** A single message within a conversation. */
export interface ConversationMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning_content?: string;
  timestamp: number;
  metadata?: {
    model?: string;
    safetyDecisionId?: string;
    tokenEstimate?: number;
    attachments?: string[];
    injectedContext?: string;
  };
}

/** A persisted conversation / chat session. */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  systemPrompt?: string;
  messages: ConversationMessage[];
  /** Parent conversation id when this conversation was forked. */
  parentConversationId?: string;
  /** Message ids that were selected when forking. */
  forkedFromMessageIds?: string[];
  metadata?: {
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
  };
  memory?: {
    summary: string;
    topics: string[];
    entities: string[];
    userFacts: MemoryFact[];
    projectRefs: string[];
  };
}

/** Shape of a conversation as stored on disk by the main process. */
export interface ConversationFile {
  version: 1;
  conversation: Conversation;
}

/** Result returned from the chat storage list operation. */
export interface ConversationListResult {
  conversations: Conversation[];
}

/** Payload for saving a conversation through IPC. */
export interface SaveConversationPayload {
  conversation: Conversation;
}
