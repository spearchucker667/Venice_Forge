/** @fileoverview RP Chat View regression tests.
 *
 * T-076: Venice stream errors must not be rendered raw into the RP chat UI.
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";

const fixtures = vi.hoisted(() => {
  const character = {
    schema: "CharacterCardV1" as const,
    id: "card_test_001",
    name: "Tester",
    description: "test desc",
    systemPrompt: "You are a test character.",
    scenario: "",
    tags: ["test"],
    adult: false,
    exampleDialogues: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
  const chat = {
    schema: "RpChatV1" as const,
    id: "chat_test_001",
    title: "Test RP",
    characterIds: ["card_test_001"],
    personaId: null,
    lorebookIds: [],
    modelId: "llama-3.3-70b",
    messages: [],
    adult: false,
    metadata: { pinned: false, archived: false, tags: [] },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
  return { character, chat };
});

const mocks = vi.hoisted(() => ({
  appendUserMessageMock: vi.fn(),
  appendCharacterMessageMock: vi.fn(),
  appendNarratorMessageMock: vi.fn(),
  setStreamingMock: vi.fn(),
  veniceStreamChatMock: vi.fn(),
  buildRpPromptMock: vi.fn(),
  assessRpContextMock: vi.fn(),
  selectTriggeredEntriesMock: vi.fn(),
  setShowInspectorMock: vi.fn(),
  getEffectiveRendererLocalFamilySafeModeEnabledMock: vi.fn(),
}));

vi.mock("../../stores/rp-chat-store", () => {
  const state = {
    chats: [fixtures.chat],
    appendUserMessage: mocks.appendUserMessageMock,
    appendCharacterMessage: mocks.appendCharacterMessageMock,
    appendNarratorMessage: mocks.appendNarratorMessageMock,
    setStreaming: mocks.setStreamingMock,
    isStreaming: false,
  };
  const fn = (selector: (s: typeof state) => unknown) => selector(state);
  (fn as unknown as { getState: () => typeof state }).getState = () => state;
  (fn as unknown as { setState: () => void }).setState = vi.fn();
  return { useRpChatStore: fn };
});

vi.mock("../../stores/character-card-store", () => {
  const state = { cards: [fixtures.character], hasLoaded: true };
  const fn = (selector: (s: typeof state) => unknown) => selector(state);
  (fn as unknown as { getState: () => typeof state }).getState = () => state;
  return { useCharacterCardStore: fn };
});

vi.mock("../../stores/persona-store", () => {
  const state = { personas: [], hasLoaded: true };
  const fn = (selector: (s: typeof state) => unknown) => selector(state);
  (fn as unknown as { getState: () => typeof state }).getState = () => state;
  return { usePersonaStore: fn };
});

vi.mock("../../stores/lorebook-store", () => {
  const state = { lorebooks: [], hasLoaded: true };
  const fn = (selector: (s: typeof state) => unknown) => selector(state);
  (fn as unknown as { getState: () => typeof state }).getState = () => state;
  return { useLorebookStore: fn };
});

vi.mock("../../stores/settings-store", () => {
  const state = { setShowInspector: mocks.setShowInspectorMock };
  const fn = (selector: (s: typeof state) => unknown) => selector(state);
  (fn as unknown as { getState: () => typeof state }).getState = () => state;
  return { useSettingsStore: fn };
});

vi.mock("../../safetyHydration", () => ({
  getEffectiveRendererLocalFamilySafeModeEnabled:
    mocks.getEffectiveRendererLocalFamilySafeModeEnabledMock,
}));

vi.mock("../../services/veniceClient", () => ({
  veniceStreamChat: mocks.veniceStreamChatMock,
}));

vi.mock("../../services/rp/promptBuilderService", () => ({
  buildRpPrompt: mocks.buildRpPromptMock,
}));

vi.mock("../../shared/safety/characterImportSafety", () => ({
  assessRpContext: mocks.assessRpContextMock,
}));

vi.mock("../../services/rp/lorebookService", () => ({
  selectTriggeredEntries: mocks.selectTriggeredEntriesMock,
}));

import { RpChatView } from "./RpChatView";

function resetMocks(): void {
  mocks.appendUserMessageMock.mockReset();
  mocks.appendCharacterMessageMock.mockReset();
  mocks.appendNarratorMessageMock.mockReset();
  mocks.setStreamingMock.mockReset();
  mocks.veniceStreamChatMock.mockReset();
  mocks.buildRpPromptMock.mockReset();
  mocks.assessRpContextMock.mockReset();
  mocks.selectTriggeredEntriesMock.mockReset();
  mocks.setShowInspectorMock.mockReset();
  mocks.getEffectiveRendererLocalFamilySafeModeEnabledMock.mockReset();

  mocks.appendUserMessageMock.mockResolvedValue({
    id: "msg_user_001",
    role: "user",
    content: "Hello",
    createdAt: Date.now(),
  });
  mocks.appendCharacterMessageMock.mockResolvedValue({
    id: "msg_char_001",
    role: "character",
    characterId: fixtures.character.id,
    content: "Hi.",
    createdAt: Date.now(),
  });
  mocks.appendNarratorMessageMock.mockResolvedValue({
    id: "msg_narr_001",
    role: "narrator",
    content: "Narration.",
    createdAt: Date.now(),
  });
  mocks.assessRpContextMock.mockReturnValue({
    allow: true,
    action: "allow",
    userMessage: "",
  });
  mocks.selectTriggeredEntriesMock.mockReturnValue([]);
  mocks.getEffectiveRendererLocalFamilySafeModeEnabledMock.mockReturnValue(false);
  mocks.buildRpPromptMock.mockReturnValue({
    systemMessages: [{ role: "system" as const, content: "You are a test character." }],
    recentMessages: [],
    userMessage: { role: "user" as const, content: "Hello" },
    trace: [],
    totalSystemChars: 28,
    budgetExceeded: false,
  });
}

beforeEach(() => {
  resetMocks();
  // jsdom does not implement scrollTo on elements.
  const proto = Element.prototype as unknown as Record<string, unknown>;
  if (!("scrollTo" in proto)) {
    proto.scrollTo = vi.fn(() => undefined);
  }
});

describe("RpChatView — T-076 stream error handling", () => {
  it("does not render raw Venice stream error text in the UI", async () => {
    const rawError =
      "500 Venice/server retryable error: fetch failed /Users/super_user/.venice/api-key leaked";
    mocks.veniceStreamChatMock.mockRejectedValueOnce(new Error(rawError));

    render(
      <RpChatView
        chatId={fixtures.chat.id}
        onBack={() => {}}
        onOpenScene={() => {}}
        onOpenDebug={() => {}}
      />,
    );

    const textarea = screen.getByLabelText("RP message");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The character response could not be generated. Please try again.",
      );
    });

    expect(screen.queryByText(rawError)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/Users\/super_user/)).not.toBeInTheDocument();
    expect(screen.queryByText(/api-key/)).not.toBeInTheDocument();
  });

  it("shows the safe generic message for non-Error stream failures", async () => {
    mocks.veniceStreamChatMock.mockRejectedValueOnce("string failure");

    render(
      <RpChatView
        chatId={fixtures.chat.id}
        onBack={() => {}}
        onOpenScene={() => {}}
        onOpenDebug={() => {}}
      />,
    );

    const textarea = screen.getByLabelText("RP message");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The character response could not be generated. Please try again.",
      );
    });
  });

  it("normalizes character/narrator roles to assistant for the API (RP-01 regression)", async () => {
    mocks.buildRpPromptMock.mockReturnValue({
      systemMessages: [{ role: "system" as const, content: "You are a test character." }],
      recentMessages: [
        { role: "user" as const, content: "Hello" },
        { role: "character" as const, content: "Greetings.", characterId: fixtures.character.id },
        { role: "narrator" as const, content: "The door creaks." },
      ],
      userMessage: { role: "user" as const, content: "How are you?" },
      trace: [],
      totalSystemChars: 28,
      budgetExceeded: false,
    });
    mocks.veniceStreamChatMock.mockImplementation(async (_payload, { onDelta }) => {
      onDelta({ content: "Fine, thanks.", reasoning: "" });
      return undefined;
    });

    render(
      <RpChatView
        chatId={fixtures.chat.id}
        onBack={() => {}}
        onOpenScene={() => {}}
        onOpenDebug={() => {}}
      />,
    );

    const textarea = screen.getByLabelText("RP message");
    fireEvent.change(textarea, { target: { value: "How are you?" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(mocks.veniceStreamChatMock).toHaveBeenCalled();
    });

    const payload = mocks.veniceStreamChatMock.mock.calls[0][0] as {
      messages?: Array<{ role: string; content: string }>;
    };
    const messages = payload.messages ?? [];
    expect(messages.some((m) => m.role === "character" || m.role === "narrator")).toBe(false);
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    expect(assistantMessages.some((m) => m.content.includes("[character]"))).toBe(true);
    expect(assistantMessages.some((m) => m.content.includes("[narrator]"))).toBe(true);
  });
});
