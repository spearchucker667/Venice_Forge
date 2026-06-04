import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatMessage, VeniceParameters } from '../types/venice'
import type { Conversation, ConversationMessage } from '../types/conversation'
import { generateId } from '../lib/utils'
import { createSafeStorage } from '../lib/safe-storage'

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

  setConversations: (conversations: Conversation[]) => void
  createConversation: (model: string) => string
  setActiveConversation: (id: string | null) => void
  deleteConversation: (id: string) => void
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

      setConversations: (conversations) => set({ conversations, _hasLoadedHistory: true }),

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
        if (typeof window !== 'undefined' && window.veniceForge?.chat) {
          window.veniceForge.chat.delete(id).catch(() => {})
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
    if (window.veniceForge?.chat) {
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
    if (pendingSave && window.veniceForge?.chat) {
      // Fire and forget; we're in a beforeunload handler and can't await.
      window.veniceForge.chat.save(pendingSave).catch(console.error);
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
        if (toSave && window.veniceForge?.chat) {
          window.veniceForge.chat.save(toSave).catch(console.error);
        }
      }, 500); // Debounce saves
    }
  })
}
