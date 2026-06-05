// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Unit tests for the renderer-side config store. */
import { describe, it, expect, beforeEach } from "vitest";
import { useConfigStore } from "./config-store";

describe("useConfigStore", () => {
  beforeEach(() => {
    useConfigStore.getState().reset();
  });

  it("starts empty", () => {
    const s = useConfigStore.getState();
    expect(s.config).toBeNull();
    expect(s.status).toBeNull();
    expect(s.error).toBeNull();
  });

  it("setPayload updates config and status", () => {
    const config = {
      version: 1 as const,
      app: { config_name: "x", profile: "p", auto_open_devtools: false, check_for_updates: true },
      secrets: { has_venice_api_key: false, has_jina_api_key: false, keep_plaintext_keys: false },
      theme: { active: "builtin-dark", themes_file: "" },
      models: { chat: "", image: "", video: "", audio: "", music: "", embedding: "", upscale: "" },
      chat: {
        system_prompt: "",
        temperature: 0.7,
        top_p: 1,
        max_tokens: 4096,
        include_venice_system_prompt: false,
        enable_web_search: "off" as const,
        enable_web_scraping: false,
        enable_web_citations: false,
        strip_thinking_response: false,
        disable_thinking: false,
      },
      memory: { enable_memory_retrieval: true, show_pulled_context_before_sending: false },
      research: { default_provider: "venice" as const, enable_jina: false, enable_social_discovery: false },
      characters: { enabled: true, include_adult_characters: false, default_character_slug: "" },
      developer: {
        verbose_config_logging: false,
        allow_config_key_import: true,
        force_import_keys: false,
        force_apply_config: false,
      },
    };
    const status = {
      configPath: "/x",
      themesPath: "/y",
      source: "userdata" as const,
      configName: "x",
      profile: "p",
      loaded: true,
      parseError: null,
      warnings: [],
      hasVeniceApiKey: false,
      hasJinaApiKey: false,
      keysImported: { venice: false, jina: false },
      keysRedacted: { venice: false, jina: false },
      secureStore: { venice: false, jina: false },
      activeTheme: "builtin-dark",
      availableThemes: ["builtin-dark"],
      redactedFields: [],
    };
    useConfigStore.getState().setPayload(config, status);
    const s = useConfigStore.getState();
    expect(s.config).toEqual(config);
    expect(s.status).toEqual(status);
    expect(s.lastLoadedAt).toBeGreaterThan(0);
  });

  it("setError records the error", () => {
    useConfigStore.getState().setError("boom");
    expect(useConfigStore.getState().error).toBe("boom");
  });
});
