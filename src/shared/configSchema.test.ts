import { describe, it, expect } from "vitest";
import { validateAppSettings } from "./configSchema";

const VALID_THEME = {
  id: "my-theme",
  name: "My Theme",
  mode: "dark" as const,
  tokens: {
    "--vf-bg": "#1a1a2e",
    "--vf-text": "rgba(255,255,255,0.9)",
  },
};

describe("validateAppSettings", () => {
  it("drops unrecognized keys and ignores primitives", () => {
    expect(validateAppSettings(null)).toEqual({});
    expect(validateAppSettings("foo")).toEqual({});
    expect(validateAppSettings(["array"])).toEqual({});
    expect(validateAppSettings({ defaultSystemPrompt: "test", foo: "bar" }))
      .toEqual({ defaultSystemPrompt: "test" });
  });

  it("preserves valid boolean fields", () => {
    expect(validateAppSettings({ includeVeniceSystemPrompt: true, webScraping: false }))
      .toEqual({ includeVeniceSystemPrompt: true, webScraping: false });
    
    // drops invalid types
    expect(validateAppSettings({ includeVeniceSystemPrompt: "true", webScraping: 1 }))
      .toEqual({});
  });

  it("preserves valid string and array fields", () => {
    expect(validateAppSettings({ 
      webSearch: "auto", 
      theme: "dark",
      customModels: ["m1", "m2", 123]
    })).toEqual({
      webSearch: "auto",
      theme: "dark",
      customModels: ["m1", "m2"]
    });
  });

  it("handles empty objects", () => {
    expect(validateAppSettings({})).toEqual({});
  });

  describe("customTheme validation", () => {
    it("passes through a structurally valid theme", () => {
      const result = validateAppSettings({ customTheme: VALID_THEME });
      expect(result.customTheme).toEqual(VALID_THEME);
    });

    it("rejects customTheme with missing required fields", () => {
      expect(validateAppSettings({ customTheme: { id: "x", name: "y" } })).toEqual({});
      expect(validateAppSettings({ customTheme: { id: "x", name: "y", mode: "dark" } })).toEqual({});
      expect(validateAppSettings({ customTheme: null })).toEqual({});
    });

    it("rejects customTheme with invalid mode", () => {
      const badMode = { ...VALID_THEME, mode: "blue" };
      expect(validateAppSettings({ customTheme: badMode })).toEqual({});
    });

    it("rejects customTheme with non-string token values", () => {
      const badToken = { ...VALID_THEME, tokens: { "--vf-bg": 12345 } };
      expect(validateAppSettings({ customTheme: badToken })).toEqual({});
    });

    it("rejects customTheme with dangerous CSS token values", () => {
      const injected = { ...VALID_THEME, tokens: { "--vf-bg": "url(javascript:alert(1))" } };
      expect(validateAppSettings({ customTheme: injected })).toEqual({});
    });

    it("rejects customTheme where tokens is not an object", () => {
      const noTokens = { ...VALID_THEME, tokens: "bad" };
      expect(validateAppSettings({ customTheme: noTokens })).toEqual({});
    });
  });
});
