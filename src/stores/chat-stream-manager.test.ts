/** @fileoverview Unit tests for the persistent chat stream manager. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveConvId,
  isStreaming,
  startStream,
  stopStream,
  subscribeToStreamState,
} from "./chat-stream-manager";
import { useChatStore } from "./chat-store";
import { useCharacterStore } from "./character-store";
import { veniceStreamChat } from "../services/veniceClient";

vi.mock("../services/veniceClient", () => ({
  veniceStreamChat: vi.fn(),
  veniceFetch: vi.fn(),
}));

const mockedVeniceStreamChat = vi.mocked(veniceStreamChat);

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
}

describe("chat-stream-manager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopStream();
    resetStores();
    vi.useRealTimers();
  });

  it("builds the request body from the current conversation and model", async () => {
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });

    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "llama-3.3-70b");

    const body = mockedVeniceStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(body.model).toBe("llama-3.3-70b");
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("injects a global system prompt when one is configured", async () => {
    useChatStore.setState({ systemPrompt: "Use concise answers." });
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });

    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "llama-3.3-70b");

    const body = mockedVeniceStreamChat.mock.calls[0][0] as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: "system", content: "Use concise answers." });
    expect(messages[1]).toEqual({ role: "user", content: "Hello" });
  });

  // VERIFY-143: custom chat prompts must retain their context budget without
  // exposing the image-helper protocol in subsequent model turns.
  it("preserves a disabled Venice prompt, strips image-helper markers, and clamps output for a large custom prompt", async () => {
    useChatStore.setState({
      systemPrompt: "x".repeat(20_000),
      maxTokens: 4096,
      veniceParams: {
        include_venice_system_prompt: false,
        enable_web_search: "off",
      },
    });
    const convId = useChatStore.getState().createConversation("unknown-small-context-model");
    useChatStore.getState().addMessage(convId, {
      role: "assistant",
      content: 'Visible reply <venice_forge_scene_request>{"intent":"create_scene"}</venice_forge_scene_request>',
    });
    useChatStore.getState().addMessage(convId, { role: "user", content: "Continue" });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "unknown-small-context-model");

    const body = mockedVeniceStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(body.venice_parameters).toEqual(expect.objectContaining({ include_venice_system_prompt: false }));
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.max_tokens).toBeLessThan(4096);
    expect(JSON.stringify(body.messages)).not.toContain("venice_forge_scene_request");
  });

  it("appends content and reasoning deltas to the last assistant message", async () => {
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    useChatStore.getState().addMessage(convId, { role: "assistant", content: "" });

    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      opts.onDelta?.({ content: " world", reasoning: "" });
      opts.onDelta?.({ content: "!", reasoning: "thinking" });
      return Promise.resolve(undefined);
    });

    await startStream(convId, "llama-3.3-70b");

    const conv = useChatStore.getState().conversations.find((c) => c.id === convId)!;
    const last = conv.messages[conv.messages.length - 1];
    expect(last?.role).toBe("assistant");
    expect(last?.content).toBe(" world!");
    expect(last?.reasoning_content).toBe("thinking");
  });

  it("batches 1,000 raw deltas into one conversation mutation and preserves final output", async () => {
    // VERIFY-138 regression guard
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "assistant", content: "" });
    const append = vi.spyOn(useChatStore.getState(), "appendAssistantStreamDelta");

    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      for (let index = 0; index < 1000; index += 1) {
        opts.onDelta?.({ content: "x", reasoning: index % 10 === 0 ? "r" : "" });
      }
      return Promise.resolve(undefined);
    });

    await startStream(convId, "llama-3.3-70b");

    expect(append).toHaveBeenCalledTimes(1);
    const last = useChatStore.getState().conversations[0].messages.at(-1)!;
    expect(last.content).toBe("x".repeat(1000));
    expect(last.reasoning_content).toBe("r".repeat(100));
  });

  it("flushes buffered content before cancellation completes", async () => {
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "assistant", content: "" });
    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      opts.onDelta?.({ content: "buffered", reasoning: "" });
      return new Promise<void>((_, reject) => {
        opts.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    const pending = startStream(convId, "llama-3.3-70b");
    stopStream();
    await pending;

    expect(useChatStore.getState().conversations[0].messages.at(-1)?.content).toBe("buffered");
  });

  it("sets store.isStreaming true while streaming and false when done", async () => {
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    useChatStore.getState().addMessage(convId, { role: "assistant", content: "" });

    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      expect(useChatStore.getState().isStreaming).toBe(true);
      opts.onDelta?.({ content: "done", reasoning: "" });
      return Promise.resolve(undefined);
    });

    expect(useChatStore.getState().isStreaming).toBe(false);
    await startStream(convId, "llama-3.3-70b");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("reports isStreaming and active conv id", async () => {
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    useChatStore.getState().addMessage(convId, { role: "assistant", content: "" });

    let capturedSignal: AbortSignal | undefined;
    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      capturedSignal = opts.signal;
      return new Promise<void>((resolve) => {
        opts.signal!.addEventListener("abort", () => resolve());
      });
    });

    const promise = startStream(convId, "llama-3.3-70b");
    expect(isStreaming()).toBe(true);
    expect(getActiveConvId()).toBe(convId);

    stopStream();
    await promise;

    expect(capturedSignal?.aborted).toBe(true);
    expect(isStreaming()).toBe(false);
    expect(getActiveConvId()).toBeNull();
  });

  it("returns { aborted: true } when the stream is stopped", async () => {
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    useChatStore.getState().addMessage(convId, { role: "assistant", content: "" });

    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      return new Promise<void>((_, reject) => {
        opts.signal!.addEventListener("abort", () => {
          reject(new DOMException("Request aborted", "AbortError"));
        });
      });
    });

    const promise = startStream(convId, "llama-3.3-70b");
    stopStream();

    const result = await promise;
    expect(result.aborted).toBe(true);
  });

  it("appends a safe error message on non-abort stream failures", async () => {
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    useChatStore.getState().addMessage(convId, { role: "assistant", content: "" });

    const sensitive = "Network error at /Users/example/secret/path";
    mockedVeniceStreamChat.mockRejectedValue(new Error(sensitive));

    const promise = startStream(convId, "llama-3.3-70b");
    
    // Advance timers to trigger the exponential backoff (1s, 2s)
    await vi.advanceTimersByTimeAsync(4000);
    
    const result = await promise;

    expect(result.aborted).toBe(false);
    const conv = useChatStore.getState().conversations.find((c) => c.id === convId)!;
    const last = conv.messages[conv.messages.length - 1];
    expect(last?.content).toContain("Sorry, something went wrong");
    expect(last?.content).not.toContain(sensitive);
    expect(last?.content).not.toContain("/Users/super_user");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("notifies stream-state listeners on start and stop", async () => {
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    useChatStore.getState().addMessage(convId, { role: "assistant", content: "" });

    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    const listener = vi.fn();
    const unsubscribe = subscribeToStreamState(listener);

    expect(listener).toHaveBeenCalledWith({ isStreaming: false, convId: null });

    await startStream(convId, "llama-3.3-70b");

    expect(listener).toHaveBeenLastCalledWith({ isStreaming: false, convId: null });
    expect(listener.mock.calls.some((call) => call[0].isStreaming === true)).toBe(true);

    unsubscribe();
  });
});

// VF-20260720-001 / persona isolation: character identity must be
// conversation-authoritative. Global UI selection must never leak a hosted
// slug into standard or local-character requests.
describe("persona isolation (VF-20260720-001)", () => {
  const CHARACTER = {
    id: "char-1",
    slug: "alan-watts",
    name: "Alan Watts",
    description: "British philosopher",
    adult: false,
    featured: true,
    shareUrl: "https://venice.ai/c/alan-watts",
    photoUrl: "https://outerface.venice.ai/alan-watts.png",
    tags: [],
    webEnabled: false,
    modelId: "llama-3.3-70b",
    stats: { averageRating: 4.6 },
  };

  function lastRequestBody(): Record<string, unknown> {
    return mockedVeniceStreamChat.mock.calls.at(-1)![0] as Record<string, unknown>;
  }

  function veniceParameters(): Record<string, unknown> {
    return lastRequestBody().venice_parameters as Record<string, unknown>;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    vi.clearAllMocks();
    useCharacterStore.setState({
      selectedCharacter: CHARACTER,
      selectedCharacterSlug: CHARACTER.slug,
    } as never);
  });

  afterEach(() => {
    stopStream();
    resetStores();
    useCharacterStore.setState({ selectedCharacter: null, selectedCharacterSlug: null } as never);
    vi.useRealTimers();
  });

  it("sends no character_slug for a new standard chat while a hosted character is globally selected", async () => {
    const convId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "llama-3.3-70b");

    expect(veniceParameters()).not.toHaveProperty("character_slug");
  });

  it("sends no character_slug when switching from a hosted chat to an existing standard chat", async () => {
    const hostedId = useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    useChatStore.getState().addMessage(hostedId, { role: "user", content: "Hi character" });
    const standardId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(standardId, { role: "user", content: "Hi standard" });
    mockedVeniceStreamChat.mockResolvedValue(undefined);

    await startStream(hostedId, "llama-3.3-70b");
    expect(veniceParameters().character_slug).toBe("alan-watts");

    await startStream(standardId, "llama-3.3-70b");
    expect(veniceParameters()).not.toHaveProperty("character_slug");
  });

  it("hosted character conversation sends its persisted slug and disables the Venice default system prompt", async () => {
    const convId = useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "llama-3.3-70b");

    expect(veniceParameters().character_slug).toBe("alan-watts");
    expect(veniceParameters().include_venice_system_prompt).toBe(false);
  });

  it("hosted binding survives store rehydration from persisted metadata", async () => {
    const convId = useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    const persisted = useChatStore.getState().conversations.find((c) => c.id === convId)!;
    // Simulate rehydration: replace in-memory conversations with the persisted copy.
    useChatStore.setState({ conversations: [structuredClone(persisted)] });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "llama-3.3-70b");

    expect(veniceParameters().character_slug).toBe("alan-watts");
  });

  it("local character conversation never sends a hosted slug", async () => {
    const card = {
      schema: "CharacterCardV1",
      id: "local-card-1",
      name: "Local Test",
      description: "local",
      systemPrompt: "You are a local character.",
      tags: [],
      adult: false,
      exampleDialogues: [],
      modelId: "llama-3.3-70b",
      createdAt: 1,
      updatedAt: 1,
    };
    const convId = useChatStore.getState().createLocalCharacterConversation(card as never, "llama-3.3-70b");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "llama-3.3-70b");

    expect(veniceParameters()).not.toHaveProperty("character_slug");
  });

  it("standard chat restores the configured Venice default-system-prompt flag after a character chat", async () => {
    useChatStore.setState({
      veniceParams: { include_venice_system_prompt: true, enable_web_search: "off" },
    });
    const hostedId = useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    useChatStore.getState().addMessage(hostedId, { role: "user", content: "Hi" });
    const standardId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(standardId, { role: "user", content: "Hi" });
    mockedVeniceStreamChat.mockResolvedValue(undefined);

    await startStream(hostedId, "llama-3.3-70b");
    expect(veniceParameters().include_venice_system_prompt).toBe(false);

    await startStream(standardId, "llama-3.3-70b");
    expect(veniceParameters().include_venice_system_prompt).toBe(true);
  });

  it("retry rebuilds the request from conversation metadata, not global selection", async () => {
    const hostedId = useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    useChatStore.getState().addMessage(hostedId, { role: "user", content: "Hi" });
    const standardId = useChatStore.getState().createConversation("llama-3.3-70b");
    useChatStore.getState().addMessage(standardId, { role: "user", content: "Hi" });
    // First attempt fails retryably, second succeeds.
    mockedVeniceStreamChat
      .mockRejectedValueOnce(Object.assign(new Error("upstream"), { status: 502 }))
      .mockResolvedValueOnce(undefined);

    const promise = startStream(standardId, "llama-3.3-70b");
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    // Change global selection between attempts must not matter; every call
    // for this standard conversation must lack character_slug.
    for (const call of mockedVeniceStreamChat.mock.calls) {
      const params = (call[0] as Record<string, unknown>).venice_parameters as Record<string, unknown>;
      expect(params).not.toHaveProperty("character_slug");
    }
    expect(hostedId).not.toBe(standardId);
  });
});
