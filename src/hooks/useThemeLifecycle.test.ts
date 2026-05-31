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

  it("persists theme to localStorage after hydration", () => {
    const settings: AppSettings = {
      defaultSystemPrompt: "",
      includeVeniceSystemPrompt: false,
      webSearch: "off",
      webScraping: false,
      webCitations: false,
      theme: "light",
      customModels: [],
      selectedThemeId: "builtin-light",
      appearanceMode: "light",
      customTheme: null,
    };
    renderHook(() => useThemeLifecycle(settings, true));
    const stored = localStorageMock.getItem("vf.theme.bootstrap");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.appearanceMode).toBe("light");
    expect(parsed.selectedThemeId).toBe("builtin-light");
  });
});
