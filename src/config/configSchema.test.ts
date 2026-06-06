// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Unit tests for the YAML config schema validation. */
import { describe, it, expect } from "vitest";
import {
  CONFIG_SCHEMA_VERSION,
  emptyConfig,
  PROVIDER_CAPABILITIES,
  REQUIRED_THEME_TOKEN_KEYS,
  sanitizeConfig,
  validateConfig,
  validateThemesFile,
  capabilitiesFor,
} from "./configSchema";

describe("configSchema", () => {
  describe("validateConfig", () => {
    it("returns defaults when the input is not an object", () => {
      const result = validateConfig(null);
      expect(result.config.version).toBe(CONFIG_SCHEMA_VERSION);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("returns defaults for a minimal valid config", () => {
      const result = validateConfig({ version: 1 });
      expect(result.config.version).toBe(1);
      expect(result.config.app.config_name).toBe("local-dev");
      expect(result.config.chat.temperature).toBe(0.7);
    });

    it("clamps temperature into [0, 2]", () => {
      const result = validateConfig({ version: 1, chat: { temperature: 5 } });
      expect(result.config.chat.temperature).toBe(2);
    });

    it("clamps temperature below 0 to 0", () => {
      const result = validateConfig({ version: 1, chat: { temperature: -1 } });
      expect(result.config.chat.temperature).toBe(0);
    });

    it("clamps top_p into [0, 1]", () => {
      const result = validateConfig({ version: 1, chat: { top_p: 99 } });
      expect(result.config.chat.top_p).toBe(1);
    });

    it("clamps max_tokens to [1, 200000]", () => {
      const result = validateConfig({ version: 1, chat: { max_tokens: 1_000_000 } });
      expect(result.config.chat.max_tokens).toBe(200000);
    });

    it("falls back to off for invalid enable_web_search", () => {
      const result = validateConfig({ version: 1, chat: { enable_web_search: "bogus" } });
      expect(result.config.chat.enable_web_search).toBe("off");
    });

    it("accepts off, on, auto for enable_web_search", () => {
      for (const v of ["off", "on", "auto"] as const) {
        const result = validateConfig({ version: 1, chat: { enable_web_search: v } });
        expect(result.config.chat.enable_web_search).toBe(v);
      }
    });

    it("falls back to venice for invalid research.default_provider", () => {
      const result = validateConfig({ version: 1, research: { default_provider: "invalid" } });
      expect(result.config.research.default_provider).toBe("venice");
    });

    it("rejects URL paths", () => {
      const result = validateConfig({ version: 1, theme: { themes_file: "https://evil.example.com/x.yaml" } });
      expect(result.config.theme.themes_file).toBe("");
      expect(result.warnings.some((w) => w.field === "theme.themes_file" && w.severity === "error")).toBe(true);
    });

    it("rejects control characters in paths", () => {
      const result = validateConfig({ version: 1, theme: { themes_file: "a\nb" } });
      expect(result.config.theme.themes_file).toBe("");
      expect(result.warnings.some((w) => w.field === "theme.themes_file" && w.severity === "error")).toBe(true);
    });

    it("clamps an oversized API key to empty and records the redaction", () => {
      const huge = "x".repeat(600);
      const result = validateConfig({ version: 1, secrets: { venice_api_key: huge } });
      expect(result.config.secrets.venice_api_key).toBe("");
      expect(result.redactedFields).toContain("secrets.venice_api_key");
    });

    it("preserves a non-empty valid key", () => {
      const result = validateConfig({ version: 1, secrets: { venice_api_key: "abc-123" } });
      expect(result.config.secrets.venice_api_key).toBe("abc-123");
      expect(result.redactedFields).not.toContain("secrets.venice_api_key");
    });

    it("truncates an oversized system_prompt", () => {
      const long = "a".repeat(40000);
      const result = validateConfig({ version: 1, chat: { system_prompt: long } });
      expect(result.config.chat.system_prompt.length).toBeLessThanOrEqual(32768);
    });

    it("falls back to a valid default for unknown version", () => {
      const result = validateConfig({ version: 999 });
      expect(result.warnings.some((w) => w.field === "version" && w.severity === "error")).toBe(true);
    });

    it("treats string 'yes' as not-true for booleans", () => {
      const result = validateConfig({ version: 1, memory: { enable_memory_retrieval: "yes" as unknown as boolean } });
      expect(result.config.memory.enable_memory_retrieval).toBe(true); // default
    });
  });

  describe("sanitizeConfig", () => {
    it("strips API keys and replaces with booleans", () => {
      const cfg = emptyConfig();
      cfg.secrets.venice_api_key = "secret-1";
      cfg.secrets.jina_api_key = "secret-2";
      const sanitized = sanitizeConfig(cfg);
      expect(sanitized.secrets.has_venice_api_key).toBe(true);
      expect(sanitized.secrets.has_jina_api_key).toBe(true);
      // No raw key in the sanitized view.
      const serialized = JSON.stringify(sanitized);
      expect(serialized).not.toContain("secret-1");
      expect(serialized).not.toContain("secret-2");
    });
  });

  describe("validateThemesFile", () => {
    it("rejects themes without a valid version", () => {
      const result = validateThemesFile({ themes: {} });
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("skips invalid theme entries with a warning", () => {
      const result = validateThemesFile({
        version: 1,
        themes: { foo: { display_name: "Foo", mode: "sideways", tokens: {} } },
      });
      expect(result.themes).toEqual({});
      expect(result.warnings.some((w) => w.field === "themes.foo.mode")).toBe(true);
    });

    it("skips themes with invalid color values", () => {
      const tokens: Record<string, string> = { background: "not-a-color" };
      for (const k of REQUIRED_THEME_TOKEN_KEYS) {
        if (k !== "background") tokens[k] = "#000000";
      }
      const result = validateThemesFile({
        version: 1,
        themes: { foo: { display_name: "Foo", mode: "dark", tokens } },
      });
      expect(result.themes).toEqual({});
    });

    it("accepts a valid theme", () => {
      const tokens: Record<string, string> = {};
      for (const k of REQUIRED_THEME_TOKEN_KEYS) tokens[k] = "#123456";
      const result = validateThemesFile({
        version: 1,
        themes: { foo: { display_name: "Foo", mode: "dark", tokens } },
      });
      expect(result.themes.foo?.display_name).toBe("Foo");
      expect(result.warnings).toEqual([]);
    });
  });

  // BUG-006 regression guard: provider abstraction. The new env /
  // YAML fields and the capability matrix must be additive — every
  // legacy Venice code path must still work without modification.
  describe("provider abstraction (BUG-006)", () => {
    it("defaults the LLM provider to venice when missing", () => {
      const result = validateConfig({ version: 1 });
      expect(result.config.research.llm_provider).toBe("venice");
    });

    it("accepts the minimax LLM provider", () => {
      const result = validateConfig({ version: 1, research: { llm_provider: "minimax" } });
      expect(result.config.research.llm_provider).toBe("minimax");
    });

    it("falls back to venice for an unknown LLM provider", () => {
      const result = validateConfig({ version: 1, research: { llm_provider: "anthropic" } });
      expect(result.config.research.llm_provider).toBe("venice");
    });

    it("does not leak the minimax API key through the sanitized view", () => {
      const cfg = emptyConfig();
      cfg.secrets.minimax_api_key = "minimax-secret-xyz";
      cfg.secrets.venice_api_key = "venice-secret-1";
      cfg.secrets.jina_api_key = "jina-secret-1";
      const sanitized = sanitizeConfig(cfg);
      expect(sanitized.secrets.has_minimax_api_key).toBe(true);
      const serialized = JSON.stringify(sanitized);
      expect(serialized).not.toContain("minimax-secret-xyz");
      expect(serialized).not.toContain("venice-secret-1");
      expect(serialized).not.toContain("jina-secret-1");
    });

    it("exposes a per-provider capability matrix", () => {
      expect(PROVIDER_CAPABILITIES.venice.chat).toBe(true);
      expect(PROVIDER_CAPABILITIES.venice.openAiStyleStreaming).toBe(true);
      // MiniMax is a future target; every non-chat capability is
      // explicitly disabled so the renderer can hide controls.
      expect(PROVIDER_CAPABILITIES.minimax.chat).toBe(false);
      expect(PROVIDER_CAPABILITIES.minimax.imageGenerate).toBe(false);
      expect(PROVIDER_CAPABILITIES.minimax.openAiStyleStreaming).toBe(false);
    });

    it("falls back to Venice capabilities for unknown provider ids", () => {
      expect(capabilitiesFor("unknown").chat).toBe(true);
      expect(capabilitiesFor(undefined)?.chat).toBe(true);
      expect(capabilitiesFor(null)?.chat).toBe(true);
    });
  });
});
