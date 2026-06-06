/** @fileoverview Shared chat-store serialisation helpers.
 *
 * These helpers are extracted from `chat-store.ts` so non-store callers
 * (the sidebar's Undo button, the IPC layer, tests) can produce the
 * canonical `ConversationRecordV1` wire shape without having to
 * duplicate the field-by-field mapping.
 *
 * Important invariants enforced by `toConversationRecord`:
 *   - `updatedAt` is always >= `createdAt`
 *   - `metadata.messageCount` reflects `messages.length`
 *   - `metadata.tags / pinned / archived / source` are never undefined
 *   - `memory.*` arrays are always present (never undefined)
 *
 * Any future change to `ConversationRecordV1` should land here first and
 * the `VERIFY-005` regression test in `chat-store.flush.test.ts` is the
 * contract that locks the shape.
 */

import type { Conversation } from '../types/conversation'
import type { ConversationRecordV1, ConversationSource } from '../types/conversationVault'

const DEFAULT_TAGS: string[] = []
const DEFAULT_TOPICS: string[] = []
const DEFAULT_ENTITIES: string[] = []
const DEFAULT_USER_FACTS: never[] = []
const DEFAULT_PROJECT_REFS: string[] = []
const DEFAULT_SOURCE: ConversationSource = 'chat'

/**
 * Build the wire-format `ConversationRecordV1` from a `Conversation`.
 * Use this everywhere we hand a conversation to the IPC layer instead
 * of constructing the record inline.
 */
export function toConversationRecord(conv: Conversation): ConversationRecordV1 {
  const now = Date.now()
  const createdAt = conv.createdAt || now
  const updatedAt = Math.max(conv.updatedAt || createdAt, createdAt)
  const messages = conv.messages ?? []
  return {
    version: 1,
    id: conv.id,
    title: conv.title,
    createdAt,
    updatedAt,
    model: conv.model,
    systemPrompt: conv.systemPrompt,
    messages,
    metadata: {
      tags: conv.metadata?.tags ?? DEFAULT_TAGS,
      pinned: conv.metadata?.pinned ?? false,
      archived: conv.metadata?.archived ?? false,
      source: conv.metadata?.source ?? DEFAULT_SOURCE,
      messageCount: messages.length,
      tokenEstimate: conv.metadata?.tokenEstimate,
      lastSummaryAt: conv.metadata?.lastSummaryAt,
      migratedFrom: conv.metadata?.migratedFrom,
      character: conv.metadata?.character,
    },
    memory: {
      summary: conv.memory?.summary ?? conv.title ?? '',
      topics: conv.memory?.topics ?? DEFAULT_TOPICS,
      entities: conv.memory?.entities ?? DEFAULT_ENTITIES,
      userFacts: conv.memory?.userFacts ?? (DEFAULT_USER_FACTS as never[]),
      projectRefs: conv.memory?.projectRefs ?? DEFAULT_PROJECT_REFS,
    },
  }
}
