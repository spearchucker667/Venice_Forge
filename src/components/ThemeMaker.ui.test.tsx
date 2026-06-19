// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ThemeMaker } from "./ThemeMaker";
import { useSettingsStore } from "../stores/settings-store";
import { useConfigStore } from "../stores/config-store";

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
    useConfigStore.setState({ yamlThemes: {} });
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

  describe("ThemeMaker YAML theme selection", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      selectedThemeId: "builtin-venice",
      customTheme: null,
      appearanceMode: "dark",
    });
    useConfigStore.setState({
      yamlThemes: {
        "mock-custom-theme": {
          id: "mock-custom-theme",
          name: "Mock Custom Theme",
          mode: "dark",
          tokens: {
            background: "#021015",
            surface: "#0a1f1a",
            surfaceElevated: "#122e28",
            surfaceMuted: "#051812",
            border: "#1a3530",
            borderStrong: "#2a5048",
            textPrimary: "#e0f7fa",
            textSecondary: "#a3d5d0",
            textMuted: "#5a8a82",
            accent: "#4dffb4",
            accentHover: "#7fffd4",
            accentForeground: "#021015",
            success: "#2ecc71",
            warning: "#f39c12",
            danger: "#e74c3c",
            info: "#3498db",
            focusRing: "#4dffb4",
            overlay: "rgba(2, 16, 21, 0.7)",
            glow: "rgba(77, 255, 180, 0.25)",
            foreground: "#e0f7fa",
            foregroundMuted: "#a3d5d0",
            foregroundSubtle: "#5a8a82",
            inputBackground: "#122e28",
            inputForeground: "#e0f7fa",
            placeholder: "#5a8a82",
            disabledForeground: "#5a8a82",
            buttonPrimaryBackground: "#4dffb4",
            buttonPrimaryForeground: "#021015",
            buttonSecondaryBackground: "#122e28",
            buttonSecondaryForeground: "#e0f7fa",
            link: "#3498db",
            selectionBackground: "#4dffb4",
            selectionForeground: "#021015",
            successForeground: "#021015",
            warningForeground: "#021015",
            dangerForeground: "#021015",
          },
        },
      },
    });
  });

  it("lists YAML themes alongside built-in themes", () => {
    render(<ThemeMaker />);
    expect(screen.getByRole("button", { name: "Mock Custom Theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge Nord" })).toBeInTheDocument();
  });

  it("selects a YAML theme when its button is clicked", () => {
    render(<ThemeMaker />);
    fireEvent.click(screen.getByRole("button", { name: "Mock Custom Theme" }));
    expect(useSettingsStore.getState().selectedThemeId).toBe("mock-custom-theme");
    expect(useSettingsStore.getState().appearanceMode).toBe("dark");
  });
});
