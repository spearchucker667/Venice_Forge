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

    const sensitive = "Network error at /Users/super_user/secret/path";
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
