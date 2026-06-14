// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ThemeMaker } from "./ThemeMaker";
import { useSettingsStore } from "../stores/settings-store";

vi.mock("../services/desktopBridge", async () => {
  const actual = await vi.importActual<typeof import("../services/desktopBridge")>(
    "../services/desktopBridge",
  );
  return {
    ...actual,
    desktopFiles: {
      exportYaml: vi.fn().mockResolvedValue(true),
      importYamlString: vi.fn().mockResolvedValue(null),
    },
  };
});

describe("ThemeMaker built-in theme selection", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      selectedThemeId: "builtin-venice",
      customTheme: null,
      appearanceMode: "dark",
    });
  });

  it("lists the new built-in themes", () => {
    render(<ThemeMaker />);
    expect(screen.getByRole("button", { name: "Forge Nord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge Tokyo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge Catppuccin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge Solarized Dark" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge Solarized Light" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge One Dark" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge Monokai" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge GitHub Light" })).toBeInTheDocument();
  });

  it.each([
    ["Forge Nord", "builtin-nord"],
    ["Forge Tokyo", "builtin-tokyo-night"],
    ["Forge Catppuccin", "builtin-catppuccin"],
    ["Forge Solarized Dark", "builtin-solarized-dark"],
    ["Forge Solarized Light", "builtin-solarized-light"],
    ["Forge One Dark", "builtin-one-dark"],
    ["Forge Monokai", "builtin-monokai"],
    ["Forge GitHub Light", "builtin-github-light"],
  ] as const)("selects %s when its button is clicked", (label, id) => {
    render(<ThemeMaker />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(useSettingsStore.getState().selectedThemeId).toBe(id);
    expect(useSettingsStore.getState().customTheme).toBeNull();
  });
});
