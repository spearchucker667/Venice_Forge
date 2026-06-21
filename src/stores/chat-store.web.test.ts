import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Conversation } from "../types/conversation";
import StorageService from "../services/storageService";

// Polyfill localStorage so zustand persist middleware does not throw.
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore[key] = String(value);
  },
  removeItem: (key: string) => {
    delete localStorageStore[key];
  },
  clear: () => {
    for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
  },
  key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
  get length() {
    return Object.keys(localStorageStore).length;
  },
};
(globalThis as { localStorage?: Storage }).localStorage =
  localStorageMock as unknown as Storage;

vi.mock("../services/desktopBridge", async () => {
  const actual = await vi.importActual<typeof import("../services/desktopBridge")>(
    "../services/desktopBridge",
  );
  return {
    ...actual,
    isElectron: () => false,
  };
});

vi.mock("./settings-store", () => {
  return {
    useSettingsStore: {
      getState: () => ({ activeProjectId: "mock-proj-123" }),
    },
  };
});

let useChatStore: typeof import("./chat-store").useChatStore;
let flushAllPendingSaves: typeof import("./chat-store").flushAllPendingSaves;
let cleanupUnloadListeners: (() => void) | undefined;

/**
 * VERIFY-059 regression guard: web-mode conversation persistence.
 * Conversations must be saved to, deleted from, and hydrated from the
 * IndexedDB `conversations` store when running outside the Electron shell.
 */
describe("chat-store web-mode persistence", () => {
  beforeAll(async () => {
    const mod = await import("./chat-store");
    useChatStore = mod.useChatStore;
    flushAllPendingSaves = mod.flushAllPendingSaves;
    cleanupUnloadListeners = mod.cleanupUnloadListeners;
  });

  afterAll(() => {
    if (cleanupUnloadListeners) cleanupUnloadListeners();
  });

  beforeEach(async () => {
    await StorageService.clearStore("conversations");
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      isStreaming: false,
      systemPrompt: "",
      temperature: 0.7,
      topP: 1,
      maxTokens: 4096,
      veniceParams: { include_venice_system_prompt: false, enable_web_search: "off" },
      pendingContext: null,
      _hasLoadedHistory: true,
    });
    await flushAllPendingSaves();
  });

  it("saves a new conversation to IndexedDB in web mode", async () => {
    const id = useChatStore.getState().createConversation("venice-uncensored");
    useChatStore.getState().addMessage(id, {
      role: "user",
      content: "hello web mode",
    });
    await flushAllPendingSaves();

    const stored = await StorageService.getItems<Conversation>("conversations");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(id);
    expect(stored[0]?.messages).toHaveLength(1);
    expect(stored[0]?.messages[0]?.content).toBe("hello web mode");
  });

  it("deletes a conversation from IndexedDB in web mode", async () => {
    const id = useChatStore.getState().createConversation("venice-uncensored");
    await flushAllPendingSaves();
    expect((await StorageService.getItems<Conversation>("conversations")).length).toBe(1);

    await useChatStore.getState().deleteConversation(id);
    await flushAllPendingSaves();

    const stored = await StorageService.getItems<Conversation>("conversations");
    expect(stored).toHaveLength(0);
  });

  it("hydrates conversations from IndexedDB on module load in web mode", async () => {
    const id = useChatStore.getState().createConversation("venice-uncensored");
    useChatStore.getState().addMessage(id, { role: "user", content: "persist me" });
    await flushAllPendingSaves();

    // Reset module and store state to simulate a fresh page load.
    vi.resetModules();
    const mod = await import("./chat-store");
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(mod.useChatStore.getState().conversations.length).toBeGreaterThanOrEqual(1);
    const restored = mod.useChatStore
      .getState()
      .conversations.find((c) => c.id === id);
    expect(restored).toBeDefined();
    expect(restored?.messages[0]?.content).toBe("persist me");
  });
});
