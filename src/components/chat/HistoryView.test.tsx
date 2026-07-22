// @vitest-environment jsdom
// Regression guards: VERIFY-074 (character display title in history).
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import HistoryView from "./HistoryView";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useChatFolderStore } from "../../stores/chat-folder-store";
import type { Conversation } from "../../types/conversation";
import { askDecision } from "../ui/modal-requests";

vi.mock("../ui/modal-requests", () => ({
  askDecision: vi.fn(),
  askSecret: vi.fn(),
}));

// Polyfill localStorage for Node 26+ / jsdom environments where it may be missing
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = String(value); },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]; },
  key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
  get length() { return Object.keys(localStorageStore).length; },
};
(globalThis as { localStorage?: Storage }).localStorage = localStorageMock as unknown as Storage;

vi.mock("../../services/desktopBridge", () => ({
  isElectron: () => false,
  desktopConfig: { writeSanitized: vi.fn() },
  desktopConversations: { list: () => Promise.resolve({ ok: false, records: [], error: 'mock' }) },
  desktopChat: { list: () => Promise.resolve({ ok: false, conversations: [], truncated: false, totalScanned: 0, error: 'mock' }) },
}));

vi.mock("../../stores/toast-store", () => ({
  toast: {
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from "../../stores/toast-store";
const mockToastError = vi.mocked(toast.error);
const mockToastSuccess = vi.mocked(toast.success);

// Variable to store the action from the last call
let lastToastErrorAction: { label: string; onClick: () => void | Promise<void> } | undefined = undefined;

// Mock the return value of toast.error to return a toast ID
vi.mocked(toast.error).mockImplementation((title: string, description?: string, action?: { label: string; onClick: () => void | Promise<void> }) => {
  // Store the action so we can test it
  lastToastErrorAction = action;
  return "toast-id";
});

describe("HistoryView Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    useSettingsStore.setState({
      activeTab: "history",
    });
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      pendingContext: null,
    });
    useChatFolderStore.setState({ folders: [], isLoaded: true, isLoading: false });
  });

  // Helper to create mock conversations
  const createMockConversation = (
    id: string,
    title: string,
    content: string | any[],
    updatedAt: number = Date.now()
  ): Conversation => ({
    id,
    title,
    model: "test-model",
    messages: [
      {
        id: `msg-${id}`,
        role: "user",
        content,
        timestamp: updatedAt,
      },
    ],
    createdAt: updatedAt,
    updatedAt,
    metadata: {
      tags: [],
      pinned: false,
      archived: false,
      source: "chat",
      messageCount: 1,
    },
  });

  it("renders empty state when there are no conversations", () => {
    render(<HistoryView />);
    expect(screen.getByText("No conversations found")).toBeInTheDocument();
  });

  it("renders list of conversations", () => {
    const conversations = [
      createMockConversation("c1", "First Chat", "Hello standard message"),
      createMockConversation("c2", "Second Chat", "Another standard message"),
    ];
    useChatStore.setState({ conversations });

    render(<HistoryView />);
    expect(screen.getByText("First Chat")).toBeInTheDocument();
    expect(screen.getByText("Second Chat")).toBeInTheDocument();
  });

  // VERIFY-074 regression guard: character conversations are prefixed in history.
  it("prefixes character names in the history list", () => {
    const conv: Conversation = {
      ...createMockConversation("c1", "Discussion", "Hello"),
      metadata: {
        tags: [],
        pinned: false,
        archived: false,
        source: "character",
        messageCount: 1,
        character: { name: "Ada" },
      },
    };
    useChatStore.setState({ conversations: [conv] });

    render(<HistoryView />);
    expect(screen.getByText("Ada: Discussion")).toBeInTheDocument();
  });

  it("switches to active conversation and chat tab on select", () => {
    const conversations = [createMockConversation("c1", "Target Chat", "Hello standard message")];
    useChatStore.setState({ conversations });

    render(<HistoryView />);
    fireEvent.click(screen.getByText("Target Chat"));

    expect(useChatStore.getState().activeConversationId).toBe("c1");
    expect(useSettingsStore.getState().activeTab).toBe("chat");
  });

  it("starts a new chat on click of 'New Chat' button", () => {
    useChatStore.setState({ activeConversationId: "c1" });
    
    render(<HistoryView />);
    fireEvent.click(screen.getByRole("button", { name: /New Chat/i }));

    expect(useChatStore.getState().activeConversationId).toBeNull();
    expect(useSettingsStore.getState().activeTab).toBe("chat");
  });

  it("filters conversations by title search", async () => {
    const conversations = [
      createMockConversation("c1", "Unique Title One", "Hello message"),
      createMockConversation("c2", "Unique Title Two", "Another message"),
    ];
    useChatStore.setState({ conversations });

    render(<HistoryView />);
    const searchInput = screen.getByPlaceholderText(/Search by title or message content.../i);
    await userEvent.type(searchInput, "One");

    expect(screen.getByText("Unique Title One")).toBeInTheDocument();
    expect(screen.queryByText("Unique Title Two")).not.toBeInTheDocument();
  });

  it("filters conversations by message content search (string)", async () => {
    const conversations = [
      createMockConversation("c1", "Chat One", "Looking for apple here"),
      createMockConversation("c2", "Chat Two", "Looking for banana here"),
    ];
    useChatStore.setState({ conversations });

    render(<HistoryView />);
    const searchInput = screen.getByPlaceholderText(/Search by title or message content.../i);
    await userEvent.type(searchInput, "apple");

    expect(screen.getByText("Chat One")).toBeInTheDocument();
    expect(screen.queryByText("Chat Two")).not.toBeInTheDocument();
  });

  it("filters conversations by message content search (ContentPart[] text)", async () => {
    const multimodalContent = [
      { type: "text", text: "Looking for cherry here" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } }
    ];
    const conversations = [
      createMockConversation("c1", "Chat One", multimodalContent as any),
      createMockConversation("c2", "Chat Two", "Looking for date here"),
    ];
    useChatStore.setState({ conversations });

    render(<HistoryView />);
    const searchInput = screen.getByPlaceholderText(/Search by title or message content.../i);
    await userEvent.type(searchInput, "cherry");

    expect(screen.getByText("Chat One")).toBeInTheDocument();
    expect(screen.queryByText("Chat Two")).not.toBeInTheDocument();
  });

  it("injects context and navigates to chat when Zap button is clicked", () => {
    const conv = createMockConversation("c1", "Chat with context", "hello");
    conv.memory = {
      summary: "This is a summary of the chat",
      topics: [],
      entities: [],
      userFacts: [
        { id: "f1", text: "User likes coffee", forgotten: false, createdAt: 1, updatedAt: 1, confidence: 1, sourceMessageIds: [] }
      ],
      projectRefs: [],
    };
    useChatStore.setState({ conversations: [conv] });

    render(<HistoryView />);
    
    const zapButton = screen.getByTitle("Inject context into active chat");
    fireEvent.click(zapButton);

    const pending = useChatStore.getState().pendingContext;
    expect(pending).not.toBeNull();
    expect(pending?.injectedText).toContain("This is a summary of the chat");
    expect(pending?.injectedText).toContain("User likes coffee");
    expect(mockToastSuccess).toHaveBeenCalledWith("Context injected into active chat");
    expect(useSettingsStore.getState().activeTab).toBe("chat");
  });

  it("deletes a conversation and allows undo via toast", async () => {
    const conv = createMockConversation("c1", "Delete target", "hello");
    const deleteSpy = vi.fn().mockResolvedValue(undefined);
    const restoreSpy = vi.fn().mockResolvedValue(undefined);
    
    useChatStore.setState({ 
      conversations: [conv],
      deleteConversation: deleteSpy,
      restoreConversation: restoreSpy,
    });

    render(<HistoryView />);
    
    const deleteButton = screen.getByTitle("Delete conversation");
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith("c1");
    });
    expect(mockToastError).toHaveBeenCalledWith("Conversation deleted", "Delete target", expect.any(Object));

    expect(lastToastErrorAction).toBeDefined();
    if (lastToastErrorAction) {
      expect(lastToastErrorAction.label).toBe("Undo");
      await lastToastErrorAction.onClick();
    }
    expect(restoreSpy).toHaveBeenCalledWith(conv);
    expect(mockToastSuccess).toHaveBeenCalledWith("Conversation restored");
  });

  it("batch delete asks through the app modal and does not call window.confirm", async () => {
    vi.mocked(askDecision).mockResolvedValueOnce(true);
    const deleteConversationsSpy = vi.fn().mockResolvedValue({ deleted: ["c1", "c2"], failed: [] });

    const conversations = [
      createMockConversation("c1", "Chat One", "hello"),
      createMockConversation("c2", "Chat Two", "hello"),
    ];
    useChatStore.setState({
      conversations,
      deleteConversations: deleteConversationsSpy,
    });

    render(<HistoryView />);

    const selectButtons = screen.getAllByTitle(/Select conversation|Deselect conversation/);
    fireEvent.click(selectButtons[0]);
    fireEvent.click(selectButtons[1]);

    const batchDeleteButton = screen.getByRole("button", { name: /Delete selected/i });
    fireEvent.click(batchDeleteButton);

    await waitFor(() => {
      expect(askDecision).toHaveBeenCalledWith({
        title: "Delete 2 conversations?",
        detail: "This permanently removes the selected local conversation records from this device. This cannot be undone.",
        actionLabel: "Delete",
        cancelLabel: "Cancel",
        danger: true,
      });
    });
    expect(deleteConversationsSpy).toHaveBeenCalledWith(["c1", "c2"]);
    expect(mockToastSuccess).toHaveBeenCalledWith("Conversations deleted", "2 selected conversations removed.");
  });

  it("batch delete cancels when the modal is dismissed", async () => {
    vi.mocked(askDecision).mockResolvedValueOnce(false);
    const deleteConversationsSpy = vi.fn().mockResolvedValue({ deleted: [], failed: [] });

    const conversations = [createMockConversation("c1", "Chat One", "hello")];
    useChatStore.setState({
      conversations,
      deleteConversations: deleteConversationsSpy,
    });

    render(<HistoryView />);

    const selectButton = screen.getByTitle(/Select conversation/);
    fireEvent.click(selectButton);

    const batchDeleteButton = screen.getByRole("button", { name: /Delete selected/i });
    fireEvent.click(batchDeleteButton);

    await waitFor(() => {
      expect(askDecision).toHaveBeenCalled();
    });
    expect(deleteConversationsSpy).not.toHaveBeenCalled();
  });

  it("offers keyboard-accessible folder reordering", async () => {
    const reorderFolders = vi.fn().mockResolvedValue(undefined);
    useChatFolderStore.setState({
      folders: [
        { id: "folder-1", profileId: "default", kind: "standard", name: "First", sortOrder: 1, createdAt: "now", updatedAt: "now", lockState: "unlocked", schemaVersion: 1 },
        { id: "folder-2", profileId: "default", kind: "standard", name: "Second", sortOrder: 2, createdAt: "now", updatedAt: "now", lockState: "unlocked", schemaVersion: 1 },
      ],
      reorderFolders,
    });

    render(<HistoryView />);
    fireEvent.click(screen.getByRole("button", { name: "Move Second folder up" }));
    await waitFor(() => expect(reorderFolders).toHaveBeenCalledWith(["folder-2", "folder-1"], "standard"));
    expect(screen.getByRole("button", { name: "Move First folder up" })).toBeDisabled();
  });
});
