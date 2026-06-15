// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Unit tests for the renderer-side config store. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useConfigStore, refreshConfig, reloadConfig } from "./config-store";

const setLocalFamilySafeModeEnabledMock = vi.fn();
const setVeniceApiSafeModeMock = vi.fn();

const desktopConfigGetMock = vi.fn();
const desktopConfigReloadMock = vi.fn();

vi.mock("../services/desktopBridge", async () => {
  const actual = await vi.importActual<typeof import("../services/desktopBridge")>("../services/desktopBridge");
  return {
    ...actual,
    isElectron: () => true,
    desktopConfig: {
      get: (...args: unknown[]) => desktopConfigGetMock(...args),
      reload: (...args: unknown[]) => desktopConfigReloadMock(...args),
    },
  };
});

vi.mock("./settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      setLocalFamilySafeModeEnabled: setLocalFamilySafeModeEnabledMock,
      setVeniceApiSafeMode: setVeniceApiSafeModeMock,
    }),
  },
}));

describe("useConfigStore", () => {
  beforeEach(() => {
    useConfigStore.getState().reset();
    vi.clearAllMocks();
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
      safety: { local_family_safe_mode_enabled: true, venice_api_safe_mode: true },
      developer: {
        verbose_config_logging: false,
        allow_config_key_import: true,
        force_import_keys: false,
        force_apply_config: false,
      },
      internal_prompt_enhancer: {
        enabled: true,
        model: "venice-uncensored-1-2",
        temperature: 0.4,
        maxTokens: 350,
        systemPrompt: "",
        remixSystemPrompt: "",
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

describe("refreshConfig", () => {
  beforeEach(() => {
    useConfigStore.getState().reset();
    vi.clearAllMocks();
  });

  it("loads config through desktopConfig and applies safety settings", async () => {
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
      safety: { local_family_safe_mode_enabled: false, venice_api_safe_mode: false },
      developer: {
        verbose_config_logging: false,
        allow_config_key_import: true,
        force_import_keys: false,
        force_apply_config: false,
      },
      internal_prompt_enhancer: {
        enabled: true,
        model: "venice-uncensored-1-2",
        temperature: 0.4,
        maxTokens: 350,
        systemPrompt: "",
        remixSystemPrompt: "",
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

    desktopConfigGetMock.mockResolvedValue({ ok: true, payload: { config, status } });

    await refreshConfig();

    expect(desktopConfigGetMock).toHaveBeenCalled();
    expect(useConfigStore.getState().config).toEqual(config);
    expect(useConfigStore.getState().status).toEqual(status);
    expect(setLocalFamilySafeModeEnabledMock).toHaveBeenCalledWith(false);
    expect(setVeniceApiSafeModeMock).toHaveBeenCalledWith(false);
  });

  it("records an error when desktopConfig.get fails", async () => {
    desktopConfigGetMock.mockResolvedValue({ ok: false, error: "config unreadable" });

    await refreshConfig();

    expect(useConfigStore.getState().error).toBe("config unreadable");
  });

  it("redacts raw exception messages when desktopConfig.get throws", async () => {
    desktopConfigGetMock.mockRejectedValue(
      new Error("config load failed: vn-deadbeef123456789 exposed")
    );

    await refreshConfig();

    const error = useConfigStore.getState().error;
    expect(error).not.toContain("vn-deadbeef123456789");
    expect(error).toContain("[REDACTED]");
  });
});

describe("reloadConfig", () => {
  beforeEach(() => {
    useConfigStore.getState().reset();
    vi.clearAllMocks();
  });

  it("reloads and fetches config through desktopConfig", async () => {
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
      safety: { local_family_safe_mode_enabled: true, venice_api_safe_mode: true },
      developer: {
        verbose_config_logging: false,
        allow_config_key_import: true,
        force_import_keys: false,
        force_apply_config: false,
      },
      internal_prompt_enhancer: {
        enabled: true,
        model: "venice-uncensored-1-2",
        temperature: 0.4,
        maxTokens: 350,
        systemPrompt: "",
        remixSystemPrompt: "",
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

    desktopConfigReloadMock.mockResolvedValue({ ok: true });
    desktopConfigGetMock.mockResolvedValue({ ok: true, payload: { config, status } });

    await reloadConfig();

    expect(desktopConfigReloadMock).toHaveBeenCalled();
    expect(desktopConfigGetMock).toHaveBeenCalled();
    expect(useConfigStore.getState().config).toEqual(config);
  });

  it("records an error when desktopConfig.reload fails", async () => {
    desktopConfigReloadMock.mockResolvedValue({ ok: false, error: "reload failed" });

    await reloadConfig();

    expect(useConfigStore.getState().error).toBe("reload failed");
  });

  it("redacts raw exception messages when desktopConfig.reload throws", async () => {
    desktopConfigReloadMock.mockRejectedValue(
      new Error("reload crashed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 token leaked")
    );

    await reloadConfig();

    const error = useConfigStore.getState().error;
    expect(error).not.toContain("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(error).toContain("[REDACTED]");
  });
});
