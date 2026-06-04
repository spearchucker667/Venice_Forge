import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatMessage, Conversation, VeniceParameters } from '../types/venice'
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
        const conv: Conversation = {
          id,
          title: 'New Chat',
          messages: [],
          model,
          createdAt: Date.now(),
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
            const updated = { ...c, messages: [...c.messages, message] }
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
  // Load initially
  setTimeout(() => {
    if (window.veniceForge?.chat) {
      window.veniceForge.chat.list().then((list) => {
        // Only load if not already hydrated with valid history
        if (!useChatStore.getState()._hasLoadedHistory) {
          useChatStore.getState().setConversations(list as unknown as Conversation[])
        }
      }).catch(console.error)
    }
  }, 100)

  // Save changes
  let saveTimer: ReturnType<typeof setTimeout>
  useChatStore.subscribe((state, prevState) => {
    // If the active conversation's messages or title changed, save it
    const active = state.conversations.find((c) => c.id === state.activeConversationId)
    const prevActive = prevState.conversations.find((c) => c.id === state.activeConversationId)
    
    if (active && (active !== prevActive)) {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        if (window.veniceForge?.chat) {
          window.veniceForge.chat.save(active as any).catch(console.error)
        }
      }, 500) // Debounce saves
    }
  })
}
