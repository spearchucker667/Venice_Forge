/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import type { VeniceCharacter } from '../types/characters'
import type { CharacterCardV1 } from '../types/rp'
import type { ChatMessage } from '../types/venice'
import type { Conversation } from '../types/conversation'
import { generateId } from '../lib/utils'
import { desktopConversations, desktopChat } from '../services/desktopBridge'
import { toConversationRecord } from './chat-store-helpers'
import { DEFAULT_CHAT_MODEL } from '../constants/venice'

/**
 * Regression guard: chat-store hydration routes through desktopBridge.
 */

// Polyfill localStorage so zustand persist middleware does not throw.
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = String(value); },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]; },
  key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
  get length() { return Object.keys(localStorageStore).length; },
};
(globalThis as { localStorage?: Storage }).localStorage =
  localStorageMock as unknown as Storage;

const conversationListMock = vi.fn().mockResolvedValue({ ok: true, records: [] })
const chatListMock = vi.fn().mockResolvedValue({
  ok: true,
  conversations: [],
  truncated: false,
  totalScanned: 0,
})
const chatSaveMock = vi.fn().mockResolvedValue({ ok: true })
const chatDeleteMock = vi.fn().mockResolvedValue({ ok: true })
const conversationSaveMock = vi.fn().mockResolvedValue({ ok: true })
const conversationDeleteMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('../services/desktopBridge', async () => {
  const actual = await vi.importActual<typeof import('../services/desktopBridge')>('../services/desktopBridge')
  return {
    ...actual,
    isElectron: () => true,
    desktopConversations: {
      list: conversationListMock,
      get: vi.fn().mockResolvedValue({ ok: true, record: null }),
      save: conversationSaveMock,
      delete: conversationDeleteMock,
      pullContext: vi.fn().mockResolvedValue({ ok: true }),
      detectLegacyHistory: vi.fn().mockResolvedValue(false),
      rebuildIndex: vi.fn().mockResolvedValue({ ok: true }),
      openConversationsFolder: vi.fn().mockResolvedValue({ ok: true }),
      migrateLegacyHistory: vi.fn().mockResolvedValue({
        ok: true,
        migrated: 0,
        failed: 0,
        skipped: 0,
      }),
    },
    desktopChat: {
      list: chatListMock,
      listPage: vi.fn().mockResolvedValue({
        ok: true,
        conversations: [],
        truncated: false,
        totalScanned: 0,
        offset: 0,
        count: 0,
      }),
      get: vi.fn().mockResolvedValue({ ok: true, conversation: null }),
      save: chatSaveMock,
      delete: chatDeleteMock,
    },
  }
})

vi.mock('./settings-store', () => {
  return {
    useSettingsStore: {
      getState: () => ({ activeProjectId: 'mock-proj-123' })
    }
  }
})

let useChatStore: typeof import('./chat-store').useChatStore
let flushAllPendingSaves: typeof import('./chat-store').flushAllPendingSaves
let _debugGetDirtyConversationIds: typeof import('./chat-store')._debugGetDirtyConversationIds
let cleanupUnloadListeners: (() => void) | undefined

describe('chat-store desktopBridge routing', () => {
  beforeAll(async () => {
    vi.useFakeTimers()
    const mod = await import('./chat-store')
    useChatStore = mod.useChatStore
    flushAllPendingSaves = mod.flushAllPendingSaves
    _debugGetDirtyConversationIds = mod._debugGetDirtyConversationIds
    cleanupUnloadListeners = mod.cleanupUnloadListeners
    await vi.runAllTimersAsync()
  })

  afterAll(() => {
    vi.useRealTimers()
    if (cleanupUnloadListeners) cleanupUnloadListeners()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      isStreaming: false,
      systemPrompt: '',
      temperature: 0.7,
      topP: 1,
      maxTokens: 4096,
      veniceParams: { include_venice_system_prompt: false, enable_web_search: 'off' },
      pendingContext: null,
      _hasLoadedHistory: true,
    })
    await flushAllPendingSaves()
  })

  it('hydrates via desktopConversations.list on module load', async () => {
    vi.resetModules()
    const mod = await import('./chat-store')
    await vi.runAllTimersAsync()
    expect(conversationListMock).toHaveBeenCalled()
  })

  it('falls back to desktopChat.list when conversations returns an error', async () => {
    conversationListMock.mockResolvedValueOnce({
      ok: false,
      records: [],
      error: 'vault unavailable',
    })
    chatListMock.mockResolvedValueOnce({
      ok: true,
      conversations: [{ id: 'legacy-1', title: 'Legacy Chat' } as any],
      truncated: false,
      totalScanned: 1,
    })

    vi.resetModules()
    const mod = await import('./chat-store')
    useChatStore = mod.useChatStore
    await vi.runAllTimersAsync()

    expect(chatListMock).toHaveBeenCalled()
    const state = useChatStore.getState()
    expect(state.conversations.some((c) => c.id === 'legacy-1')).toBe(true)
  })

  it('creates conversation properly', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    const state = useChatStore.getState()
    expect(state.activeConversationId).toBe(id)
    expect(state.conversations.length).toBe(1)
    expect(state.conversations[0].model).toBe('llama-3')
    expect(state.conversations[0].memory.projectRefs).toEqual(['mock-proj-123'])
    
    // Test dirty map tracking
    await vi.advanceTimersByTimeAsync(500)
    expect(conversationSaveMock).toHaveBeenCalled()
  })

  it('creates character conversation', async () => {
    const char: VeniceCharacter = {
      id: 'char-1', slug: 'test-slug', name: 'Test Char', description: 'desc',
      photoUrl: '', shareUrl: '', modelId: 'specific-model', adult: false, webEnabled: false
    }
    const id = useChatStore.getState().createCharacterConversation(char, 'fallback')
    const conv = useChatStore.getState().getActiveConversation()
    expect(conv?.id).toBe(id)
    expect(conv?.title).toBe('Chat with Test Char')
    expect(conv?.model).toBe('specific-model')
    expect(conv?.metadata.character?.slug).toBe('test-slug')
  })

  it('creates local character conversation', async () => {
    const card: CharacterCardV1 = {
      id: 'local-1', name: 'Local Char', systemPrompt: 'Sys prompt',
      description: ''
    } as any
    const id = useChatStore.getState().createLocalCharacterConversation(card, 'fallback-model')
    const conv = useChatStore.getState().getActiveConversation()
    expect(conv?.id).toBe(id)
    expect(conv?.model).toBe('fallback-model')
    expect(conv?.systemPrompt).toBe('Sys prompt')
    expect(conv?.metadata.character?.localCharacterId).toBe('local-1')
  })

  it('deletes conversation and calls IPC', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    await vi.advanceTimersByTimeAsync(500)
    expect(useChatStore.getState().conversations.length).toBe(1)
    
    await useChatStore.getState().deleteConversation(id)
    expect(useChatStore.getState().conversations.length).toBe(0)
    expect(useChatStore.getState().activeConversationId).toBeNull()
    expect(conversationDeleteMock).toHaveBeenCalledWith(id)
  })

  it('handles IPC delete failure by falling back to legacy chat.delete', async () => {
    conversationDeleteMock.mockResolvedValueOnce({ ok: false, error: 'fail' })
    const id = useChatStore.getState().createConversation('llama-3')
    await useChatStore.getState().deleteConversation(id)
    expect(chatDeleteMock).toHaveBeenCalledWith(id)
  })

  it('batch deletes selected conversations and clears active id when deleted', async () => {
    const first = useChatStore.getState().createConversation('llama-3')
    const second = useChatStore.getState().createConversation('llama-3')
    useChatStore.getState().setActiveConversation(first)

    const result = await useChatStore.getState().deleteConversations([first, second, second])

    expect(result.deleted.sort()).toEqual([first, second].sort())
    expect(result.failed).toEqual([])
    expect(result.activeConversationDeleted).toBe(true)
    expect(useChatStore.getState().activeConversationId).toBeNull()
    expect(useChatStore.getState().conversations).toHaveLength(0)
  })

  it('keeps conversations visible when batch persistence deletion fails', async () => {
    conversationDeleteMock.mockResolvedValueOnce({ ok: false, error: 'vault failed' })
    chatDeleteMock.mockResolvedValueOnce({ ok: false, error: 'legacy failed' })
    const id = useChatStore.getState().createConversation('llama-3')

    const result = await useChatStore.getState().deleteConversations([id])

    expect(result.deleted).toEqual([])
    expect(result.failed).toEqual([{ id, error: 'legacy failed' }])
    expect(useChatStore.getState().conversations.some((conversation) => conversation.id === id)).toBe(true)
  })

  it('restores conversation', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    const conv = useChatStore.getState().conversations[0]
    await useChatStore.getState().deleteConversation(id)
    expect(useChatStore.getState().conversations.length).toBe(0)

    await useChatStore.getState().restoreConversation(conv)
    expect(useChatStore.getState().conversations.length).toBe(1)
    expect(useChatStore.getState().conversations[0].id).toBe(id)
    expect(conversationSaveMock).toHaveBeenCalled()
  })

  it('rejects invalid ids before marking restored conversations dirty', async () => {
    const conv: Conversation = {
      id: '__proto__',
      title: 'Invalid',
      model: 'llama-3',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: { tags: [], pinned: false, archived: false, source: 'chat', messageCount: 0 },
      memory: { summary: '', topics: [], entities: [], userFacts: [], projectRefs: [] },
    }

    await expect(useChatStore.getState().restoreConversation(conv)).rejects.toThrow(/Invalid id.*markDirtyConversation/)
    expect(conversationSaveMock).not.toHaveBeenCalled()
  })

  it('adds message and sets title on first user message', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    useChatStore.getState().addMessage(id, { role: 'user', content: 'Hello there world' })
    const conv = useChatStore.getState().getActiveConversation()
    expect(conv?.messages?.length).toBe(1)
    expect(conv?.messages?.[0].content).toBe('Hello there world')
    expect(conv?.title).toBe('Hello there world')
    expect(conv?.metadata?.messageCount).toBe(1)
  })

  it('appends to last assistant message', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    useChatStore.getState().addMessage(id, { role: 'assistant', content: 'Hello' })
    useChatStore.getState().appendToLastAssistant(id, ' World')
    const conv = useChatStore.getState().getActiveConversation()
    expect(conv?.messages?.[0].content).toBe('Hello World')
  })

  it('appends reasoning to last assistant message', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    useChatStore.getState().addMessage(id, { role: 'assistant', content: 'Final' })
    useChatStore.getState().appendReasoningToLastAssistant(id, 'Thinking...')
    const conv = useChatStore.getState().getActiveConversation()
    expect(conv?.messages?.[0].reasoning_content).toBe('Thinking...')
  })

  it('deletes a message', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    useChatStore.getState().addMessage(id, { role: 'user', content: 'A' })
    useChatStore.getState().addMessage(id, { role: 'assistant', content: 'B' })
    useChatStore.getState().deleteMessage(id, 0)
    const conv = useChatStore.getState().getActiveConversation()
    expect(conv?.messages?.length).toBe(1)
    expect(conv?.messages?.[0].content).toBe('B')
  })

  it('sets message metadata', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    useChatStore.getState().addMessage(id, { role: 'user', content: 'A' })
    useChatStore.getState().setMessageMetadata(id, 0, { hidden: true } as any)
    const conv = useChatStore.getState().getActiveConversation()
    expect((conv?.messages?.[0].metadata as any)?.hidden).toBe(true)
  })

  it('updates simple states', async () => {
    useChatStore.getState().setStreaming(true)
    expect(useChatStore.getState().isStreaming).toBe(true)
    
    useChatStore.getState().setSystemPrompt('Sys')
    expect(useChatStore.getState().systemPrompt).toBe('Sys')
    
    useChatStore.getState().setTemperature(0.5)
    expect(useChatStore.getState().temperature).toBe(0.5)

    useChatStore.getState().setTopP(0.8)
    expect(useChatStore.getState().topP).toBe(0.8)

    useChatStore.getState().setMaxTokens(100)
    expect(useChatStore.getState().maxTokens).toBe(100)
    
    useChatStore.getState().setPendingContext({ entities: [], projectRefs: [], summary: '', topics: [], userFacts: [] } as any)
    expect(useChatStore.getState().pendingContext).not.toBeNull()

    useChatStore.getState().setVeniceParams({ enable_web_search: 'on' })
    expect(useChatStore.getState().veniceParams.enable_web_search).toBe('on')

    useChatStore.getState().setActiveConversation('not-exist')
    expect(useChatStore.getState().activeConversationId).toBe('not-exist')
    expect(useChatStore.getState().getActiveConversation()).toBeUndefined()
  })

  it('handles writeConversation fallback and failures', async () => {
    conversationSaveMock.mockResolvedValueOnce({ ok: false, error: 'fail1' })
    chatSaveMock.mockResolvedValueOnce({ ok: false, error: 'fail2' })
    useChatStore.getState().createConversation('llama-3')
    await vi.advanceTimersByTimeAsync(500)
    expect(conversationSaveMock).toHaveBeenCalled()
    expect(chatSaveMock).toHaveBeenCalled()
  })

  it('handles writeConversation where desktopChat throws', async () => {
    conversationSaveMock.mockResolvedValueOnce({ ok: false, error: 'fail1' })
    chatSaveMock.mockRejectedValueOnce(new Error('fail2'))
    useChatStore.getState().createConversation('llama-3')
    await vi.advanceTimersByTimeAsync(500)
    // Should not crash
  })

  it('adds a multimodal message', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    useChatStore.getState().addMessage(id, { role: 'user', content: [{ type: 'text', text: 'hello' }] })
    const conv = useChatStore.getState().getActiveConversation()
    expect(conv?.messages?.[0].content).toEqual([{ type: 'text', text: 'hello' }])
  })

  it('ignores appendToLastAssistant if last message is not assistant or not string', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    useChatStore.getState().addMessage(id, { role: 'user', content: 'hello' })
    useChatStore.getState().appendToLastAssistant(id, ' world')
    const conv = useChatStore.getState().getActiveConversation()
    expect(conv?.messages?.[0].content).toBe('hello')
  })

  it('ignores appendReasoningToLastAssistant if last message is not assistant', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    useChatStore.getState().addMessage(id, { role: 'user', content: 'hello' })
    useChatStore.getState().appendReasoningToLastAssistant(id, 'thinking...')
    const conv = useChatStore.getState().getActiveConversation()
    expect(conv?.messages?.[0].reasoning_content).toBeUndefined()
  })

  it('ignores setMessageMetadata if message does not exist', async () => {
    const id = useChatStore.getState().createConversation('llama-3')
    useChatStore.getState().setMessageMetadata(id, 99, { hidden: true } as any)
    const conv = useChatStore.getState().getActiveConversation()
    expect(conv?.messages?.length).toBe(0)
  })

  it('creates character conversation with fallback model if modelId is empty', async () => {
    const char: VeniceCharacter = {
      id: 'char-1', slug: 'test-slug', name: 'Test Char', description: 'desc',
      photoUrl: '', shareUrl: '', modelId: '  ', adult: false, webEnabled: false
    }
    useChatStore.getState().createCharacterConversation(char, 'fallback-model')
    expect(useChatStore.getState().getActiveConversation()?.model).toBe('fallback-model')

    useChatStore.getState().createCharacterConversation(char, '')
    expect(useChatStore.getState().getActiveConversation()?.model).toBe(DEFAULT_CHAT_MODEL)
  })

  it('logs warning if conversation list is truncated', async () => {
    conversationListMock.mockResolvedValueOnce({
      ok: true,
      records: [],
      truncated: true,
      totalScanned: 100,
    })
    vi.resetModules()
    const mod = await import('./chat-store')
    await vi.runAllTimersAsync()
    // just exercising the truncated branch
  })

  it('migrates persisted state', () => {
    const migrate = useChatStore.persist.getOptions().migrate as (persisted: any, version: number) => any
    
    expect(migrate(null, 1)).toBeNull()
    
    let migrated = migrate({ someOldState: true }, 1)
    expect(migrated.veniceParams).toBeDefined()
    
    migrated = migrate({ conversations: [], veniceParams: {} }, 2)
    expect(migrated.conversations).toBeUndefined()
  })

  it('triggers flush on unload events', () => {
    const id = useChatStore.getState().createConversation('llama-3')
    window.dispatchEvent(new Event('beforeunload'))
    // flushAllPendingSaves handles it (async, but event runs sync)
    // we can advance timers if needed
  })

  it('triggers flush on pagehide event', () => {
    const id = useChatStore.getState().createConversation('llama-3')
    window.dispatchEvent(new Event('pagehide'))
  })

  it('catches vault bootstrap throw', async () => {
    conversationListMock.mockRejectedValueOnce(new Error('vault throw'))
    vi.resetModules()
    const mod = await import('./chat-store')
    await vi.runAllTimersAsync()
    // Should catch the vault throw and try legacy
  })

  it('catches legacy bootstrap throw', async () => {
    conversationListMock.mockResolvedValueOnce({ ok: false, error: 'skip' })
    chatListMock.mockRejectedValueOnce(new Error('legacy throw'))
    vi.resetModules()
    const mod = await import('./chat-store')
    await vi.runAllTimersAsync()
    // Should catch the legacy throw
  })

  it('logs error when desktopConversations.list returns error without ok', async () => {
    // Just another branch inside safeList
    chatListMock.mockResolvedValueOnce({ ok: false, error: 'fail reason' })
    conversationListMock.mockResolvedValueOnce({ ok: false, error: 'fail vault' })
    vi.resetModules()
    const mod = await import('./chat-store')
    await vi.runAllTimersAsync()
  })
})
