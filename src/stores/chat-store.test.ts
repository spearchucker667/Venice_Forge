import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

/**
 * Regression guard: chat-store hydration routes through desktopBridge.
 *
 * The legacy module-level queueMicrotask previously accessed
 * `window.veniceForge.conversations.list()` and `window.veniceForge.chat.list()`
 * directly. After the Wave 3 boundary hardening, it must call
 * `desktopConversations.list()` and `desktopChat.list()` from
 * `src/services/desktopBridge.ts` instead.
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

vi.mock('../services/desktopBridge', async () => {
  const actual = await vi.importActual<typeof import('../services/desktopBridge')>('../services/desktopBridge')
  return {
    ...actual,
    isElectron: () => true,
    desktopConversations: {
      list: conversationListMock,
      get: vi.fn().mockResolvedValue({ ok: true, record: null }),
      save: vi.fn().mockResolvedValue({ ok: true, id: 'mock-id' }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
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

let useChatStore: typeof import('./chat-store').useChatStore

describe('chat-store desktopBridge routing', () => {
  beforeAll(async () => {
    vi.useFakeTimers()
    const mod = await import('./chat-store')
    useChatStore = mod.useChatStore
    await vi.runAllTimersAsync()
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('hydrates via desktopConversations.list on module load', async () => {
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

    // Re-import to trigger a fresh module-level queueMicrotask.
    vi.resetModules()
    const mod = await import('./chat-store')
    useChatStore = mod.useChatStore
    await vi.runAllTimersAsync()

    expect(chatListMock).toHaveBeenCalled()
    const state = useChatStore.getState()
    expect(state.conversations.some((c) => c.id === 'legacy-1')).toBe(true)
  })
})
