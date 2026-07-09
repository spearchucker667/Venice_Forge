// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Renderer-side cache of the sanitized local config.
 *  - Holds the last-seen config payload from the main process.
 *  - Provides `applyNonSecretDefaults()` to prepopulate settings on first run
 *    without overwriting existing user choices unless
 *    `developer.force_apply_config: true`.
 */
import { create } from "zustand";
import { desktopConfig, isElectron } from "../services/desktopBridge";
import { redactErrorMessage } from "../shared/redaction";
import { useSettingsStore } from "./settings-store";
import type { YamlInternalPromptEnhancer } from "../config/configSchema";
import type { Theme } from "../theme";
import { yamlThemeToTheme } from "../theme/yamlTheme";

export interface ConfigStatusSnapshot {
  configPath: string;
  themesPath: string;
  source: "userdata" | "repo-local" | "env-override" | "defaults";
  configName: string;
  profile: string;
  loaded: boolean;
  parseError: string | null;
  warnings: Array<{ field: string; message: string; severity: "warn" | "error" }>;
  hasVeniceApiKey: boolean;
  hasJinaApiKey: boolean;
  keysImported: { venice: boolean; jina: boolean };
  keysRedacted: { venice: boolean; jina: boolean };
  secureStore: { venice: boolean; jina: boolean };
  activeTheme: string;
  availableThemes: string[];
  redactedFields: string[];
}

export interface SanitizedConfigSnapshot {
  version: 1;
  app: {
    config_name: string;
    profile: string;
    auto_open_devtools: boolean;
    check_for_updates: boolean;
  };
  secrets: {
    has_venice_api_key: boolean;
    has_jina_api_key: boolean;
    keep_plaintext_keys: boolean;
  };
  theme: { active: string; themes_file: string };
  models: {
    chat: string;
    image: string;
    video: string;
    audio: string;
    music: string;
    embedding: string;
    upscale: string;
  };
  chat: {
    system_prompt: string;
    temperature: number;
    top_p: number;
    max_tokens: number;
    include_venice_system_prompt: boolean;
    enable_web_search: "off" | "on" | "auto";
    enable_web_scraping: boolean;
    enable_web_citations: boolean;
    strip_thinking_response: boolean;
    disable_thinking: boolean;
  };
  memory: {
    enable_memory_retrieval: boolean;
    show_pulled_context_before_sending: boolean;
  };
  research: {
    default_provider: "venice" | "jina" | "auto";
    enable_jina: boolean;
    enable_social_discovery: boolean;
    liveBrowserAllowExternalOpen?: boolean;
  };
  characters: {
    enabled: boolean;
    include_adult_characters: boolean;
    default_character_slug: string;
  };
  safety: {
    local_family_safe_mode_enabled: boolean;
    venice_api_safe_mode: boolean;
  };
  developer: {
    verbose_config_logging: boolean;
    allow_config_key_import: boolean;
    force_import_keys: boolean;
    force_apply_config: boolean;
  };
  /** Internal prompt-enhancer LLM configuration. Read by image-view and
   *  the gallery inspector to drive enhance/remix calls. */
  internal_prompt_enhancer: YamlInternalPromptEnhancer;
}

interface ConfigState {
  config: SanitizedConfigSnapshot | null;
  status: ConfigStatusSnapshot | null;
  yamlThemes: Record<string, Theme>;
  loading: boolean;
  hydrated: boolean;
  error: string | null;
  lastLoadedAt: number;
  setPayload: (config: SanitizedConfigSnapshot, status: ConfigStatusSnapshot) => void;
  setStatus: (status: ConfigStatusSnapshot) => void;
  setError: (error: string) => void;
  setLoading: (loading: boolean) => void;
  setYamlThemes: (themes: Record<string, Theme>) => void;
  reset: () => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  status: null,
  yamlThemes: {},
  loading: false,
  hydrated: false,
  error: null,
  lastLoadedAt: 0,
  setPayload: (config, status) =>
    set({ config, status, loading: false, hydrated: true, error: null, lastLoadedAt: Date.now() }),
  setStatus: (status) => set({ status, lastLoadedAt: Date.now() }),
  setError: (error) => set({ error, loading: false }),
  setLoading: (loading) => set({ loading }),
  setYamlThemes: (yamlThemes) => set({ yamlThemes }),
  reset: () => set({ config: null, status: null, yamlThemes: {}, error: null, hydrated: false, lastLoadedAt: 0 }),
}));

/** Loads merged themes from the main process and converts them to Theme objects. */
export async function loadYamlThemes(): Promise<Record<string, Theme>> {
  if (!isElectron()) return {};
  try {
    const res = await desktopConfig.loadMergedThemes();
    if (!res.ok || !res.themes) return {};
    const themes: Record<string, Theme> = {};
    for (const [id, raw] of Object.entries(res.themes as Record<string, unknown>)) {
      const rec = raw as Record<string, unknown>;
      if (typeof rec.display_name !== 'string' || !rec.display_name) continue;
      if (rec.mode !== 'dark' && rec.mode !== 'light') continue;
      if (!rec.tokens || typeof rec.tokens !== 'object') continue;
      try {
        themes[id] = yamlThemeToTheme(id, rec.display_name, rec.mode, rec.tokens as Record<string, string>);
      } catch {
        // Skip malformed themes defensively
      }
    }
    return themes;
  } catch {
    return {};
  }
}

/** Loads the config payload from the desktop bridge and updates the store. */
export async function refreshConfig(): Promise<void> {
  if (!isElectron()) return;
  useConfigStore.getState().setLoading(true);
  try {
    const res = await desktopConfig.get();
    if (res.ok && res.payload) {
      const { config, status } = res.payload as { config: SanitizedConfigSnapshot; status: ConfigStatusSnapshot };
      useConfigStore.getState().setPayload(config, status);
      useSettingsStore.getState().setLocalFamilySafeModeEnabled(config.safety.local_family_safe_mode_enabled);
      useSettingsStore.getState().setVeniceApiSafeMode(config.safety.venice_api_safe_mode);
      // Load merged YAML themes so the theme picker and resolver can use them.
      const yamlThemes = await loadYamlThemes();
      useConfigStore.getState().setYamlThemes(yamlThemes);
    } else {
      useConfigStore.getState().setError(res.error || "Failed to load config.");
    }
  } catch (err) {
    useConfigStore.getState().setError(redactErrorMessage(err));
  }
}

/** Re-reads the config from disk (calls IPC reload). */
export async function reloadConfig(): Promise<void> {
  if (!isElectron()) return;
  useConfigStore.getState().setLoading(true);
  try {
    const reloadRes = await desktopConfig.reload();
    if (reloadRes.ok) {
      const getRes = await desktopConfig.get();
      if (getRes.ok && getRes.payload) {
        const { config, status } = getRes.payload as { config: SanitizedConfigSnapshot; status: ConfigStatusSnapshot };
        useConfigStore.getState().setPayload(config, status);
        useSettingsStore.getState().setLocalFamilySafeModeEnabled(config.safety.local_family_safe_mode_enabled);
        useSettingsStore.getState().setVeniceApiSafeMode(config.safety.venice_api_safe_mode);
        // Refresh merged YAML themes after reload.
        const yamlThemes = await loadYamlThemes();
        useConfigStore.getState().setYamlThemes(yamlThemes);
      }
    } else {
      useConfigStore.getState().setError(reloadRes.error || "Failed to reload config.");
    }
  } catch (err) {
    useConfigStore.getState().setError(redactErrorMessage(err));
  }
}
