/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { useChatStore } from './chat-store'
import { useMediaStore } from './media-store'
import { useToastStore } from './toast-store'
import {
  cloneChatMediaReference,
  coerceToChatMediaReferenceArray,
  createChatMediaReference,
  isChatMediaReference,
  isChatMediaReferenceArray,
} from '../types/conversation'
import {
  mediaMigrationMigratedMediaItem,
} from '../services/mediaMigration'

const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore[key] = String(value)
  },
  removeItem: (key: string) => {
    delete localStorageStore[key]
  },
  clear: () => {
    for (const k of Object.keys(localStorageStore)) {
      delete localStorageStore[k]
    }
  },
  key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
  get length() {
    return Object.keys(localStorageStore).length
  },
}
;(globalThis as { localStorage?: Storage }).localStorage =
  localStorageMock as unknown as Storage

const desktopConversationsMock = {
  list: vi.fn().mockResolvedValue({ ok: true, records: [] }),
}
const desktopChatMock = {
  list: vi.fn().mockResolvedValue({
    ok: true,
    conversations: [],
    truncated: false,
    totalScanned: 0,
  }),
  save: vi.fn().mockResolvedValue({ ok: true }),
  delete: vi.fn().mockResolvedValue({ ok: true }),
}

vi.mock('../services/desktopBridge', () => ({
  isElectron: () => false,
  desktopChat: () => desktopChatMock,
  desktopConversations: () => desktopConversationsMock,
  default: {},
  __esModule: true,
}))

vi.mock('../services/mediaMigration', () => ({
  mediaMigrationMigratedMediaItem: vi.fn(),
  __esModule: true,
}))

function resetStores() {
  useChatStore.setState({
    conversations: [],
    conversationSummaries: [],
    activeConversationId: null,
    isStreaming: false,
    pendingContext: null,
    _hasLoadedHistory: false,
    orphanedGeneratedMediaRefs: [],
    tombstonedMediaRefs: [],
    veniceParams: { model: 'test-model' } as never,
    systemPrompt: '',
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 2048,
  })
  useMediaStore.setState({
    items: [],
    itemsById: {},
    query: '',
    filters: {} as never,
    sortBy: 'newest',
    viewMode: 'grid',
    selectedIds: [],
    cache: { entries: {}, order: [] },
  } as never)
  useToastStore.setState({ toasts: [] })
}

function seedConversationWithAssistantMessage() {
  useChatStore.setState((s) => ({
    ...s,
    conversations: [
      {
        id: 'conv-1',
        title: 'Test',
        character: undefined,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: 1,
            metadata: undefined,
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Hi there',
            timestamp: 2,
            metadata: { generatedMedia: [] },
          },
        ],
      } as never,
    ],
  }))
}

function makeRef(overrides: Record<string, unknown> = {}) {
  return createChatMediaReference({
    id: 'ref-1',
    mediaId: 'media-1',
    mediaType: 'image',
    operation: 'generate',
    displayUrl: 'venice-media://media-1',
    ...overrides,
  } as never)
}

beforeAll(() => {
  ;(mediaMigrationMigratedMediaItem as unknown as ReturnType<typeof vi.fn>)
    .mockImplementation((item) => item)
})

afterAll(() => {
  ;(mediaMigrationMigratedMediaItem as unknown as ReturnType<typeof vi.fn>).mockReset()
})

beforeEach(() => {
  resetStores()
})

describe('Phase 6 ChatMediaReference schema', () => {
  it('createChatMediaReference produces a valid reference', () => {
    const ref = makeRef()
    expect(isChatMediaReference(ref)).toBe(true)
    expect(ref.id).toBe('ref-1')
    expect(ref.mediaId).toBe('media-1')
    expect(ref.mediaType).toBe('image')
    expect(ref.operation).toBe('generate')
    expect(ref.displayUrl).toBe('venice-media://media-1')
    expect(typeof ref.createdAt).toBe('number')
  })

  it('coerceToChatMediaReferenceArray migrates a legacy single object', () => {
    const legacy = makeRef()
    const result = coerceToChatMediaReferenceArray(legacy)
    expect(isChatMediaReferenceArray(result)).toBe(true)
    expect(result).toHaveLength(1)
  })

  it('coerceToChatMediaReferenceArray returns [] for null/undefined', () => {
    expect(coerceToChatMediaReferenceArray(undefined)).toEqual([])
    expect(coerceToChatMediaReferenceArray(null)).toEqual([])
  })

  it('coerceToChatMediaReferenceArray drops malformed entries', () => {
    const mixed = [makeRef(), { id: 'bad', mediaId: 'also-bad' }, null, 42]
    const result = coerceToChatMediaReferenceArray(mixed)
    expect(result).toHaveLength(1)
  })

  it('cloneChatMediaReference preserves fields and assigns a fresh id', () => {
    const ref = makeRef({ displayUrl: 'venice-media://x' })
    const clone = cloneChatMediaReference(ref, { displayUrl: 'venice-media://y' })
    expect(clone.id).not.toBe(ref.id)
    expect(clone.displayUrl).toBe('venice-media://y')
    expect(clone.mediaId).toBe(ref.mediaId)
    expect(clone.mediaType).toBe(ref.mediaType)
  })

  it('createChatMediaReference throws on invalid operation', () => {
    expect(() =>
      createChatMediaReference({
        id: 'a',
        mediaId: 'b',
        mediaType: 'image',
        operation: 'hacked' as never,
        displayUrl: 'venice-media://x',
      }),
    ).toThrow()
  })

  it('createChatMediaReference throws on invalid mediaType', () => {
    expect(() =>
      createChatMediaReference({
        id: 'a',
        mediaId: 'b',
        mediaType: 'document' as never,
        operation: 'generate',
        displayUrl: 'venice-media://x',
      }),
    ).toThrow()
  })
})

describe('Phase 6 chat-store.hel', () => {
  it('recordGeneratedMediaForMessage appends a ref to generatedMedia[] on success', () => {
    seedConversationWithAssistantMessage()
    const ref = makeRef()
    const result = useChatStore
      .getState()
      .recordGeneratedMediaForMessage('conv-1', 'msg-2', ref)
    expect(result.ok).toBe(true)
    const msg = useChatStore.getState().conversations[0].messages[1]
    expect(Array.isArray(msg.metadata?.generatedMedia)).toBe(true)
    expect(msg.metadata?.generatedMedia?.[0]?.id).toBe('ref-1')
  })

  it('recordGeneratedMediaForMessage is idempotent for repeated calls with same id', () => {
    seedConversationWithAssistantMessage()
    const ref = makeRef()
    useChatStore.getState().recordGeneratedMediaForMessage('conv-1', 'msg-2', ref)
    useChatStore.getState().recordGeneratedMediaForMessage('conv-1', 'msg-2', ref)
    const msg = useChatStore.getState().conversations[0].messages[1]
    expect(msg.metadata?.generatedMedia).toHaveLength(1)
  })

  it('recordGeneratedMediaForMessage marks the ref orphanedFromChat when no message matches', () => {
    seedConversationWithAssistantMessage()
    const ref = makeRef()
    const result = useChatStore
      .getState()
      .recordGeneratedMediaForMessage('conv-1', 'msg-missing', ref)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.ref.orphanedFromChat).toBe(true)
    }
    expect(
      useChatStore.getState().orphanedGeneratedMediaRefs.length,
    ).toBe(1)
  })

  it('removeMediaReferenceFromMessage soft-deletes only the matching ref', () => {
    seedConversationWithAssistantMessage()
    const refA = makeRef({ id: 'ref-a', mediaId: 'media-a' })
    const refB = makeRef({ id: 'ref-b', mediaId: 'media-b' })
    useChatStore.getState().recordGeneratedMediaForMessage('conv-1', 'msg-2', refA)
    useChatStore.getState().recordGeneratedMediaForMessage('conv-1', 'msg-2', refB)
    const result = useChatStore
      .getState()
      .removeMediaReferenceFromMessage('conv-1', 'msg-2', 'ref-a')
    expect(result.ok).toBe(true)
    const refs = coerceToChatMediaReferenceArray(
      useChatStore.getState().conversations[0].messages[1].metadata?.generatedMedia,
    )
    const a = refs.find((r) => r.id === 'ref-a')!
    const b = refs.find((r) => r.id === 'ref-b')!
    expect(a.deletedFromChatAt).toBeTypeOf('number')
    expect(b.deletedFromChatAt).toBeUndefined()
  })

  it('removeMediaReferenceFromMessage returns ok:false when ref not found', () => {
    seedConversationWithAssistantMessage()
    useChatStore
      .getState()
      .recordGeneratedMediaForMessage('conv-1', 'msg-2', makeRef())
    const result = useChatStore
      .getState()
      .removeMediaReferenceFromMessage('conv-1', 'msg-2', 'missing-id')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/not found/i)
    }
  })

  it('restoreMediaReferenceOnMessage clears the soft tombstone', () => {
    seedConversationWithAssistantMessage()
    const ref = makeRef()
    useChatStore.getState().recordGeneratedMediaForMessage('conv-1', 'msg-2', ref)
    useChatStore.getState().removeMediaReferenceFromMessage('conv-1', 'msg-2', 'ref-1')
    const restore = useChatStore
      .getState()
      .restoreMediaReferenceOnMessage('conv-1', 'msg-2', 'ref-1')
    expect(restore.ok).toBe(true)
    const refs = coerceToChatMediaReferenceArray(
      useChatStore.getState().conversations[0].messages[1].metadata?.generatedMedia,
    )
    const r = refs.find((x) => x.id === 'ref-1')
    expect(r).toBeDefined()
    expect(r?.deletedFromChatAt).toBeUndefined()
  })

  it('restoreMediaReferenceOnMessage is a no-op when no tombstone matches', () => {
    seedConversationWithAssistantMessage()
    useChatStore.getState().recordGeneratedMediaForMessage('conv-1', 'msg-2', makeRef())
    const result = useChatStore
      .getState()
      .restoreMediaReferenceOnMessage('conv-1', 'msg-2', 'ref-1')
    expect(result.ok).toBe(false)
  })

  it('tombstone registry is appended on removeMediaReferenceFromMessage', () => {
    seedConversationWithAssistantMessage()
    useChatStore.getState().recordGeneratedMediaForMessage('conv-1', 'msg-2', makeRef())
    useChatStore.getState().removeMediaReferenceFromMessage('conv-1', 'msg-2', 'ref-1')
    expect(useChatStore.getState().tombstonedMediaRefs.length).toBe(1)
    expect(useChatStore.getState().tombstonedMediaRefs[0].ref.id).toBe('ref-1')
  })
})
