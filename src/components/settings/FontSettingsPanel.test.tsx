// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { FontSettingsPanel } from "./FontSettingsPanel";
import { useSettingsStore } from "../../stores/settings-store";
import { DEFAULT_FONT_ID, DEFAULT_FONT_SIZE } from "../../services/fontService";

describe("FontSettingsPanel", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      fontFamily: DEFAULT_FONT_ID,
      fontSize: DEFAULT_FONT_SIZE,
    });
  });

  it("renders the font selection menu with available fonts", () => {
    render(<FontSettingsPanel />);

    const select = screen.getByRole("combobox", { name: /font family/i });
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue(DEFAULT_FONT_ID);

    expect(screen.getAllByText(/MesloLGM Nerd Font/)[0]).toBeInTheDocument();
    expect(screen.getByText(/Inter/)).toBeInTheDocument();
    expect(screen.getByText(/JetBrains Mono/)).toBeInTheDocument();
    expect(screen.getByText(/Lora/)).toBeInTheDocument();
  });

  it("updates the font family when an option is selected", () => {
    render(<FontSettingsPanel />);

    const select = screen.getByRole("combobox", { name: /font family/i });
    fireEvent.change(select, { target: { value: "inter" } });

    expect(useSettingsStore.getState().fontFamily).toBe("inter");
    expect(select).toHaveValue("inter");
  });

  it("renders the font size slider with default 16px value", () => {
    render(<FontSettingsPanel />);

    const slider = screen.getByRole("slider", { name: /font size/i });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveValue(String(DEFAULT_FONT_SIZE));
    expect(screen.getByText(/16px \(100% · Default\)/)).toBeInTheDocument();
  });

  it("updates the font size when the slider value changes", () => {
    render(<FontSettingsPanel />);

    const slider = screen.getByRole("slider", { name: /font size/i });
    fireEvent.change(slider, { target: { value: "18" } });

    expect(useSettingsStore.getState().fontSize).toBe(18);
    expect(screen.getByText(/18px \(113%\)/)).toBeInTheDocument();
  });

  it("shows the reset button when settings are non-default and resets on click", () => {
    render(<FontSettingsPanel />);

    // Initially at default, reset button is not shown
    expect(screen.queryByRole("button", { name: /reset to default/i })).not.toBeInTheDocument();

    const slider = screen.getByRole("slider", { name: /font size/i });
    fireEvent.change(slider, { target: { value: "20" } });

    // Now reset button should be visible
    const resetButton = screen.getByRole("button", { name: /reset to default/i });
    expect(resetButton).toBeInTheDocument();

    fireEvent.click(resetButton);

    expect(useSettingsStore.getState().fontSize).toBe(DEFAULT_FONT_SIZE);
    expect(useSettingsStore.getState().fontFamily).toBe(DEFAULT_FONT_ID);
    expect(screen.queryByRole("button", { name: /reset to default/i })).not.toBeInTheDocument();
  });

  it("renders the live typography preview", () => {
    render(<FontSettingsPanel />);

    expect(screen.getByText(/Live Typography Preview/i)).toBeInTheDocument();
    expect(screen.getByText(/The Quietly Confident AI Workspace/i)).toBeInTheDocument();
    expect(screen.getByText(/Venice Forge provides private AI chat/i)).toBeInTheDocument();
  });
});
