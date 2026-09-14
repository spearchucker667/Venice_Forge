// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ThemeMaker } from "./ThemeMaker";
import { useSettingsStore } from "../stores/settings-store";
import { useConfigStore } from "../stores/config-store";
import { completeCodeThemeConfig, type ThemeVariant, BUILTIN_THEME_FAMILIES } from "../theme";

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

  it("lists built-in theme families", () => {
    render(<ThemeMaker />);
    expect(screen.getByRole("button", { name: "Forge Nord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge Tokyo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge Catppuccin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge Solarized" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge One Dark" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge Monokai" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forge GitHub Light" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Obsidian Bloom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Harbor Fog" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Circuit Mint" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Amber Archive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Neon Dusk" })).toBeInTheDocument();
  });

  it("orders actual themes by visible label and keeps Custom Theme last", () => {
    render(<ThemeMaker />);
    const themeButtons = screen.getAllByRole("button").filter((button) =>
      ["Amber Archive", "Circuit Mint", "Forge Nord", "Custom Theme"].includes(button.textContent ?? ""),
    );
    expect(themeButtons.map((button) => button.textContent)).toEqual([
      "Amber Archive",
      "Circuit Mint",
      "Forge Nord",
      "Custom Theme",
    ]);
  });

  it.each([
    ["Forge Nord", "builtin-nord"],
    ["Forge Tokyo", "builtin-tokyo-night"],
    ["Forge Catppuccin", "builtin-catppuccin"],
    ["Forge Solarized", "builtin-solarized"],
    ["Forge One Dark", "builtin-one-dark"],
    ["Forge Monokai", "builtin-monokai"],
    ["Forge GitHub Light", "builtin-github-light"],
    ["Obsidian Bloom", "builtin-obsidian-bloom"],
    ["Harbor Fog", "builtin-harbor-fog"],
    ["Circuit Mint", "builtin-circuit-mint"],
    ["Amber Archive", "builtin-amber-archive"],
    ["Neon Dusk", "builtin-neon-dusk"],
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
          schemaVersion: 2,
          id: "mock-custom-theme",
          name: "Mock Custom Theme",
          aliases: [],
          builtIn: false,
          variants: ((): Record<"light" | "dark", ThemeVariant> => {
            const lightTokens = {
              background: "#f6f8fa",
              surface: "#ffffff",
              surfaceElevated: "#fcfcfc",
              surfaceMuted: "#eef1f4",
              border: "#d0d7de",
              borderStrong: "#8c959f",
              textPrimary: "#1f2328",
              textSecondary: "#57606a",
              textMuted: "#656d76",
              accent: "#0969da",
              accentHover: "#0860c4",
              accentForeground: "#ffffff",
              success: "#1a7f37",
              warning: "#7a5200",
              danger: "#cf222e",
              info: "#0969da",
              focusRing: "#0969da",
              overlay: "rgba(0, 0, 0, 0.4)",
              glow: "rgba(9, 105, 218, 0.18)",
              foreground: "#1f2328",
              foregroundMuted: "#57606a",
              foregroundSubtle: "#656d76",
              inputBackground: "#fcfcfc",
              inputForeground: "#1f2328",
              placeholder: "#656d76",
              disabledForeground: "#656d76",
              buttonPrimaryBackground: "#0969da",
              buttonPrimaryForeground: "#ffffff",
              buttonSecondaryBackground: "#fcfcfc",
              buttonSecondaryForeground: "#1f2328",
              link: "#0969da",
              selectionBackground: "#0969da",
              selectionForeground: "#ffffff",
              successForeground: "#ffffff",
              warningForeground: "#ffffff",
              dangerForeground: "#ffffff",
            };
            const darkTokens = {
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
            };
            return {
              light: {
                tokens: lightTokens,
                code: completeCodeThemeConfig("light", undefined, {
                  mode: "light",
                  tokens: lightTokens as unknown as import("../theme").ThemeTokens,
                }),
              },
              dark: {
                tokens: darkTokens,
                code: completeCodeThemeConfig("dark", undefined, {
                  mode: "dark",
                  tokens: darkTokens as unknown as import("../theme").ThemeTokens,
                }),
              },
            };
          })(),
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
    // Family identity is preserved; the canonical mode is inferred from the
    // light variant background.
    expect(useSettingsStore.getState().appearanceMode).toBe("light");
  });

  it("deduplicates themes when YAML registry contains themes sharing built-in names or IDs", () => {
    useConfigStore.setState({
      yamlThemes: {
        "amber-archive": BUILTIN_THEME_FAMILIES.find((f) => f.id === "amber-archive")!,
        nord: BUILTIN_THEME_FAMILIES.find((f) => f.id === "nord")!,
        "custom-unique": {
          schemaVersion: 2,
          id: "custom-unique",
          name: "Unique Custom YAML",
          variants: BUILTIN_THEME_FAMILIES[0].variants,
        },
      },
    });

    render(<ThemeMaker />);
    expect(screen.getAllByRole("button", { name: "Amber Archive" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Forge Nord" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Unique Custom YAML" })).toHaveLength(1);
  });

  it("renders the theme selection container with extended vertical height", () => {
    const { container } = render(<ThemeMaker />);
    const grid = container.querySelector(".overflow-y-auto");
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass("min-h-[16rem]");
    expect(grid).toHaveClass("max-h-[36rem]");
  });
});

describe("ThemeMaker dark/light mode preview tabs", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      selectedThemeId: "builtin-dark",
      customTheme: null,
      appearanceMode: "dark",
    });
    useConfigStore.setState({ yamlThemes: {} });
    document.documentElement.removeAttribute("data-theme-mode");
  });

  it("keeps family identity when Light is clicked on a built-in", () => {
    render(<ThemeMaker />);
    fireEvent.click(screen.getByText("Light Mode"));
    expect(useSettingsStore.getState().selectedThemeId).toBe("builtin-dark");
    expect(useSettingsStore.getState().appearanceMode).toBe("dark");
  });

  it("updates the live CSS theme-mode attribute for local preview", () => {
    render(<ThemeMaker />);
    fireEvent.click(screen.getByText("Light Mode"));
    expect(document.documentElement.dataset.themeMode).toBe("light");
  });

  it("flips back to dark mode preview when Dark Mode is clicked", () => {
    render(<ThemeMaker />);
    fireEvent.click(screen.getByText("Light Mode"));
    fireEvent.click(screen.getByText("Dark Mode"));
    expect(useSettingsStore.getState().selectedThemeId).toBe("builtin-dark");
    expect(useSettingsStore.getState().appearanceMode).toBe("dark");
    expect(document.documentElement.dataset.themeMode).toBe("dark");
  });
});
