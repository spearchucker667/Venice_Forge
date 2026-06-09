import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

/**
 * Regression guard for BUG-3 (chat-store flush-on-unload).
 *
 * The chat-store subscribes to its own state and queues a debounced
 * save. When the renderer is closed (or hides for bfcache), the pending
 * save MUST be flushed synchronously — otherwise the user's last
 * message and the in-progress assistant reply are lost.
 *
 * We exercise this by:
 *   1. Mocking window.veniceForge.conversations.save
 *   2. Loading the module
 *   3. Mutating the active conversation via the store
 *   4. Firing `pagehide` (the more reliable cross-browser unload signal)
 *   5. Asserting the save was called with the mutated record
 *
 * The test runs in jsdom (the Vitest default) which is the same env the
 * renderer uses. It does NOT exercise the IPC handler — only the store's
 * flush logic.
 */

const saveMock = vi.fn().mockResolvedValue({ ok: true, id: 'mock-id' })
const listMock = vi.fn().mockResolvedValue({ ok: true, records: [] })
// The chat-store ALSO checks for a legacy `chat` namespace (the pre-bridge
// path) when `conversations` is missing. We always provide `conversations`
// in the renderer, so the `chat` branch should never fire — but if a test
// ordering bug causes `conversations` to be cleared between the
// subscribe-callback and the actual save (e.g. a debounced timer firing
// after a pagehide flushed a different save), the legacy path would throw
// on the missing `chat.save`. Stubbing both namespaces with vi.fn() that
// return resolved Promises makes the test infrastructure noise-free
// without affecting the assertions (saveMock is the one we assert on).
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
  // Legacy fallback namespace. The renderer uses `conversations.*`; this
  // stub only exists to silence "Cannot read properties of undefined" in
  // the chat-store's defensive `else if` branch.
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

beforeAll(async () => {
  vi.useFakeTimers()
  // Dynamic import so the module-level queueMicrotask + subscribe handler
  // run AFTER the mock is in place. Use a fresh require to get a clean
  // store state per test file (vitest isolates per file).
  const mod = await import('./chat-store')
  useChatStore = mod.useChatStore
  // Drain the initial queueMicrotask so the list() mock fires and sets
  // the empty initial state.
  await vi.runAllTimersAsync()
})

afterAll(() => {
  vi.useRealTimers()
})

describe('chat-store flush-on-unload (BUG-3 regression)', () => {
  beforeEach(() => {
    saveMock.mockClear()
    listMock.mockClear()
    chatSaveMock.mockClear()
    chatListMock.mockClear()
  })

  it('flushes a pending save on pagehide', async () => {
    const convId = useChatStore.getState().createConversation('llama-3.3-70b')
    expect(convId).toBeDefined()
    saveMock.mockClear()

    useChatStore.getState().addMessage(convId, {
      role: 'user',
      content: 'Hello, world!',
    })
    useChatStore.getState().addMessage(convId, {
      role: 'assistant',
      content: 'Hi there!',
    })

    // With fake timers + 500ms debounce, the timer has not fired.
    expect(saveMock).not.toHaveBeenCalled()

    // Fire the pagehide event. The module-level handler must flush the
    // pending save synchronously.
    window.dispatchEvent(new Event('pagehide'))

    expect(saveMock).toHaveBeenCalledTimes(1)
    const record = saveMock.mock.calls[0][0]
    expect(record.id).toBe(convId)
    expect(record.messages.length).toBe(2)
    expect(record.messages[0].role).toBe('user')
    expect(record.messages[1].role).toBe('assistant')
  })

  it('flushes a pending save on beforeunload', async () => {
    const convId = useChatStore.getState().createConversation('llama-3.3-70b')
    saveMock.mockClear()

    useChatStore.getState().addMessage(convId, {
      role: 'user',
      content: 'critical unsaved message',
    })
    expect(saveMock).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('beforeunload'))
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it('clears the pending-save flag after a flush (no double-save on next mutation)', async () => {
    const convId = useChatStore.getState().createConversation('llama-3.3-70b')
    saveMock.mockClear()

    useChatStore.getState().addMessage(convId, { role: 'user', content: 'msg 1' })
    window.dispatchEvent(new Event('pagehide'))
    expect(saveMock).toHaveBeenCalledTimes(1)

    // Now mutate again and dispatch pagehide — must save again, not be skipped.
    saveMock.mockClear()
    useChatStore.getState().addMessage(convId, { role: 'user', content: 'msg 2' })
    window.dispatchEvent(new Event('pagehide'))
    expect(saveMock).toHaveBeenCalledTimes(1)
  })
})
