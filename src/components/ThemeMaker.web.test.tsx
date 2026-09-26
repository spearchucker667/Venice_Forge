// @vitest-environment jsdom
// THEME-P2-016 regression guard: web transport disables IPC-backed theme CRUD
// affordances instead of letting them error-toast. Browse/preview/export keep
// working.
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ThemeMaker } from "./ThemeMaker";
import { useSettingsStore } from "../stores/settings-store";
import { useConfigStore } from "../stores/config-store";
import { desktopConfig } from "../services/desktopBridge";
import { BUILTIN_VENICE, resolveTheme } from "../theme";

vi.mock("../services/desktopBridge", async () => {
  const actual = await vi.importActual<typeof import("../services/desktopBridge")>(
    "../services/desktopBridge",
  );
  return {
    ...actual,
    isElectron: vi.fn(() => false),
    desktopFiles: {
      exportYaml: vi.fn().mockResolvedValue(true),
      importYamlString: vi.fn().mockResolvedValue(null),
    },
    desktopConfig: {
      saveTheme: vi.fn().mockResolvedValue({ ok: true }),
      deleteTheme: vi.fn().mockResolvedValue({ ok: true }),
      loadMergedThemes: vi
        .fn()
        .mockResolvedValue({ ok: true, themes: {}, warnings: [] }),
      onThemeUpdated: vi.fn(() => () => {}),
    },
  };
});

const WEB_NOTICE = "Not supported in web mode";

describe("ThemeMaker web transport gating (THEME-P2-016)", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      selectedThemeId: "user-web-theme",
      customTheme: {
        ...resolveTheme(BUILTIN_VENICE, "dark"),
        id: "user-web-theme",
        name: "Web User Theme",
      },
      customThemes: [
        {
          ...resolveTheme(BUILTIN_VENICE, "dark"),
          id: "user-web-theme",
          name: "Web User Theme",
        },
      ],
      appearanceMode: "dark",
    });
    useConfigStore.setState({ yamlThemes: {} });
  });

  it("renders the canonical web-mode notice", () => {
    render(<ThemeMaker />);
    expect(screen.getByRole("note")).toHaveTextContent(WEB_NOTICE);
  });

  it("disables every IPC-backed CRUD affordance with an explanation", () => {
    render(<ThemeMaker />);

    for (const name of [
      "Save Theme",
      "+ Create New Theme",
      "Duplicate Theme",
      "Import Theme…",
      "Delete Theme",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button, name).toBeDisabled();
      expect(button, name).toHaveAttribute("aria-disabled", "true");
      expect(button, name).toHaveAttribute("title", WEB_NOTICE);
    }
  });

  it("keeps browse/preview/export functional on web", () => {
    render(<ThemeMaker />);

    // Theme palette browsing + preview still work.
    fireEvent.click(screen.getByRole("button", { name: "Forge Nord" }));
    expect(useSettingsStore.getState().selectedThemeId).toBe("builtin-nord");

    const exportButton = screen.getByRole("button", { name: "Export Theme" });
    expect(exportButton).toBeEnabled();
  });

  it("never reaches the IPC layer when a disabled CRUD button is clicked", () => {
    render(<ThemeMaker />);

    fireEvent.click(screen.getByRole("button", { name: "Save Theme" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Create New Theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Import Theme…" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Theme" }));

    expect(desktopConfig.saveTheme).not.toHaveBeenCalled();
    expect(desktopConfig.deleteTheme).not.toHaveBeenCalled();
  });
});
