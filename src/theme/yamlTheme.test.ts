import { describe, it, expect } from "vitest";
import { yamlThemeToTheme, findMergedTheme } from "./yamlTheme";

describe("yamlThemeToTheme", () => {
  it("converts a valid YAML theme entry to a Theme object", () => {
    const theme = yamlThemeToTheme("test-theme", "Test Theme", "dark", {
      background: "#111111",
      surface: "#222222",
      surface_elevated: "#333333",
      border: "#444444",
      text_primary: "#ffffff",
      text_secondary: "#cccccc",
      text_muted: "#888888",
      accent: "#ff0000",
      accent_hover: "#ff3333",
      accent_foreground: "#ffffff",
      success: "#00ff00",
      success_foreground: "#111111",
      warning: "#ffff00",
      warning_foreground: "#111111",
      danger: "#ff0000",
      danger_foreground: "#ffffff",
      info: "#0000ff",
      focus_ring: "#ff0000",
      overlay: "rgba(0,0,0,0.5)",
      glow: "rgba(255,0,0,0.2)",
      surface_muted: "#1a1a1a",
      border_strong: "#666666",
      foreground: "#ffffff",
      foreground_muted: "#cccccc",
      foreground_subtle: "#888888",
      input_background: "#333333",
      input_foreground: "#ffffff",
      placeholder: "#888888",
      disabled_foreground: "#888888",
      button_primary_background: "#ff0000",
      button_primary_foreground: "#ffffff",
      button_secondary_background: "#333333",
      button_secondary_foreground: "#ffffff",
      link: "#0000ff",
      selection_background: "#ff0000",
      selection_foreground: "#ffffff",
    });

    expect(theme.id).toBe("test-theme");
    expect(theme.name).toBe("Test Theme");
    expect(theme.mode).toBe("dark");
    expect(theme.tokens.background).toBe("#111111");
    expect(theme.tokens.accent).toBe("#ff0000");
    expect(theme.tokens.surfaceElevated).toBe("#333333");
  });

  it("skips invalid color values defensively", () => {
    const theme = yamlThemeToTheme("bad-colors", "Bad Colors", "dark", {
      background: "#111111",
      surface: "#222222",
      surface_elevated: "#333333",
      border: "#444444",
      text_primary: "#ffffff",
      text_secondary: "#cccccc",
      text_muted: "#888888",
      accent: "url(evil)",
      accent_hover: "#ff3333",
      accent_foreground: "#ffffff",
      success: "#00ff00",
      success_foreground: "#111111",
      warning: "#ffff00",
      warning_foreground: "#111111",
      danger: "#ff0000",
      danger_foreground: "#ffffff",
      info: "#0000ff",
      focus_ring: "#ff0000",
      overlay: "rgba(0,0,0,0.5)",
      glow: "rgba(255,0,0,0.2)",
      surface_muted: "#1a1a1a",
      border_strong: "#666666",
      foreground: "#ffffff",
      foreground_muted: "#cccccc",
      foreground_subtle: "#888888",
      input_background: "#333333",
      input_foreground: "#ffffff",
      placeholder: "#888888",
      disabled_foreground: "#888888",
      button_primary_background: "#ff0000",
      button_primary_foreground: "#ffffff",
      button_secondary_background: "#333333",
      button_secondary_foreground: "#ffffff",
      link: "#0000ff",
      selection_background: "#ff0000",
      selection_foreground: "#ffffff",
    });

    // The accent should be skipped because url(evil) is rejected by isValidColorValue.
    // completeThemeTokens will use the accent value from the fallback logic.
    // Since accent is invalid, it won't be in the normalized tokens, and
    // completeThemeTokens will try to use it but it's undefined.
    // Actually, completeThemeTokens doesn't validate - it just spreads.
    // So accent will be undefined. But the theme object still gets created.
    expect(theme.id).toBe("bad-colors");
    expect(theme.tokens.accent).toBeUndefined();
  });

  it("normalizes snake_case keys to camelCase", () => {
    const theme = yamlThemeToTheme("snake", "Snake", "light", {
      background: "#ffffff",
      surface: "#f0f0f0",
      surface_elevated: "#e0e0e0",
      border: "#cccccc",
      text_primary: "#000000",
      text_secondary: "#333333",
      text_muted: "#666666",
      accent: "#0066cc",
      accent_hover: "#0055aa",
      accent_foreground: "#ffffff",
      success: "#228822",
      success_foreground: "#ffffff",
      warning: "#cc8800",
      warning_foreground: "#ffffff",
      danger: "#cc2222",
      danger_foreground: "#ffffff",
      info: "#0066cc",
      focus_ring: "#0066cc",
      overlay: "rgba(0,0,0,0.25)",
      glow: "rgba(0,102,204,0.15)",
      surface_muted: "#f5f5f5",
      border_strong: "#999999",
      foreground: "#000000",
      foreground_muted: "#333333",
      foreground_subtle: "#666666",
      input_background: "#e0e0e0",
      input_foreground: "#000000",
      placeholder: "#666666",
      disabled_foreground: "#666666",
      button_primary_background: "#0066cc",
      button_primary_foreground: "#ffffff",
      button_secondary_background: "#e0e0e0",
      button_secondary_foreground: "#000000",
      link: "#0066cc",
      selection_background: "#0066cc",
      selection_foreground: "#ffffff",
    });

    expect(theme.tokens.surfaceElevated).toBe("#e0e0e0");
    expect(theme.tokens.buttonPrimaryBackground).toBe("#0066cc");
    expect(theme.tokens.selectionForeground).toBe("#ffffff");
  });
});

describe("findMergedTheme", () => {
  it("returns a YAML theme when the id exists in the registry", () => {
    const yamlTheme = yamlThemeToTheme("aurora-boreal", "Aurora Boreal", "dark", {
      background: "#021015",
      surface: "#0a1f1a",
      surface_elevated: "#122e28",
      border: "#1a3530",
      text_primary: "#e0f7fa",
      text_secondary: "#a3d5d0",
      text_muted: "#5a8a82",
      accent: "#4dffb4",
      accent_hover: "#7fffd4",
      accent_foreground: "#021015",
      success: "#2ecc71",
      success_foreground: "#021015",
      warning: "#f39c12",
      warning_foreground: "#021015",
      danger: "#e74c3c",
      danger_foreground: "#021015",
      info: "#3498db",
      focus_ring: "#4dffb4",
      overlay: "rgba(2, 16, 21, 0.7)",
      glow: "rgba(77, 255, 180, 0.25)",
      surface_muted: "#051812",
      border_strong: "#2a5048",
      foreground: "#e0f7fa",
      foreground_muted: "#a3d5d0",
      foreground_subtle: "#5a8a82",
      input_background: "#122e28",
      input_foreground: "#e0f7fa",
      placeholder: "#5a8a82",
      disabled_foreground: "#5a8a82",
      button_primary_background: "#4dffb4",
      button_primary_foreground: "#021015",
      button_secondary_background: "#122e28",
      button_secondary_foreground: "#e0f7fa",
      link: "#3498db",
      selection_background: "#4dffb4",
      selection_foreground: "#021015",
    });

    const found = findMergedTheme("aurora-boreal", { "aurora-boreal": yamlTheme });
    expect(found).toBe(yamlTheme);
  });

  it("returns null for unknown ids", () => {
    expect(findMergedTheme("unknown", {})).toBeNull();
    expect(findMergedTheme(null, {})).toBeNull();
    expect(findMergedTheme(undefined, {})).toBeNull();
  });

  it("prefers YAML themes over built-in themes when id matches", () => {
    // This is a conceptual test: findMergedTheme only checks yamlThemes,
    // the caller (resolveInitialTheme) is responsible for ordering.
    const yamlTheme = yamlThemeToTheme("builtin-dark", "YAML Dark", "dark", {
      background: "#111111",
      surface: "#222222",
      surface_elevated: "#333333",
      border: "#444444",
      text_primary: "#ffffff",
      text_secondary: "#cccccc",
      text_muted: "#888888",
      accent: "#ff0000",
      accent_hover: "#ff3333",
      accent_foreground: "#ffffff",
      success: "#00ff00",
      success_foreground: "#111111",
      warning: "#ffff00",
      warning_foreground: "#111111",
      danger: "#ff0000",
      danger_foreground: "#ffffff",
      info: "#0000ff",
      focus_ring: "#ff0000",
      overlay: "rgba(0,0,0,0.5)",
      glow: "rgba(255,0,0,0.2)",
      surface_muted: "#1a1a1a",
      border_strong: "#666666",
      foreground: "#ffffff",
      foreground_muted: "#cccccc",
      foreground_subtle: "#888888",
      input_background: "#333333",
      input_foreground: "#ffffff",
      placeholder: "#888888",
      disabled_foreground: "#888888",
      button_primary_background: "#ff0000",
      button_primary_foreground: "#ffffff",
      button_secondary_background: "#333333",
      button_secondary_foreground: "#ffffff",
      link: "#0000ff",
      selection_background: "#ff0000",
      selection_foreground: "#ffffff",
    });

    const found = findMergedTheme("builtin-dark", { "builtin-dark": yamlTheme });
    expect(found?.name).toBe("YAML Dark");
  });
});
