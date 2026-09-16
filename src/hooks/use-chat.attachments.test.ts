/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChat } from "./use-chat";
import { useChatStore } from "../stores/chat-store";
import { useSettingsStore } from "../stores/settings-store";
import { veniceStreamChat } from "../services/veniceClient";
import { getModelById } from "../services/modelService";
import { desktopConversations } from "../services/desktopBridge";
import { stopStream } from "../stores/chat-stream-manager";
import { MAX_TOTAL_CONTEXT_BYTES } from "../services/ingestion/ingestionLimits";
import { serializeSafetyProvenanceIntoPayload } from "../services/ingestion/xmlEscape";
import { toast } from "../stores/toast-store";

vi.mock("../services/veniceClient", () => ({
  veniceStreamChat: vi.fn(),
  veniceFetch: vi.fn(),
}));

vi.mock("../services/modelService", () => ({
  getModelById: vi.fn(),
}));
const mockedGetModelById = vi.mocked(getModelById);

vi.mock("../stores/toast-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stores/toast-store")>();
  return {
    ...actual,
    toast: { warn: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
  };
});

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

  /** Applies the transport-boundary serializer so assertions observe the
   *  provider-facing body (envelopes serialized from typed provenance, the
   *  internal `_safetyProvenance` field stripped). */
  function extractProviderFacingPayload(): Record<string, unknown> | null {
    const payload = extractPayloadFromCall();
    if (!payload) return null;
    return serializeSafetyProvenanceIntoPayload(payload);
  }

  // VERIFY-063: attachment context admission is bounded by the selected
  // model's remaining token budget (not a fixed byte ceiling).
  it("omits attachments that exceed the selected model's remaining token budget", async () => {
    mockedGetModelById.mockReturnValue({
      contextLength: 8192,
      maxOutputTokens: 4096,
    } as never);
    const { result } = renderHook(() => useChat());

    const att1 = makeTextAttachment("A".repeat(4000), "att1");
    const att2 = makeTextAttachment("B".repeat(100_000), "att2");

    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b", [att1, att2]);
    });

    const body = extractProviderFacingPayload();
    expect(body).not.toBeNull();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    const userMessage = messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();

    const content = userMessage!.content as string;
    expect(content).toContain("att1");
    expect(content).toContain("att2");
    expect(content).not.toContain("B".repeat(100_000));
    expect(mockedToastWarn).toHaveBeenCalledWith(
      "Attachment context truncated",
      expect.stringContaining("Some attachments were omitted"),
    );
  });

  it("admits attachment text on a large-context model that a small model omits", async () => {
    // Same payloads: 8,192-token model omits, 1M-token model admits both.
    const makePayloads = () => [
      makeTextAttachment("C".repeat(50_000), "att1"),
      makeTextAttachment("D".repeat(50_000), "att2"),
    ];

    mockedGetModelById.mockReturnValue({
      contextLength: 8192,
      maxOutputTokens: 4096,
    } as never);
    const small = renderHook(() => useChat());
    await act(async () => {
      await small.result.current.send("Hello", "llama-3.3-70b", makePayloads());
    });
    const smallContent = (
      extractProviderFacingPayload()!.messages as Array<{ role: string; content: string }>
    ).filter((m) => m.role === "user").at(-1)!.content as string;
    expect(smallContent).not.toContain("att2");
    mockedVeniceStreamChat.mockClear();
    mockedToastWarn.mockClear();

    mockedGetModelById.mockReturnValue({
      contextLength: 1_000_000,
      maxOutputTokens: 4096,
    } as never);
    const large = renderHook(() => useChat());
    await act(async () => {
      await large.result.current.send("Hello", "llama-3.3-70b", makePayloads());
    });
    const largeContent = (
      extractProviderFacingPayload()!.messages as Array<{ role: string; content: string }>
    ).filter((m) => m.role === "user").at(-1)!.content as string;
    expect(largeContent).toContain("att1");
    expect(largeContent).toContain("att2");
    expect(mockedToastWarn).not.toHaveBeenCalled();
  });

  it("falls back to the legacy byte ceiling when model context is unknown", async () => {
    mockedGetModelById.mockReturnValue(undefined as never);
    const { result } = renderHook(() => useChat());

    const bigText = "A".repeat(Math.floor(MAX_TOTAL_CONTEXT_BYTES / 2));
    const att1 = makeTextAttachment(bigText, "att1");
    const att2 = makeTextAttachment(bigText, "att2");

    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b", [att1, att2]);
    });

    const body = extractPayloadFromCall();
    expect(body).not.toBeNull();
    // Admission used the legacy byte ceiling: the warning reports the KB
    // ceiling (token-mode reports remaining tokens instead). The admitted
    // attachment may still be shortened by the compiler against the unknown
    // model's conservative 8,192-token fallback — that is request-layer
    // budgeting, not admission.
    expect(mockedToastWarn).toHaveBeenCalledWith(
      "Attachment context truncated",
      expect.stringContaining("KB"),
    );
  });

  it("includes all attachments when total text is under the budget", async () => {
    const { result } = renderHook(() => useChat());

    const att1 = makeTextAttachment("Hello from attachment 1", "att1");
    const att2 = makeTextAttachment("Hello from attachment 2", "att2");

    await act(async () => {
      await result.current.send("Hello", "llama-3.3-70b", [att1, att2]);
    });

    const body = extractProviderFacingPayload();
    const messages = body!.messages as Array<{ role: string; content: string }>;
    const userMessage = messages.find((m) => m.role === "user");
    const content = userMessage!.content as string;

    expect(content).toContain("att1");
    expect(content).toContain("att2");
    expect(mockedToastWarn).not.toHaveBeenCalled();
  });
});
