import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatMessage, VeniceParameters } from '../types/venice'
import type { Conversation, ConversationMessage } from '../types/conversation'
import type { ConversationCharacterMeta } from '../types/conversationVault'
import type { VeniceCharacter } from '../types/characters'
import { generateId } from '../lib/utils'
import { createSafeStorage } from '../lib/safe-storage'
import type { ConversationRecordV1, PulledMemoryContext } from '../types/conversationVault'

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
  deleteConversation: (id: string) => void
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
            projectRefs: [],
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
            projectRefs: [],
          },
        }
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeConversationId: id,
        }))
        return id
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),

      deleteConversation: (id) => {
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeConversationId:
            s.activeConversationId === id ? null : s.activeConversationId,
        }))
        if (typeof window !== 'undefined') {
          if (window.veniceForge?.conversations) {
            window.veniceForge.conversations.delete(id).catch(() => {})
          } else if (window.veniceForge?.chat) {
            window.veniceForge.chat.delete(id).catch(() => {})
          }
        }
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
        const updated = { ...c, messages: [...c.messages, persisted], updatedAt: Date.now() }
        if (
          message.role === 'user' &&
          c.messages.length === 0 &&
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
            const msgs = [...c.messages]
            const last = msgs[msgs.length - 1]
            if (last?.role === 'assistant' && typeof last.content === 'string') {
              msgs[msgs.length - 1] = { ...last, content: last.content + token }
            }
            return { ...c, messages: msgs }
          }),
        })),

      appendReasoningToLastAssistant: (conversationId, token) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const msgs = [...c.messages]
            const last = msgs[msgs.length - 1]
            if (last?.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, reasoning_content: (last.reasoning_content || '') + token }
            }
            return { ...c, messages: msgs }
          }),
        })),

      deleteMessage: (conversationId, index) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c
            const msgs = c.messages.filter((_, i) => i !== index)
            return { ...c, messages: msgs }
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
        if (!useChatStore.getState()._hasLoadedHistory) {
          const conversations = result.ok ? result.records : [];
          useChatStore.getState().setConversations(conversations);
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
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave: Conversation | null = null;
  const flushSave = () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (pendingSave) {
      if (window.veniceForge?.conversations) {
        const record: ConversationRecordV1 = {
          version: 1,
          id: pendingSave.id,
          title: pendingSave.title,
          createdAt: pendingSave.createdAt,
          updatedAt: pendingSave.updatedAt,
          model: pendingSave.model,
          systemPrompt: pendingSave.systemPrompt,
          messages: pendingSave.messages,
          metadata: pendingSave.metadata || {
            tags: [],
            pinned: false,
            archived: false,
            source: 'chat',
            messageCount: pendingSave.messages.length,
          },
          memory: pendingSave.memory || {
            summary: pendingSave.title || '',
            topics: [],
            entities: [],
            userFacts: [],
            projectRefs: [],
          },
        };
        window.veniceForge.conversations.save(record).catch(console.error);
      } else if (window.veniceForge?.chat) {
        window.veniceForge.chat.save(pendingSave).catch(console.error);
      }
      pendingSave = null;
    }
  };
  window.addEventListener("beforeunload", flushSave);
  window.addEventListener("pagehide", flushSave);
 
  useChatStore.subscribe((state, prevState) => {
    // If the active conversation's messages or title changed, save it
    const active = state.conversations.find((c) => c.id === state.activeConversationId)
    const prevActive = prevState.conversations.find((c) => c.id === state.activeConversationId)
 
    if (active && (active !== prevActive)) {
      pendingSave = active;
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        const toSave = pendingSave;
        pendingSave = null;
        if (toSave) {
          if (window.veniceForge?.conversations) {
            const record: ConversationRecordV1 = {
              version: 1,
              id: toSave.id,
              title: toSave.title,
              createdAt: toSave.createdAt,
              updatedAt: toSave.updatedAt,
              model: toSave.model,
              systemPrompt: toSave.systemPrompt,
              messages: toSave.messages,
              metadata: toSave.metadata || {
                tags: [],
                pinned: false,
                archived: false,
                source: 'chat',
                messageCount: toSave.messages.length,
              },
              memory: toSave.memory || {
                summary: toSave.title || '',
                topics: [],
                entities: [],
                userFacts: [],
                projectRefs: [],
              },
            };
            window.veniceForge.conversations.save(record).catch(console.error);
          } else if (window.veniceForge?.chat) {
            window.veniceForge.chat.save(toSave).catch(console.error);
          }
        }
      }, 500); // Debounce saves
    }
  })
}
