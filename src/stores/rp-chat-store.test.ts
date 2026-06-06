// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../services/rp/rpChatService", () => ({
  listRpChats: vi.fn(async () => []),
  saveRpChat: mocks.save,
  deleteRpChat: vi.fn(async () => true),
  generateId: vi.fn(() => "rp-chat-1"),
  normalizeChat: vi.fn((chat) => chat),
}));

vi.mock("./toast-store", () => ({
  toast: { error: mocks.toastError },
}));

import { useRpChatStore } from "./rp-chat-store";

const init = {
  title: "Test chat",
  characterIds: ["character-1"],
  personaId: null,
  lorebookIds: [],
  modelId: "test-model",
};

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

  it("keeps failed creations out of UI state and surfaces the persistence error", async () => {
    mocks.save.mockRejectedValue(new Error("Config is still hydrating"));

    await expect(useRpChatStore.getState().createChat(init)).resolves.toBeNull();

    expect(useRpChatStore.getState().chats).toEqual([]);
    expect(useRpChatStore.getState().activeChatId).toBeNull();
    expect(useRpChatStore.getState().error).toBe("Config is still hydrating");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not create RP chat", "Config is still hydrating");
  });
});
