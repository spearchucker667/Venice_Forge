/** @fileoverview Phase 8 — Responses API (alpha) transport selection tests
 *  for the chat stream manager. Proves:
 *    - toggle OFF → chat completions body/transport, byte-shape unchanged;
 *    - toggle ON + non-E2EE model → Responses body/transport;
 *    - toggle ON + E2EE model / missing metadata → chat fallback;
 *    - unsupported content parts → chat fallback;
 *    - E2EE params and non-Responses venice_parameters never leak into the
 *      Responses body. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startStream, stopStream } from "./chat-stream-manager";
import { useChatStore } from "./chat-store";
import { useDocumentAgentStore } from "./document-agent-store";
import { useSettingsStore } from "./settings-store";
import { veniceStreamChat, veniceStreamResponses } from "../services/veniceClient";

vi.mock("../services/veniceClient", () => ({
  veniceStreamChat: vi.fn(),
  veniceStreamResponses: vi.fn(),
  veniceFetch: vi.fn(),
}));

const mockGetModelById = vi.fn();
vi.mock("../services/modelService", () => ({
  getModelById: (...args: unknown[]) => mockGetModelById(...args),
}));

const mockedVeniceStreamChat = vi.mocked(veniceStreamChat);
const mockedVeniceStreamResponses = vi.mocked(veniceStreamResponses);

const NON_E2EE_MODEL = {
  id: "plain-model",
  model_spec: { supportsE2EE: false },
};

function resetStores() {
  useDocumentAgentStore.setState({ preset: "limited_documents" });
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
    e2eeOverride: "provider-default",
    promptCacheRetention: "default",
    reasoningEffort: undefined,
  });
  useSettingsStore.setState({ responsesApiEnabled: false });
}

describe("chat-stream-manager — Responses API transport selection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    vi.clearAllMocks();
    mockGetModelById.mockReturnValue(undefined);
  });

  afterEach(() => {
    stopStream();
    resetStores();
    vi.useRealTimers();
  });

  it("toggle off → chat completions transport with an unchanged body shape", async () => {
    const convId = useChatStore.getState().createConversation("plain-model");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    mockGetModelById.mockReturnValue(NON_E2EE_MODEL);
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "plain-model");

    expect(mockedVeniceStreamChat).toHaveBeenCalledTimes(1);
    expect(mockedVeniceStreamResponses).not.toHaveBeenCalled();
    const body = mockedVeniceStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toHaveProperty("messages");
    expect(body).not.toHaveProperty("input");
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("toggle on + non-E2EE model → Responses transport with typed input items", async () => {
    useSettingsStore.setState({ responsesApiEnabled: true });
    useChatStore.setState({ systemPrompt: "Be helpful." });
    const convId = useChatStore.getState().createConversation("plain-model");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    mockGetModelById.mockReturnValue(NON_E2EE_MODEL);
    mockedVeniceStreamResponses.mockResolvedValueOnce(undefined);

    await startStream(convId, "plain-model");

    expect(mockedVeniceStreamResponses).toHaveBeenCalledTimes(1);
    expect(mockedVeniceStreamChat).not.toHaveBeenCalled();
    const body = mockedVeniceStreamResponses.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("messages");
    expect(body.stream).toBe(true);
    expect(body.max_output_tokens).toBe(4096);
    const input = body.input as Array<Record<string, unknown>>;
    expect(Array.isArray(input)).toBe(true);
    // System prompt is compiled to the first message item.
    expect(input[0]).toMatchObject({ type: "message", role: "system" });
    expect(input.some((item) => item.role === "user")).toBe(true);
    for (const item of input) {
      expect(item.type).toBe("message");
      const content = item.content as Array<{ type: string }> | string;
      if (Array.isArray(content)) {
        for (const part of content) {
          expect(["input_text", "input_image"]).toContain(part.type);
        }
      }
    }
  });

  it("toggle on + E2EE-capable model → falls back to chat completions", async () => {
    useSettingsStore.setState({ responsesApiEnabled: true });
    const convId = useChatStore.getState().createConversation("e2ee-model");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    mockGetModelById.mockReturnValue({
      id: "e2ee-model",
      model_spec: { supportsE2EE: true },
    });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "e2ee-model");

    expect(mockedVeniceStreamChat).toHaveBeenCalledTimes(1);
    expect(mockedVeniceStreamResponses).not.toHaveBeenCalled();
  });

  it("toggle on + missing capability metadata → fails closed to chat completions", async () => {
    useSettingsStore.setState({ responsesApiEnabled: true });
    const convId = useChatStore.getState().createConversation("mystery-model");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    mockGetModelById.mockReturnValue({ id: "mystery-model" });
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "mystery-model");

    expect(mockedVeniceStreamChat).toHaveBeenCalledTimes(1);
    expect(mockedVeniceStreamResponses).not.toHaveBeenCalled();
  });

  it("Responses body never carries enable_e2ee or chat-only venice_parameters", async () => {
    useSettingsStore.setState({ responsesApiEnabled: true });
    const convId = useChatStore.getState().createConversation("plain-model");
    useChatStore.getState().addMessage(convId, { role: "user", content: "Hello" });
    useChatStore.getState().setVeniceParams({
      include_venice_system_prompt: false,
      enable_web_search: "auto",
      strip_thinking_response: true,
      disable_thinking: true,
    });
    mockGetModelById.mockReturnValue(NON_E2EE_MODEL);
    mockedVeniceStreamResponses.mockResolvedValueOnce(undefined);

    await startStream(convId, "plain-model");

    const body = mockedVeniceStreamResponses.mock.calls[0][0] as Record<string, unknown>;
    const vp = body.venice_parameters as Record<string, unknown>;
    expect(vp).not.toHaveProperty("enable_e2ee");
    expect(vp).not.toHaveProperty("strip_thinking_response");
    expect(vp).not.toHaveProperty("disable_thinking");
    expect(vp.enable_web_search).toBe("auto");
    expect(vp.include_venice_system_prompt).toBe(false);
    // prompt_cache_retention is chat-only (not declared on ResponsesRequest).
    expect(body).not.toHaveProperty("prompt_cache_retention");
    expect(body).not.toHaveProperty("stream_options");
    expect(body).not.toHaveProperty("tools");
  });

  it("unsupported native content parts (input_audio) → chat fallback", async () => {
    useSettingsStore.setState({ responsesApiEnabled: true });
    const convId = useChatStore.getState().createConversation("plain-model");
    useChatStore.getState().addMessage(convId, {
      role: "user",
      content: [
        { type: "text", text: "listen" },
        { type: "input_audio", input_audio: { data: "QUJD", format: "mp3" } },
      ],
    });    mockGetModelById.mockReturnValue(NON_E2EE_MODEL);
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "plain-model");

    expect(mockedVeniceStreamChat).toHaveBeenCalledTimes(1);
    expect(mockedVeniceStreamResponses).not.toHaveBeenCalled();
  });

  it("conversations with tool turns fall back to chat (compiled messages lack tool_call ids)", async () => {
    useSettingsStore.setState({ responsesApiEnabled: true });
    const convId = useChatStore.getState().createConversation("plain-model");
    useChatStore.getState().addMessage(convId, { role: "user", content: "weather?" });
    // The agent loop persists tool turns via stream deltas (addMessage alone
    // drops tool_calls/tool_call_id by design).
    useChatStore.getState().addMessage(convId, { role: "assistant", content: "" });
    useChatStore.getState().appendAssistantStreamDelta(convId, {
      content: "",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: "{\"city\":\"Paris\"}" },
        },
      ],
    });
    useChatStore.getState().appendAssistantStreamDelta(convId, {
      content: "",
      appendedMessages: [
        { role: "tool", content: "sunny", tool_call_id: "call_1" },
      ],
    });
    mockGetModelById.mockReturnValue(NON_E2EE_MODEL);
    mockedVeniceStreamChat.mockResolvedValueOnce(undefined);

    await startStream(convId, "plain-model");

    // Tool history cannot be replayed losslessly into the Responses input
    // union (no tool_call ids survive compilation), so the turn routes
    // through /chat/completions — identical to pre-Responses behavior.
    expect(mockedVeniceStreamChat).toHaveBeenCalledTimes(1);
    expect(mockedVeniceStreamResponses).not.toHaveBeenCalled();
  });
});
