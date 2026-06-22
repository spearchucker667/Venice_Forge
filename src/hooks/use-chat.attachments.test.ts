/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChat } from "./use-chat";
import { useChatStore } from "../stores/chat-store";
import { useSettingsStore } from "../stores/settings-store";
import { veniceStreamChat } from "../services/veniceClient";
import { desktopConversations } from "../services/desktopBridge";
import { stopStream } from "../stores/chat-stream-manager";
import { MAX_TOTAL_CONTEXT_BYTES } from "../services/ingestion/ingestionLimits";
import { toast } from "../stores/toast-store";

vi.mock("../services/veniceClient", () => ({
  veniceStreamChat: vi.fn(),
  veniceFetch: vi.fn(),
}));

vi.mock("../stores/toast-store", () => ({
  toast: { warn: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
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
const mockedToastWarn = vi.mocked(toast.warn);

function makeTextAttachment(text: string, id: string) {
  return {
    id,
    kind: "text" as const,
    name: `${id}.txt`,
    extension: "txt",
    mimeType: "text/plain",
    sizeBytes: new TextEncoder().encode(text).length,
    createdAt: new Date().toISOString(),
    text: `<attached_file name="${id}.txt" kind="text">\n${text}\n</attached_file>`,
    extraction: {
      route: "local-text" as const,
      local: true,
      truncated: false,
      warnings: [],
      errors: [],
    },
    modelRequirements: {
      requiresVision: false,
      canFallbackToText: true,
    },
    security: {
      untrusted: true as const,
      macrosExecuted: false as const,
      scriptsExecuted: false as const,
      htmlSanitized: true as const,
    },
  };
}

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
  useSettingsStore.setState({
    selectedModels: { chat: "llama-3.3-70b" },
  });
}

describe("use-chat attachment context budget", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
    mockedPullContext.mockResolvedValue({
      ok: false,
      context: { injectedText: "", facts: [], summaries: [], tokenEstimate: 0 },
    });
    mockedVeniceStreamChat.mockResolvedValue(undefined);
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

  // VERIFY-063: total attachment context bytes must be bounded.
  it("truncates attachments that would exceed MAX_TOTAL_CONTEXT_BYTES", async () => {
    const { result } = renderHook(() => useChat());

    const bigText = "A".repeat(Math.floor(MAX_TOTAL_CONTEXT_BYTES / 2));
    const att1 = makeTextAttachment(bigText, "att1");
    const att2 = makeTextAttachment(bigText, "att2");

    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b", [att1, att2]);
    });

    const body = extractPayloadFromCall();
    expect(body).not.toBeNull();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    const userMessage = messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();

    const content = userMessage!.content as string;
    expect(content).toContain("att1");
    expect(content).not.toContain("att2");
    expect(mockedToastWarn).toHaveBeenCalledWith(
      "Attachment context truncated",
      expect.stringContaining("Some attachments were omitted"),
    );
  });

  it("includes all attachments when total text is under the budget", async () => {
    const { result } = renderHook(() => useChat());

    const att1 = makeTextAttachment("Hello from attachment 1", "att1");
    const att2 = makeTextAttachment("Hello from attachment 2", "att2");

    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b", [att1, att2]);
    });

    const body = extractPayloadFromCall();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    const userMessage = messages.find((m) => m.role === "user");
    const content = userMessage!.content as string;

    expect(content).toContain("att1");
    expect(content).toContain("att2");
    expect(mockedToastWarn).not.toHaveBeenCalled();
  });
});
