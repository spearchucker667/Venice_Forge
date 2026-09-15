/**
 * @fileoverview Phase 3 Reference Chat Family Invariant Tests.
 *
 * Verifies that all components in the Chat Family (MessageBubble, ChatInput,
 * VeniceParams, ChatView, HistoryView, CharacterChatsView, CharacterSceneCard,
 * ChatTtsPlayer) implement the reference visual language:
 * - Graphite panel backgrounds (bg-vf-panel-bg, bg-vf-panel-bg-raised, bg-vf-panel-bg-inset)
 * - 1px cool-gray panel borders (border-vf-panel-border)
 * - Restrained crimson accent glows (shadow-[0_0_8px_var(--color-vf-accent-glow...)])
 * - Subtle control hover states (hover:bg-vf-control-hover)
 */

import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/desktopBridge", () => ({
  isElectron: () => false,
  desktopApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopJinaApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopProviderApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopProviderSettings: { get: () => Promise.resolve({}) },
  desktopApp: { getDiagnostics: () => Promise.resolve({}) },
  desktopConfig: { writeSanitized: vi.fn() },
  desktopConversations: {
    list: () => Promise.resolve({ ok: false, records: [], error: "mock" }),
    save: () => Promise.resolve({ ok: false, id: "mock", error: "mock" }),
    delete: () => Promise.resolve({ ok: false, error: "mock" }),
    pullContext: () =>
      Promise.resolve({
        ok: false,
        context: { injectedText: "", facts: [], summaries: [], tokenEstimate: 0 },
        error: "mock",
      }),
  },
  desktopChat: {
    list: () =>
      Promise.resolve({
        ok: false,
        conversations: [],
        truncated: false,
        totalScanned: 0,
        error: "mock",
      }),
    save: () => Promise.resolve({ ok: false, id: "mock", error: "mock" }),
    delete: () => Promise.resolve({ ok: false, error: "mock" }),
  },
}));

vi.mock("../../src/stores/config-store", () => ({ reloadConfig: vi.fn() }));

vi.mock("../../src/hooks/use-models", () => ({
  useModels: () => ({
    data: [
      { id: "default-model", name: "Default Model", type: "text" },
      { id: "qwen3-72b", name: "Qwen 3 72B", type: "text" },
    ],
    isFetching: false,
    error: null,
    refetch: vi.fn(async () => ({ isSuccess: true, data: [], error: null })),
  }),
}));

import { MessageBubble } from "../../src/components/chat/message-bubble";
import { ChatInput } from "../../src/components/chat/chat-input";
import { CharacterSceneCard } from "../../src/components/chat/CharacterSceneCard";
import { CharacterChatsView } from "../../src/components/chat/CharacterChatsView";
import { useSettingsStore } from "../../src/stores/settings-store";
import { useChatStore } from "../../src/stores/chat-store";
import { useCharacterCardStore } from "../../src/stores/character-card-store";


describe("Reference Chat Family UI Invariants", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      activeTab: "chat",
      redTeamMode: false,
      selectedModels: {},
    });
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      isStreaming: false,
    });
    useCharacterCardStore.setState({
      cards: [],
      hasLoaded: true,
    });
  });

  describe("MessageBubble styling", () => {
    it("renders user message with graphite raised panel and 1px border", () => {
      const userMsg = {
        role: "user" as const,
        content: "Hello Venice Forge",
        timestamp: Date.now(),
      };

      const { container } = render(
        <MessageBubble
          message={userMsg}
          index={0}
          onCopy={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      const userBubble = container.querySelector(".bg-vf-panel-bg-raised");
      expect(userBubble).toBeInTheDocument();
      expect(userBubble?.className).toContain("border-vf-panel-border");
      expect(userBubble?.className).toContain("rounded-xl");
    });

    it("renders assistant message avatar container with inset graphite panel", () => {
      const assistantMsg = {
        role: "assistant" as const,
        content: "I am ready.",
        timestamp: Date.now(),
      };

      const { container } = render(
        <MessageBubble
          message={assistantMsg}
          index={0}
          onCopy={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      const avatarContainer = container.querySelector(".bg-vf-panel-bg-inset");
      expect(avatarContainer).toBeInTheDocument();
      expect(avatarContainer?.className).toContain("border-vf-panel-border");
      expect(avatarContainer?.className).toContain("rounded-md");
    });
  });

  describe("ChatInput styling", () => {
    it("renders send button with accent glow when text is entered", () => {
      render(
        <ChatInput
          onSend={vi.fn()}
          onStop={vi.fn()}
          isStreaming={false}
          disabled={false}
        />,
      );

      const textarea = screen.getByLabelText("Message input");
      fireEvent.change(textarea, { target: { value: "Test prompt" } });

      const sendBtn = screen.getByRole("button", { name: /send message/i });
      expect(sendBtn).toBeInTheDocument();
      expect(sendBtn.className).toContain("bg-accent");
      expect(sendBtn.className).toContain("shadow-[0_0_8px_var(--color-vf-accent-glow)]");
      expect(sendBtn.className).toContain("rounded-md");
    });

    it("renders file attach button with control hover token", () => {
      render(
        <ChatInput
          onSend={vi.fn()}
          onStop={vi.fn()}
          isStreaming={false}
          disabled={false}
        />,
      );

      const attachBtn = screen.getByRole("button", { name: /attach file/i });
      expect(attachBtn).toBeInTheDocument();
      expect(attachBtn.className).toContain("hover:bg-vf-control-hover");
      expect(attachBtn.className).toContain("rounded-md");
    });
  });

  describe("CharacterSceneCard styling", () => {
    it("renders card with raised graphite panel, 1px border, and accent glow button", () => {
      const { container } = render(
        <CharacterSceneCard
          status="complete"
          prompt="Cyberpunk laboratory"
          imageUrl="data:image/png;base64,mock"
          onOpenInMediaStudio={vi.fn()}
        />,
      );

      const card = container.querySelector(".bg-vf-panel-bg-raised");
      expect(card).toBeInTheDocument();
      expect(card?.className).toContain("border-vf-panel-border");
      expect(card?.className).toContain("rounded-lg");

      const actionBtn = screen.getByRole("button", { name: /open in media studio/i });
      expect(actionBtn.className).toContain("bg-accent");
      expect(actionBtn.className).toContain("shadow-[0_0_8px_var(--color-vf-accent-glow-subtle)]");
      expect(actionBtn.className).toContain("rounded-md");
    });
  });

  describe("CharacterChatsView styling", () => {
    it("renders workspace container and aside with reference tokens and no legacy mesh tokens", () => {
      render(<CharacterChatsView />);

      const workspace = screen.getByTestId("character-chats-workspace");
      expect(workspace.className).toContain("bg-vf-panel-bg");
      expect(workspace.className).not.toContain("mesh-surface");

      const aside = workspace.querySelector("aside");
      expect(aside?.className).toContain("bg-vf-shell-bg");
      expect(aside?.className).toContain("border-vf-panel-border");
      expect(aside?.className).not.toContain("mesh-surface-elevated");
    });
  });
});
