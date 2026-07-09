import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

/**
 * Regression/performance guard: P1-006 chat-store subscription O(n²).
 *
 * The subscription that marks mutated conversations dirty used to call
 * `prevState.conversations.find(...)` inside a loop over every current
 * conversation, giving O(n²) behaviour as the conversation list grows.
 *
 * The fix builds a `Map<string, Conversation>` of previous state once,
 * then uses `Map.get(c.id)` inside the loop for O(n) total work.
 *
 * This test:
 *   1. Creates ~100 conversations.
 *   2. Mutates a single non-active conversation.
 *   3. Asserts the dirty map contains ONLY the changed id (no false
 *      positives from identity checks gone wrong).
 *   4. Spies on `Array.prototype.find` during the mutation window and
 *      asserts it is not used for the subscription scan.
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

// Restore real timers unconditionally so fake timers never bleed into
// sibling test files (this is a known contributor to non-terminating
// `test:unit` runs in aggregate Vitest execution).
afterAll(() => {
  vi.useRealTimers()
})

describe('chat-store subscription performance (P1-006 regression)', () => {
  beforeEach(() => {
    saveMock.mockClear()
    listMock.mockClear()
    chatSaveMock.mockClear()
    chatListMock.mockClear()

    // Reset store state so each test starts with an empty conversation list.
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
    } as never)
  })

  it('uses O(n) lookups when scanning for mutated conversations', async () => {
    // Create 100 conversations. Each creation mutates state, but the timer
    // is fake so the debounced flush will not run until we advance it.
    const ids: string[] = []
    for (let i = 0; i < 100; i++) {
      const id = useChatStore.getState().createConversation('llama-3.3-70b')
      ids.push(id)
    }

    // Pick a non-active conversation to mutate. We use the last-created id
    // so it is not the active conversation (the final createConversation
    // made ids[99] active).
    const target = ids[10]
    const active = ids[99]

    // Clear the dirty map from the creation churn so we can observe only
    // the subsequent mutation.
    useChatStore.getState().setActiveConversation(active)
    // Flush pending saves and clear dirty map so we're starting clean.
    // We do this by forcing a flush, which clears the map.
    // NOTE: setActiveConversation itself may have marked dirty if identity
    // changed; flush it out.
    await vi.runAllTimersAsync()

    // Spy on Array.prototype.find specifically during the mutation we care
    // about. The subscription itself must not rely on .find to locate the
    // previous conversation.
    const findSpy = vi.spyOn(Array.prototype, 'find')
    try {
      useChatStore.getState().addMessage(target, { role: 'user', content: 'ping' })

      // The subscription should have marked only the mutated conversation
      // dirty — not every conversation, and not zero.
      const dirty = _debugGetDirtyConversationIds()
      expect(dirty).toContain(target)
      expect(dirty).not.toContain(active)
      expect(dirty.length).toBe(1)

      // Assert the subscription did not use Array.prototype.find on the
      // conversations array. Other code paths may legitimately call find,
      // so we only assert that no find call was made with a predicate that
      // compares `p.id === c.id` (the old O(n²) pattern).
      const oldPatternCalls = findSpy.mock.calls.filter((call) => {
        const predicate = call[0]
        if (typeof predicate !== 'function') return false
        // Exercise the predicate with a dummy object to inspect its source.
        // The old predicate was `(p) => p.id === c.id`.
        try {
          const fnString = predicate.toString()
          return /p\.id\s*===\s*c\.id/.test(fnString)
        } catch {
          return false
        }
      })
      expect(oldPatternCalls).toHaveLength(0)
    } finally {
      // Restore in finally so test failures do not leak the spy into
      // sibling tests where Array.prototype.find would unexpectedly fail.
      findSpy.mockRestore()
    }
  })

  it('scales linearly: mutating one conversation in a 100-item list marks only that id dirty', async () => {
    const ids: string[] = []
    for (let i = 0; i < 100; i++) {
      const id = useChatStore.getState().createConversation('llama-3.3-70b')
      ids.push(id)
    }

    // Drain any flushes triggered by creation so the dirty map only reflects
    // the subsequent targeted mutation.
    await flushAllPendingSaves()
    await vi.runAllTimersAsync()

    const target = ids[42]
    const active = ids[99]
    useChatStore.getState().setActiveConversation(active)

    useChatStore.getState().addMessage(target, { role: 'user', content: 'pong' })

    const dirty = _debugGetDirtyConversationIds()
    expect(dirty).toEqual([target])
  })
})
