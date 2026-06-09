import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatMessage, VeniceParameters } from '../types/venice'
import type { Conversation, ConversationMessage } from '../types/conversation'
import type { ConversationCharacterMeta } from '../types/conversationVault'
import type { VeniceCharacter } from '../types/characters'
import { generateId } from '../lib/utils'
import { createSafeStorage } from '../lib/safe-storage'
import type { PulledMemoryContext } from '../types/conversationVault'
import { toConversationRecord } from './chat-store-helpers'
import { useSettingsStore } from './settings-store' // for defaulting projectRefs to active project on create (polished Phase 1)
import { desktopChat, desktopConversations } from '../services/desktopBridge'

/**
 * LEGACY NOTE: the module-level queueMicrotask at the bottom of this file
 * still accesses window.veniceForge directly for the initial conversation
 * hydration. Per AGENTS.md this is the single remaining pre-bridge legacy
 * spot. All function-level paths (deleteConversation, writeConversation)
 * now route through desktopBridge.ts. Do not add new direct calls.
 */

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
  setActiveConversation: (id: string | null) => void
  deleteConversation: (id: string) => Promise<void>
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
    tags: conv.metadata?.tags ?? [],
    pinned: conv.metadata?.pinned ?? false,
    archived: conv.metadata?.archived ?? false,
    source: conv.metadata?.source ?? 'chat',
    messageCount: messages.length,
    tokenEstimate: conv.metadata?.tokenEstimate,
    lastSummaryAt: conv.metadata?.lastSummaryAt,
    migratedFrom: conv.metadata?.migratedFrom,
    character: conv.metadata?.character,
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
        include_venice_system_prompt: false,
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
        }
        const preferredModel =
          (character.modelId && character.modelId.trim()) || fallbackModel || 'llama-3.3-70b'
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
        }))
        return id
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),

      deleteConversation: async (id) => {
        // Mark the conversation dirty first so a pending save flush on
        // unload will NOT resurrect a conversation the user has just
        // deleted. We do this by removing the entry from the dirty map
        // via the module-level helper exported below.
        forgetDirtyConversation(id)
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeConversationId:
            s.activeConversationId === id ? null : s.activeConversationId,
        }))
        try {
          const convRes = await desktopConversations.delete(id)
          if (!convRes.ok) {
            const chatRes = await desktopChat.delete(id)
            if (!chatRes.ok) {
              console.error('[chat] deleteConversation IPC failed', chatRes.error)
            }
          }
        } catch (err) {
          console.error('[chat] deleteConversation IPC failed', err)
        }
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
            const persisted: ConversationMessage = {
              id: generateId(),
              role: message.role,
              content: typeof message.content === 'string' ? message.content : '',
              reasoning_content: message.reasoning_content,
              timestamp: Date.now(),
            }
            const withMessage: Conversation = {
              ...c,
              messages: [...(c.messages ?? []), persisted],
            }
            const updated = touchConversation(withMessage)
            if (
              message.role === 'user' &&
              (c.messages?.length ?? 0) === 0 &&
              typeof message.content === 'string'
            ) {
              updated.title = message.content.slice(0, 50) || 'New Chat'
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
          s.veniceParams = { include_venice_system_prompt: false, enable_web_search: 'off' }
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

function markDirtyConversation(id: string, conv: Conversation): void {
  dirtyConversations.set(id, conv)
  scheduleFlush()
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
    if (!convRes.ok) {
      const chatRes = await desktopChat.save(conv)
      if (!chatRes.ok) {
        console.error('[chat] conversations.save failed', chatRes.error)
      }
    }
  } catch (err) {
    console.error('[chat] conversations.save failed', err)
  }
}

async function flushConversationSave(id: string): Promise<void> {
  const conv = dirtyConversations.get(id)
  if (!conv) return
  dirtyConversations.delete(id)
  await writeConversation(conv)
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
 * dispatched. Errors from individual writes are logged but do NOT
 * reject the aggregate promise — one bad write should not stop the
 * rest from landing.
 */
export async function flushAllPendingSaves(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const pending = Array.from(dirtyConversations.entries())
  dirtyConversations.clear()
  await Promise.all(pending.map(([, conv]) => writeConversation(conv)))
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
  queueMicrotask(() => {
    if (window.veniceForge?.conversations) {
      window.veniceForge.conversations.list().then((result) => {
        if (!useChatStore.getState()._hasLoadedHistory && result.ok) {
          useChatStore.getState().setConversations(result.records);
        } else if (!result.ok) {
          console.error('[chat] conversations.list failed', result.error);
        }
      }).catch(console.error)
    } else if (window.veniceForge?.chat) {
      window.veniceForge.chat.list().then((result) => {
        if (!useChatStore.getState()._hasLoadedHistory) {
          const conversations = Array.isArray(result)
            ? result
            : (result.conversations as Conversation[]);
          useChatStore.getState().setConversations(conversations);
          if (!Array.isArray(result) && result.truncated) {
            console.warn(
              `[chat] conversation list truncated — ${result.totalScanned} files on disk, ` +
                `showing ${conversations.length}. Consider archiving old chats.`,
            );
          }
        }
      }).catch(console.error)
    }
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
    for (const c of state.conversations) {
      const prev = prevState.conversations.find((p) => p.id === c.id)
      if (prev !== c) {
        markDirtyConversation(c.id, c)
      }
    }
  })
}
