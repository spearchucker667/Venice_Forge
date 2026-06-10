// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ChatView } from "./chat-view";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useAuthStore } from "../../stores/auth-store";
import { toast } from "../../stores/toast-store";
import { desktopConversations } from "../../services/desktopBridge";

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
    send: vi.fn(),
    stop: vi.fn(),
    regenerate: vi.fn(),
    isStreaming: false,
  }),
}));

vi.mock("../../services/promptStarterService", () => ({
  getBalancedPromptStarters: () => [],
}));

vi.mock("../../utils/characterImageResolver", () => ({
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
    vi.mocked(desktopConversations.list).mockReset();

    useAuthStore.setState({ isConfigured: true, apiKey: null });
    useSettingsStore.setState({
      selectedModels: { chat: "llama-3.3-70b" },
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

  it("warns when sending an image with a non-vision model", async () => {
    const warnSpy = vi.spyOn(toast, "warn");
    render(<ChatView />);

    const file = new File(["dummy"], "img.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    await waitFor(() => expect(screen.getByAltText("Attachment 1")).toBeInTheDocument());

    const input = screen.getByLabelText("Message input");
    await userEvent.type(input, "Describe this");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(
        "Model does not support images",
        expect.stringContaining("llama-3.3-70b"),
      ),
    );
  });

  it("surfaces a toast when forgetting a fact fails", async () => {
    vi.mocked(desktopConversations.list).mockRejectedValue(new Error("storage offline"));
    const errorSpy = vi.spyOn(toast, "error");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

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

    confirmSpy.mockRestore();
  });
});
