// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyControls } from "./privacy-controls";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { getModelById } from "../../services/modelService";
import { i18n } from "../../i18n";
import type { Conversation } from "../../types/conversation";

vi.mock("../../services/modelService", () => ({
  getModelById: vi.fn(),
}));
const mockedGetModelById = vi.mocked(getModelById);

function makeConversation(id: string): Conversation {
  return {
    id,
    title: "Test chat",
    createdAt: 1,
    updatedAt: 1,
    model: "test-model",
    messages: [
      {
        id: "m1",
        role: "user",
        content: "hi",
        timestamp: 1,
      },
    ],
    metadata: {
      tags: [],
      pinned: false,
      archived: false,
      source: "chat",
      messageCount: 1,
    },
  };
}

describe("PrivacyControls (FEAT-003 / FEAT-004)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockedGetModelById.mockReturnValue({
      model_spec: { capabilities: { supportsE2EE: true } },
    } as never);
    useSettingsStore.setState({
      selectedModels: { chat: "e2ee-model" },
      autoFallbackEnabled: false,
      enabledProviders: {},
    });
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      e2eeOverride: "provider-default",
      promptCacheRetention: "default",
    });
    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
  });

  it("renders the E2EE and prompt-cache retention selectors", () => {
    render(<PrivacyControls />);
    expect(screen.getByTestId("chat-privacy-e2ee")).toBeInTheDocument();
    expect(screen.getByTestId("chat-privacy-retention")).toBeInTheDocument();
    expect(screen.getByText("End-to-end encryption")).toBeInTheDocument();
    expect(screen.getByText("Prompt cache retention")).toBeInTheDocument();
  });

  it("edits the profile default when no conversation is active", () => {
    render(<PrivacyControls />);
    fireEvent.change(screen.getByTestId("chat-privacy-e2ee"), {
      target: { value: "on" },
    });
    expect(useChatStore.getState().e2eeOverride).toBe("on");

    fireEvent.change(screen.getByTestId("chat-privacy-retention"), {
      target: { value: "24h" },
    });
    expect(useChatStore.getState().promptCacheRetention).toBe("24h");
  });

  it("writes a conversation override that beats the profile default", () => {
    useChatStore.setState({
      conversations: [makeConversation("conv-1")],
      activeConversationId: "conv-1",
      e2eeOverride: "on",
    });
    render(<PrivacyControls />);

    fireEvent.change(screen.getByTestId("chat-privacy-e2ee"), {
      target: { value: "off" },
    });

    const conv = useChatStore
      .getState()
      .conversations.find((c) => c.id === "conv-1");
    expect(conv?.metadata?.privacy?.e2eeOverride).toBe("off");
    // Profile default untouched.
    expect(useChatStore.getState().e2eeOverride).toBe("on");
    expect(screen.getByText(/Effective for this chat/)).toHaveTextContent("Off");
  });

  it("clears the conversation override when 'provider-default' is selected", () => {
    const conv = makeConversation("conv-1");
    conv.metadata = {
      ...conv.metadata!,
      privacy: { e2eeOverride: "off" },
    };
    useChatStore.setState({
      conversations: [conv],
      activeConversationId: "conv-1",
      e2eeOverride: "on",
    });
    render(<PrivacyControls />);
    // The selector shows the active conversation override.
    expect(screen.getByTestId("chat-privacy-e2ee")).toHaveValue("off");

    fireEvent.change(screen.getByTestId("chat-privacy-e2ee"), {
      target: { value: "provider-default" },
    });

    const updated = useChatStore
      .getState()
      .conversations.find((c) => c.id === "conv-1");
    expect(updated?.metadata?.privacy?.e2eeOverride).toBeUndefined();
  });

  it("persists the retention conversation override via metadata.privacy", () => {
    useChatStore.setState({
      conversations: [makeConversation("conv-1")],
      activeConversationId: "conv-1",
    });
    render(<PrivacyControls />);

    fireEvent.change(screen.getByTestId("chat-privacy-retention"), {
      target: { value: "extended" },
    });
    let conv = useChatStore
      .getState()
      .conversations.find((c) => c.id === "conv-1");
    expect(conv?.metadata?.privacy?.promptCacheRetention).toBe("extended");

    fireEvent.change(screen.getByTestId("chat-privacy-retention"), {
      target: { value: "default" },
    });
    conv = useChatStore
      .getState()
      .conversations.find((c) => c.id === "conv-1");
    expect(conv?.metadata?.privacy?.promptCacheRetention).toBeUndefined();
  });

  it("disables the E2EE control when the model does not advertise support", () => {
    mockedGetModelById.mockReturnValue({
      model_spec: { capabilities: { supportsE2EE: false } },
    } as never);
    render(<PrivacyControls />);

    const select = screen.getByTestId("chat-privacy-e2ee");
    expect(select).toBeDisabled();
    expect(
      screen.getByText("The selected model doesn't advertise E2EE support."),
    ).toBeInTheDocument();
    // Retention stays enabled (no capability gate).
    expect(screen.getByTestId("chat-privacy-retention")).toBeEnabled();
  });

  it("keeps the control enabled and truthful when model metadata is missing", () => {
    mockedGetModelById.mockReturnValue(undefined as never);
    render(<PrivacyControls />);
    // Missing metadata fails closed — the control is a request preference,
    // so it stays editable; the effective-state line makes no E2EE claim.
    expect(screen.getByTestId("chat-privacy-e2ee")).toBeDisabled();
    expect(screen.getByText(/Effective for this chat/)).toBeInTheDocument();
  });

  it("annotates that fallback providers cannot preserve E2EE without blocking", () => {
    useSettingsStore.setState({ autoFallbackEnabled: true });
    render(<PrivacyControls />);

    expect(
      screen.getByText(/cannot preserve E2EE/i),
    ).toBeInTheDocument();
    // Never blocks the control.
    expect(screen.getByTestId("chat-privacy-e2ee")).toBeEnabled();
  });

  it("annotates the fallback notice when an individual provider is enabled", () => {
    useSettingsStore.setState({
      autoFallbackEnabled: false,
      enabledProviders: { openai: true },
    });
    render(<PrivacyControls />);
    expect(screen.getByText(/cannot preserve E2EE/i)).toBeInTheDocument();
  });
});
