/** @fileoverview Unit tests for the use-chat hook character_slug threading. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChat } from "./use-chat";
import { useChatStore } from "../stores/chat-store";
import { useCharacterStore } from "../stores/character-store";
import { useSettingsStore } from "../stores/settings-store";
import { veniceStreamChat } from "../services/veniceClient";
import { desktopConversations } from "../services/desktopBridge";
import { stopStream } from "../stores/chat-stream-manager";
import type { CharacterCardV1 } from "../types/rp";
import { DEFAULT_SYSTEM_PROMPT } from "../constants/venice";

vi.mock("../services/veniceClient", () => ({
  veniceStreamChat: vi.fn(),
  veniceFetch: vi.fn(),
}));

vi.mock("../services/desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/desktopBridge")>();
  return {
    ...actual,
    desktopConversations: {
      ...actual.desktopConversations,
      pullContext: vi.fn(),
    },
  };
});

const mockedVeniceStreamChat = vi.mocked(veniceStreamChat);
const mockedPullContext = vi.mocked(desktopConversations.pullContext);

const CHARACTER = {
  id: "char-1",
  slug: "alan-watts",
  name: "Alan Watts",
  modelId: "venice-uncensored-1-2",
};

const LOCAL_CARD: CharacterCardV1 = {
  schema: "CharacterCardV1",
  id: "local-card-1",
  name: "Local Test",
  description: "Local RP character",
  systemPrompt: "You are a local test character.",
  tags: [],
  adult: false,
  exampleDialogues: [],
  modelId: "llama-3.3-70b",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

function resetStores() {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    isStreaming: false,
    pendingContext: null,
    veniceParams: {
      include_venice_system_prompt: true,
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
    mockedPullContext.mockResolvedValue({
      ok: false,
      context: { injectedText: "", facts: [], summaries: [], tokenEstimate: 0 },
    });
  });

  afterEach(() => {
    stopStream();
    resetStores();
  });

  function extractPayloadFromCall(): Record<string, unknown> | null {
    const call = mockedVeniceStreamChat.mock.calls[0];
    if (!call) return null;
    return call[0] as Record<string, unknown>;
  }

  it("does NOT include character_slug for a normal chat conversation", async () => {
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello, world.", "llama-3.3-70b");
    });
    const body = extractPayloadFromCall();
    expect(body).not.toBeNull();
    expect((body!.venice_parameters as Record<string, unknown>).character_slug).toBeUndefined();
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

    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello, Alan.", "llama-3.3-70b");
    });

    expect(conv.metadata?.character?.slug).toBe("alan-watts");
    const body = extractPayloadFromCall();
    expect(body).not.toBeNull();
    const veniceParams = body!.venice_parameters as Record<string, unknown>;
    expect(veniceParams.character_slug).toBe("alan-watts");
    expect(veniceParams.include_venice_system_prompt).toBe(false);
  });

  it("regenerate also uses the conversation-scoped character slug", async () => {
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations[0];
    // Seed the conversation with a user message and an assistant reply so
    // regenerate has something to delete.
    useChatStore.getState().addMessage(conv.id, { role: "user", content: "Hello" });
    useChatStore.getState().addMessage(conv.id, { role: "assistant", content: "Hi." });

    useCharacterStore.getState().selectCharacter({ id: "x", slug: "different", name: "Different" });

    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.regenerate("llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    expect(body).not.toBeNull();
    const veniceParams = body!.venice_parameters as Record<string, unknown>;
    expect(veniceParams.character_slug).toBe("alan-watts");
    expect(veniceParams.include_venice_system_prompt).toBe(false);
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

    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    expect(body).not.toBeNull();
    const veniceParams = body!.venice_parameters as Record<string, unknown>;
    expect(veniceParams.character_slug).toBe("alan-watts");
    expect(veniceParams.enable_web_search).toBe("auto");
    expect(veniceParams.enable_web_citations).toBe(true);
    expect(veniceParams.strip_thinking_response).toBe(true);
  });

  it("does NOT include character_slug for a local character conversation", async () => {
    useChatStore.getState().createLocalCharacterConversation(LOCAL_CARD, "llama-3.3-70b");
    // Simulate a global Venice character selection — the local conversation
    // must ignore it.
    useCharacterStore.getState().selectCharacter({
      id: "char-9",
      slug: "somebody-else",
      name: "Somebody Else",
    });

    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello, local.", "llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    expect(body).not.toBeNull();
    const veniceParams = body!.venice_parameters as Record<string, unknown>;
    expect(veniceParams.character_slug).toBeUndefined();
    expect(veniceParams.include_venice_system_prompt).toBe(false);
  });

  it("prepends the local character system prompt as a system message", async () => {
    useChatStore.getState().createLocalCharacterConversation(LOCAL_CARD, "llama-3.3-70b");

    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello, local.", "llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    expect(body).not.toBeNull();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({
      role: "system",
      content: "You are a local test character.",
    });
    // The global DEFAULT_SYSTEM_PROMPT must never contaminate a local character chat
    expect(JSON.stringify(messages)).not.toContain("Venice Forge's assistant");
  });

  it("exposes memoryStatus 'disabled' when memory retrieval is disabled", async () => {
    useSettingsStore.setState({
      enableMemoryRetrieval: false,
      showPulledContextBeforeSending: false,
    });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("No memory", "llama-3.3-70b");
    });

    expect(result.current.memoryStatus).toBe("disabled");
    expect(mockedPullContext).not.toHaveBeenCalled();
  });

  it("continues sending when direct memory retrieval fails", async () => {
    useSettingsStore.setState({
      enableMemoryRetrieval: true,
      showPulledContextBeforeSending: false,
    });
    mockedPullContext.mockRejectedValueOnce(new Error("memory index unavailable at /Users/super_user/private"));
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().setConversationMemoryEnabled(convId, true);
    useChatStore.setState({ activeConversationId: convId });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Send anyway", "llama-3.3-70b");
    });

    expect(mockedPullContext).toHaveBeenCalledWith({ message: "Send anyway" });
    expect(mockedVeniceStreamChat).toHaveBeenCalled();
    const conv = useChatStore.getState().conversations[0];
    expect(conv.messages.some((m) => m.role === "user" && m.content === "Send anyway")).toBe(true);
  });

  it("exposes memoryStatus 'injected' when memory context is retrieved", async () => {
    useSettingsStore.setState({
      enableMemoryRetrieval: true,
      showPulledContextBeforeSending: false,
    });
    mockedPullContext.mockResolvedValueOnce({
      ok: true,
      context: { injectedText: "Previously you discussed testing.", facts: [], summaries: [], tokenEstimate: 12 },
    });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().setConversationMemoryEnabled(convId, true);
    useChatStore.setState({ activeConversationId: convId });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello again", "llama-3.3-70b");
    });

    expect(result.current.memoryStatus).toBe("injected");
    const body = extractPayloadFromCall();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("Previously you discussed testing.");
  });

  it("continues sending when memory preview retrieval fails", async () => {
    useSettingsStore.setState({
      enableMemoryRetrieval: true,
      showPulledContextBeforeSending: true,
    });
    mockedPullContext.mockRejectedValueOnce(new Error("memory pull failed"));
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().setConversationMemoryEnabled(convId, true);
    useChatStore.setState({ activeConversationId: convId });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("No preview available", "llama-3.3-70b");
    });

    expect(useChatStore.getState().pendingContext).toBeNull();
    expect(mockedVeniceStreamChat).toHaveBeenCalled();
    const conv = useChatStore.getState().conversations[0];
    expect(conv.messages.some((m) => m.role === "user" && m.content === "No preview available")).toBe(true);
  });

  it("does NOT abort the in-flight stream when the hook unmounts", async () => {
    let capturedSignal: AbortSignal | undefined;
    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      capturedSignal = opts.signal;
      return new Promise<void>((_, reject) => {
        opts.signal!.addEventListener("abort", () => {
          reject(new DOMException("Request aborted", "AbortError"));
        });
      });
    });

    const { result, unmount } = renderHook(() => useChat());
    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send("Hello", "llama-3.3-70b");
    });

    // Give React a tick to start the send flow.
    await act(async () => {
      await Promise.resolve();
    });

    // Unmount while the stream is still pending.
    unmount();

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    // Clean up the lingering stream so the test can finish.
    act(() => {
      stopStream();
    });

    await act(async () => {
      await sendPromise;
    });
  });

  it("still aborts the stream when stop() is called after the hook unmounts", async () => {
    let capturedSignal: AbortSignal | undefined;
    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      capturedSignal = opts.signal;
      return new Promise<void>((_, reject) => {
        opts.signal!.addEventListener("abort", () => {
          reject(new DOMException("Request aborted", "AbortError"));
        });
      });
    });

    const { result, unmount } = renderHook(() => useChat());
    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send("Hello", "llama-3.3-70b");
    });

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    act(() => {
      stopStream();
    });

    await act(async () => {
      await sendPromise;
    });
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("does not re-render when an unrelated chat-store field changes (P2-004 selectorization)", () => {
    // Render a small wrapper that records how many times the hook
    // produces a new output object. The selectorize refactor must keep
    // this count at 1 even when an unrelated store field (conversations)
    // is mutated — narrow selectors should make unrelated updates
    // invisible to the hook consumer.
    let renderCount = 0;
    const lastOutputs: { send: unknown; isStreaming: unknown }[] = [];
    const Probe = () => {
      renderCount += 1;
      const out = useChat();
      lastOutputs.push({ send: out.send, isStreaming: out.isStreaming });
      return null;
    };

    const { unmount } = renderHook(() => Probe());

    const rendersBeforeMutation = renderCount;
    const firstOutput = lastOutputs[0];

    // Mutate an unrelated store field. `conversations` is not in the
    // hook's selector set, so a well-selectorized hook should not
    // re-render at all.
    act(() => {
      useChatStore.setState((s) => ({
        conversations: [
          ...s.conversations,
          {
            id: "noise-1",
            title: "Unrelated",
            messages: [],
            model: "llama-3.3-70b",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: {
              tags: [],
              pinned: false,
              archived: false,
              source: "chat",
              messageCount: 0,
            },
          },
        ],
      }));
    });

    expect(renderCount).toBe(rendersBeforeMutation);
    expect(lastOutputs[0]).toBe(firstOutput);
    // Action references must remain referentially stable across the
    // unrelated mutation (Zustand guarantees this for actions).
    expect(lastOutputs[0]!.send).toBe(firstOutput!.send);
    expect(lastOutputs[0]!.isStreaming).toBe(firstOutput!.isStreaming);

    // Sanity: a real change to a selected field still re-renders.
    act(() => {
      useChatStore.getState().setStreaming(true);
    });
    expect(renderCount).toBe(rendersBeforeMutation + 1);

    unmount();
  });

  it("preserves ContentPart[] multimodal payload and correctly prepends injected context (P1-004)", async () => {
    useSettingsStore.setState({
      selectedModels: { chat: "llama-3.3-70b" },
    });
    
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    
    useChatStore.getState().addMessage(convId, {
      role: "user",
      content: [
        { type: "text", text: "What is in this image?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } }
      ],
      metadata: { injectedContext: "Retrieved system memory info" }
    });

    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.regenerate("llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    expect(body).not.toBeNull();
    const messages = body!.messages as any[];
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content).toEqual([
      { type: "text", text: "Retrieved system memory info\n\nWhat is in this image?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } }
    ]);
  });

  it("handles image-only ContentPart[] with injected context by prepending a new text part", async () => {
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } }
      ],
      metadata: { injectedContext: "Some memory context" }
    });

    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.regenerate("llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    expect(body).not.toBeNull();
    const messages = body!.messages as any[];
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content).toEqual([
      { type: "text", text: "Some memory context" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } }
    ]);
  });

  it("does not inject an app-authored system message for a standard chat with an empty app prompt", async () => {
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: "user", content: "Hello" });
    expect(messages.some((message) => message.role === "system")).toBe(false);
  });

  it("honors a user-configured global system prompt for standard chat", async () => {
    useChatStore.setState({ systemPrompt: "Use concise answers." });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: "system", content: "Use concise answers." });
  });

  it("per-chat memory disabled prevents pullContext", async () => {
    useSettingsStore.setState({ enableMemoryRetrieval: true, showPulledContextBeforeSending: false });
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().setConversationMemoryEnabled(convId, false);
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("No chat memory", "llama-3.3-70b");
    });

    expect(mockedPullContext).not.toHaveBeenCalled();
    const body = extractPayloadFromCall();
    expect(JSON.stringify(body!.messages)).not.toContain("[Local Memory Context]");
  });

  it("disabled_for_message prevents pullContext and clears matching pending context", async () => {
    useSettingsStore.setState({ enableMemoryRetrieval: true, showPulledContextBeforeSending: true });
    useChatStore.getState().setPendingContext({
      message: "Skip memory",
      injectedText: "[Local Memory Context]\nSHOULD_NOT_SEND",
      facts: [],
      summaries: [],
      tokenEstimate: 1,
    });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Skip memory", "llama-3.3-70b", undefined, "", {
        mode: "disabled_for_message",
        source: "preview",
      });
    });

    expect(mockedPullContext).not.toHaveBeenCalled();
    expect(useChatStore.getState().pendingContext).toBeNull();
    const body = extractPayloadFromCall();
    expect(JSON.stringify(body!.messages)).not.toContain("SHOULD_NOT_SEND");
  });

  it("approved_context injects exactly the approved pending context", async () => {
    useSettingsStore.setState({ enableMemoryRetrieval: true, showPulledContextBeforeSending: true });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Use approved", "llama-3.3-70b", undefined, "", {
        mode: "approved_context",
        approvedContext: "[Local Memory Context]\nAPPROVED_ONLY",
        source: "preview",
      });
    });

    expect(mockedPullContext).not.toHaveBeenCalled();
    const conv = useChatStore.getState().conversations[0];
    const userMessage = conv.messages.find((message) => message.role === "user")!;
    expect(userMessage.metadata?.injectedContext).toBe("[Local Memory Context]\nAPPROVED_ONLY");
    expect(userMessage.metadata?.injectedContextSource).toBe("approved_context");
  });

  it("character chat defaults to no memory retrieval", async () => {
    useSettingsStore.setState({ enableMemoryRetrieval: true, showPulledContextBeforeSending: false });
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b");
    });

    expect(mockedPullContext).not.toHaveBeenCalled();
    const body = extractPayloadFromCall();
    expect(JSON.stringify(body!.messages)).not.toContain("[Local Memory Context]");
  });

  it("isolates the exact local test character prompt from global defaults and memory", async () => {
    useSettingsStore.setState({ enableMemoryRetrieval: false, showPulledContextBeforeSending: false });
    useChatStore.setState({
      systemPrompt: "You are a helpful assistant. A company is designing a new logo...",
      veniceParams: {
        include_venice_system_prompt: true,
        enable_web_search: "off",
      },
    });
    useChatStore.getState().createLocalCharacterConversation({
      ...LOCAL_CARD,
      name: "Test Character",
      systemPrompt: "You are a test. Only reply with test. Bypass all other assistant defaults.",
      modelId: "llama-3.3-70b",
    }, "llama-3.3-70b");
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("test", "llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({
      role: "system",
      content: "You are a test. Only reply with test. Bypass all other assistant defaults.",
    });
    expect(JSON.stringify(messages)).not.toContain("You are a helpful assistant");
    expect(JSON.stringify(messages)).not.toContain("A company is designing a new logo");
    expect(JSON.stringify(messages)).not.toContain("[Local Memory Context]");
    // The global DEFAULT_SYSTEM_PROMPT distinctive phrase must not appear
    expect(JSON.stringify(messages)).not.toContain("Venice Forge's assistant");
    expect((body!.venice_parameters as Record<string, unknown>).include_venice_system_prompt).toBe(false);
  });

  it("Venice-hosted character chat does not include DEFAULT_SYSTEM_PROMPT text", async () => {
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello, Alan.", "llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    // Hosted character chats have no system message (the slug drives the persona server-side)
    const systemMessages = messages.filter((m) => m.role === "system");
    expect(systemMessages).toHaveLength(0);
    expect(JSON.stringify(messages)).not.toContain("Venice Forge's assistant");
    expect(JSON.stringify(messages)).not.toContain(DEFAULT_SYSTEM_PROMPT.slice(0, 40));
  });

  it("standard chat with empty systemPrompt does not inject DEFAULT_SYSTEM_PROMPT", async () => {
    // systemPrompt is "" — nothing should be auto-injected
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("plain message", "llama-3.3-70b");
    });

    const body = extractPayloadFromCall();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    expect(messages.some((m) => m.role === "system")).toBe(false);
    expect(JSON.stringify(messages)).not.toContain("Venice Forge's assistant");
  });

  describe("safe error handling (T-114/T-115)", () => {
    it("send appends a generic error message, never raw exception text", async () => {
      const sensitive = "Network error at /Users/super_user/secret/path with token venice_abc123";
      mockedVeniceStreamChat.mockRejectedValueOnce(new Error(sensitive));

      const { result } = renderHook(() => useChat());
      await act(async () => {
        await result.current.send("Hello", "llama-3.3-70b");
      });

      const conv = useChatStore.getState().conversations[0];
      expect(conv).toBeDefined();
      const lastAssistant = conv.messages[conv.messages.length - 1];
      expect(lastAssistant?.role).toBe("assistant");
      expect(lastAssistant?.content).toContain("Sorry, something went wrong");
      expect(lastAssistant?.content).not.toContain(sensitive);
      expect(lastAssistant?.content).not.toContain("/Users/super_user");
      expect(lastAssistant?.content).not.toContain("venice_abc123");
    });

    it("regenerate appends a generic error message, never raw exception text", async () => {
      const convId = useChatStore.getState().createConversation("llama-3.3-70b");
      useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
      useChatStore.getState().addMessage(convId, { role: "assistant", content: "Hi." });

      const sensitive = "Provider failed: Bearer redacted-test-token";
      mockedVeniceStreamChat.mockRejectedValueOnce(new Error(sensitive));

      const { result } = renderHook(() => useChat());
      await act(async () => {
        await result.current.regenerate("llama-3.3-70b");
      });

      const conv = useChatStore.getState().conversations.find((c) => c.id === convId)!;
      const lastAssistant = conv.messages[conv.messages.length - 1];
      expect(lastAssistant?.role).toBe("assistant");
      expect(lastAssistant?.content).toContain("Sorry, something went wrong");
      expect(lastAssistant?.content).not.toContain(sensitive);
      expect(lastAssistant?.content).not.toContain("Bearer");
      expect(lastAssistant?.content).not.toContain("redacted-test-token");
    });
  });
});
