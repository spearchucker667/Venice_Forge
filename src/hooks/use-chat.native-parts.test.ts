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
import { serializeSafetyProvenanceIntoPayload } from "../services/ingestion/xmlEscape";
import { toast } from "../stores/toast-store";
import {
  clearNativePartRegistry,
  resolveNativePartRef,
} from "../services/nativeContentPartRegistry";
import type { ComposerAttachment } from "../types/chatAttachment";
import type { ContentPart } from "../types/venice";

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
const mockedToastError = vi.mocked(toast.error);

function makeNativeFileAttachment(
  overrides: Partial<ComposerAttachment> = {},
): ComposerAttachment {
  return {
    id: "att-file-1",
    kind: "pdf",
    name: "report.pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    sizeBytes: 3,
    createdAt: new Date().toISOString(),
    extraction: {
      route: "local-pdf-text-layer",
      local: true,
      truncated: false,
      warnings: [],
      errors: [],
    },
    modelRequirements: { requiresVision: false, canFallbackToText: true },
    security: {
      untrusted: true as const,
      macrosExecuted: false as const,
      scriptsExecuted: false as const,
      htmlSanitized: true as const,
    },
    sendMode: "native-file",
    nativeFileDataUrl: "data:application/pdf;base64,QUJD",
    ...overrides,
  };
}

function makeNativeVideoAttachment(
  url: string,
  id: string,
): ComposerAttachment {
  return {
    id,
    kind: "url",
    name: url || "Video URL",
    extension: "",
    mimeType: "text/uri-list",
    sizeBytes: 0,
    createdAt: new Date().toISOString(),
    extraction: {
      route: "unsupported",
      local: false,
      truncated: false,
      warnings: [],
      errors: [],
    },
    modelRequirements: { requiresVision: false, canFallbackToText: true },
    security: {
      untrusted: true as const,
      macrosExecuted: false as const,
      scriptsExecuted: false as const,
      htmlSanitized: true as const,
    },
    sendMode: "native-video",
    nativeVideoUrl: url,
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

describe("use-chat native file/video parts (FEAT-006)", () => {
  beforeEach(() => {
    resetStores();
    clearNativePartRegistry();
    vi.clearAllMocks();
    mockedPullContext.mockResolvedValue({
      ok: false,
      context: { injectedText: "", facts: [], summaries: [], tokenEstimate: 0 },
    });
    mockedVeniceStreamChat.mockResolvedValue(undefined);
    mockedGetModelById.mockReturnValue({
      contextLength: 100_000,
      maxOutputTokens: 4096,
    } as never);
  });

  afterEach(() => {
    stopStream();
    resetStores();
    clearNativePartRegistry();
  });

  function extractProviderFacingPayload(): Record<string, unknown> | null {
    const call = mockedVeniceStreamChat.mock.calls[0];
    if (!call) return null;
    return serializeSafetyProvenanceIntoPayload(call[0] as Record<string, unknown>);
  }

  it("sends a native file part to the provider without persisting the payload", async () => {
    const { result } = renderHook(() => useChat());
    const att = makeNativeFileAttachment();

    await act(async () => {
      await result.current.send("Summarize this", "llama-3.3-70b", [att]);
    });

    const body = extractProviderFacingPayload();
    expect(body).not.toBeNull();
    const messages = body!.messages as Array<{
      role: string;
      content: string | ContentPart[];
    }>;
    const userMessage = messages.find((m) => m.role === "user");
    const parts = userMessage!.content as ContentPart[];
    expect(parts).toContainEqual({
      type: "file",
      file: { file_data: "data:application/pdf;base64,QUJD", filename: "report.pdf" },
    });

    // The durable conversation record keeps text content only — the giant
    // base64 payload must NOT be persisted.
    const conv = useChatStore.getState().conversations[0];
    const persistedUser = conv.messages.find((m) => m.role === "user");
    expect(persistedUser?.content).toBe("Summarize this");
    expect(JSON.stringify(persistedUser)).not.toContain("base64,QUJD");
    const nativeParts = (
      persistedUser?.metadata as { nativeParts?: Array<{ filename?: string }> }
    )?.nativeParts;
    expect(nativeParts).toHaveLength(1);
    expect(nativeParts?.[0]?.filename).toBe("report.pdf");
  });

  it("sends native video_url parts alongside the text part", async () => {
    const { result } = renderHook(() => useChat());
    const att = makeNativeVideoAttachment(
      "https://example.com/clip.mp4",
      "att-video-1",
    );

    await act(async () => {
      await result.current.send("What happens in this video?", "llama-3.3-70b", [att]);
    });

    const body = extractProviderFacingPayload();
    const messages = body!.messages as Array<{
      role: string;
      content: string | ContentPart[];
    }>;
    const userMessage = messages.find((m) => m.role === "user");
    const parts = userMessage!.content as ContentPart[];
    expect(parts[0]).toEqual({ type: "text", text: "What happens in this video?" });
    expect(parts).toContainEqual({
      type: "video_url",
      video_url: { url: "https://example.com/clip.mp4" },
    });
  });

  it("allows up to three video_url parts in one message", async () => {
    const { result } = renderHook(() => useChat());
    const atts = [
      makeNativeVideoAttachment("https://example.com/a.mp4", "v1"),
      makeNativeVideoAttachment("https://example.com/b.mp4", "v2"),
      makeNativeVideoAttachment("https://example.com/c.mp4", "v3"),
    ];

    await act(async () => {
      await result.current.send("Compare these", "llama-3.3-70b", atts);
    });

    const body = extractProviderFacingPayload();
    const messages = body!.messages as Array<{
      role: string;
      content: string | ContentPart[];
    }>;
    const parts = messages.find((m) => m.role === "user")!.content as ContentPart[];
    expect(parts.filter((p) => p.type === "video_url")).toHaveLength(3);
  });

  it("blocks the send when a native part is invalid (raw local path)", async () => {
    const { result } = renderHook(() => useChat());
    const att = makeNativeVideoAttachment(
      "/Users/someone/Movies/clip.mp4",
      "att-video-bad",
    );

    await act(async () => {
      await result.current.send("describe", "llama-3.3-70b", [att]);
    });

    expect(mockedVeniceStreamChat).not.toHaveBeenCalled();
    expect(mockedToastError).toHaveBeenCalledWith(
      "Attachment can't be sent",
      expect.stringContaining("Local file paths"),
    );
    // Nothing persisted.
    expect(useChatStore.getState().conversations).toHaveLength(0);
  });

  it("blocks the send when more than three video parts are attached", async () => {
    const { result } = renderHook(() => useChat());
    const atts = ["a", "b", "c", "d"].map((letter, i) =>
      makeNativeVideoAttachment(
        `https://example.com/${letter}.mp4`,
        `att-video-${i}`,
      ),
    );

    await act(async () => {
      await result.current.send("compare", "llama-3.3-70b", atts);
    });

    expect(mockedVeniceStreamChat).not.toHaveBeenCalled();
    expect(mockedToastError).toHaveBeenCalledWith(
      "Attachment can't be sent",
      expect.stringContaining("At most 3 video inputs"),
    );
    expect(useChatStore.getState().conversations).toHaveLength(0);
  });

  it("blocks the send when a native file part is missing its payload", async () => {
    const { result } = renderHook(() => useChat());
    const att = makeNativeFileAttachment({ nativeFileDataUrl: undefined });

    await act(async () => {
      await result.current.send("summarize", "llama-3.3-70b", [att]);
    });

    expect(mockedVeniceStreamChat).not.toHaveBeenCalled();
    expect(mockedToastError).toHaveBeenCalled();
    expect(useChatStore.getState().conversations).toHaveLength(0);
  });

  it("omits native parts from regenerated requests after registry loss", async () => {
    const { result } = renderHook(() => useChat());
    const att = makeNativeFileAttachment();

    await act(async () => {
      await result.current.send("Summarize this", "llama-3.3-70b", [att]);
    });
    expect(mockedVeniceStreamChat).toHaveBeenCalledTimes(1);

    // Simulate an app restart: the durable ref survives, the payload is gone.
    const conv = useChatStore.getState().conversations[0];
    const persistedUser = conv.messages.find((m) => m.role === "user");
    const refs = (
      persistedUser?.metadata as {
        nativeParts?: Array<{ id: string; type: "file" | "video_url" }>;
      }
    )?.nativeParts;
    expect(refs).toHaveLength(1);
    expect(resolveNativePartRef(refs![0])).not.toBeNull();
    clearNativePartRegistry();
    expect(resolveNativePartRef(refs![0])).toBeNull();

    mockedVeniceStreamChat.mockClear();
    await act(async () => {
      await result.current.regenerate("llama-3.3-70b");
    });

    const call = mockedVeniceStreamChat.mock.calls[0];
    expect(call).toBeDefined();
    const body = serializeSafetyProvenanceIntoPayload(
      call![0] as Record<string, unknown>,
    );
    const messages = body.messages as Array<{
      role: string;
      content: string | ContentPart[];
    }>;
    const userMessage = messages.find((m) => m.role === "user");
    expect(userMessage?.content).toBe("Summarize this");
  });
});
