/**
 * @fileoverview Component tests for the Developer settings panel
 * (Phase 8 — Responses API alpha toggle).
 */

import React from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeveloperPanel } from "./DeveloperPanel";
import { useSettingsStore } from "../../stores/settings-store";
import { getModelById } from "../../services/modelService";

vi.mock("../../services/modelService", () => ({
  getModelById: vi.fn(() => undefined),
}));

const mockedGetModelById = vi.mocked(getModelById);

describe("DeveloperPanel", () => {
  beforeEach(() => {
    useSettingsStore.setState({ responsesApiEnabled: false });
    mockedGetModelById.mockReturnValue(undefined);
  });

  afterEach(() => {
    useSettingsStore.setState({ responsesApiEnabled: false });
  });

  it("labels the Responses API as experimental/alpha and defaults off", () => {
    render(<DeveloperPanel />);

    expect(screen.getByText("Responses API (Alpha)")).toBeDefined();
    expect(screen.getByText("Experimental")).toBeDefined();
    expect(screen.getByText("OFF: Chat Completions (default)")).toBeDefined();
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("toggling on enables the Responses API transport setting", () => {
    render(<DeveloperPanel />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;

    fireEvent.click(checkbox);

    expect(useSettingsStore.getState().responsesApiEnabled).toBe(true);
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText("ON: Responses API")).toBeDefined();
  });

  it("shows eligibility for a confirmed non-E2EE chat model", () => {
    useSettingsStore.setState({ selectedModels: { chat: "plain-model" } });
    mockedGetModelById.mockReturnValue({
      id: "plain-model",
      name: "Plain Model",
      model_spec: { supportsE2EE: false },
    } as unknown as ReturnType<typeof getModelById>);

    render(<DeveloperPanel />);

    const status = screen.getByText(/Current chat model/);
    expect(status.getAttribute("data-support-eligible")).toBe("true");
  });

  it("shows ineligibility for an E2EE-capable chat model", () => {
    useSettingsStore.setState({ selectedModels: { chat: "e2ee-model" } });
    mockedGetModelById.mockReturnValue({
      id: "e2ee-model",
      name: "E2EE Model",
      model_spec: { supportsE2EE: true },
    } as unknown as ReturnType<typeof getModelById>);

    render(<DeveloperPanel />);

    const status = screen.getByText(/Current chat model/);
    expect(status.getAttribute("data-support-eligible")).toBe("false");
  });

  it("hides the model status when no chat model is selected", () => {
    useSettingsStore.setState({ selectedModels: {} });
    render(<DeveloperPanel />);

    expect(screen.queryByText(/Current chat model/)).toBeNull();
  });
});
