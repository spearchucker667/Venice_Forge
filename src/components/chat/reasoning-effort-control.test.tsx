// @vitest-environment jsdom
/** @fileoverview Unit tests for the model-aware reasoning-effort selector. */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ReasoningEffortControl } from "./reasoning-effort-control";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";

const mockGetModelById = vi.fn();
vi.mock("../../services/modelService", () => ({
  getModelById: (...args: unknown[]) => mockGetModelById(...args),
}));

function resetStores() {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    reasoningEffort: undefined,
  });
  useSettingsStore.setState({ selectedModels: { chat: "chat-model" } });
}

describe("ReasoningEffortControl", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
    mockGetModelById.mockReturnValue(undefined);
  });

  it("offers the full documented enum when the model advertises no restriction", () => {
    mockGetModelById.mockReturnValue({
      id: "chat-model",
      model_spec: { capabilities: { supportsReasoningEffort: true } },
    });
    render(<ReasoningEffortControl />);
    const select = screen.getByTestId("chat-reasoning-effort") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual([
      "",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it("offers only the advertised options for a restricted model", () => {
    mockGetModelById.mockReturnValue({
      id: "chat-model",
      model_spec: {
        capabilities: {
          supportsReasoningEffort: true,
          reasoningEffortOptions: ["low", "medium", "high"],
          defaultReasoningEffort: "medium",
        },
      },
    });
    render(<ReasoningEffortControl />);
    const select = screen.getByTestId("chat-reasoning-effort") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["", "low", "medium", "high"]);
  });

  it("writes the selected effort to the chat store and clears on provider default", () => {
    mockGetModelById.mockReturnValue({
      id: "chat-model",
      model_spec: { capabilities: { supportsReasoningEffort: true } },
    });
    render(<ReasoningEffortControl />);
    const select = screen.getByTestId("chat-reasoning-effort") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "high" } });
    expect(useChatStore.getState().reasoningEffort).toBe("high");

    fireEvent.change(select, { target: { value: "" } });
    expect(useChatStore.getState().reasoningEffort).toBeUndefined();
  });

  it("disables the control with a notice when the model does not support the parameter", () => {
    mockGetModelById.mockReturnValue({
      id: "chat-model",
      model_spec: { capabilities: { supportsReasoningEffort: false } },
    });
    render(<ReasoningEffortControl />);
    const select = screen.getByTestId("chat-reasoning-effort") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent(
      "doesn't advertise reasoning-effort support",
    );
  });

  it("disables the control when model metadata is missing (fail closed)", () => {
    mockGetModelById.mockReturnValue(undefined);
    render(<ReasoningEffortControl />);
    const select = screen.getByTestId("chat-reasoning-effort") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent(
      "capabilities aren't available",
    );
  });

  it("repairs an invalid persisted preference to the model default with a notice", async () => {
    useChatStore.setState({ reasoningEffort: "max" });
    mockGetModelById.mockReturnValue({
      id: "chat-model",
      model_spec: {
        capabilities: {
          supportsReasoningEffort: true,
          reasoningEffortOptions: ["low", "medium", "high"],
          defaultReasoningEffort: "medium",
        },
      },
    });
    render(<ReasoningEffortControl />);

    await waitFor(() => {
      expect(useChatStore.getState().reasoningEffort).toBe("medium");
    });
    expect(useChatStore.getState().reasoningEffort).not.toBe("max");
    expect(screen.getByRole("status")).toHaveTextContent(
      "isn't supported by chat-model",
    );
  });

  it("repairs to provider default when the model has no advertised default", async () => {
    useChatStore.setState({ reasoningEffort: "max" });
    mockGetModelById.mockReturnValue({
      id: "chat-model",
      model_spec: {
        capabilities: {
          supportsReasoningEffort: true,
          reasoningEffortOptions: ["low", "high"],
        },
      },
    });
    render(<ReasoningEffortControl />);

    await waitFor(() => {
      expect(useChatStore.getState().reasoningEffort).toBeUndefined();
    });
  });

  it("keeps a valid persisted preference untouched", () => {
    useChatStore.setState({ reasoningEffort: "low" });
    mockGetModelById.mockReturnValue({
      id: "chat-model",
      model_spec: {
        capabilities: {
          supportsReasoningEffort: true,
          reasoningEffortOptions: ["low", "medium", "high"],
        },
      },
    });
    render(<ReasoningEffortControl />);
    const select = screen.getByTestId("chat-reasoning-effort") as HTMLSelectElement;
    expect(select.value).toBe("low");
    expect(useChatStore.getState().reasoningEffort).toBe("low");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
