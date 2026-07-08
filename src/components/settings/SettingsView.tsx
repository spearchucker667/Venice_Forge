import React, { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../../stores/auth-store";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useModels } from "../../hooks/use-models";
import { useDataStorageActions } from "../../hooks/use-data-storage-actions";
import { ConfirmModal } from "../ConfirmModal";
import { toast } from "../../stores/toast-store";
import { MemoryPanel } from "../layout/memory-panel";
import { ThemeMaker } from "../ThemeMaker";
import { isElectron, desktopApiKey, desktopJinaApiKey, desktopUpdates, desktopConfig } from "../../services/desktopBridge";
import { redactErrorMessage } from "../../shared/redaction";
import { reloadConfig } from "../../stores/config-store";
import type { UpdateInfo, ProgressInfo } from "electron-updater";
import { ApiKeysPanel } from "./ApiKeysPanel";
import { DefaultsPanel } from "./DefaultsPanel";
import { SafetyPanel } from "./SafetyPanel";
import { DataStoragePanel } from "./DataStoragePanel";
import { UpdatesPanel } from "./UpdatesPanel";
import { ConfigPanel } from "./ConfigPanel";
import { AboutPanel } from "./AboutPanel";
import { ProfilePanel } from "./ProfilePanel";
import type { PendingConfirm } from "./types";

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
  const { systemPrompt, setSystemPrompt, veniceParams, setVeniceParams } = useChatStore();

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
    desktopJinaApiKey
      .isConfigured()
      .then((v) => {
        if (mounted) setJinaKeyConfigured(v);
      })
      .catch(() => {
        if (mounted) setJinaKeyConfigured(false);
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
      },
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
      },
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

  const sectionButtonClass = (section: string) => `
    w-full text-left px-3.5 py-2 rounded-lg text-[13.5px] font-medium transition-all duration-150
    ${activeSection === section
      ? "bg-accent/10 text-accent border border-accent/20"
      : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50 border border-transparent"}
  `;

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex-none p-5 border-b border-border/50 bg-surface">
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
        <div className="w-52 border-r border-border/50 p-3 space-y-1 overflow-y-auto shrink-0 hidden sm:block">
          <button onClick={() => setActiveSection("profiles")} className={sectionButtonClass("profiles")}>
            Profiles
          </button>
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
          {activeSection === "profiles" && (
            <ProfilePanel />
          )}

          {activeSection === "api-keys" && (
            <ApiKeysPanel
              veniceConfigured={veniceConfigured}
              apiKeyInput={apiKeyInput}
              setApiKeyInput={setApiKeyInput}
              apiKeyTesting={apiKeyTesting}
              jinaKeyInput={jinaKeyInput}
              setJinaKeyInput={setJinaKeyInput}
              jinaKeyTesting={jinaKeyTesting}
              jinaKeyConfigured={jinaKeyConfigured}
              onSaveApiKey={handleSaveApiKey}
              onDeleteApiKey={handleDeleteApiKey}
              onTestApiKey={handleTestApiKey}
              onSaveJinaKey={handleSaveJinaKey}
              onDeleteJinaKey={handleDeleteJinaKey}
              onTestJinaKey={handleTestJinaKey}
            />
          )}

          {activeSection === "defaults" && (
            <DefaultsPanel
              currentChatModel={currentChatModel}
              currentImageModel={currentImageModel}
              textModels={textModels}
              imageModels={imageModels}
              systemPrompt={systemPrompt}
              setSystemPrompt={setSystemPrompt}
              veniceParams={veniceParams}
              setVeniceParams={setVeniceParams}
              setSelectedModel={setSelectedModel}
              characterSceneGenerationEnabled={characterSceneGenerationEnabled}
              setCharacterSceneGenerationEnabled={setCharacterSceneGenerationEnabled}
              characterSceneGenerationMode={characterSceneGenerationMode}
              setCharacterSceneGenerationMode={setCharacterSceneGenerationMode}
            />
          )}

          {activeSection === "safety" && (
            <SafetyPanel
              localFamilySafeModeEnabled={localFamilySafeModeEnabled}
              veniceApiSafeMode={veniceApiSafeMode}
              onUpdateSafetySetting={updateSafetySetting}
            />
          )}

          {activeSection === "vault" && isElectron() && <MemoryPanel />}

          {activeSection === "appearance" && (
            <div className="space-y-4">
              <ThemeMaker />
            </div>
          )}

          {activeSection === "data" && (
            <DataStoragePanel
              exportData={exportData}
              importData={importData}
              clearLocalSettings={clearLocalSettings}
              clearAllHistory={clearAllHistory}
            />
          )}

          {activeSection === "about" && <AboutPanel />}

          {activeSection === "updates" && isElectron() && (
            <UpdatesPanel
              updateStatus={updateStatus}
              isUpdateChecking={isUpdateChecking}
              updateDownloaded={updateDownloaded}
              onCheckForUpdates={checkForUpdates}
              onInstallUpdate={installUpdate}
            />
          )}

          {activeSection === "config" && isElectron() && <ConfigPanel />}
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
