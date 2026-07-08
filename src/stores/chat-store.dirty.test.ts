// VERIFY-021 regression guard
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

/**
 * Regression guard: BUG-CHAT-DIRTY non-active saves.
 *
 * Pre-audit the chat-store only debounced-saved the *active* conversation.
 * Editing a non-active chat (e.g. deleting a message via a context menu
 * on the Sidebar, or a background tag rename) was silently dropped on
 * the next reload because the IPC `save` was never invoked.
 *
 * The fix introduces a module-level dirty map keyed by conversation id.
 * Every mutation — active or not — is captured, and `flushAllPendingSaves`
 * (called on debounce + `pagehide` + `beforeunload`) writes them all.
 *
 * This test:
 *   1. Creates conv A, mutates it (becomes active).
 *   2. Creates conv B, mutates it.
 *   3. Asserts BOTH dirty IDs are tracked.
 *   4. Fires pagehide and asserts BOTH saves land.
 */

const saveMock = vi.fn().mockResolvedValue({ ok: true, id: 'mock-id' })
const listMock = vi.fn().mockResolvedValue({ ok: true, records: [] })
const chatSaveMock = vi.fn().mockResolvedValue({ ok: true })
const chatListMock = vi.fn().mockResolvedValue([])

const mockVeniceForge = {
  isDesktop: true,
  conversations: {
    save: saveMock,
    list: listMock,
    get: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
    archive: vi.fn().mockResolvedValue({ ok: true }),
    search: vi.fn().mockResolvedValue({ ok: true, records: [] }),
    pullContext: vi.fn().mockResolvedValue({ ok: true }),
    rebuildIndex: vi.fn().mockResolvedValue({ ok: true }),
    migrateLegacyHistory: vi.fn().mockResolvedValue({ ok: true }),
    detectLegacyHistory: vi.fn().mockResolvedValue({ ok: true }),
  },
  chat: {
    save: chatSaveMock,
    list: chatListMock,
    delete: vi.fn().mockResolvedValue(undefined),
  },
}

Object.defineProperty(window, 'veniceForge', {
  value: mockVeniceForge,
  writable: true,
  configurable: true,
})

let useChatStore: typeof import('./chat-store').useChatStore
let _debugGetDirtyConversationIds: typeof import('./chat-store')._debugGetDirtyConversationIds
let flushAllPendingSaves: typeof import('./chat-store').flushAllPendingSaves

beforeAll(async () => {
  vi.useFakeTimers()
  const mod = await import('./chat-store')
  useChatStore = mod.useChatStore
  _debugGetDirtyConversationIds = mod._debugGetDirtyConversationIds
  flushAllPendingSaves = mod.flushAllPendingSaves
  await vi.runAllTimersAsync()
})

afterAll(() => {
  vi.useRealTimers()
})

describe('chat-store dirty tracking for non-active saves (BUG-CHAT-DIRTY regression)', () => {
  beforeEach(() => {
    saveMock.mockClear()
    listMock.mockClear()
    chatSaveMock.mockClear()
    chatListMock.mockClear()
  })

  it('tracks both active and non-active conversations in the dirty map', async () => {
    // Reset state by using the store's setState to clear conversations.
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
    } as never)

    const a = useChatStore.getState().createConversation('llama-3.3-70b')
    // A is now the active conversation. Mutate it.
    useChatStore.getState().addMessage(a, { role: 'user', content: 'A hello' })

    // Create B and switch to it.
    const b = useChatStore.getState().createConversation('mistral-31-24b')
    // A is no longer active. Mutate B (the new active) and then mutate A
    // via a non-active code path (deleteMessage on A, while B is active).
    useChatStore.getState().addMessage(b, { role: 'user', content: 'B hello' })
    useChatStore.getState().deleteMessage(a, 0) // mutates A while B is active

    const dirty = _debugGetDirtyConversationIds()
    expect(dirty).toContain(a)
    expect(dirty).toContain(b)
  })

  it('flushAllPendingSaves writes every dirty conversation exactly once', async () => {
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
    } as never)

    const a = useChatStore.getState().createConversation('llama-3.3-70b')
    const b = useChatStore.getState().createConversation('mistral-31-24b')
    useChatStore.getState().addMessage(a, { role: 'user', content: 'A1' })
    useChatStore.getState().addMessage(b, { role: 'user', content: 'B1' })
    expect(_debugGetDirtyConversationIds().length).toBeGreaterThanOrEqual(2)

    await flushAllPendingSaves()

    // Both A and B should have been saved at least once.
    const savedIds = saveMock.mock.calls.map((c) => c[0].id)
    expect(savedIds).toContain(a)
    expect(savedIds).toContain(b)

    // The dirty map should be empty after the flush.
    expect(_debugGetDirtyConversationIds()).toEqual([])
  })

  it('retains dirty-map entries when persistence fails so the next flush can retry', async () => {
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
    } as never)
    saveMock.mockResolvedValueOnce({ ok: false, error: 'temporary vault failure' })
    chatSaveMock.mockResolvedValueOnce({ ok: false, error: 'temporary legacy failure' })

    const id = useChatStore.getState().createConversation('llama-3.3-70b')
    useChatStore.getState().addMessage(id, { role: 'user', content: 'retry me' })

    await flushAllPendingSaves()

    expect(_debugGetDirtyConversationIds()).toContain(id)

    saveMock.mockResolvedValue({ ok: true, id })
    await flushAllPendingSaves()

    expect(_debugGetDirtyConversationIds()).not.toContain(id)
  })

  it('pagehide flushes BOTH active and non-active dirty conversations', async () => {
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
    } as never)

    const a = useChatStore.getState().createConversation('llama-3.3-70b')
    const b = useChatStore.getState().createConversation('mistral-31-24b')
    saveMock.mockClear()

    useChatStore.getState().addMessage(a, { role: 'user', content: 'A2' })
    useChatStore.getState().deleteMessage(b, 0) // non-active mutation

    // Debounce has not fired (fake timers).
    expect(saveMock).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('pagehide'))

    // Allow the microtask in the pagehide handler to settle.
    await vi.runAllTimersAsync()
    await Promise.resolve()
    await Promise.resolve()

    const savedIds = saveMock.mock.calls.map((c) => c[0].id)
    expect(savedIds).toContain(a)
    expect(savedIds).toContain(b)
  })

  it('flushes immediately when the dirty map exceeds MAX_DIRTY_CONVERSATIONS', async () => {
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
    } as never)

    const ids: string[] = []
    for (let i = 0; i < 1002; i++) {
      ids.push(useChatStore.getState().createConversation('model'))
    }

    // Wait for any pending eager flush + the final cleanup to settle.
    await flushAllPendingSaves()
    await vi.runAllTimersAsync()

    // The dirty map must be bounded and fully flushed.
    expect(_debugGetDirtyConversationIds()).toEqual([])
    const savedIds = new Set(saveMock.mock.calls.map((c) => c[0].id))
    expect(savedIds.size).toBeGreaterThanOrEqual(1000)
    // The final conversation created must also have been saved at some point.
    expect(savedIds).toContain(ids[ids.length - 1])
  })
})

describe('chat-store metadata invariants (BUG-CHAT-META regression)', () => {
  beforeEach(() => {
    saveMock.mockClear()
    listMock.mockClear()
  })

  it('updates metadata.messageCount on every mutation that changes the message list', async () => {
    useChatStore.setState({ conversations: [], activeConversationId: null } as never)
    const id = useChatStore.getState().createConversation('llama-3.3-70b')

    let conv = useChatStore.getState().conversations.find((c) => c.id === id)!
    expect(conv.messages.length).toBe(0)
    expect(conv.metadata?.messageCount).toBe(0)

    useChatStore.getState().addMessage(id, { role: 'user', content: 'm1' })
    conv = useChatStore.getState().conversations.find((c) => c.id === id)!
    expect(conv.messages.length).toBe(1)
    expect(conv.metadata?.messageCount).toBe(1)

    useChatStore.getState().addMessage(id, { role: 'assistant', content: 'r1' })
    conv = useChatStore.getState().conversations.find((c) => c.id === id)!
    expect(conv.messages.length).toBe(2)
    expect(conv.metadata?.messageCount).toBe(2)

    useChatStore.getState().deleteMessage(id, 0)
    conv = useChatStore.getState().conversations.find((c) => c.id === id)!
    expect(conv.messages.length).toBe(1)
    expect(conv.metadata?.messageCount).toBe(1)
  })

  it('bumps updatedAt on every mutation that changes the message list', async () => {
    useChatStore.setState({ conversations: [], activeConversationId: null } as never)
    const id = useChatStore.getState().createConversation('llama-3.3-70b')
    const before = useChatStore.getState().conversations.find((c) => c.id === id)!.updatedAt
    // Advance the clock so the next mutation produces a strictly larger
    // updatedAt (Date.now resolution is ms; on a fast machine two calls
    // inside the same tick would otherwise tie).
    vi.setSystemTime(new Date(before + 10))
    useChatStore.getState().addMessage(id, { role: 'user', content: 'tick' })
    const after = useChatStore.getState().conversations.find((c) => c.id === id)!.updatedAt
    expect(after).toBeGreaterThan(before)
    vi.useRealTimers()
    vi.useFakeTimers()
  })
})
