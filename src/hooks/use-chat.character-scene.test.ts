/** @fileoverview Character scene generation integration tests for use-chat. */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChat } from "./use-chat";
import { useChatStore } from "../stores/chat-store";
import { useCharacterStore } from "../stores/character-store";
import { useSettingsStore } from "../stores/settings-store";
import { veniceStreamChat } from "../services/veniceClient";
import { generateCharacterScene } from "../services/characterSceneGenerationService";
import { parseCharacterSceneRequest } from "../services/characterSceneRequestParser";

vi.mock("../services/veniceClient", () => ({
  veniceStreamChat: vi.fn(),
  veniceFetch: vi.fn(),
}));

vi.mock("../services/characterSceneGenerationService", () => ({
  generateCharacterScene: vi.fn(),
}));

vi.mock("../services/characterSceneRequestParser", () => ({
  parseCharacterSceneRequest: vi.fn(),
}));

vi.mock("../services/desktopBridge", async () => {
  const actual = await vi.importActual<typeof import("../services/desktopBridge")>("../services/desktopBridge");
  return {
    ...actual,
    desktopConversations: {
      pullContext: vi.fn().mockResolvedValue({ ok: false }),
      list: vi.fn().mockResolvedValue({ ok: true, records: [] }),
      save: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

const mockedVeniceStreamChat = vi.mocked(veniceStreamChat);
const mockedGenerateCharacterScene = vi.mocked(generateCharacterScene);
const mockedParseCharacterSceneRequest = vi.mocked(parseCharacterSceneRequest);

const CHARACTER = {
  id: "char-1",
  slug: "picnic-bot",
  name: "Picnic Bot",
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
    selectedModels: { chat: "llama-3.3-70b", image: "flux-dev" },
    characterSceneGenerationEnabled: false,
    characterSceneGenerationMode: "manual",
    enableMemoryRetrieval: false,
  });
}

describe("use-chat character scene generation", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
    mockedVeniceStreamChat.mockResolvedValue(undefined);
    mockedGenerateCharacterScene.mockResolvedValue({
      requestId: "req-1",
      status: "complete",
      prompt: "A cinematic sunset picnic scene.",
      imageId: "img-1",
      galleryItemId: "img-1",
      updatedAt: new Date().toISOString(),
    });
    mockedParseCharacterSceneRequest.mockReturnValue({ request: null, displayText: "" });
  });

  afterEach(() => {
    resetStores();
  });

  it("createScene is inert when character scene generation is disabled", async () => {
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations[0];
    useChatStore.getState().addMessage(conv.id, { role: "user", content: "Sunset picnic" });
    useChatStore.getState().addMessage(conv.id, { role: "assistant", content: "Meadows and a castle." });
    const updatedConv = useChatStore.getState().conversations.find((c) => c.id === conv.id)!;

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.createScene(updatedConv.messages[1].id);
    });
    expect(mockedGenerateCharacterScene).not.toHaveBeenCalled();
  });

  it("createScene calls generateCharacterScene when enabled and character-bound", async () => {
    useSettingsStore.setState({ characterSceneGenerationEnabled: true });
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations[0];
    useChatStore.getState().addMessage(conv.id, { role: "user", content: "Sunset picnic" });
    useChatStore.getState().addMessage(conv.id, { role: "assistant", content: "Meadows and a castle." });
    const updatedConv = useChatStore.getState().conversations.find((c) => c.id === conv.id)!;

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.createScene(updatedConv.messages[1].id);
    });
    expect(mockedGenerateCharacterScene).toHaveBeenCalledOnce();
    const opts = mockedGenerateCharacterScene.mock.calls[0][0];
    expect(opts.source).toBe("on_demand");
    expect(opts.conversation.id).toBe(conv.id);
  });

  it("does not auto-generate when mode is manual", async () => {
    useSettingsStore.setState({ characterSceneGenerationEnabled: true, characterSceneGenerationMode: "manual" });
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Sunset picnic", "llama-3.3-70b");
    });
    expect(mockedGenerateCharacterScene).not.toHaveBeenCalled();
  });

  it("auto-generates after assistant stream when enabled and mode is auto", async () => {
    useSettingsStore.setState({ characterSceneGenerationEnabled: true, characterSceneGenerationMode: "auto" });
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");

    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      // Simulate a streaming assistant response that includes the marker.
      opts.onDelta?.({ content: "Here is a scene. <venice_forge_scene_request>{\"intent\":\"create_scene\",\"focus\":\"sunset picnic\"}</venice_forge_scene_request>", reasoning: "" });
      return Promise.resolve(undefined);
    });
    mockedParseCharacterSceneRequest.mockReturnValue({
      request: { intent: "create_scene", focus: "sunset picnic" },
      displayText: "Here is a scene.",
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Sunset picnic", "llama-3.3-70b");
    });
    expect(mockedGenerateCharacterScene).toHaveBeenCalledOnce();
    const opts = mockedGenerateCharacterScene.mock.calls[0][0];
    expect(opts.source).toBe("automatic");
  });

  it("isolates automatic scene generation failures from successful assistant streams", async () => {
    useSettingsStore.setState({ characterSceneGenerationEnabled: true, characterSceneGenerationMode: "auto" });
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");

    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      opts.onDelta?.({
        content: "Here is a scene. <venice_forge_scene_request>{\"intent\":\"create_scene\",\"focus\":\"sunset picnic\"}</venice_forge_scene_request>",
        reasoning: "",
      });
      return Promise.resolve(undefined);
    });
    mockedParseCharacterSceneRequest.mockReturnValue({
      request: { intent: "create_scene", focus: "sunset picnic" },
      displayText: "Here is a scene.",
    });
    mockedGenerateCharacterScene.mockRejectedValueOnce(new Error("scene service exploded"));

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Sunset picnic", "llama-3.3-70b");
    });

    const conv = useChatStore.getState().conversations[0];
    const assistant = conv.messages.find((message) => message.role === "assistant");
    expect(assistant?.content).toBe("Here is a scene.");
    expect(String(assistant?.content)).not.toContain("Sorry, something went wrong");
    expect(assistant?.metadata?.sceneGeneration).toMatchObject({
      status: "failed",
      error: "Character scene generation failed. Please try again.",
    });
  });

  it("does not auto-generate for non-character chats", async () => {
    useSettingsStore.setState({ characterSceneGenerationEnabled: true, characterSceneGenerationMode: "auto" });
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b");
    });
    expect(mockedGenerateCharacterScene).not.toHaveBeenCalled();
  });

  it("stop aborts scene generation", async () => {
    useSettingsStore.setState({ characterSceneGenerationEnabled: true, characterSceneGenerationMode: "auto" });
    useChatStore.getState().createCharacterConversation(CHARACTER, "llama-3.3-70b");

    mockedVeniceStreamChat.mockImplementationOnce((_payload, opts) => {
      opts.onDelta?.({ content: "<venice_forge_scene_request>{\"intent\":\"create_scene\"}</venice_forge_scene_request>", reasoning: "" });
      return Promise.resolve(undefined);
    });
    mockedParseCharacterSceneRequest.mockReturnValue({
      request: { intent: "create_scene" },
      displayText: "",
    });

    const { result } = renderHook(() => useChat());
    const sendPromise = act(async () => {
      await result.current.send("Sunset picnic", "llama-3.3-70b");
    });

    act(() => {
      result.current.stop();
    });

    await sendPromise;
    // After stop, scene generation should not complete successfully because
    // the abort controller is signaled.
    const calls = mockedGenerateCharacterScene.mock.calls;
    if (calls.length > 0) {
      expect(calls[0][0].signal?.aborted).toBe(true);
    }
  });
});
