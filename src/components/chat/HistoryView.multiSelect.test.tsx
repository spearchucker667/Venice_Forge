// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import HistoryView from "./HistoryView";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useChatFolderStore } from "../../stores/chat-folder-store";
import type { Conversation } from "../../types/conversation";

// Polyfill localStorage
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
  desktopChatFolders: {
    moveConversation: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("../../stores/toast-store", () => ({
  toast: {
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

describe("HistoryView Multi-Select & Batch Folder Handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    useSettingsStore.setState({ activeTab: "history" });
    const isoNow = new Date().toISOString();
    useChatFolderStore.setState({
      folders: [
        {
          id: "f1",
          profileId: "default",
          name: "Project Alpha",
          kind: "standard",
          sortOrder: 0,
          lockState: "unlocked",
          schemaVersion: 1,
          createdAt: isoNow,
          updatedAt: isoNow,
        },
        {
          id: "f2",
          profileId: "default",
          name: "Research Notes",
          kind: "standard",
          sortOrder: 1,
          lockState: "unlocked",
          schemaVersion: 1,
          createdAt: isoNow,
          updatedAt: isoNow,
        },
      ],
      isLoaded: true,
    });
  });

  const createMockConv = (id: string, title: string, folderId: string | null = null): Conversation => ({
    id,
    title,
    model: "llama-3",
    folderId,
    messages: [{ id: `m-${id}`, role: "user", content: "hello", timestamp: Date.now() }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  it("selects all visible conversations and clears selection", async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      conversations: [
        createMockConv("c1", "First Chat"),
        createMockConv("c2", "Second Chat"),
      ],
    });

    render(<HistoryView />);

    expect(screen.getByText("0 selected")).toBeInTheDocument();

    const selectAllBtn = screen.getByRole("button", { name: "Select all visible" });
    await user.click(selectAllBtn);

    expect(screen.getByText("2 selected")).toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: "Clear selection" });
    await user.click(clearBtn);

    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });

  it("toggles folder level multi-selection", async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      conversations: [
        createMockConv("c1", "Folder Chat 1", "f1"),
        createMockConv("c2", "Folder Chat 2", "f1"),
        createMockConv("c3", "Unfiled Chat", null),
      ],
    });

    render(<HistoryView />);

    const folderCheckbox = screen.getAllByRole("checkbox")[0];
    await user.click(folderCheckbox);

    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("batch moves selected conversations to a folder", async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      conversations: [
        createMockConv("c1", "Chat One", null),
        createMockConv("c2", "Chat Two", null),
      ],
    });

    render(<HistoryView />);

    const selectAllBtn = screen.getByRole("button", { name: "Select all visible" });
    await user.click(selectAllBtn);

    expect(screen.getByText("2 selected")).toBeInTheDocument();

    const selectDropdown = screen.getByDisplayValue("Select destination folder...");
    await user.selectOptions(selectDropdown, "f1");

    await waitFor(() => {
      const convs = useChatStore.getState().conversations;
      expect(convs.find(c => c.id === "c1")?.folderId).toBe("f1");
      expect(convs.find(c => c.id === "c2")?.folderId).toBe("f1");
    });
  });
});
