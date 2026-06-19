import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatMessage, VeniceParameters } from '../types/venice'
import type { Conversation, ConversationMessage } from '../types/conversation'
import { contentToSearchText } from '../utils/messageContent'
import type { ConversationCharacterMeta } from '../types/conversationVault'
import type { VeniceCharacter } from '../types/characters'
import type { CharacterCardV1 } from '../types/rp'
import { generateId } from '../lib/utils'
import { createSafeStorage } from '../lib/safe-storage'
import type { PulledMemoryContext } from '../types/conversationVault'
import { toConversationRecord } from './chat-store-helpers'
import { useSettingsStore } from './settings-store' // for defaulting projectRefs to active project on create (polished Phase 1)
import { desktopChat, desktopConversations } from '../services/desktopBridge'
import { redactErrorMessage } from '../shared/redaction'
import * as logger from '../shared/logger'
import { DEFAULT_CHAT_MODEL } from '../constants/venice'
import { assertValidId } from '../utils/idValidation'



interface ChatState {
  conversations: Conversation[]
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
  appendToLastAssistant: (conversationId: string, token: string) => void
  appendReasoningToLastAssistant: (conversationId: string, token: string) => void
  deleteMessage: (conversationId: string, index: number) => void
  setMessageMetadata: (conversationId: string, messageIndex: number, metadataPatch: Record<string, unknown>) => void
  setConversationMemoryEnabled: (conversationId: string, enabled: boolean) => void
  setStreaming: (streaming: boolean) => void
  setVeniceParams: (params: Partial<VeniceParameters>) => void
  setSystemPrompt: (prompt: string) => void
  setTemperature: (t: number) => void
  setTopP: (p: number) => void
  setMaxTokens: (t: number) => void
  getActiveConversation: () => Conversation | undefined
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

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      isStreaming: false,
      veniceParams: {
        include_venice_system_prompt: true,
        enable_web_search: 'off',
      },
      systemPrompt: '',
      temperature: 0.7,
      topP: 1,
      maxTokens: 4096,
      _hasLoadedHistory: false,
      pendingContext: null,

      setConversations: (conversations) => set({ conversations, _hasLoadedHistory: true }),
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
          activeConversationId: id,
          _hasLoadedHistory: true,
        }))
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
          messages: [],
          model: preferredModel,
          createdAt: now,
          updatedAt: now,
          metadata: {
            tags: [],
            pinned: false,
            archived: false,
            source: 'character',
            messageCount: 0,
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
          activeConversationId: id,
          _hasLoadedHistory: true,
        }))
        return id
      },

      createLocalCharacterConversation: (card, fallbackModel) => {
        const id = generateId()
        const now = Date.now()
        const preferredModel =
          (card.modelId && card.modelId.trim()) || fallbackModel || DEFAULT_CHAT_MODEL
        const activeProj = useSettingsStore.getState().activeProjectId
        const characterMeta: ConversationCharacterMeta = {
          id: card.id,
          name: card.name,
          localCharacterId: card.id,
          systemPrompt: card.systemPrompt,
          modelId: card.modelId,
          adult: card.adult,
        }
        const conv: Conversation = {
          id,
          title: `Chat with ${card.name || 'local character'}`,
          model: preferredModel,
          systemPrompt: card.systemPrompt,
          messages: [],
          createdAt: now,
          updatedAt: now,
          metadata: {
            tags: [],
            pinned: false,
            archived: false,
            source: 'localCharacter',
            messageCount: 0,
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
          activeConversationId: id,
          _hasLoadedHistory: true,
        }))
        return id
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),

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
          return { conversations: [restored, ...s.conversations] }
        })
        markDirtyConversation(restored.id, restored)
        await flushConversationSave(restored.id)
      },

      addMessage: (conversationId, message) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
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
          }),
        })),

      appendToLastAssistant: (conversationId, token) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const msgs = [...(c.messages ?? [])]
            const last = msgs[msgs.length - 1]
            if (last?.role === 'assistant' && typeof last.content === 'string') {
              msgs[msgs.length - 1] = { ...last, content: last.content + token }
            }
            return touchConversation({ ...c, messages: msgs })
          }),
        })),

      appendReasoningToLastAssistant: (conversationId, token) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const msgs = [...(c.messages ?? [])]
            const last = msgs[msgs.length - 1]
            if (last?.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, reasoning_content: (last.reasoning_content || '') + token }
            }
            return touchConversation({ ...c, messages: msgs })
          }),
        })),

      deleteMessage: (conversationId, index) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const msgs = (c.messages ?? []).filter((_, i) => i !== index)
            return touchConversation({ ...c, messages: msgs })
          }),
        })),

      setMessageMetadata: (conversationId, messageIndex, metadataPatch) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const msgs = [...(c.messages ?? [])]
            const msg = msgs[messageIndex]
            if (!msg) return c
            msgs[messageIndex] = { ...msg, metadata: { ...msg.metadata, ...metadataPatch } }
            return touchConversation({ ...c, messages: msgs })
          }),
        })),

      setConversationMemoryEnabled: (conversationId, enabled) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
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
          }),
        })),

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
      storage: createJSONStorage(() => createSafeStorage()),
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted as ChatState
        const s = persisted as Partial<ChatState>
        if (!s.veniceParams || typeof s.veniceParams !== 'object') {
          s.veniceParams = { include_venice_system_prompt: true, enable_web_search: 'off' }
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
const DEBOUNCE_MS = 500
/** Prevent the dirty map from growing without bound if a huge number of
 *  conversations mutate in a short window. Crossing the limit flushes
 *  immediately rather than waiting for the debounce. */
const MAX_DIRTY_CONVERSATIONS = 1000

function markDirtyConversation(id: string, conv: Conversation): void {
  assertValidId(id, 'markDirtyConversation')
  dirtyConversations.set(id, conv)
  if (dirtyConversations.size > MAX_DIRTY_CONVERSATIONS) {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    void flushAllPendingSaves()
  } else {
    scheduleFlush()
  }
}

function forgetDirtyConversation(id: string): void {
  dirtyConversations.delete(id)
}

function scheduleFlush(): void {
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushAllPendingSaves()
  }, DEBOUNCE_MS)
}

async function writeConversation(conv: Conversation): Promise<void> {
  const record = toConversationRecord(conv)
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
  dirtyConversations.delete(id)
}

/**
 * Flush every dirty conversation to disk. Called by:
 *   - The 500ms debounce timer
 *   - The `pagehide` and `beforeunload` listeners (synchronously kick it
 *     off — the actual save is async, but the IPC channel is fire-and-
 *     forget in the unload path so the renderer does not block on it).
 *   - Tests (via `flushAllPendingSavesForTests`).
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
      dirtyConversations.delete(id)
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
/** Exported for test cleanup only. */
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

  // Save changes — debounced, with flush-on-unload so a pending edit is
  // not silently dropped when the renderer tab closes.
  // We track BOTH the active and any non-active conversation that mutated
  // during the debounce window. `markDirtyConversation` is the entry point
  // called from the subscribe callback below.
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

  useChatStore.subscribe((state, prevState) => {
    // If any conversation's identity changed (i.e. it was replaced in
    // the conversations array, which Zustand does on `set` with a
    // fresh object), mark it dirty. This catches BOTH the active
    // conversation (e.g. addMessage) AND non-active ones (e.g. delete
    // a message in a background chat via the Search panel).
    //
    // Build a Map of previous conversations by id so the per-item lookup
    // is O(1) instead of O(n); the whole subscription is now O(n).
    const prevById = new Map<string, Conversation>()
    for (const p of prevState.conversations) {
      prevById.set(p.id, p)
    }
    for (const c of state.conversations) {
      const prev = prevById.get(c.id)
      if (prev !== c) {
        markDirtyConversation(c.id, c)
      }
    }
  })
}
