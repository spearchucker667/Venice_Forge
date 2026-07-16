/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// @vitest-environment node
// T-189 / T-199 regression guard
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  toastError: vi.fn(),
  appendMessage: vi.fn(),
  listRpChats: vi.fn(async () => []),
  deleteRpChat: vi.fn(async () => true),
  generateId: vi.fn(() => "rp-chat-1"),
  normalizeChat: vi.fn((chat) => chat),
}));

vi.mock("../services/rp/rpChatService", () => ({
  listRpChats: mocks.listRpChats,
  saveRpChat: mocks.save,
  deleteRpChat: mocks.deleteRpChat,
  generateId: mocks.generateId,
  appendMessage: mocks.appendMessage,
  normalizeChat: mocks.normalizeChat,
}));

vi.mock("./toast-store", () => ({
  toast: { error: mocks.toastError },
}));

import type { RpChatV1 } from "../types/rp";
import { useRpChatStore } from "./rp-chat-store";

const init = {
  title: "Test chat",
  characterIds: ["character-1"],
  personaId: null,
  lorebookIds: [],
  modelId: "test-model",
};

const fixtures = {
  chat: {
    schema: "RpChatV1" as const,
    id: "chat_test_001",
    title: "Test RP",
    characterIds: ["character-1"],
    lorebookIds: [],
    modelId: "test-model",
    messages: [],
    adult: false,
    metadata: { pinned: false, archived: false, tags: [] },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  } as RpChatV1,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rp-chat-store Success Paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRpChatStore.setState({ chats: [], activeChatId: null, error: null, isLoading: false, hasLoaded: false, isStreaming: false });
  });

  it("loads chats successfully", async () => {
    mocks.listRpChats.mockResolvedValueOnce([fixtures.chat]);
    await useRpChatStore.getState().load();
    expect(useRpChatStore.getState().hasLoaded).toBe(true);
    expect(useRpChatStore.getState().chats.length).toBe(1);
    expect(useRpChatStore.getState().error).toBeNull();
  });

  it("sets active chat and streaming flag", () => {
    useRpChatStore.getState().setActive("chat-xyz");
    expect(useRpChatStore.getState().activeChatId).toBe("chat-xyz");
    
    useRpChatStore.getState().setStreaming(true);
    expect(useRpChatStore.getState().isStreaming).toBe(true);
  });

  it("upserts chat successfully", async () => {
    mocks.normalizeChat.mockReturnValueOnce(fixtures.chat);
    mocks.save.mockResolvedValueOnce({ ...fixtures.chat, title: "Updated Title" });

    const saved = await useRpChatStore.getState().upsert(fixtures.chat);
    expect(saved?.title).toBe("Updated Title");
    expect(useRpChatStore.getState().chats.length).toBe(1);
    expect(useRpChatStore.getState().chats[0].title).toBe("Updated Title");
  });

  it("upsert fails validation", async () => {
    mocks.normalizeChat.mockReturnValueOnce(null);
    const saved = await useRpChatStore.getState().upsert(fixtures.chat);
    expect(saved).toBeNull();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it("removes chat successfully", async () => {
    useRpChatStore.setState({ chats: [fixtures.chat], activeChatId: fixtures.chat.id });
    mocks.deleteRpChat.mockResolvedValueOnce(true);

    const ok = await useRpChatStore.getState().remove(fixtures.chat.id);
    expect(ok).toBe(true);
    expect(useRpChatStore.getState().chats.length).toBe(0);
    expect(useRpChatStore.getState().activeChatId).toBeNull();
  });

  it("remove handles rejection from service", async () => {
    useRpChatStore.setState({ chats: [fixtures.chat], activeChatId: fixtures.chat.id });
    mocks.deleteRpChat.mockResolvedValueOnce(false);

    const ok = await useRpChatStore.getState().remove(fixtures.chat.id);
    expect(ok).toBe(false);
    expect(useRpChatStore.getState().chats.length).toBe(1);
    expect(mocks.toastError).toHaveBeenCalledWith("Could not delete RP chat", "Storage rejected the request.");
  });

  it("appends user message successfully", async () => {
    useRpChatStore.setState({ chats: [fixtures.chat] });
    const newMsg = { id: "m_1", role: "user" as const, content: "hi", createdAt: 123 };
    mocks.appendMessage.mockResolvedValueOnce({ ...fixtures.chat, messages: [newMsg] });

    const msg = await useRpChatStore.getState().appendUserMessage(fixtures.chat.id, "hi");
    expect(msg?.content).toBe("hi");
    expect(useRpChatStore.getState().chats[0].messages.length).toBe(1);
  });

  it("appends character message successfully", async () => {
    useRpChatStore.setState({ chats: [fixtures.chat] });
    const newMsg = { id: "m_2", role: "character" as const, characterId: "c_1", content: "hello", createdAt: 123 };
    mocks.appendMessage.mockResolvedValueOnce({ ...fixtures.chat, messages: [newMsg] });

    const msg = await useRpChatStore.getState().appendCharacterMessage(fixtures.chat.id, "c_1", "hello");
    expect(msg?.content).toBe("hello");
    expect(useRpChatStore.getState().chats[0].messages.length).toBe(1);
  });

  it("appends narrator message successfully", async () => {
    useRpChatStore.setState({ chats: [fixtures.chat] });
    const newMsg = { id: "m_3", role: "narrator" as const, content: "narration", createdAt: 123 };
    mocks.appendMessage.mockResolvedValueOnce({ ...fixtures.chat, messages: [newMsg] });

    const msg = await useRpChatStore.getState().appendNarratorMessage(fixtures.chat.id, "narration");
    expect(msg?.content).toBe("narration");
    expect(useRpChatStore.getState().chats[0].messages.length).toBe(1);
  });

  it("getters work correctly", () => {
    useRpChatStore.setState({ chats: [fixtures.chat], activeChatId: fixtures.chat.id });
    expect(useRpChatStore.getState().getById(fixtures.chat.id)?.id).toBe(fixtures.chat.id);
    expect(useRpChatStore.getState().getActive()?.id).toBe(fixtures.chat.id);
    expect(useRpChatStore.getState().getById("missing")).toBeUndefined();
  });
});

describe("VERIFY-025 RP chat creation persistence", () => {
  beforeEach(() => {
    mocks.save.mockReset();
    mocks.toastError.mockReset();
    useRpChatStore.setState({ chats: [], activeChatId: null, error: null });
  });

  it("publishes and activates a new chat only after persistence succeeds", async () => {
    mocks.save.mockImplementation(async (chat) => chat);

    const pending = useRpChatStore.getState().createChat(init);
    expect(useRpChatStore.getState().chats).toEqual([]);

    await expect(pending).resolves.toBe("rp-chat-1");
    expect(useRpChatStore.getState().chats).toHaveLength(1);
    expect(useRpChatStore.getState().activeChatId).toBe("rp-chat-1");
  });

  it("persists the selected greeting exactly once as conversation metadata and history", async () => {
    mocks.save.mockImplementation(async (chat) => chat);
    await useRpChatStore.getState().createChat({ ...init, greeting: { mode: "alternate", characterId: "c_1", index: 1, content: "Alternate hello" } });
    const saved = mocks.save.mock.calls[0][0];
    expect(saved.metadata.greetingSelection).toEqual({ mode: "alternate", characterId: "c_1", index: 1 });
    expect(saved.messages).toEqual([expect.objectContaining({ role: "character", characterId: "c_1", content: "Alternate hello" })]);
    expect(saved.messages).toHaveLength(1);
  });

  it("keeps failed creations out of UI state and surfaces a safe persistence error", async () => {
    mocks.save.mockRejectedValue(new Error("Config is still hydrating"));

    await expect(useRpChatStore.getState().createChat(init)).resolves.toBeNull();

    expect(useRpChatStore.getState().chats).toEqual([]);
    expect(useRpChatStore.getState().activeChatId).toBeNull();
    expect(useRpChatStore.getState().error).toBe("Config is still hydrating");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not create RP chat", "Please try again.");
  });
});

describe("T-189 RP chat persistence failures do not expose raw errors", () => {
  beforeEach(() => {
    mocks.save.mockReset();
    mocks.toastError.mockReset();
    mocks.appendMessage.mockReset();
    mocks.listRpChats.mockReset();
    mocks.deleteRpChat.mockReset();
    mocks.normalizeChat.mockImplementation((chat) => chat);
    useRpChatStore.setState({
      chats: [],
      activeChatId: null,
      error: null,
      isLoading: false,
      hasLoaded: false,
    });
  });

  it("redacts load errors in state", async () => {
    mocks.listRpChats.mockRejectedValueOnce(
      new Error("read failed /Users/example/.config sk-1234567890abcdef"),
    );

    await useRpChatStore.getState().load();

    const err = useRpChatStore.getState().error;
    expect(err).not.toMatch(/\/Users\/super_user/);
    expect(err).not.toMatch(/sk-1234567890abcdef/);
    expect(err).toContain("[REDACTED]");
  });

  it("toasts a generic description on createChat failure", async () => {
    mocks.save.mockRejectedValueOnce(new Error("disk full"));
    await useRpChatStore.getState().createChat(init);
    expect(mocks.toastError).toHaveBeenCalledWith("Could not create RP chat", "Please try again.");
  });

  it("toasts a generic description on upsert failure", async () => {
    mocks.save.mockRejectedValueOnce(new Error("disk full"));
    await useRpChatStore.getState().upsert(fixtures.chat);
    expect(mocks.toastError).toHaveBeenCalledWith("Could not save RP chat", "Please try again.");
  });

  it("toasts a generic description on remove failure", async () => {
    mocks.deleteRpChat.mockRejectedValueOnce(new Error("disk full"));
    await useRpChatStore.getState().remove("chat-1");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not delete RP chat", "Please try again.");
  });

  it("toasts a generic description on appendUserMessage failure", async () => {
    useRpChatStore.setState({ chats: [fixtures.chat] });
    mocks.appendMessage.mockRejectedValueOnce(new Error("disk full"));
    await useRpChatStore.getState().appendUserMessage(fixtures.chat.id, "hi");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not save message", "Please try again.");
  });

  it("toasts a generic description on appendCharacterMessage failure", async () => {
    useRpChatStore.setState({ chats: [fixtures.chat] });
    mocks.appendMessage.mockRejectedValueOnce(new Error("disk full"));
    await useRpChatStore.getState().appendCharacterMessage(fixtures.chat.id, "character-1", "hello");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not save message", "Please try again.");
  });

  it("toasts a generic description on appendNarratorMessage failure", async () => {
    useRpChatStore.setState({ chats: [fixtures.chat] });
    mocks.appendMessage.mockRejectedValueOnce(new Error("disk full"));
    await useRpChatStore.getState().appendNarratorMessage(fixtures.chat.id, "narration");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not save message", "Please try again.");
  });
});

describe("T-199 message ids use crypto.randomUUID", () => {
  beforeEach(() => {
    mocks.appendMessage.mockReset();
    useRpChatStore.setState({ chats: [fixtures.chat], activeChatId: null, error: null });
  });

  it("uses crypto.randomUUID when available", async () => {
    if (!globalThis.crypto?.randomUUID) {
      return;
    }

    const id = "11111111-2222-3333-4444-555555555555";
    const spy = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(id);
    mocks.appendMessage.mockImplementation(async (_chat, msg) => ({
      ...fixtures.chat,
      messages: [...fixtures.chat.messages, msg],
    }));

    const result = await useRpChatStore.getState().appendUserMessage(fixtures.chat.id, "hi");

    expect(spy).toHaveBeenCalled();
    expect(result?.id).toBe(`m_${id}`);
    spy.mockRestore();
  });

  it("falls back to Math.random when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", { randomUUID: undefined });
    const mathSpy = vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    mocks.appendMessage.mockImplementation(async (_chat, msg) => ({
      ...fixtures.chat,
      messages: [...fixtures.chat.messages, msg],
    }));

    const result = await useRpChatStore.getState().appendUserMessage(fixtures.chat.id, "hi");

    expect(result?.id).toMatch(/^m_[0-9a-z]+_[0-9a-z]+$/);
    mathSpy.mockRestore();
  });
});
