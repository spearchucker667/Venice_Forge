/** @fileoverview Unit tests for the use-chat hook character_slug threading. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChat } from "./use-chat";
import { useChatStore } from "../stores/chat-store";
import { useCharacterStore } from "../stores/character-store";
import { useSettingsStore } from "../stores/settings-store";
import { venice } from "../lib/venice-client";

vi.mock("../lib/venice-client", () => ({
  venice: vi.fn(),
  VeniceAPIError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "VeniceAPIError";
      this.status = status;
    }
  },
}));

const mockedVenice = vi.mocked(venice);

/** Builds a minimal SSE-encoded response body that parsesSSEStream
 *  will recognize. The hook only cares about the request body, but the
 *  stream parser is invoked at the end of `send` so we need a no-op
 *  payload here. */
function buildSseResponse(): string {
  return "data: [DONE]\n\n";
}

const CHARACTER = {
  id: "char-1",
  slug: "alan-watts",
  name: "Alan Watts",
  modelId: "venice-uncensored-1-2",
};

function resetStores() {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    isStreaming: false,
    pendingContext: null,
    veniceParams: {
      include_venice_system_prompt: false,
      enable_web_search: "off",
    },
    systemPrompt: "",
    temperature: 0.7,
    topP: 1,
    maxTokens: 4096,
  });
  useCharacterStore.setState({
    selectedCharacter: null,
    selectedCharacterSlug: null,
    results: [],
    searchQuery: "",
    includeAdultCharacters: false,
    webEnabledOnly: false,
    isLoading: false,
    error: null,
    sortBy: "featured",
    sortOrder: "desc",
    offset: 0,
    hasMore: false,
  });
  useSettingsStore.setState({
    selectedModels: { chat: "llama-3.3-70b" },
  });
}

describe("use-chat character_slug threading", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStores();
  });

  it("does NOT include character_slug for a normal chat conversation", async () => {
    mockedVenice.mockResolvedValueOnce(buildSseResponse());
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello, world.", "llama-3.3-70b");
    });
    const call = mockedVenice.mock.calls.find((c) => c[0] === "/chat/completions");
    expect(call).toBeDefined();
    const body = call![1]?.body as Record<string, unknown>;
    expect(body.venice_parameters).toBeDefined();
    expect((body.venice_parameters as Record<string, unknown>).character_slug).toBeUndefined();
  });

  it("uses the conversation's persisted character slug even when the global selection changes", async () => {
    // Create a character conversation
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations[0];

    // Simulate the user later selecting a different character in the
    // global store. The conversation slug must NOT be overwritten.
    useCharacterStore.getState().selectCharacter({
      id: "char-9",
      slug: "somebody-else",
      name: "Somebody Else",
    });

    mockedVenice.mockResolvedValueOnce(buildSseResponse());
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello, Alan.", "llama-3.3-70b");
    });

    expect(conv.metadata?.character?.slug).toBe("alan-watts");
    const call = mockedVenice.mock.calls.find((c) => c[0] === "/chat/completions");
    const body = call![1]?.body as Record<string, unknown>;
    const veniceParams = body.venice_parameters as Record<string, unknown>;
    expect(veniceParams.character_slug).toBe("alan-watts");
  });

  it("regenerate also uses the conversation-scoped character slug", async () => {
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations[0];
    // Seed the conversation with a user message and an assistant reply so
    // regenerate has something to delete.
    useChatStore.getState().addMessage(conv.id, { role: "user", content: "Hello" });
    useChatStore.getState().addMessage(conv.id, { role: "assistant", content: "Hi." });

    useCharacterStore.getState().selectCharacter({ id: "x", slug: "different", name: "Different" });

    mockedVenice.mockResolvedValueOnce(buildSseResponse());
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.regenerate("llama-3.3-70b");
    });

    const call = mockedVenice.mock.calls.find((c) => c[0] === "/chat/completions");
    const body = call![1]?.body as Record<string, unknown>;
    const veniceParams = body.venice_parameters as Record<string, unknown>;
    expect(veniceParams.character_slug).toBe("alan-watts");
  });

  it("preserves the existing web search / citation params when character_slug is set", async () => {
    useChatStore.setState({
      veniceParams: {
        include_venice_system_prompt: false,
        enable_web_search: "auto",
        enable_web_citations: true,
        strip_thinking_response: true,
      },
    });
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");

    mockedVenice.mockResolvedValueOnce(buildSseResponse());
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b");
    });

    const call = mockedVenice.mock.calls.find((c) => c[0] === "/chat/completions");
    const body = call![1]?.body as Record<string, unknown>;
    const veniceParams = body.venice_parameters as Record<string, unknown>;
    expect(veniceParams.character_slug).toBe("alan-watts");
    expect(veniceParams.enable_web_search).toBe("auto");
    expect(veniceParams.enable_web_citations).toBe(true);
    expect(veniceParams.strip_thinking_response).toBe(true);
  });
});
