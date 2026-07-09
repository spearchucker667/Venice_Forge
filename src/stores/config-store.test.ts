// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Unit tests for the renderer-side config store. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useConfigStore, refreshConfig, reloadConfig } from "./config-store";

const setLocalFamilySafeModeEnabledMock = vi.fn();
const setVeniceApiSafeModeMock = vi.fn();

const desktopConfigGetMock = vi.fn();
const desktopConfigReloadMock = vi.fn();
const desktopConfigLoadMergedThemesMock = vi.fn();

vi.mock("../services/desktopBridge", async () => {
  const actual = await vi.importActual<typeof import("../services/desktopBridge")>("../services/desktopBridge");
  return {
    ...actual,
    isElectron: () => true,
    desktopConfig: {
      get: (...args: unknown[]) => desktopConfigGetMock(...args),
      reload: (...args: unknown[]) => desktopConfigReloadMock(...args),
      loadMergedThemes: (...args: unknown[]) => desktopConfigLoadMergedThemesMock(...args),
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

function buildConfigFixture() {
  return {
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
    research: {
      default_provider: "venice" as const,
      enable_jina: false,
      enable_social_discovery: false,
      enable_live_browser: false,
      live_browser_search_provider: "google" as const,
      live_browser_persist_session: false,
      live_browser_javascript_enabled: false,
      live_browser_allow_external_open: false,
      max_browser_extract_chars: 40_000,
    },
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
}

function buildStatusFixture() {
  return {
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
}

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
    const config = buildConfigFixture();
    const status = buildStatusFixture();
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
      research: {
        default_provider: "venice" as const,
        enable_jina: false,
        enable_social_discovery: false,
        enable_live_browser: false,
        live_browser_search_provider: "google" as const,
        live_browser_persist_session: false,
        live_browser_javascript_enabled: false,
        live_browser_allow_external_open: false,
        max_browser_extract_chars: 40_000,
      },
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
    desktopConfigLoadMergedThemesMock.mockResolvedValue({
      ok: true,
      themes: {
        "aurora-boreal": {
          display_name: "Aurora Boreal",
          mode: "dark",
          tokens: {
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
            overlay: "rgba(2,16,21,0.7)",
            glow: "rgba(77,255,180,0.25)",
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
          },
        },
      },
    });

    await refreshConfig();

    expect(desktopConfigGetMock).toHaveBeenCalled();
    expect(useConfigStore.getState().config).toEqual(config);
    expect(useConfigStore.getState().status).toEqual(status);
    expect(setLocalFamilySafeModeEnabledMock).toHaveBeenCalledWith(false);
    expect(setVeniceApiSafeModeMock).toHaveBeenCalledWith(false);
    expect(useConfigStore.getState().yamlThemes["aurora-boreal"]).toBeDefined();
    expect(useConfigStore.getState().yamlThemes["aurora-boreal"].name).toBe("Aurora Boreal");
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
    const config = buildConfigFixture();
    const status = buildStatusFixture();

    desktopConfigReloadMock.mockResolvedValue({ ok: true });
    desktopConfigGetMock.mockResolvedValue({ ok: true, payload: { config, status } });
    desktopConfigLoadMergedThemesMock.mockResolvedValue({
      ok: true,
      themes: {
        "sakura-terminal": {
          display_name: "Sakura Terminal",
          mode: "dark",
          tokens: {
            background: "#1a1218",
            surface: "#2a2028",
            surface_elevated: "#3a3038",
            border: "#4a3a48",
            text_primary: "#ffe4ec",
            text_secondary: "#d4b0c0",
            text_muted: "#9a7a8a",
            accent: "#ff8fa3",
            accent_hover: "#ffb3c1",
            accent_foreground: "#1a1218",
            success: "#a8e6cf",
            success_foreground: "#1a1218",
            warning: "#ffd3b6",
            warning_foreground: "#1a1218",
            danger: "#ff8b94",
            danger_foreground: "#1a1218",
            info: "#c7ceea",
            focus_ring: "#ff8fa3",
            overlay: "rgba(26,18,24,0.7)",
            glow: "rgba(255,143,163,0.25)",
            surface_muted: "#221a20",
            border_strong: "#6a5a68",
            foreground: "#ffe4ec",
            foreground_muted: "#d4b0c0",
            foreground_subtle: "#9a7a8a",
            input_background: "#3a3038",
            input_foreground: "#ffe4ec",
            placeholder: "#9a7a8a",
            disabled_foreground: "#9a7a8a",
            button_primary_background: "#ff8fa3",
            button_primary_foreground: "#1a1218",
            button_secondary_background: "#3a3038",
            button_secondary_foreground: "#ffe4ec",
            link: "#c7ceea",
            selection_background: "#ff8fa3",
            selection_foreground: "#1a1218",
          },
        },
      },
    });

    await reloadConfig();

    expect(desktopConfigReloadMock).toHaveBeenCalled();
    expect(desktopConfigGetMock).toHaveBeenCalled();
    expect(useConfigStore.getState().config).toEqual(config);
    expect(useConfigStore.getState().yamlThemes["sakura-terminal"]).toBeDefined();
    expect(useConfigStore.getState().yamlThemes["sakura-terminal"].name).toBe("Sakura Terminal");
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
