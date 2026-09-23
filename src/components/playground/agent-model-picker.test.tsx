/** @fileoverview AgentModelPicker — portaled dropdown placement and dismissal.
 *  The menu portals to document.body, flips above the trigger near the bottom
 *  viewport edge, clamps inside the viewport, and closes on Escape. */

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentModel } from "../../hooks/use-agent-models";

const MODELS: AgentModel[] = [
  {
    id: "qwen3-next-80b",
    name: "Qwen3 Next 80B",
    capabilities: { supportsResponseSchema: true, supportsFunctionCalling: true },
    traits: [],
    contextTokens: 262144,
    recommended: true,
    tier: 0,
    reasoning: false,
    uncensored: false,
  },
  {
    id: "mistral-small-3-2-24b-instruct",
    name: "Mistral Small 3.2 24B",
    capabilities: { supportsResponseSchema: true },
    traits: [],
    contextTokens: 131072,
    recommended: false,
    tier: 2,
    reasoning: false,
    uncensored: false,
  },
];

vi.mock("../../hooks/use-agent-models", () => ({
  useAgentModels: () => ({ models: MODELS, isLoading: false }),
}));

import { AgentModelPicker } from "./agent-model-picker";

function queryMenu(): HTMLElement | null {
  return document.querySelector("[data-agent-model-picker-menu='true']");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AgentModelPicker", () => {
  it("opens a portaled menu and keeps selection behavior", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AgentModelPicker value="" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /pick agent model/i });

    await user.click(trigger);
    const menu = queryMenu();
    expect(menu).not.toBeNull();
    expect(menu!.parentElement).toBe(document.body);
    expect(menu!.querySelector("input")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: /Mistral Small 3\.2 24B/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("mistral-small-3-2-24b-instruct");
    expect(queryMenu()).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AgentModelPicker value="" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /pick agent model/i });

    await user.click(trigger);
    expect(queryMenu()).not.toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(queryMenu()).toBeNull());
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("flips above the trigger and clamps the list to the viewport near the bottom edge", async () => {
    const user = userEvent.setup();
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 300 });
    vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 220,
      bottom: 250,
      left: 176,
      right: 400,
      width: 224,
      height: 30,
      x: 176,
      y: 220,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.agentModelPickerMenu ? 340 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.agentModelPickerHeader) return 36;
      if (this.dataset.agentModelPickerList) return 600;
      return 0;
    });
    try {
      const onChange = vi.fn();
      render(<AgentModelPicker value="" onChange={onChange} />);
      await user.click(screen.getByRole("button", { name: /pick agent model/i }));
      const menu = queryMenu()!;
      await waitFor(() => expect(menu.style.top).not.toBe(""));

      // 300px viewport, trigger bottom at 250: only 38px below (incl. margins)
      // versus 208px above, so the menu flips above with an 8px top margin.
      expect(menu.style.top).toBe("8px");
      expect(menu.parentElement).toBe(document.body);
      const list = menu.querySelector("[data-agent-model-picker-list='true']") as HTMLElement;
      expect(list.style.maxHeight).toBe("172px");
      expect(Number.parseInt(list.style.maxHeight, 10)).toBeLessThanOrEqual(300 - 8 - 36);
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
    }
  });
});
