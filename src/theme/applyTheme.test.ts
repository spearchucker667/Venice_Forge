import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyTheme, resolveInitialTheme, legacyThemeToFamily, isValidPersistedTheme } from "./applyTheme";
import { BUILTIN_VENICE, BUILTIN_DARK, BUILTIN_LIGHT, BUILTIN_COPPER } from "./themes";
import { resolveTheme } from "./resolver";
import type { Theme } from "./themeTypes";

function resolved(family: typeof BUILTIN_DARK, mode: "dark" | "light" = "dark") {
  return resolveTheme(family, mode);
}

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
    const theme = resolved(BUILTIN_DARK, "dark");
    applyTheme(theme);
    expect(setPropertySpy).toHaveBeenCalledWith("--bg", theme.tokens.background);
    expect(setPropertySpy).toHaveBeenCalledWith("--text-primary", theme.tokens.textPrimary);
    expect(setPropertySpy).toHaveBeenCalledWith("--accent", theme.tokens.accent);
    expect(setPropertySpy).toHaveBeenCalledWith("--glow", theme.tokens.glow);
    expect(setPropertySpy).toHaveBeenCalledWith("--surface-muted", theme.tokens.surfaceMuted);
    expect(setPropertySpy).toHaveBeenCalledWith("--foreground", theme.tokens.foreground);
    expect(setPropertySpy).toHaveBeenCalledWith("--input-bg", theme.tokens.inputBackground);
    expect(setPropertySpy).toHaveBeenCalledWith("--button-primary-fg", theme.tokens.buttonPrimaryForeground);
    expect(setPropertySpy).toHaveBeenCalledWith("--selection-fg", theme.tokens.selectionForeground);
    expect(setPropertySpy).toHaveBeenCalledWith("--app-mesh-opacity", "0.12");

    // Code surface variables
    expect(setPropertySpy).toHaveBeenCalledWith("--code-bg", theme.code.tokens.background);
    expect(setPropertySpy).toHaveBeenCalledWith("--code-fg", theme.code.tokens.foreground);
    expect(setPropertySpy).toHaveBeenCalledWith("--code-border", theme.code.tokens.border);
    expect(setPropertySpy).toHaveBeenCalledWith("--code-header-bg", theme.code.tokens.headerBackground);
    expect(setPropertySpy).toHaveBeenCalledWith("--code-header-fg", theme.code.tokens.headerForeground);
    expect(setPropertySpy).toHaveBeenCalledWith("--code-inline-bg", theme.code.tokens.inlineBackground);
    expect(setPropertySpy).toHaveBeenCalledWith("--code-inline-fg", theme.code.tokens.inlineForeground);
    expect(setPropertySpy).toHaveBeenCalledWith("--code-selection-bg", theme.code.tokens.selectionBackground);

    // Syntax token variables
    expect(setPropertySpy).toHaveBeenCalledWith("--syntax-keyword", theme.code.tokens.keyword);
    expect(setPropertySpy).toHaveBeenCalledWith("--syntax-string", theme.code.tokens.string);
    expect(setPropertySpy).toHaveBeenCalledWith("--syntax-function", theme.code.tokens.function);
    expect(setPropertySpy).toHaveBeenCalledWith("--syntax-comment", theme.code.tokens.comment);

    expect(setPropertySpy).toHaveBeenCalledTimes(70);
  });

  it("sets data-theme-mode attribute", () => {
    applyTheme(resolved(BUILTIN_LIGHT, "light"));
    expect(document.documentElement.dataset.themeMode).toBe("light");
  });

  it("overwrites previous theme tokens when called again", () => {
    applyTheme(resolved(BUILTIN_DARK, "dark"));
    applyTheme(resolved(BUILTIN_LIGHT, "light"));
    expect(setPropertySpy).toHaveBeenCalledWith("--bg", BUILTIN_LIGHT.variants.light.tokens.background);
    expect(document.documentElement.dataset.themeMode).toBe("light");
  });

  // Theme subscribers receive one synchronous completion event.
  it("dispatches applyTheme:complete on window with mode + themeId detail", () => {
    const listener = vi.fn();
    window.addEventListener("applyTheme:complete", listener as EventListener);
    try {
      const theme = resolved(BUILTIN_DARK, "dark");
      applyTheme(theme);
      expect(listener).toHaveBeenCalledTimes(1);
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toEqual({ mode: "dark", themeId: BUILTIN_DARK.id });
    } finally {
      window.removeEventListener("applyTheme:complete", listener as EventListener);
    }
  });
});

describe("isValidPersistedTheme", () => {
  function persistedTheme(name: string): Theme {
    return { ...resolved(BUILTIN_DARK, "dark"), id: "custom", name };
  }

  it("accepts a well-formed persisted theme", () => {
    expect(isValidPersistedTheme(persistedTheme("My Theme"))).toBe(true);
  });

  it("rejects empty and whitespace-only names", () => {
    expect(isValidPersistedTheme(persistedTheme(""))).toBe(false);
    expect(isValidPersistedTheme(persistedTheme("   "))).toBe(false);
    expect(isValidPersistedTheme(persistedTheme("\t\n "))).toBe(false);
  });

  it("keeps the 200-character name cap", () => {
    expect(isValidPersistedTheme(persistedTheme("a".repeat(200)))).toBe(true);
    expect(isValidPersistedTheme(persistedTheme("a".repeat(201)))).toBe(false);
  });

  it("rejects non-object and structurally invalid values", () => {
    expect(isValidPersistedTheme(null)).toBe(false);
    expect(isValidPersistedTheme("theme")).toBe(false);
    expect(isValidPersistedTheme({ ...persistedTheme("X"), mode: "system" })).toBe(false);
  });
});

describe("resolveInitialTheme", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("returns custom theme when selectedThemeId is 'custom' and customTheme is provided", () => {
    const custom: Theme = {
      ...resolved(BUILTIN_DARK, "dark"),
      id: "custom",
      name: "My Theme",
    };
    const result = resolveInitialTheme({ selectedThemeId: "custom", customTheme: custom });
    expect(result.id).toBe("custom");
  });

  it("rejects persisted custom themes with unsafe token values", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const custom: Theme = {
      ...resolved(BUILTIN_DARK, "dark"),
      id: "custom",
      tokens: { ...resolved(BUILTIN_DARK, "dark").tokens, accent: "url(javascript:alert(1))" },
    };
    const result = resolveInitialTheme({ selectedThemeId: "custom", customTheme: custom });
    expect(result.id).toBe(BUILTIN_VENICE.id);
  });

  it("returns the light family when selectedThemeId is 'builtin-light'", () => {
    const result = resolveInitialTheme({ selectedThemeId: "builtin-light" });
    expect(result.id).toBe(BUILTIN_LIGHT.id);
    expect(result.mode).toBe("light");
  });

  it("returns the copper family when selectedThemeId is 'builtin-copper'", () => {
    const result = resolveInitialTheme({ selectedThemeId: "builtin-copper" });
    expect(result.id).toBe(BUILTIN_COPPER.id);
  });

  it("returns the dark family when selectedThemeId is 'builtin-dark'", () => {
    const result = resolveInitialTheme({ selectedThemeId: "builtin-dark" });
    expect(result.id).toBe(BUILTIN_DARK.id);
    expect(result.mode).toBe("dark");
  });

  it("falls back to BUILTIN_VENICE when prefers-color-scheme is dark", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const result = resolveInitialTheme({});
    expect(result.id).toBe(BUILTIN_VENICE.id);
    expect(result.mode).toBe("dark");
  });

  it("falls back to BUILTIN_LIGHT when prefers-color-scheme is light", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    const result = resolveInitialTheme({});
    expect(result.id).toBe(BUILTIN_LIGHT.id);
    expect(result.mode).toBe("light");
  });

  it("returns BUILTIN_VENICE when no bootstrap is provided and prefers-color-scheme is dark", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const result = resolveInitialTheme();
    expect(result.id).toBe(BUILTIN_VENICE.id);
    expect(result.mode).toBe("dark");
  });

  it("returns a YAML theme family when the id matches a merged theme", () => {
    const yamlFamily = legacyThemeToFamily({
      ...resolved(BUILTIN_DARK, "dark"),
      id: "aurora-boreal",
      name: "Aurora Boreal",
    });
    const result = resolveInitialTheme({ selectedThemeId: "aurora-boreal" }, { "aurora-boreal": yamlFamily });
    expect(result.id).toBe("aurora-boreal");
    expect(result.name).toBe("Aurora Boreal");
  });

  it("prefers YAML themes over built-in themes when id collides", () => {
    const yamlFamily = legacyThemeToFamily({
      ...resolved(BUILTIN_DARK, "dark"),
      id: "builtin-dark",
      name: "YAML Override",
    });
    const result = resolveInitialTheme({ selectedThemeId: "builtin-dark" }, { "builtin-dark": yamlFamily });
    expect(result.name).toBe("YAML Override");
  });

  it("falls back to built-in when YAML theme is not found", () => {
    const result = resolveInitialTheme({ selectedThemeId: "builtin-dark" }, {});
    expect(result.id).toBe(BUILTIN_DARK.id);
    expect(result.mode).toBe("dark");
  });

  it("recovers to the default family when the selectedThemeId is fully bogus", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const result = resolveInitialTheme({ selectedThemeId: "no-such-theme-at-all" });
    expect(result.id).toBe(BUILTIN_VENICE.id);
    expect(result.mode).toBe("dark");
  });

  it("recovers to the light family when a bogus id is selected under light appearance", () => {
    const result = resolveInitialTheme({ selectedThemeId: "no-such-theme-at-all", appearanceMode: "light" });
    expect(result.id).toBe(BUILTIN_LIGHT.id);
    expect(result.mode).toBe("light");
  });

  it("treats a garbage appearanceMode as system", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    const result = resolveInitialTheme(
      { selectedThemeId: "no-such-theme-at-all", appearanceMode: "garbage-mode" as never },
    );
    // migrateAppearanceMode coerces unknown values to "system", and the
    // effective mode then follows the OS preference (mocked light here).
    expect(result.id).toBe(BUILTIN_LIGHT.id);
    expect(result.mode).toBe("light");
  });
});


it('prefers both persisted family variants over the legacy single-mode projection', () => {
  const family = { ...BUILTIN_VENICE, id: 'authored-pair' };
  const legacy = { ...resolveTheme(family, 'dark') };
  const restored = resolveInitialTheme({ selectedThemeId: family.id, appearanceMode: 'light', customThemes: [legacy] }, { [family.id]: family });
  expect(restored.tokens).toEqual(resolveTheme(family, 'light').tokens);
});
