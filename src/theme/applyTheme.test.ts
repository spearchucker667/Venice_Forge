import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyTheme, resolveInitialTheme } from "./applyTheme";
import { BUILTIN_VENICE, BUILTIN_DARK, BUILTIN_LIGHT, BUILTIN_COPPER } from "./themes";

describe("applyTheme", () => {
  let setPropertySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setPropertySpy = vi.spyOn(document.documentElement.style, "setProperty").mockImplementation(() => {});
  });

  afterEach(() => {
    setPropertySpy.mockRestore();
    delete document.documentElement.dataset.themeMode;
  });

  it("sets the complete semantic CSS variable contract on document.documentElement", () => {
    applyTheme(BUILTIN_DARK);
    expect(setPropertySpy).toHaveBeenCalledWith("--bg", BUILTIN_DARK.tokens.background);
    expect(setPropertySpy).toHaveBeenCalledWith("--text-primary", BUILTIN_DARK.tokens.textPrimary);
    expect(setPropertySpy).toHaveBeenCalledWith("--accent", BUILTIN_DARK.tokens.accent);
    expect(setPropertySpy).toHaveBeenCalledWith("--glow", BUILTIN_DARK.tokens.glow);
    expect(setPropertySpy).toHaveBeenCalledWith("--surface-muted", BUILTIN_DARK.tokens.surfaceMuted);
    expect(setPropertySpy).toHaveBeenCalledWith("--foreground", BUILTIN_DARK.tokens.foreground);
    expect(setPropertySpy).toHaveBeenCalledWith("--input-bg", BUILTIN_DARK.tokens.inputBackground);
    expect(setPropertySpy).toHaveBeenCalledWith("--button-primary-fg", BUILTIN_DARK.tokens.buttonPrimaryForeground);
    expect(setPropertySpy).toHaveBeenCalledWith("--selection-fg", BUILTIN_DARK.tokens.selectionForeground);
    expect(setPropertySpy).toHaveBeenCalledWith("--app-mesh-opacity", "0.12");
    expect(setPropertySpy).toHaveBeenCalledTimes(37);
  });

  it("sets data-theme-mode attribute", () => {
    applyTheme(BUILTIN_LIGHT);
    expect(document.documentElement.dataset.themeMode).toBe("light");
  });

  it("overwrites previous theme tokens when called again", () => {
    applyTheme(BUILTIN_DARK);
    applyTheme(BUILTIN_LIGHT);
    expect(setPropertySpy).toHaveBeenCalledWith("--bg", BUILTIN_LIGHT.tokens.background);
    expect(document.documentElement.dataset.themeMode).toBe("light");
  });
});

describe("resolveInitialTheme", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("returns custom theme when selectedThemeId is 'custom' and customTheme is provided", () => {
    const custom = { ...BUILTIN_DARK, id: "custom", name: "My Theme" };
    const result = resolveInitialTheme({ selectedThemeId: "custom", customTheme: custom });
    expect(result.id).toBe("custom");
  });

  it("rejects persisted custom themes with unsafe token values", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const custom = {
      ...BUILTIN_DARK,
      id: "custom",
      tokens: { ...BUILTIN_DARK.tokens, accent: "url(javascript:alert(1))" },
    };
    expect(resolveInitialTheme({ selectedThemeId: "custom", customTheme: custom })).toBe(BUILTIN_VENICE);
  });

  it("returns BUILTIN_LIGHT when selectedThemeId is 'builtin-light'", () => {
    expect(resolveInitialTheme({ selectedThemeId: "builtin-light" })).toBe(BUILTIN_LIGHT);
  });

  it("returns BUILTIN_COPPER when selectedThemeId is 'builtin-copper'", () => {
    expect(resolveInitialTheme({ selectedThemeId: "builtin-copper" })).toBe(BUILTIN_COPPER);
  });

  it("returns BUILTIN_DARK when selectedThemeId is 'builtin-dark'", () => {
    expect(resolveInitialTheme({ selectedThemeId: "builtin-dark" })).toBe(BUILTIN_DARK);
  });

  it("falls back to BUILTIN_VENICE when prefers-color-scheme is dark", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(resolveInitialTheme({})).toBe(BUILTIN_VENICE);
  });

  it("falls back to BUILTIN_LIGHT when prefers-color-scheme is light", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(resolveInitialTheme({})).toBe(BUILTIN_LIGHT);
  });

  it("returns BUILTIN_VENICE when no bootstrap is provided and prefers-color-scheme is dark", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(resolveInitialTheme()).toBe(BUILTIN_VENICE);
  });

  it("returns a YAML theme when the id matches a merged theme", () => {
    const yamlTheme = { ...BUILTIN_DARK, id: "aurora-boreal", name: "Aurora Boreal" };
    const result = resolveInitialTheme({ selectedThemeId: "aurora-boreal" }, { "aurora-boreal": yamlTheme });
    expect(result.id).toBe("aurora-boreal");
    expect(result.name).toBe("Aurora Boreal");
  });

  it("prefers YAML themes over built-in themes when id collides", () => {
    const yamlTheme = { ...BUILTIN_DARK, id: "builtin-dark", name: "YAML Override" };
    const result = resolveInitialTheme({ selectedThemeId: "builtin-dark" }, { "builtin-dark": yamlTheme });
    expect(result.name).toBe("YAML Override");
  });

  it("falls back to built-in when YAML theme is not found", () => {
    const result = resolveInitialTheme({ selectedThemeId: "builtin-dark" }, {});
    expect(result).toBe(BUILTIN_DARK);
  });
});
