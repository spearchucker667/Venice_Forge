// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ThemeMaker, themeToYaml } from "./ThemeMaker";
import { useSettingsStore } from "../stores/settings-store";
import { desktopFiles } from "../services/desktopBridge";
import { BUILTIN_DRACULA, BUILTIN_VENICE } from "../theme";

vi.mock("../services/desktopBridge", async () => {
  const actual = await vi.importActual<typeof import("../services/desktopBridge")>(
    "../services/desktopBridge"
  );
  return {
    ...actual,
    desktopFiles: {
      exportYaml: vi.fn().mockResolvedValue(true),
      importYamlString: vi.fn().mockResolvedValue(null),
    },
  };
});

describe("ThemeMaker Custom Theme Engine Features", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      selectedThemeId: "builtin-venice",
      customTheme: null,
      customThemes: [],
      appearanceMode: "dark",
    });
  });

  it("saves a new custom theme into settingsStore customThemes", async () => {
    render(<ThemeMaker />);
    fireEvent.click(screen.getByRole("button", { name: "+ Create New Theme" }));

    const saveButton = screen.getByRole("button", { name: "Save Theme" });
    fireEvent.click(saveButton);

    const state = useSettingsStore.getState();
    expect(state.customThemes.length).toBeGreaterThan(0);
    expect(state.selectedThemeId).toContain("user-theme-");
  });

  it("resets unsaved draft token changes when Cancel / Reset is clicked", async () => {
    render(<ThemeMaker />);
    
    // Select background token input and change value
    const bgInput = screen.getByLabelText("Background") as HTMLInputElement;
    fireEvent.change(bgInput, { target: { value: "#ff0055" } });
    expect(bgInput.value).toBe("#ff0055");

    const resetButton = screen.getByRole("button", { name: "Cancel / Reset" });
    fireEvent.click(resetButton);

    expect(bgInput.value).toBe(BUILTIN_VENICE.tokens.background);
  });

  it("deletes a user custom theme and falls back safely", async () => {
    const customThemeObj = {
      id: "user-test-theme",
      name: "User Test Theme",
      mode: "dark" as const,
      tokens: BUILTIN_DRACULA.tokens,
    };
    useSettingsStore.setState({
      selectedThemeId: "user-test-theme",
      customTheme: customThemeObj,
      customThemes: [customThemeObj],
      appearanceMode: "dark",
    });

    render(<ThemeMaker />);
    const deleteButton = screen.getByRole("button", { name: "Delete Theme" });
    fireEvent.click(deleteButton);

    const state = useSettingsStore.getState();
    expect(state.customThemes).toEqual([]);
    expect(state.selectedThemeId).toBe("builtin-venice");
  });

  it("opens structured import preview modal when a YAML file is loaded", async () => {
    const validYaml = await themeToYaml(BUILTIN_DRACULA);
    const mockImport = vi.fn().mockResolvedValue(validYaml);
    vi.mocked(desktopFiles.importYamlString).mockImplementation(mockImport);

    render(<ThemeMaker />);
    const importBtn = screen.getByRole("button", { name: "Import Theme…" });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(screen.getByText("Import Theme Preview")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Forge Dracula").length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("button", { name: "Import & Apply" }));

    await waitFor(() => {
      expect(screen.queryByText("Import Theme Preview")).not.toBeInTheDocument();
    });
    expect(useSettingsStore.getState().customThemes.length).toBe(1);
  });
});
