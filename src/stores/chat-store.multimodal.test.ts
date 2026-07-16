import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

/**
 * Regression guard: P1-001 — multimodal `ConversationMessage.content`.
 *
 * Pre-audit, `addMessage` silently flattened `ContentPart[]` content to
 * an empty string before persisting into the conversation. After a
 * reload, the user-visible message bubble lost its image attachments
 * because the persisted `content` was `''`.
 *
 * This test:
 *   1. Adds a multimodal user turn (text + image_url) via `addMessage`.
 *   2. Asserts the persisted `ConversationMessage.content` is the
 *      original `ContentPart[]` (not `''`).
 *   3. Asserts the auto-derived title uses the leading text part.
 *   4. Asserts a multimodal turn with no text part still derives a
 *      "New Chat" title (no crash, no `[object Object]`).
 *   5. Asserts the assistant-role delta path still works with `string`
 *      content (no regression on streaming).
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

beforeAll(async () => {
  vi.useFakeTimers()
  const mod = await import('./chat-store')
  useChatStore = mod.useChatStore
  await vi.runAllTimersAsync()
})

afterAll(() => {
  vi.useRealTimers()
})

describe('chat-store multimodal content round-trip (P1-001 regression guard)', () => {
  beforeEach(() => {
    saveMock.mockClear()
    listMock.mockClear()
    chatSaveMock.mockClear()
    chatListMock.mockClear()
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
    } as never)
  })

  it('persists ContentPart[] user content without flattening to empty string', () => {
    const convId = useChatStore.getState().createConversation('llama-3.3-70b')
    useChatStore.getState().addMessage(convId, {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      ],
    })

    const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
    expect(conv).toBeDefined()
    const persisted = conv!.messages[0]
    expect(persisted.role).toBe('user')
    expect(Array.isArray(persisted.content)).toBe(true)
    const parts = persisted.content as Array<{ type: string; text?: string; image_url?: { url: string } }>
    expect(parts).toHaveLength(2)
    expect(parts[0]).toEqual({ type: 'text', text: 'What is in this image?' })
    expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } })
  })

  it('derives title from the leading text part of a multimodal first turn', () => {
    const convId = useChatStore.getState().createConversation('llama-3.3-70b')
    useChatStore.getState().addMessage(convId, {
      role: 'user',
      content: [
        { type: 'text', text: 'Hello multimodal world' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } },
      ],
    })
    const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
    expect(conv!.title).toBe('Hello multimodal world')
  })

  it('falls back to "New Chat" when a multimodal first turn has no text part', () => {
    const convId = useChatStore.getState().createConversation('llama-3.3-70b')
    useChatStore.getState().addMessage(convId, {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,CCCC' } },
      ],
    })
    const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
    expect(conv!.title).toBe('New Chat')
  })

  it('keeps plain string user turns working (no regression)', () => {
    const convId = useChatStore.getState().createConversation('llama-3.3-70b')
    useChatStore.getState().addMessage(convId, { role: 'user', content: 'plain text turn' })
    const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
    expect(conv!.messages[0].content).toBe('plain text turn')
    expect(conv!.title).toBe('plain text turn')
  })

  it('does not change a pre-existing title when a later multimodal turn is added', () => {
    const convId = useChatStore.getState().createConversation('llama-3.3-70b')
    useChatStore.getState().addMessage(convId, { role: 'user', content: 'original title' })
    useChatStore.getState().addMessage(convId, {
      role: 'user',
      content: [
        { type: 'text', text: 'second turn with image' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,DDDD' } },
      ],
    })
    const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
    expect(conv!.title).toBe('original title')
    expect(Array.isArray(conv!.messages[1].content)).toBe(true)
  })

  it('preserves assistant delta accumulation on a string content turn (streaming path)', () => {
    const convId = useChatStore.getState().createConversation('llama-3.3-70b')
    useChatStore.getState().addMessage(convId, { role: 'assistant', content: '' })
    useChatStore.getState().appendAssistantStreamDelta(convId, { content: 'Hello' })
    useChatStore.getState().appendAssistantStreamDelta(convId, { content: ' world' })
    const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
    expect(conv!.messages[0].content).toBe('Hello world')
  })
})
