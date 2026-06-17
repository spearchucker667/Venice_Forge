import React, { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../stores/auth-store";
import { useChatStore } from "../stores/chat-store";
import { useSettingsStore } from "../stores/settings-store";
import { useModels } from "../hooks/use-models";
import { useDataStorageActions } from "../hooks/use-data-storage-actions";
import { useConfigStore, reloadConfig } from "../stores/config-store";
import { ModelSelect } from "./ModelSelect";
import { ThemeMaker } from "./ThemeMaker";
import { MemoryPanel } from "./layout/memory-panel";
import { ConfirmModal } from "./ConfirmModal";
import { toast } from "../stores/toast-store";
import { askDecision } from "./ui/modal-requests";
import { PillGroup } from "./ui/shared";
import { isElectron, desktopApiKey, desktopJinaApiKey, desktopFiles, desktopUpdates, desktopConfig } from "../services/desktopBridge";
import { APP_NAME, OFFICIAL_LINKS, FIRST_RUN_ACK_KEY } from "../shared/legal";
import { redactErrorMessage } from "../shared/redaction";
import type { UpdateInfo, ProgressInfo } from "electron-updater";

type PendingConfirm = { message: string; detail?: string; onConfirm: () => Promise<void> | void };

export function SettingsView() {
  const { isConfigured: veniceConfigured, setApiKey, clearApiKey } = useAuthStore();
  const {
    selectedModels,
    setSelectedModel,
    localFamilySafeModeEnabled,
    setLocalFamilySafeModeEnabled,
    veniceApiSafeMode,
    setVeniceApiSafeMode,
    characterSceneGenerationEnabled,
    setCharacterSceneGenerationEnabled,
    characterSceneGenerationMode,
    setCharacterSceneGenerationMode,
  } = useSettingsStore();
  
  // Chat store settings
  const { 
    systemPrompt, 
    setSystemPrompt, 
    veniceParams, 
    setVeniceParams 
  } = useChatStore();

  const [activeSection, setActiveSection] = useState("api-keys");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  // One-shot cancel callback for the safety-import confirmation. The import
  // path resolves a Promise via the modal's confirm/cancel buttons; this ref
  // lets the wrapper's onCancel fire the cancel resolution without changing
  // the existing PendingConfirm type.
  const applySafetyCancelRef = useRef<(() => void) | null>(null);
  const applySafetyTertiaryRef = useRef<(() => void) | null>(null);
  const applySafetyDismissRef = useRef<(() => void) | null>(null);

  // Venice key entry state
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyTesting, setApiKeyTesting] = useState(false);

  // Jina key state
  const [jinaKeyInput, setJinaKeyInput] = useState("");
  const [jinaKeyTesting, setJinaKeyTesting] = useState(false);
  const [jinaKeyConfigured, setJinaKeyConfigured] = useState<boolean | null>(null);

  // Updates state (Electron only)
  const [updateStatus, setUpdateStatus] = useState("");
  const [isUpdateChecking, setIsUpdateChecking] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const updateEventSeenRef = useRef(false);

  // Data & Storage operations — extracted to a custom hook so the
  // SettingsView component can stay focused on the per-section UI.
  // The hook returns the 4 async action functions used by the
  // "Data & Storage operations" panel and preserves the safety-mode
  // 3-way choice (P0) end-to-end.
  const { clearLocalSettings, clearAllHistory, exportData, importData } = useDataStorageActions({
    setSystemPrompt,
    setVeniceParams,
    setLocalFamilySafeModeEnabled,
    setVeniceApiSafeMode,
    setPendingConfirm,
    localFamilySafeModeEnabled,
    veniceApiSafeMode,
    applySafetyCancelRef,
    applySafetyTertiaryRef,
    applySafetyDismissRef,
  });

  // Load models
  const { data: textModels } = useModels("text");
  const { data: imageModels } = useModels("image");

  const currentChatModel = selectedModels["chat"] || textModels?.[0]?.id || "";
  const currentImageModel = selectedModels["image"] || imageModels?.[0]?.id || "";

  async function updateSafetySetting(
    key: "local_family_safe_mode_enabled" | "venice_api_safe_mode",
    enabled: boolean,
  ) {
    // Optimistic update + rollback: apply to the renderer store first so
    // the toggle feels instant, then persist to the YAML. If persistence
    // fails (disk full, parse error, etc.) we revert the renderer state
    // and surface a toast — otherwise the UI and the main-process guard
    // would disagree about whether the user is in Family Safe Mode.
    const previousFamily = localFamilySafeModeEnabled;
    const previousVenice = veniceApiSafeMode;
    if (key === "local_family_safe_mode_enabled") setLocalFamilySafeModeEnabled(enabled);
    else setVeniceApiSafeMode(enabled);
    if (isElectron()) {
      const result = await desktopConfig.writeSanitized({ safety: { [key]: enabled } });
      if (!result.ok) {
        if (key === "local_family_safe_mode_enabled") setLocalFamilySafeModeEnabled(previousFamily);
        else setVeniceApiSafeMode(previousVenice);
        toast.error(result.error || "Failed to persist safety setting.");
        return;
      }
      await reloadConfig();
    }
  }

  // Check Jina configuration on mount
  useEffect(() => {
    if (!isElectron()) return;
    let mounted = true;
    desktopJinaApiKey.isConfigured().then((v) => {
      if (mounted) setJinaKeyConfigured(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Update listeners for Electron
  useEffect(() => {
    if (!isElectron()) return;

    const unsubs = [
      desktopUpdates.onUpdateAvailable((info: UpdateInfo) => {
        updateEventSeenRef.current = true;
        setUpdateStatus(`Update available: v${info?.version || "new"}`);
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onUpdateNotAvailable(() => {
        updateEventSeenRef.current = true;
        setUpdateStatus("App is up to date.");
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onDownloadProgress((progress: ProgressInfo) => {
        updateEventSeenRef.current = true;
        setUpdateStatus(`Downloading update: ${Math.round(progress?.percent || 0)}%`);
      }),
      desktopUpdates.onUpdateDownloaded(() => {
        updateEventSeenRef.current = true;
        setUpdateStatus("Update downloaded and ready to install.");
        setUpdateDownloaded(true);
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onUpdateError((err: string) => {
        updateEventSeenRef.current = true;
        setUpdateStatus(`Update error: ${err}`);
        setIsUpdateChecking(false);
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  async function checkForUpdates() {
    setIsUpdateChecking(true);
    updateEventSeenRef.current = false;
    setUpdateStatus("Checking for updates...");
    try {
      const res = await desktopUpdates.checkForUpdates();
      if (!res.ok) {
        const raw = res.error ?? "Unknown error";
        const msg = raw.startsWith("Error: ") ? raw.slice(7) : raw;
        setUpdateStatus(`Update check failed: ${msg}`);
      } else if (!updateEventSeenRef.current) {
        setUpdateStatus("Update check completed.");
      }
    } catch (err: unknown) {
      const message = redactErrorMessage(err);
      setUpdateStatus(`Update check failed: ${message}`);
    } finally {
      setIsUpdateChecking(false);
    }
  }

  async function installUpdate() {
    try {
      await desktopUpdates.installUpdate();
    } catch (err: unknown) {
      const message = redactErrorMessage(err);
      setUpdateStatus(`Install failed: ${message}`);
    }
  }

  // Key operations
  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return;
    try {
      await setApiKey(apiKeyInput.trim());
      setApiKeyInput("");
      toast.success(isElectron() ? "Venice API key saved securely." : "Venice API key saved for this development session.");
    } catch (err) {
      toast.error("Failed to save API key.", redactErrorMessage(err));
    }
  }

  async function handleDeleteApiKey() {
    setPendingConfirm({
      message: "Delete Venice API key?",
      detail: isElectron()
        ? "This will remove your Venice API key from OS secure storage. You will need to re-enter it to make requests."
        : "This will remove the Venice API key from the current development session.",
      onConfirm: async () => {
        try {
          await clearApiKey();
          toast.success("Venice API key deleted.");
        } catch (err) {
          toast.error("Failed to delete API key.", redactErrorMessage(err));
        }
      }
    });
  }

  async function handleTestApiKey() {
    setApiKeyTesting(true);
    try {
      const result = await desktopApiKey.test();
      if (result.ok) {
        toast.success(`Connection successful${result.status ? ` (HTTP ${result.status})` : ""}.`);
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
    } catch (err) {
      toast.error("Test connection failed.", redactErrorMessage(err));
    } finally {
      setApiKeyTesting(false);
    }
  }

  async function handleSaveJinaKey() {
    if (!jinaKeyInput.trim()) return;
    try {
      await desktopJinaApiKey.set(jinaKeyInput.trim());
      setJinaKeyInput("");
      setJinaKeyConfigured(true);
      toast.success(isElectron() ? "Jina API key saved securely." : "Jina API key saved for this browser session.");
    } catch (err) {
      toast.error("Failed to save Jina API key.", redactErrorMessage(err));
    }
  }

  async function handleDeleteJinaKey() {
    setPendingConfirm({
      message: "Delete Jina API key?",
      detail: isElectron()
        ? "This will remove your Jina API key from OS secure storage."
        : "This will remove the in-memory Jina API key for this browser session.",
      onConfirm: async () => {
        try {
          await desktopJinaApiKey.delete();
          setJinaKeyConfigured(false);
          toast.success("Jina API key deleted.");
        } catch (err) {
          toast.error("Failed to delete Jina API key.", redactErrorMessage(err));
        }
      }
    });
  }

  async function handleTestJinaKey() {
    setJinaKeyTesting(true);
    try {
      const result = await desktopJinaApiKey.test();
      if (result.ok) {
        toast.success(`Jina connection successful${result.status ? ` (HTTP ${result.status})` : ""}.`);
      } else {
        toast.error(`Jina connection failed: ${result.message}`);
      }
    } catch (err) {
      toast.error("Jina test connection failed.", redactErrorMessage(err));
    } finally {
      setJinaKeyTesting(false);
    }
  }

  // Data & Storage operations — extracted to a custom hook (see
  // useDataStorageActions call above).

  const sectionButtonClass = (section: string) => `
    w-full text-left px-3.5 py-2 rounded-lg text-[13.5px] font-medium transition-all duration-150
    ${activeSection === section 
      ? "bg-accent/10 text-accent border border-accent/20" 
      : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50 border border-transparent"}
  `;

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex-none p-5 border-b border-border bg-surface">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-text-primary">Config</h2>
            <p className="text-[12.5px] text-text-muted mt-0.5">
              {isElectron() ? "Manage API endpoints, defaults, and appearance styles." : "Configure default prompts and styling templates."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Navigation Rail */}
        <div className="w-52 border-r border-border p-3 space-y-1 overflow-y-auto shrink-0 hidden sm:block">
          <button onClick={() => setActiveSection("api-keys")} className={sectionButtonClass("api-keys")}>
            API Keys
          </button>
          <button onClick={() => setActiveSection("defaults")} className={sectionButtonClass("defaults")}>
            Defaults & Behavior
          </button>
          <button onClick={() => setActiveSection("safety")} className={sectionButtonClass("safety")}>
            Safety
          </button>
          {isElectron() && (
            <button onClick={() => setActiveSection("vault")} className={sectionButtonClass("vault")}>
              Conversation Vault
            </button>
          )}
          <button onClick={() => setActiveSection("appearance")} className={sectionButtonClass("appearance")}>
            Appearance
          </button>
          <button onClick={() => setActiveSection("data")} className={sectionButtonClass("data")}>
            Data & Storage
          </button>
          <button onClick={() => setActiveSection("about")} className={sectionButtonClass("about")}>
            About & Legal
          </button>
          {isElectron() && (
            <button onClick={() => setActiveSection("updates")} className={sectionButtonClass("updates")}>
              Updates
              {updateDownloaded && <span className="ml-2 inline-flex w-1.5 h-1.5 rounded-full bg-success"></span>}
            </button>
          )}
          {isElectron() && (
            <button onClick={() => setActiveSection("config")} className={sectionButtonClass("config")}>
              Local Config
            </button>
          )}
        </div>

        {/* Content panel */}
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
          {activeSection === "api-keys" && (
            <div className="space-y-6">
              {/* Venice key */}
              <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14.5px] font-medium text-text-primary">Venice.ai Integration</h3>
                  <span className={`text-[11.5px] px-2 py-0.5 rounded font-medium ${veniceConfigured ? "bg-success/10 text-success border border-success/20" : "bg-warning/10 text-warning border border-warning/20"}`}>
                    {veniceConfigured ? "Configured" : "Unset"}
                  </span>
                </div>
                <p className="text-[12.5px] text-text-secondary leading-relaxed">
                  Your API key is saved using secure storage encryption and is never exposed to the web sandbox.
                </p>
                <div className="space-y-3">
                  {!veniceConfigured ? (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="sk-..."
                        autoComplete="off"
                        className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-all font-mono placeholder:text-text-muted/50"
                      />
                      <button 
                        onClick={handleSaveApiKey} 
                        disabled={!apiKeyInput.trim()}
                        className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        Save Key
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled
                        value="••••••••••••••••••••••••••••••••"
                        className="flex-1 bg-surface-elevated border border-border/40 rounded-lg px-3 py-1.5 text-[13.5px] text-text-muted font-mono"
                      />
                      <button 
                        onClick={handleTestApiKey} 
                        disabled={apiKeyTesting}
                        className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {apiKeyTesting ? "Testing..." : "Test Key"}
                      </button>
                      <button 
                        onClick={handleDeleteApiKey} 
                        className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/25 transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Jina key */}
              <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14.5px] font-medium text-text-primary">Jina.ai Integration</h3>
                  <span className={`text-[11.5px] px-2 py-0.5 rounded font-medium ${jinaKeyConfigured ? "bg-success/10 text-success border border-success/20" : "bg-surface border border-border text-text-muted"}`}>
                    {jinaKeyConfigured ? "Configured" : "Optional"}
                  </span>
                </div>
                <p className="text-[12.5px] text-text-secondary leading-relaxed">
                  Provides deep web searching, scraping, and social profile discovery mapping capabilities. {isElectron() ? "Jina API keys are saved with the same OS secure storage." : "Jina API keys are kept only in memory for this browser session; use the server environment for persistent web configuration."}
                </p>
                <div className="space-y-3">
                  {!jinaKeyConfigured ? (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={jinaKeyInput}
                        onChange={(e) => setJinaKeyInput(e.target.value)}
                        placeholder="jina_..."
                        autoComplete="off"
                        className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-all font-mono placeholder:text-text-muted/50"
                      />
                      <button 
                        onClick={handleSaveJinaKey} 
                        disabled={!jinaKeyInput.trim()}
                        className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        Save Key
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled
                        value="••••••••••••••••••••••••••••••••"
                        className="flex-1 bg-surface-elevated border border-border/40 rounded-lg px-3 py-1.5 text-[13.5px] text-text-muted font-mono"
                      />
                      <button 
                        onClick={handleTestJinaKey} 
                        disabled={jinaKeyTesting}
                        className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {jinaKeyTesting ? "Testing..." : "Test Key"}
                      </button>
                      <button 
                        onClick={handleDeleteJinaKey} 
                        className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/25 transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === "defaults" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[12.5px] text-text-secondary block mb-1.5 font-medium">Default Chat Model</label>
                  <ModelSelect
                    value={currentChatModel}
                    models={textModels || []}
                    onChange={(val) => setSelectedModel("chat", val)}
                  />
                </div>
                <div>
                  <label className="text-[12.5px] text-text-secondary block mb-1.5 font-medium">Default Image Model</label>
                  <ModelSelect
                    value={currentImageModel}
                    models={imageModels || []}
                    onChange={(val) => setSelectedModel("image", val)}
                  />
                </div>
              </div>

              <div className="border-t border-border pt-5 space-y-4">
                <div>
                  <label className="text-[12.5px] text-text-secondary block mb-1.5 font-medium">Default Web Search</label>
                  <select
                    value={veniceParams.enable_web_search || "off"}
                    onChange={(e) => setVeniceParams({ enable_web_search: e.target.value as "off" | "on" | "auto" })}
                    className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>

                <div>
                  <label className="text-[12.5px] text-text-secondary block mb-1.5 font-medium">Default System Prompt</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="You are a helpful assistant..."
                    rows={4}
                    className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50 resize-none"
                  />
                </div>

                <div className="flex flex-col gap-3.5 p-4 rounded-xl border border-border bg-surface-elevated">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={veniceParams.include_venice_system_prompt !== false}
                      onChange={(e) => setVeniceParams({ include_venice_system_prompt: e.target.checked })}
                      className="rounded border-border bg-surface text-accent focus:ring-offset-0 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[13.5px] text-text-primary">Venice System Prompt Toggle</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={veniceParams.enable_web_citations === true}
                      onChange={(e) => setVeniceParams({ enable_web_citations: e.target.checked })}
                      className="rounded border-border bg-surface text-accent focus:ring-offset-0 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[13.5px] text-text-primary">Enable Citations by Default</span>
                  </label>
                </div>

                <div className="flex flex-col gap-3.5 p-4 rounded-xl border border-border bg-surface-elevated">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-[14.5px] font-medium text-text-primary">Character Scene Generation</h3>
                      <p className="mt-1 text-[12.5px] text-text-secondary leading-relaxed">
                        Allow character chats to create inline scene images from the current conversation only. Protected by local rate limits.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={characterSceneGenerationEnabled}
                        onChange={(e) => setCharacterSceneGenerationEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-border bg-surface text-accent cursor-pointer"
                      />
                      <span className="text-[12.5px] font-medium text-text-primary">
                        {characterSceneGenerationEnabled ? 'On' : 'Off'}
                      </span>
                    </label>
                  </div>
                  {characterSceneGenerationEnabled && (
                    <div className="pt-2 border-t border-border/50">
                      <label className="text-[12.5px] text-text-secondary block mb-2 font-medium">Mode</label>
                      <PillGroup
                        ariaLabel="Character scene generation mode"
                        options={[
                          { value: 'manual', label: 'Manual only' },
                          { value: 'auto', label: 'Automatic + manual' },
                        ]}
                        value={characterSceneGenerationMode}
                        onChange={(v) => setCharacterSceneGenerationMode(v as 'manual' | 'auto')}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === "safety" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[14.5px] font-medium text-text-primary">Family Safe Mode</h3>
                    <p className="mt-1 text-[12.5px] text-text-secondary leading-relaxed">
                      Runs Venice Forge&apos;s local family-safe filter before sending requests. Designed for child/family-safe use.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={localFamilySafeModeEnabled}
                      onChange={(event) => void updateSafetySetting("local_family_safe_mode_enabled", event.target.checked)}
                      className="h-4 w-4 rounded border-border bg-surface text-accent"
                    />
                    <span className="text-[12.5px] font-medium text-text-primary">
                      {localFamilySafeModeEnabled ? "ON: Family Safe Mode" : "OFF: Adult Mode"}
                    </span>
                  </label>
                </div>
                <p className="text-[12px] text-text-muted leading-relaxed">
                  {localFamilySafeModeEnabled
                    ? "When enabled, matching requests are blocked locally before the provider is called."
                    : "Bypasses Venice Forge's local family-safe filter. Venice/API-level safety and provider-side safemode are controlled separately."}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[14.5px] font-medium text-text-primary">Venice API Safe Mode</h3>
                    <p className="mt-1 text-[12.5px] text-text-secondary leading-relaxed">
                      Controls the provider-side safemode parameter sent to Venice. This is separate from Family Safe Mode.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Venice API Safe Mode"
                    checked={veniceApiSafeMode}
                    onChange={(event) => void updateSafetySetting("venice_api_safe_mode", event.target.checked)}
                    className="h-4 w-4 rounded border-border bg-surface text-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "vault" && isElectron() && (
            <MemoryPanel />
          )}

          {activeSection === "appearance" && (
            <div className="space-y-4">
              <ThemeMaker />
            </div>
          )}

          {activeSection === "data" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
                <h3 className="text-[14.5px] font-medium text-text-primary">Data Backups</h3>
                <p className="text-[12.5px] text-text-secondary leading-relaxed">
                  Export your conversations, images, settings, and memories to a JSON file, or restore them from a previous backup.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button 
                    onClick={exportData}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer"
                  >
                    Export Backup
                  </button>
                  <button 
                    onClick={importData}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                  >
                    Import Backup
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-danger/10 bg-danger/[0.02] p-5 shadow-lg space-y-4">
                <h3 className="text-[14.5px] font-medium text-danger">Danger Zone</h3>
                <p className="text-[12.5px] text-text-secondary leading-relaxed">
                  These operations are destructive and cannot be undone. Always export a backup first if you have important history.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button 
                    onClick={clearLocalSettings}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-danger/10 hover:text-danger hover:border-danger/25 transition-colors cursor-pointer"
                  >
                    Clear App Defaults
                  </button>
                  <button 
                    onClick={clearAllHistory}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-colors cursor-pointer"
                  >
                    Clear All Local History
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "about" && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="text-[17px] font-semibold text-text-primary">{APP_NAME}</div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 uppercase tracking-wider font-semibold">Unofficial</span>
              </div>

              <div className="text-[13px] text-text-secondary leading-relaxed space-y-4">
                <p>
                  Venice Forge is a third-party desktop client configured to interface directly with the Venice.ai inference API endpoints. It is not affiliated with, endorsed by, sponsored by, or approved by Venice.ai, Inc.
                </p>
                
                <div className="p-3 bg-surface-elevated border border-border rounded-lg">
                  <div className="text-[11.5px] uppercase tracking-wider text-text-muted font-bold mb-1">Official Links</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    <a href={OFFICIAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Terms of Service</a>
                    <a href={OFFICIAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Privacy Policy</a>
                    <a href={OFFICIAL_LINKS.apiDocs} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">API Documentation</a>
                  </div>
                </div>

                <div className="text-[11px] text-text-muted space-y-2">
                  <p>
                     Venice ,  Venice.ai , and related logos are trademarks of Venice.ai, Inc. Use of these names is solely for nominative identification of API compatibility.
                  </p>
                  <p>
                    Reset legal acknowledgment gate:
                  </p>
                  <button
                    onClick={() => {
                      try {
                        localStorage.removeItem(FIRST_RUN_ACK_KEY) /* localStorage-allowed: first-run legal ack */;
                        toast.success("Legal acknowledgment reset. It will appear on next reload.");
                      } catch {
                        toast.error("Could not reset acknowledgment.");
                      }
                    }}
                    className="px-3 py-1 rounded bg-surface-elevated border border-border hover:bg-surface text-text-primary cursor-pointer transition-colors"
                  >
                    Reset gate
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "updates" && isElectron() && (
            <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
              <h3 className="text-[14.5px] font-medium text-text-primary font-semibold">Application Updates</h3>
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                Check for desktop application updates securely via GitHub Releases.
              </p>
              <div className="space-y-4">
                <div className="text-[13px] text-text-secondary">
                  <span className="text-text-muted mr-2">Status:</span>
                  <span className="font-mono bg-surface border border-border rounded px-2 py-0.5 text-text-primary">{updateStatus || "Idle"}</span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button 
                    onClick={checkForUpdates} 
                    disabled={isUpdateChecking || updateDownloaded}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isUpdateChecking ? "Checking..." : "Check for updates"}
                  </button>
                  {updateDownloaded && (
                    <button 
                      onClick={installUpdate}
                      className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-success text-accent-fg hover:opacity-90 transition-colors cursor-pointer"
                    >
                      Restart and Install
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === "config" && isElectron() && (
            <ConfigPanel />
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!pendingConfirm}
        message={pendingConfirm?.message || ""}
        detail={pendingConfirm?.detail}
        confirmLabel="Import all"
        cancelLabel="Cancel"
        tertiaryAction={
          applySafetyTertiaryRef.current
            ? { label: "Keep current safety", onClick: () => applySafetyTertiaryRef.current?.() }
            : undefined
        }
        onConfirm={async () => {
          try {
            await pendingConfirm?.onConfirm();
            setPendingConfirm(null);
          } catch {
            setPendingConfirm(null);
          }
        }}
        onCancel={() => {
          applySafetyDismissRef.current?.();
          applySafetyCancelRef.current?.();
          applySafetyCancelRef.current = null;
          applySafetyTertiaryRef.current = null;
          applySafetyDismissRef.current = null;
          setPendingConfirm(null);
        }}
      />
    </div>
  );
}

/** Settings panel that surfaces the local master YAML config. */
function ConfigPanel(): React.ReactElement {
  const config = useConfigStore((s) => s.config);
  const status = useConfigStore((s) => s.status);
  const loading = useConfigStore((s) => s.loading);
  const error = useConfigStore((s) => s.error);
  const [working, setWorking] = useState(false);

  const handleReload = async (): Promise<void> => {
    setWorking(true);
    try {
      await reloadConfig();
      toast.success("Local config reloaded.");
    } catch (err) {
      toast.error("Failed to reload config.", redactErrorMessage(err));
    } finally {
      setWorking(false);
    }
  };

  const handleOpenFolder = async (): Promise<void> => {
    setWorking(true);
    try {
      const res = await desktopConfig.openFolder();
      if (!res.ok) toast.error(res.error || "Failed to open config folder.");
    } catch (err) {
      toast.error("Failed to open config folder.", redactErrorMessage(err));
    } finally {
      setWorking(false);
    }
  };

  const handleExport = async (): Promise<void> => {
    setWorking(true);
    try {
      const filename = `venice-forge-config-template-${new Date().toISOString().slice(0, 10)}.yaml`;
      const ok = await desktopFiles.exportYaml(
        "# Sanitized config template (no secrets)\n",
        filename
      );
      if (ok) toast.success("Template exported.");
      else toast.info("Export cancelled.");
    } catch (err) {
      toast.error("Failed to export config template.", redactErrorMessage(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-3">
        <h3 className="text-[15px] font-semibold text-text-primary">Local Master Config</h3>
        <p className="text-[12.5px] text-text-secondary">
          Edit <code className="px-1 py-0.5 rounded bg-surface border border-border text-[11.5px]">config.yaml</code> and <code className="px-1 py-0.5 rounded bg-surface border border-border text-[11.5px]">themes.yaml</code> on disk to configure Venice Forge without touching the UI. See <code className="px-1 py-0.5 rounded bg-surface border border-border text-[11.5px]">docs/CONFIG.md</code> for the full schema.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Config path</div>
            <div className="text-text-primary font-mono break-all">{status?.configPath || "(unavailable)"}</div>
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Themes path</div>
            <div className="text-text-primary font-mono break-all">{status?.themesPath || "(unavailable)"}</div>
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Loaded from</div>
            <div className="text-text-primary">{status?.source || "—"}</div>
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Profile</div>
            <div className="text-text-primary">{status?.configName || "default"} / {status?.profile || "default"}</div>
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-[12px] text-danger">
            {error}
          </div>
        )}
        {status?.parseError && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[12px] text-warning">
            Parse error: {status.parseError}
          </div>
        )}
        {status?.warnings && status.warnings.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[12px] space-y-1">
            <div className="font-medium text-warning">Validation warnings</div>
            <ul className="list-disc list-inside text-text-secondary">
              {status.warnings.map((w, i) => (
                <li key={i}><span className="font-mono">{w.field}</span>: {w.message} ({w.severity})</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleReload}
            disabled={working || loading}
            className="px-3 py-1.5 rounded-md border border-border bg-surface text-text-primary text-[12.5px] hover:bg-surface-elevated disabled:opacity-50"
          >
            {working ? "Working…" : "Reload Config"}
          </button>
          <button
            onClick={handleOpenFolder}
            disabled={working}
            className="px-3 py-1.5 rounded-md border border-border bg-surface text-text-primary text-[12.5px] hover:bg-surface-elevated disabled:opacity-50"
          >
            Open Config Folder
          </button>
          <button
            onClick={handleExport}
            disabled={working}
            className="px-3 py-1.5 rounded-md border border-border bg-surface text-text-primary text-[12.5px] hover:bg-surface-elevated disabled:opacity-50"
          >
            Export Sanitized Template
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-3">
        <h3 className="text-[15px] font-semibold text-text-primary">API Key Import</h3>
        <p className="text-[12.5px] text-text-secondary">
          Plaintext keys in <code className="px-1 py-0.5 rounded bg-surface border border-border text-[11.5px]">config.yaml</code> are imported into OS secure storage on startup and redacted from the file (unless <code className="px-1 py-0.5 rounded bg-surface border border-border text-[11.5px]">secrets.keep_plaintext_keys: true</code> is set).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Venice key</div>
            <div className="text-text-primary">
              {status?.secureStore.venice ? "Configured (secure store)" : "Not configured"}
            </div>
            {status?.keysImported.venice && <div className="text-success mt-1">Imported this run</div>}
            {status?.keysRedacted.venice && <div className="text-text-muted mt-1">Plaintext redacted</div>}
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Jina key</div>
            <div className="text-text-primary">
              {status?.secureStore.jina ? "Configured (secure store)" : "Not configured"}
            </div>
            {status?.keysImported.jina && <div className="text-success mt-1">Imported this run</div>}
            {status?.keysRedacted.jina && <div className="text-text-muted mt-1">Plaintext redacted</div>}
          </div>
        </div>
        <p className="text-[11.5px] text-text-muted">
          Raw keys are never sent to the renderer. Reset the secure store to clear stored keys; you can then re-enter them via the API Keys tab.
        </p>
        <button
          onClick={async () => {
            const shouldReset = await askDecision({
              title: "Clear secure store keys?",
              detail: "This removes all stored API keys from the secure store. This cannot be undone.",
              actionLabel: "Clear keys",
              danger: true,
            });
            if (!shouldReset) return;
            setWorking(true);
            try {
              const res = await desktopConfig.resetSecureStoreKeys();
              if (res.ok) {
                toast.success("Secure store cleared.");
                await reloadConfig();
              } else {
                toast.error(res.error || "Failed to clear secure store.");
              }
            } finally {
              setWorking(false);
            }
          }}
          disabled={working || !status?.secureStore.venice && !status?.secureStore.jina}
          className="px-3 py-1.5 rounded-md border border-danger/40 bg-danger/10 text-danger text-[12.5px] hover:bg-danger/20 disabled:opacity-50"
        >
          Clear Secure Store
        </button>
      </div>

      {config && (
        <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-3">
          <h3 className="text-[15px] font-semibold text-text-primary">Effective Settings (preview)</h3>
          <p className="text-[12.5px] text-text-secondary">
            Read-only preview of the merged config currently in memory. The <code className="px-1 py-0.5 rounded bg-surface border border-border text-[11.5px]">YAML</code> source remains the canonical source of truth — edit it on disk and click <em>Reload Config</em>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
            <div>
              <div className="text-text-muted mb-1">Active theme</div>
              <div className="text-text-primary font-mono">{config.theme.active || "builtin-dark"}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Default chat model</div>
              <div className="text-text-primary font-mono">{config.models.chat || "(use UI default)"}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Temperature</div>
              <div className="text-text-primary">{config.chat.temperature}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Top-p</div>
              <div className="text-text-primary">{config.chat.top_p}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Max tokens</div>
              <div className="text-text-primary">{config.chat.max_tokens}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Web search</div>
              <div className="text-text-primary">{config.chat.enable_web_search}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
