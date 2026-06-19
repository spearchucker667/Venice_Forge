import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useThemeLifecycle } from "./useThemeLifecycle";
import { applyTheme } from "../theme";
import type { AppSettings } from "../types/app";

vi.mock("../theme", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../theme")>();
  return {
    ...actual,
    applyTheme: vi.fn(),
  };
});

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

describe("useThemeLifecycle", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("does nothing before hydration", () => {
    const settings: AppSettings = {
      localFamilySafeModeEnabled: true,
      veniceApiSafeMode: true,
      defaultSystemPrompt: "",
      includeVeniceSystemPrompt: false,
      webSearch: "off",
      webScraping: false,
      webCitations: false,
      theme: "dark",
      customModels: [],
      selectedThemeId: "builtin-dark",
      appearanceMode: "dark",
      customTheme: null,
    };
    renderHook(() => useThemeLifecycle(settings, false));
    expect(vi.mocked(applyTheme)).not.toHaveBeenCalled();
  });

  it("applies theme after hydration", () => {
    const settings: AppSettings = {
      localFamilySafeModeEnabled: true,
      veniceApiSafeMode: true,
      defaultSystemPrompt: "",
      includeVeniceSystemPrompt: false,
      webSearch: "off",
      webScraping: false,
      webCitations: false,
      theme: "dark",
      customModels: [],
      selectedThemeId: "builtin-dark",
      appearanceMode: "dark",
      customTheme: null,
    };
    renderHook(() => useThemeLifecycle(settings, true));
    expect(vi.mocked(applyTheme)).toHaveBeenCalled();
  });

  it("applies a YAML theme when yamlThemes is provided and the selected id matches", () => {
    const yamlTheme = {
      id: "aurora-boreal",
      name: "Aurora Boreal",
      mode: "dark" as const,
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
    };
    const settings: AppSettings = {
      localFamilySafeModeEnabled: true,
      veniceApiSafeMode: true,
      defaultSystemPrompt: "",
      includeVeniceSystemPrompt: false,
      webSearch: "off",
      webScraping: false,
      webCitations: false,
      theme: "dark",
      customModels: [],
      selectedThemeId: "aurora-boreal",
      appearanceMode: "dark",
      customTheme: null,
    };
    renderHook(() => useThemeLifecycle(settings, true, { "aurora-boreal": yamlTheme }));
    expect(vi.mocked(applyTheme)).toHaveBeenCalledWith(yamlTheme);
  });

  it("falls back to built-in theme when yamlThemes does not contain the selected id", () => {
    const settings: AppSettings = {
      localFamilySafeModeEnabled: true,
      veniceApiSafeMode: true,
      defaultSystemPrompt: "",
      includeVeniceSystemPrompt: false,
      webSearch: "off",
      webScraping: false,
      webCitations: false,
      theme: "dark",
      customModels: [],
      selectedThemeId: "builtin-dark",
      appearanceMode: "dark",
      customTheme: null,
    };
    renderHook(() => useThemeLifecycle(settings, true, {}));
    expect(vi.mocked(applyTheme)).toHaveBeenCalled();
    const calledTheme = vi.mocked(applyTheme).mock.calls[0][0];
    expect(calledTheme.id).toBe("builtin-dark");
  });
});
