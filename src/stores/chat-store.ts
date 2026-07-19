import { compileCharacterSystemPrompt } from "../services/rpPromptCompiler";
import { avatarDataUri } from "../components/rp-studio/_shared";
import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { ChatMessage, VeniceParameters } from '../types/venice'
import type { Conversation, ConversationMessage } from '../types/conversation'
import { contentToSearchText } from '../utils/messageContent'
import type { ConversationCharacterMeta } from '../types/conversationVault'
import type { VeniceCharacter } from '../types/characters'
import type { CharacterCardV1 } from '../types/rp'
import { generateId } from '../lib/utils'
import type { PulledMemoryContext } from '../types/conversationVault'
import { toConversationRecord } from './chat-store-helpers'
import { useSettingsStore } from './settings-store' // for defaulting projectRefs to active project on create (polished Phase 1)
import { desktopChat, desktopConversations, isElectron } from '../services/desktopBridge'
import { redactErrorMessage } from '../shared/redaction'
import * as logger from '../shared/logger'
import { DEFAULT_CHAT_MODEL } from '../constants/venice'
import { assertValidId } from '../utils/idValidation'
import StorageService from '../services/storageService'

export interface ConversationSummary {
  id: string
  title: string
  kind: 'standard' | 'character'
  model: string
  createdAt: number
  updatedAt: number
  projectId?: string | null
  archivedAt?: number | null
  character?: ConversationCharacterMeta
  searchablePreview: string
}

const fallbackSummaryCollections = new WeakMap<Conversation[], ConversationSummary[]>()

export function selectConversationSummaries(
  state: Pick<ChatState, 'conversations' | 'conversationSummaries'>,
): ConversationSummary[] {
  const firstConversationId = state.conversations[0]?.id
  const firstSummaryId = state.conversationSummaries[0]?.id
  if (state.conversations.length === state.conversationSummaries.length && firstConversationId === firstSummaryId) {
    return state.conversationSummaries
  }
  const cached = fallbackSummaryCollections.get(state.conversations)
  if (cached) return cached
  const summaries = state.conversations.map(toConversationSummary)
  fallbackSummaryCollections.set(state.conversations, summaries)
  return summaries
}

function toConversationSummary(conversation: Conversation): ConversationSummary {
  const character = conversation.metadata?.character
  return {
    id: conversation.id,
    title: conversation.title,
    kind: character ? 'character' : 'standard',
    model: conversation.model,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    projectId: conversation.memory?.projectRefs?.[0] ?? null,
    archivedAt: conversation.metadata?.archived ? conversation.updatedAt : null,
    character,
    searchablePreview: buildConversationSearchPreview(conversation),
  }
}

function buildConversationSearchPreview(conversation: Conversation): string {
  return [
    conversation.title,
    ...(conversation.messages ?? []).flatMap((message) => [
      contentToSearchText(message.content),
      typeof message.reasoning_content === 'string' ? message.reasoning_content : '',
    ]),
  ].join('\n').toLowerCase()
}

export function selectActiveConversationModel(state: ChatState): string | undefined {
  return state.conversations.find((conversation) => conversation.id === state.activeConversationId)?.model
}

export function selectActiveConversationCharacter(state: ChatState): ConversationCharacterMeta | undefined {
  return state.conversations.find((conversation) => conversation.id === state.activeConversationId)?.metadata?.character
}

const asyncStorageAdapter: StateStorage = {
  getItem: async (name) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage /* localStorage-allowed: one-time migration */) {
        const legacy = window.localStorage.getItem(name); /* localStorage-allowed: one-time migration */
        if (legacy) {
          await StorageService.saveItem('chats', { id: name, value: legacy });
          window.localStorage.removeItem(name); /* localStorage-allowed: remove migrated legacy copy */
          return legacy;
        }
      }
    } catch (e) {
      logger.warn('[chat-store] Migration from localStorage failed', e); /* localStorage-allowed: diagnostic only */
    }
    try {
      const item = await StorageService.getItem<{ id: string; value: string }>('chats', name);
      return item?.value || null;
    } catch (e) {
      logger.warn('[chat-store] getItem failed', e);
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await StorageService.saveItem('chats', { id: name, value });
    } catch (e) {
      logger.warn('[chat-store] setItem failed', e);
    }
  },
  removeItem: async (name) => {
    try {
      await StorageService.deleteItem('chats', name);
    } catch (e) {
      logger.warn('[chat-store] removeItem failed', e);
    }
  }
}



interface ChatState {
  conversations: Conversation[]
  conversationSummaries: ConversationSummary[]
  activeConversationId: string | null
  isStreaming: boolean
  veniceParams: VeniceParameters
  systemPrompt: string
  temperature: number
  topP: number
  maxTokens: number
  _hasLoadedHistory: boolean
  pendingContext: PulledMemoryContext | null

  setConversations: (conversations: Conversation[]) => void
  createConversation: (model: string) => string
  /**
   * Creates a new conversation bound to a Venice hosted character.
   * The character slug and minimal metadata are persisted on the
   * conversation so a chat always uses the original character
   * even if the user later switches the global "selected character"
   * in the Characters tab.
   */
  createCharacterConversation: (
    character: VeniceCharacter,
    fallbackModel: string,
  ) => string
  /**
   * Creates a new conversation bound to a local RP character card.
   * The character is never resolved through Venice.ai; its system prompt
   * and model preferences are persisted on the conversation.
   */
  createLocalCharacterConversation: (
    card: CharacterCardV1,
    fallbackModel: string,
  ) => string
  setActiveConversation: (id: string | null) => void
  deleteConversation: (id: string) => Promise<void>
  deleteConversations: (ids: string[]) => Promise<{
    deleted: string[]
    failed: Array<{ id: string; error: string }>
    activeConversationDeleted: boolean
  }>
  /**
   * Restore a previously-deleted conversation at the top of the list.
   * Used by the Sidebar "Undo" toast.
   */
  restoreConversation: (conv: Conversation) => Promise<void>
  setPendingContext: (context: PulledMemoryContext | null) => void
  addMessage: (conversationId: string, message: ChatMessage) => void
  appendAssistantStreamDelta: (conversationId: string, delta: AssistantStreamDelta) => void
  updateMessage: (conversationId: string, messageId: string, update: { content: ConversationMessage['content']; updatedAt: number }) => boolean
  truncateConversationAfterMessage: (
    conversationId: string,
    messageId: string,
    options: { includeSelected: boolean },
  ) => { removed: ConversationMessage[]; retained: ConversationMessage[] } | null
  forkConversation: (conversationId: string, messageId: string) => string | null
  setConversationModel: (conversationId: string, model: string) => void
  setConversationSystemPromptMode: (conversationId: string, mode: 'inherit' | 'override' | 'disabled') => void
  setConversationMemoryEnabled: (conversationId: string, enabled: boolean) => void
  deleteMessage: (conversationId: string, index: number) => void
  setMessageMetadata: (conversationId: string, messageIndex: number, metadataPatch: Record<string, unknown>) => void
  updateConversationMetadata: (conversationId: string, metadataPatch: Record<string, unknown>) => void
  setStreaming: (streaming: boolean) => void
  setVeniceParams: (params: Partial<VeniceParameters>) => void
  setSystemPrompt: (prompt: string) => void
  setTemperature: (t: number) => void
  setTopP: (p: number) => void
  setMaxTokens: (t: number) => void
  getActiveConversation: () => Conversation | undefined
}

export interface AssistantStreamDelta {
  content?: string
  reasoning?: string
  providerRequestId?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  tool_calls?: import('../types/venice').AssistantToolCall[]
  appendedMessages?: ChatMessage[]
}

export type ConversationMutationPriority = 'stream-delta' | 'message-boundary' | 'structural'

function commitConversationMutation(
  set: (updater: (state: ChatState) => Partial<ChatState>) => void,
  conversationId: string,
  mutate: (conversation: Conversation) => Conversation,
  priority: ConversationMutationPriority,
): void {
  let updatedConversation: Conversation | null = null
  set((state) => {
    const index = state.conversations.findIndex((conversation) => conversation.id === conversationId)
    if (index < 0) return {}
    const current = state.conversations[index]
    const updated = mutate(current)
    if (updated === current) return {}
    updatedConversation = updated
    const conversations = [...state.conversations]
    conversations[index] = updated
    if (priority === 'stream-delta') return { conversations }
    const conversationSummaries = [...state.conversationSummaries]
    const summaryIndex = conversationSummaries.findIndex((summary) => summary.id === conversationId)
    if (summaryIndex >= 0) conversationSummaries[summaryIndex] = toConversationSummary(updated)
    else conversationSummaries.unshift(toConversationSummary(updated))
    return { conversations, conversationSummaries }
  })
  if (updatedConversation) markDirtyConversation(conversationId, updatedConversation, priority)
}

/**
 * Mutate `conv` in-place to keep `metadata.messageCount` in sync with the
 * real `messages.length` and to bump `updatedAt` to the current time. This
 * is the single point of truth for "this conversation just changed".
 */
function touchConversation(conv: Conversation, now: number = Date.now()): Conversation {
  const messages = conv.messages ?? []
  const metadata = {
    ...conv.metadata,
    tags: conv.metadata?.tags ?? [],
    pinned: conv.metadata?.pinned ?? false,
    archived: conv.metadata?.archived ?? false,
    source: conv.metadata?.source ?? 'chat',
    messageCount: messages.length,
    updatedAt: now,
  }
  return { ...conv, messages, updatedAt: now, metadata }
}

function legacyMessageId(conversationId: string, message: ConversationMessage, index: number): string {
  const seed = `${conversationId}\0${index}\0${message.timestamp ?? 0}\0${message.role}\0${contentToSearchText(message.content)}`
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `legacy-${(hash >>> 0).toString(16)}-${index}`
}

export function ensureStableMessageIds(conversation: Conversation): Conversation {
  let changed = false
  const messages = (conversation.messages ?? []).map((message, index) => {
    if (typeof message.id === 'string' && message.id.length > 0) return message
    changed = true
    return { ...message, id: legacyMessageId(conversation.id, message, index) }
  })
  return changed ? touchConversation({ ...conversation, messages }, conversation.updatedAt) : conversation
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      conversationSummaries: [],
      activeConversationId: null,
      isStreaming: false,
      veniceParams: {
        include_venice_system_prompt: true,
        enable_web_search: 'off',
        enable_document_tools: false,
      },
      systemPrompt: '',
      temperature: 0.7,
      topP: 1,
      maxTokens: 4096,
      _hasLoadedHistory: false,
      pendingContext: null,

      setConversations: (conversations) => {
        const stable = conversations.map(ensureStableMessageIds)
        set({
          conversations: stable,
          conversationSummaries: stable.map(toConversationSummary),
          _hasLoadedHistory: true,
        })
      },
      setPendingContext: (context) => set({ pendingContext: context }),

      createConversation: (model) => {
        const id = generateId()
        const now = Date.now()
        const activeProj = useSettingsStore.getState().activeProjectId
        const conv: Conversation = {
          id,
          title: 'New Chat',
          messages: [],
          model,
          createdAt: now,
          updatedAt: now,
          metadata: {
            tags: [],
            pinned: false,
            archived: false,
            source: 'chat',
            messageCount: 0,
          },
          memory: {
            summary: 'New Chat',
            topics: [],
            entities: [],
            userFacts: [],
            projectRefs: activeProj ? [activeProj] : [],
          }
        }
        set((s) => ({
          conversations: [conv, ...s.conversations],
          conversationSummaries: [toConversationSummary(conv), ...s.conversationSummaries],
          activeConversationId: id,
          _hasLoadedHistory: true,
        }))
        markDirtyConversation(id, conv, 'structural')
        return id
      },

      createCharacterConversation: (character, fallbackModel) => {
        const id = generateId()
        const now = Date.now()
        const characterMeta: ConversationCharacterMeta = {
          slug: character.slug,
          id: character.id || undefined,
          name: character.name,
          description: character.description,
          photoUrl: character.photoUrl,
          shareUrl: character.shareUrl,
          modelId: character.modelId,
          adult: character.adult,
          webEnabled: character.webEnabled,
          tags: character.tags,
          stats: character.stats,
        }
        const preferredModel =
          (character.modelId && character.modelId.trim()) || fallbackModel || DEFAULT_CHAT_MODEL
        const activeProj = useSettingsStore.getState().activeProjectId
        const conv: Conversation = {
          id,
          title: `Chat with ${character.name}`,
          messages: character.greeting ? [{
            id: generateId(),
            role: "assistant",
            content: character.greeting,
            timestamp: now,
          }] : [],
          model: preferredModel,
          createdAt: now,
          updatedAt: now,
          metadata: {
            tags: [],
            pinned: false,
            archived: false,
            source: 'character',
            messageCount: character.greeting ? 1 : 0,
            character: characterMeta,
            memoryRetrievalEnabled: false,
          },
          memory: {
            summary: `Chat with ${character.name}`,
            topics: [],
            entities: [],
            userFacts: [],
            projectRefs: activeProj ? [activeProj] : [],
          },
        }
        set((s) => ({
          conversations: [conv, ...s.conversations],
          conversationSummaries: [toConversationSummary(conv), ...s.conversationSummaries],
          activeConversationId: id,
          _hasLoadedHistory: true,
        }))
        markDirtyConversation(id, conv, 'structural')
        return id
      },

      createLocalCharacterConversation: (card, fallbackModel) => {
        const id = generateId()
        const now = Date.now()
        const preferredModel =
          (card.modelId && card.modelId.trim()) || fallbackModel || DEFAULT_CHAT_MODEL
        const activeProj = useSettingsStore.getState().activeProjectId
        const compiledSystemPrompt = compileCharacterSystemPrompt(card.systemPrompt, card.instructions);
        const characterMeta: ConversationCharacterMeta = {
          id: card.id,
          name: card.name,
          localCharacterId: card.id,
          systemPrompt: compiledSystemPrompt,
          modelId: card.modelId,
          adult: card.adult,
          photoUrl: avatarDataUri(card.avatar),
        }
        const conv: Conversation = {
          id,
          title: `Chat with ${card.name || 'local character'}`,
          model: preferredModel,
          systemPrompt: compiledSystemPrompt,
          messages: card.firstMessage ? [{
            id: generateId(),
            role: "assistant",
            content: card.firstMessage,
            timestamp: now,
          }] : [],
          createdAt: now,
          updatedAt: now,
          metadata: {
            tags: [],
            pinned: false,
            archived: false,
            source: 'localCharacter',
            messageCount: card.firstMessage ? 1 : 0,
            character: characterMeta,
            memoryRetrievalEnabled: false,
          },
          memory: {
            summary: `Chat with ${card.name || 'local character'}`,
            topics: [],
            entities: [],
            userFacts: [],
            projectRefs: activeProj ? [activeProj] : [],
          },
        }
        set((s) => ({
          conversations: [conv, ...s.conversations],
          conversationSummaries: [toConversationSummary(conv), ...s.conversationSummaries],
          activeConversationId: id,
          _hasLoadedHistory: true,
        }))
        markDirtyConversation(id, conv, 'structural')
        return id
      },

      setActiveConversation: (id) => set({ activeConversationId: id, pendingContext: null }),

      deleteConversation: async (id) => {
        await get().deleteConversations([id])
      },

      deleteConversations: async (ids) => {
        const uniqueIds = [...new Set(ids)].filter(Boolean)
        if (uniqueIds.length === 0) {
          return { deleted: [], failed: [], activeConversationDeleted: false }
        }

        const existing = new Set(get().conversations.map((c) => c.id))
        const targetIds = uniqueIds.filter((id) => existing.has(id))
        const failed: Array<{ id: string; error: string }> = []
        const deleted: string[] = []

        for (const id of targetIds) {
          try {
            if (!isElectron()) {
              await StorageService.deleteItem('conversations', id)
              deleted.push(id)
              continue
            }
            const convRes = await desktopConversations.delete(id)
            if (convRes.ok) {
              deleted.push(id)
              continue
            }
            const chatRes = await desktopChat.delete(id)
            if (chatRes.ok) {
              deleted.push(id)
              continue
            }
            const error = redactErrorMessage(chatRes.error || convRes.error || 'Delete failed')
            failed.push({ id, error })
            logger.error('[chat] deleteConversation IPC failed', error)
          } catch (err) {
            const error = redactErrorMessage(err instanceof Error ? err.message : 'Delete failed')
            failed.push({ id, error })
            logger.error('[chat] deleteConversation IPC failed', error)
          }
        }

        const deletedSet = new Set(deleted)
        for (const id of deleted) {
          // Prevent pending debounce/unload saves from resurrecting a
          // conversation after the backing store confirmed deletion.
          forgetDirtyConversation(id)
        }
        const activeConversationDeleted = deletedSet.has(get().activeConversationId || '')
        try {
          if (deleted.length > 0) {
            set((s) => ({
              conversations: s.conversations.filter((c) => !deletedSet.has(c.id)),
              conversationSummaries: s.conversationSummaries.filter((summary) => !deletedSet.has(summary.id)),
              activeConversationId: deletedSet.has(s.activeConversationId || '')
                ? null
                : s.activeConversationId,
            }))
          }
        } catch (err) {
          logger.error('[chat] deleteConversation state update failed', err)
        }
        return { deleted, failed, activeConversationDeleted }
      },

      restoreConversation: async (conv) => {
        // Insert at the top (matching the createConversation order) and
        // mark dirty so the debounced save picks it up. Awaiting the save
        // here means the Undo toast is accurate — the user can see "Saved"
        // confirmation rather than wondering if the IPC call landed.
        const restored = touchConversation(conv)
        set((s) => {
          if (s.conversations.some((c) => c.id === restored.id)) return s
          return {
            conversations: [restored, ...s.conversations],
            conversationSummaries: [toConversationSummary(restored), ...s.conversationSummaries],
          }
        })
        markDirtyConversation(restored.id, restored)
        await flushConversationSave(restored.id)
      },

      addMessage: (conversationId, message) => {
        commitConversationMutation(set, conversationId, (c) => {
            const persistedContent: ConversationMessage['content'] =
              typeof message.content === 'string'
                ? message.content
                : [...message.content]
            const persisted: ConversationMessage = {
              id: generateId(),
              role: message.role,
              content: persistedContent,
              reasoning_content: message.reasoning_content,
              timestamp: Date.now(),
              metadata: message.metadata,
            }
            const withMessage: Conversation = {
              ...c,
              messages: [...(c.messages ?? []), persisted],
            }
            const updated = touchConversation(withMessage)
            if (message.role === 'user' && (c.messages?.length ?? 0) === 0) {
              const titleSeed = contentToSearchText(message.content)
              updated.title = titleSeed.slice(0, 50) || 'New Chat'
            }
            return updated
        }, 'message-boundary')
      },

      appendAssistantStreamDelta: (conversationId, delta) => {
        if (!delta.content && !delta.reasoning && !delta.providerRequestId && !delta.usage && !delta.tool_calls && !delta.appendedMessages) return
        commitConversationMutation(set, conversationId, (c) => {
            let msgs = [...(c.messages ?? [])]
            const last = msgs[msgs.length - 1]
            if (last?.role !== 'assistant' || typeof last.content !== 'string') return c
            const metadata = { ...last.metadata }
            if (delta.providerRequestId) metadata.providerRequestId = delta.providerRequestId
            if (delta.usage) metadata.usage = delta.usage
            msgs[msgs.length - 1] = {
              ...last,
              content: last.content + (delta.content ?? ''),
              reasoning_content: (last.reasoning_content || '') + (delta.reasoning ?? ''),
              tool_calls: delta.tool_calls || last.tool_calls,
              metadata,
            }
            if (delta.appendedMessages && delta.appendedMessages.length > 0) {
              const newMsgs = delta.appendedMessages.map(m => ({
                id: generateId(),
                role: m.role,
                content: m.content,
                tool_call_id: m.tool_call_id,
                name: m.name,
                tool_calls: m.tool_calls,
                timestamp: Date.now(),
              })) as ConversationMessage[];
              msgs = msgs.concat(newMsgs);
            }
            // Streaming text is deliberately excluded from sidebar summary
            // freshness. The message boundary/final save owns updatedAt.
            return touchConversation({ ...c, messages: msgs }, c.updatedAt)
        }, 'stream-delta')
      },

      updateMessage: (conversationId, messageId, update) => {
        let updated = false
        commitConversationMutation(set, conversationId, (c) => {
            const messages = (c.messages ?? []).map((message) => {
              if (message.id !== messageId) return message
              updated = true
              return {
                ...message,
                content: typeof update.content === 'string'
                  ? update.content
                  : update.content.map((part) => ({ ...part })),
                updatedAt: update.updatedAt,
              }
            })
            return updated ? touchConversation({ ...c, messages }, update.updatedAt) : c
        }, 'structural')
        return updated
      },

      truncateConversationAfterMessage: (conversationId, messageId, options) => {
        let result: { removed: ConversationMessage[]; retained: ConversationMessage[] } | null = null
        commitConversationMutation(set, conversationId, (c) => {
            const index = (c.messages ?? []).findIndex((message) => message.id === messageId)
            if (index < 0) return c
            const cutAt = options.includeSelected ? index : index + 1
            const retained = c.messages.slice(0, cutAt)
            const removed = c.messages.slice(cutAt)
            result = { retained, removed }
            return touchConversation({ ...c, messages: retained })
        }, 'structural')
        return result
      },

      forkConversation: (conversationId, messageId) => {
        const source = get().conversations.find((conversation) => conversation.id === conversationId)
        const selectedIndex = source?.messages.findIndex((message) => message.id === messageId) ?? -1
        if (!source || selectedIndex < 0) return null
        const now = Date.now()
        const forkId = generateId()
        const messages = source.messages.slice(0, selectedIndex + 1).map((message) => ({
          ...message,
          id: generateId(),
          content: typeof message.content === 'string'
            ? message.content
            : message.content.map((part) => ({ ...part })),
          metadata: message.metadata ? { ...message.metadata } : undefined,
        }))
        const fork: Conversation = touchConversation({
          ...source,
          id: forkId,
          title: `${source.title} — Fork`,
          messages,
          createdAt: now,
          updatedAt: now,
          parentConversationId: source.id,
          forkedFromMessageIds: [messageId],
          forkedFrom: { conversationId: source.id, messageId, createdAt: now },
          metadata: source.metadata ? { ...source.metadata, tags: [...source.metadata.tags] } : undefined,
          memory: source.memory ? {
            ...source.memory,
            topics: [...source.memory.topics],
            entities: [...source.memory.entities],
            userFacts: source.memory.userFacts.map((fact) => ({ ...fact })),
            projectRefs: [...source.memory.projectRefs],
          } : undefined,
        }, now)
        set((s) => ({
          conversations: [fork, ...s.conversations],
          conversationSummaries: [toConversationSummary(fork), ...s.conversationSummaries],
          activeConversationId: forkId,
          pendingContext: null,
        }))
        markDirtyConversation(forkId, fork, 'structural')
        return forkId
      },

      setConversationModel: (conversationId, model) => {
        const normalized = model.trim()
        if (!normalized) return
        commitConversationMutation(
          set,
          conversationId,
          (conversation) => touchConversation({ ...conversation, model: normalized }),
          'structural',
        )
      },

      deleteMessage: (conversationId, index) => {
        commitConversationMutation(set, conversationId, (c) => {
            const msgs = (c.messages ?? []).filter((_, i) => i !== index)
            return touchConversation({ ...c, messages: msgs })
        }, 'structural')
      },

      setMessageMetadata: (conversationId, messageIndex, metadataPatch) => {
        commitConversationMutation(set, conversationId, (c) => {
            const msgs = [...(c.messages ?? [])]
            const msg = msgs[messageIndex]
            if (!msg) return c
            msgs[messageIndex] = { ...msg, metadata: { ...msg.metadata, ...metadataPatch } }
            return touchConversation({ ...c, messages: msgs })
        }, 'structural')
      },
        
      updateConversationMetadata: (conversationId, metadataPatch) => {
        commitConversationMutation(set, conversationId, (c) => {
            return touchConversation({
              ...c,
              metadata: {
                tags: c.metadata?.tags ?? [],
                pinned: c.metadata?.pinned ?? false,
                archived: c.metadata?.archived ?? false,
                source: c.metadata?.source ?? 'chat',
                messageCount: c.metadata?.messageCount ?? (c.messages?.length ?? 0),
                ...c.metadata,
                ...metadataPatch,
              },
            })
        }, 'structural')
      },

      setConversationSystemPromptMode: (conversationId, mode) => {
        commitConversationMutation(set, conversationId, (c) => ({
            ...c,
            metadata: {
              tags: c.metadata?.tags ?? [],
              pinned: c.metadata?.pinned ?? false,
              archived: c.metadata?.archived ?? false,
              source: c.metadata?.source ?? 'chat',
              messageCount: c.metadata?.messageCount ?? (c.messages?.length ?? 0),
              ...c.metadata,
              systemPromptMode: mode,
            }
          }), 'structural')
      },
      setConversationMemoryEnabled: (conversationId, enabled) => {
        commitConversationMutation(set, conversationId, (c) => {
            return touchConversation({
              ...c,
              metadata: {
                tags: c.metadata?.tags ?? [],
                pinned: c.metadata?.pinned ?? false,
                archived: c.metadata?.archived ?? false,
                source: c.metadata?.source ?? 'chat',
                messageCount: c.metadata?.messageCount ?? (c.messages?.length ?? 0),
                ...c.metadata,
                memoryRetrievalEnabled: enabled,
              },
            })
        }, 'structural')
      },

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      setVeniceParams: (params) =>
        set((s) => ({ veniceParams: { ...s.veniceParams, ...params } })),

      setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
      setTemperature: (t) => set({ temperature: t }),
      setTopP: (p) => set({ topP: p }),
      setMaxTokens: (t) => set({ maxTokens: t }),

      getActiveConversation: () => {
        const { conversations, activeConversationId } = get()
        return conversations.find((c) => c.id === activeConversationId)
      },
    }),
    {
      name: 'venice-chat',
      version: 3,
      storage: createJSONStorage(() => asyncStorageAdapter),
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted as ChatState
        const s = persisted as Partial<ChatState>
        if (!s.veniceParams || typeof s.veniceParams !== 'object') {
          s.veniceParams = { include_venice_system_prompt: true, enable_web_search: 'off', enable_document_tools: false }
        }
        if (version < 3) {
          // Remove conversations from local storage on version 3 upgrade
          delete (s as Record<string, unknown>).conversations
        }
        return s as ChatState
      },
      partialize: (state) => ({
        // DO NOT persist conversations to localStorage anymore. Handled by IPC.
        activeConversationId: state.activeConversationId,
        veniceParams: state.veniceParams,
        systemPrompt: state.systemPrompt,
        temperature: state.temperature,
        topP: state.topP,
        maxTokens: state.maxTokens,
      }),
    },
  ),
)

// ---------------------------------------------------------------------------
// Module-level persistence layer
// ---------------------------------------------------------------------------
// Why a module-level dirty map?
//   - The previous implementation only debounced-saved the *active*
//     conversation. Editing a non-active chat (renaming, tagging) would be
//     silently dropped on the next reload because the IPC `save` was never
//     invoked.
//   - We now track EVERY conversation the store mutates (active or not)
//     in a `dirty` map and coalesce the writes per id. A change to a
//     non-active chat still results in a write to disk within 500ms.
//
// The map is intentionally module-scoped (not Zustand state) so it does
// not participate in the persist middleware — it is pure in-memory dirty
// tracking and is wiped on full page reload by definition.
// ---------------------------------------------------------------------------

const dirtyConversations: Map<string, Conversation> = new Map()
let saveTimer: ReturnType<typeof setTimeout> | null = null
const STREAM_CHECKPOINT_MS = 1500
const MESSAGE_BOUNDARY_MS = 100
/** Prevent the dirty map from growing without bound if a huge number of
 *  conversations mutate in a short window. Crossing the limit flushes
 *  immediately rather than waiting for the debounce. */
const MAX_DIRTY_CONVERSATIONS = 1000

function markDirtyConversation(
  id: string,
  conv: Conversation,
  priority: ConversationMutationPriority = 'message-boundary',
): void {
  assertValidId(id, 'markDirtyConversation')
  dirtyConversations.set(id, conv)
  if (dirtyConversations.size > MAX_DIRTY_CONVERSATIONS) {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    void flushAllPendingSaves()
  } else {
    scheduleFlush(priority, id)
  }
}

function forgetDirtyConversation(id: string): void {
  dirtyConversations.delete(id)
}

function scheduleFlush(priority: ConversationMutationPriority, id: string): void {
  if (priority === 'structural') {
    void flushConversationSave(id).catch((error) => {
      logger.error('[chat] structural conversation save failed', redactErrorMessage(error))
    })
    return
  }
  // Stream chunks never reset an existing checkpoint. A continuous stream
  // therefore writes at most once per checkpoint window instead of postponing
  // persistence forever or saving every token.
  if (priority === 'stream-delta' && saveTimer !== null) return
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushAllPendingSaves()
  }, priority === 'stream-delta' ? STREAM_CHECKPOINT_MS : MESSAGE_BOUNDARY_MS)
}

async function writeConversation(conv: Conversation): Promise<void> {
  const record = toConversationRecord(conv)
  if (!isElectron()) {
    try {
      await StorageService.saveItem('conversations', { ...record, timestamp: conv.updatedAt } as Record<string, unknown>)
      return
    } catch (err) {
      const error = redactErrorMessage(err instanceof Error ? err.message : 'Web conversation save failed')
      logger.error('[chat] web conversations.save failed', error)
      throw new Error(error)
    }
  }
  try {
    const convRes = await desktopConversations.save(record)
    if (convRes.ok) return
    const chatRes = await desktopChat.save(conv)
    if (chatRes.ok) return
    const error = redactErrorMessage(chatRes.error || 'Fallback chat save failed')
    logger.error('[chat] conversations.save failed', error)
    throw new Error(error)
  } catch (err) {
    const error = redactErrorMessage(err instanceof Error ? err.message : 'Conversation save failed')
    logger.error('[chat] conversations.save failed', error)
    throw new Error(error)
  }
}

async function flushConversationSave(id: string): Promise<void> {
  const conv = dirtyConversations.get(id)
  if (!conv) return
  await writeConversation(conv)
  // A newer mutation may have replaced this entry while the async write was
  // in flight. Only clear the exact snapshot that reached durable storage.
  if (dirtyConversations.get(id) === conv) dirtyConversations.delete(id)
}

/** Flushes one conversation at a message/stream boundary. */
export async function flushConversationSaveNow(id: string): Promise<void> {
  await flushConversationSave(id)
}

/**
 * Flush every dirty conversation to disk. Called by:
 *   - The 500ms debounce timer
 *   - The `pagehide` and `beforeunload` listeners (synchronously kick it
 *     off — the actual save is async, but the IPC channel is fire-and-
 *     forget in the unload path so the renderer does not block on it).
 *   - Tests (via the exported `flushAllPendingSaves`).
 *
 * Returns a promise that resolves once every pending write has been
 * attempted. Errors from individual writes are logged and the failing
 * conversation is left in the dirty map so the next flush can retry —
 * one bad write should not stop the rest from landing.
 */
export async function flushAllPendingSaves(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const pending = Array.from(dirtyConversations.entries())
  for (const [id, conv] of pending) {
    try {
      await writeConversation(conv)
      if (dirtyConversations.get(id) === conv) dirtyConversations.delete(id)
    } catch (err) {
      logger.error('[chat] flush conversation save failed', redactErrorMessage(err))
    }
  }
}

/** Test-only: synchronously inspect the dirty map. */
export function _debugGetDirtyConversationIds(): readonly string[] {
  return Array.from(dirtyConversations.keys())
}

// Re-export the serialisation helper so other modules (sidebar undo, IPC
// layer, tests) can build the wire-format record without depending on
// the store's internals.
export { toConversationRecord } from './chat-store-helpers'

let cleanupUnloadListeners: (() => void) | undefined
/**
 * Exported for test cleanup only. The renderer process keeps the listeners
 * attached for its full lifetime — Electron does not reload the renderer
 * mid-session, so teardown is unnecessary in production code. Tests still
 * call this to verify the listeners are wired correctly and to deregister
 * them between specs so they do not leak across test files.
 */
export { cleanupUnloadListeners }

// Sync conversations with Desktop backend
if (typeof window !== 'undefined') {
  // Load initially on the next microtask. The previous setTimeout(..., 100)
  // raced with synchronous createConversation() calls (which set
  // _hasLoadedHistory = true only after setConversations runs, and the timer
  // could fire *before* the user clicked "new chat" — the loaded list would
  // then overwrite the brand-new conversation). A microtask defers past
  // the current synchronous tick so any caller that runs in the same
  // tick (e.g. App.tsx mount → user click) wins.
  //
  // Hardened against partial test mocks: if either
  // `desktopConversations.list` or `desktopChat.list` is missing or
  // not a function (e.g. a stale vi.mock block in a test that does
  // not include the newer desktopConversations export), the
  // bootstrap must NOT throw an unhandled error. The two helpers
  // below short-circuit cleanly and log the same shape of warning
  // we already use elsewhere so the failure is observable without
  // it escaping asynchronously and poisoning unrelated tests.
  const loadWebConversations = async (): Promise<void> => {
    try {
      const records = await StorageService.getItems<Conversation>("conversations");
      const state = useChatStore.getState();
      if (!state._hasLoadedHistory) {
        // If the store already contains conversations (e.g. a synchronous test
        // seed or a createConversation call that beat the async load), keep the
        // in-memory state and just mark history as loaded. This prevents the
        // bootstrap from racing with callers that bypass setConversations().
        state.setConversations(state.conversations.length === 0 ? records : state.conversations);
      }
    } catch (err) {
      logger.error("[chat] web conversations bootstrap failed", redactErrorMessage(err));
    }
  };

  const safeList = (
    namespace: "vault" | "legacy",
    provider: { list?: unknown },
  ): Promise<void> => {
    const list = provider?.list;
    if (typeof list !== "function") {
      logger.warn(`[chat] ${namespace}.list unavailable; skipping bootstrap`);
      return Promise.resolve();
    }
    return (list as () => Promise<unknown>).call(provider).then(
      (raw) => {
        const result = raw as
          | { ok: boolean; records?: unknown[]; conversations?: unknown[]; truncated?: boolean; totalScanned?: number; error?: string }
          | undefined;
        if (!result) return;
        if (!useChatStore.getState()._hasLoadedHistory && result.ok) {
          const records = result.records ?? result.conversations ?? [];
          useChatStore.getState().setConversations(records as never);
        } else if (!result.ok) {
          logger.error(`[chat] ${namespace}.list failed`, result.error);
        }
        if (result.truncated) {
          logger.warn(
            `[chat] conversation list truncated — ${result.totalScanned ?? 0} files on disk, ` +
              `showing ${(result.conversations ?? []).length}. Consider archiving old chats.`,
          );
        }
      },
      (err) => {
        logger.error(`[chat] ${namespace}.list rejected`, err instanceof Error ? err.message : err);
      },
    );
  };
  queueMicrotask(() => {
    if (!isElectron()) {
      void loadWebConversations();
      return;
    }
    safeList("vault", desktopConversations as { list?: unknown })
      .catch((err) => logger.error("[chat] vault bootstrap threw", err))
      .finally(() => {
        // Legacy fallback: if the new conversation vault failed or is
        // unavailable (e.g. an older desktop build without the vault IPC),
        // hydrate from the legacy chat namespace. The _hasLoadedHistory
        // guard prevents overwriting a successful vault load.
        return safeList("legacy", desktopChat as { list?: unknown });
      })
      .catch((err) => logger.error("[chat] legacy bootstrap threw", err));
  })

  // Flush explicit O(1) dirty entries on unload. Durable actions call
  // commitConversationMutation/markDirtyConversation directly; there is no
  // process-lifetime subscription scanning the full collection.
  cleanupUnloadListeners = (() => {
    const onBeforeUnload = () => {
      // Fire-and-forget: the browser may not await this promise, but the
      // IPC channel is still flushed to the main process.
      void flushAllPendingSaves()
    }
    const onPageHide = () => {
      void flushAllPendingSaves()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      window.removeEventListener("pagehide", onPageHide)
    }
  })()
}
