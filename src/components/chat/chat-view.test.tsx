// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ChatView } from "./chat-view";
import { _debugGetDirtyConversationIds, useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useAuthStore } from "../../stores/auth-store";
import { toast } from "../../stores/toast-store";
import { desktopConversations } from "../../services/desktopBridge";
import { askDecision } from "../ui/modal-requests";

const chatHookMocks = vi.hoisted(() => ({
  send: vi.fn(),
  stop: vi.fn(),
  regenerate: vi.fn(),
  createScene: vi.fn(),
}));

vi.mock("../ui/modal-requests", () => ({
  askDecision: vi.fn(),
}));

vi.mock("../../services/desktopBridge", async () => {
  const actual = await vi.importActual<typeof import("../../services/desktopBridge")>(
    "../../services/desktopBridge",
  );
  return {
    ...actual,
    desktopConversations: {
      list: vi.fn().mockResolvedValue({ ok: true, records: [] }),
      get: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      pullContext: vi.fn(),
      detectLegacyHistory: vi.fn(),
      rebuildIndex: vi.fn(),
      openConversationsFolder: vi.fn(),
      migrateLegacyHistory: vi.fn(),
    },
  };
});

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  readAsDataURL(_file: Blob) {
    this.result = "data:image/png;base64,mock";
    queueMicrotask(() => {
      if (this.onload) this.onload();
    });
  }
}

vi.mock("../../hooks/use-models", () => ({
  useModels: () => ({ data: [] }),
}));

vi.mock("../../hooks/use-chat", () => ({
  useChat: () => ({
    send: chatHookMocks.send,
    stop: chatHookMocks.stop,
    regenerate: chatHookMocks.regenerate,
    isStreaming: false,
    memoryStatus: "idle",
    createScene: chatHookMocks.createScene,
  }),
}));

vi.mock("../../services/promptStarterService", () => ({
  getBalancedPromptStarters: () => [],
}));

vi.mock("../../services/veniceClient", () => ({
  veniceFormData: vi.fn().mockResolvedValue({ text: "OCR text" }),
}));

vi.mock("../../utils/characterImageResolver", () => ({
  avatarFallback: (name: string) => name.trim().slice(0, 2).toUpperCase() || "?",
  resolveCharacterImageUrl: () => null,
}));

describe("ChatView", () => {
  let originalCreateObjectURL: any;
  let originalRevokeObjectURL: any;
  let originalImage: any;

  beforeEach(() => {
    originalCreateObjectURL = globalThis.URL?.createObjectURL;
    originalRevokeObjectURL = globalThis.URL?.revokeObjectURL;
    originalImage = (globalThis as any).Image;

    if (!globalThis.URL) {
      (globalThis as any).URL = {} as any;
    }
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 100;
      height = 100;
      set src(val: string) {
        setTimeout(() => { this.onload?.(); }, 0);
      }
    }
    (globalThis as any).Image = MockImage as any;

    Object.assign(globalThis, { FileReader: MockFileReader });
    chatHookMocks.send.mockReset();
    chatHookMocks.stop.mockReset();
    chatHookMocks.regenerate.mockReset();
    chatHookMocks.createScene.mockReset();
    vi.mocked(desktopConversations.list).mockReset();

    useAuthStore.setState({ isConfigured: true, apiKey: null });
    useSettingsStore.setState({
      selectedModels: { chat: "llama-3.3-70b" },
      activeProjectId: null,
      localFamilySafeModeEnabled: true,
      veniceApiSafeMode: true,
    });
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      pendingContext: null,
      systemPrompt: "",
      veniceParams: {
        include_venice_system_prompt: false,
        enable_web_search: "off",
      },
    });
  });

  afterEach(() => {
    if (globalThis.URL) {
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    }
    (globalThis as any).Image = originalImage;
  });

  it("OCRs the image and avoids warning when sending an image with a non-vision model", async () => {
    const warnSpy = vi.spyOn(toast, "warn");
    render(<ChatView />);

    const file = new File(["dummy"], "img.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    await waitFor(() => expect(screen.getByText("img.png")).toBeInTheDocument());

    const input = screen.getByLabelText("Message input");
    await userEvent.type(input, "Describe this");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(warnSpy).not.toHaveBeenCalledWith(
        "AI is not vision capable",
        expect.any(String),
      ),
    );
  });

  it("surfaces a toast when forgetting a fact fails", async () => {
    vi.mocked(desktopConversations.list).mockRejectedValue(new Error("storage offline"));
    const errorSpy = vi.spyOn(toast, "error");
    vi.mocked(askDecision).mockResolvedValueOnce(true);

    useChatStore.setState({
      pendingContext: {
        injectedText: "[Local Memory Context]",
        facts: [
          {
            id: "fact-1",
            text: "I like rockets",
            confidence: 1,
            sourceMessageIds: ["msg-1"],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        summaries: [],
        tokenEstimate: 10,
        message: "Tell me more",
      },
    });

    render(<ChatView />);
    fireEvent.click(screen.getByRole("button", { name: "Forget Fact" }));

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to forget fact",
        expect.stringContaining("storage offline"),
      ),
    );
  });

  it("reflects the global memory retrieval toggle immediately in the input indicator", () => {
    useSettingsStore.setState({ enableMemoryRetrieval: false });
    render(<ChatView />);

    // The indicator should show "Memory off" as soon as the toggle is off,
    // without waiting for a message to be sent. This is the regression guard
    // for the "disable memory for this chat toggle doesn't work" bug.
    expect(screen.getByTitle("Memory retrieval is disabled in Settings.")).toBeInTheDocument();
  });

  it("clears character metadata and memory retrieval when unbinding a character chat", async () => {
    useChatStore.setState({
      conversations: [
        {
          id: "character-chat-1",
          title: "Chat with Ada",
          model: "llama-3.3-70b",
          createdAt: 1,
          updatedAt: 1,
          messages: [{ id: "m1", role: "user", content: "Hello", timestamp: 1 }],
          metadata: {
            tags: [],
            pinned: false,
            archived: false,
            source: "character",
            messageCount: 1,
            memoryRetrievalEnabled: true,
            character: {
              slug: "ada",
              name: "Ada",
              modelId: "llama-3.3-70b",
            },
          },
          memory: { summary: "", topics: [], entities: [], userFacts: [], projectRefs: [] },
        },
      ],
      activeConversationId: "character-chat-1",
    });

    render(<ChatView />);

    await userEvent.click(screen.getByTestId("active-character-clear"));

    const updated = useChatStore.getState().conversations[0];
    expect(updated.metadata?.source).toBe("chat");
    expect(updated.metadata?.character).toBeUndefined();
    expect(updated.metadata?.memoryRetrievalEnabled).toBe(false);
    expect(_debugGetDirtyConversationIds()).toContain("character-chat-1");
  });

  it("keeps prior conversation context off by default when sending", async () => {
    useChatStore.setState({
      conversations: [
        {
          id: "prior-1",
          title: "Prior Alpha",
          model: "llama-3.3-70b",
          createdAt: 1,
          updatedAt: 1,
          messages: [{ role: "user", content: "do not include by default" }],
          memory: { summary: "", topics: [], entities: [], userFacts: [], projectRefs: [] },
        } as never,
      ],
      activeConversationId: null,
    });

    render(<ChatView />);
    expect(screen.getByLabelText("Include prior conversation context")).not.toBeChecked();

    await userEvent.type(screen.getByLabelText("Message input"), "Hello");
    await userEvent.keyboard("{Enter}");

    expect(chatHookMocks.send).toHaveBeenCalledWith(
      "Hello",
      "llama-3.3-70b",
      undefined,
      "",
      { mode: "auto", source: "global" },
    );
  });

  it("injects only selected prior conversation context when enabled", async () => {
    useSettingsStore.setState({ activeProjectId: "project-a" } as never);
    useChatStore.setState({
      conversations: [
        {
          id: "prior-1",
          title: "Prior Alpha",
          model: "llama-3.3-70b",
          createdAt: 1,
          updatedAt: 1,
          messages: [{ role: "user", content: "selected prior detail" }],
          memory: { summary: "", topics: [], entities: [], userFacts: [], projectRefs: ["project-a"] },
        },
        {
          id: "prior-2",
          title: "Prior Beta",
          model: "llama-3.3-70b",
          createdAt: 1,
          updatedAt: 1,
          messages: [{ role: "user", content: "unselected prior detail" }],
          memory: { summary: "", topics: [], entities: [], userFacts: [], projectRefs: ["project-a"] },
        },
      ] as never,
      activeConversationId: null,
    });

    render(<ChatView />);

    await userEvent.click(screen.getByLabelText("Include prior conversation context"));
    await userEvent.click(screen.getByRole("button", { name: /add prior alpha/i }));
    await userEvent.type(screen.getByLabelText("Message input"), "Use context");
    await userEvent.keyboard("{Enter}");

    expect(chatHookMocks.send).toHaveBeenCalledTimes(1);
    const explicitContext = chatHookMocks.send.mock.calls[0][3] as string;
    expect(explicitContext).toContain("Prior Alpha");
    expect(explicitContext).toContain("selected prior detail");
    expect(explicitContext).not.toContain("Prior Beta");
    expect(explicitContext).not.toContain("unselected prior detail");
  });

  it("passes approved preview context explicitly on Confirm & Send", async () => {
    useChatStore.setState({
      pendingContext: {
        injectedText: "[Local Memory Context]\nAPPROVED",
        facts: [],
        summaries: ["Summary A"],
        tokenEstimate: 10,
        message: "Use memory",
      },
    });

    render(<ChatView />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm & Send" }));

    expect(chatHookMocks.send).toHaveBeenCalledWith(
      "Use memory",
      "llama-3.3-70b",
      undefined,
      "",
      {
        mode: "approved_context",
        approvedContext: "[Local Memory Context]\nAPPROVED",
        source: "preview",
      },
    );
  });

  it("passes disabled_for_message explicitly from the memory preview", async () => {
    useChatStore.setState({
      pendingContext: {
        injectedText: "[Local Memory Context]\nSHOULD_NOT_SEND",
        facts: [],
        summaries: [],
        tokenEstimate: 10,
        message: "No memory",
      },
    });

    render(<ChatView />);
    await userEvent.click(screen.getByRole("button", { name: "Disable Memory for This Message" }));

    expect(chatHookMocks.send).toHaveBeenCalledWith(
      "No memory",
      "llama-3.3-70b",
      undefined,
      "",
      { mode: "disabled_for_message", source: "preview" },
    );
  });
});
