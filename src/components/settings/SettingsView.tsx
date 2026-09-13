import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
import { KeyIcon, CloudIcon, GlobeIcon } from "lucide-react";
import { LanguageRegionPanel } from "./LanguageRegionPanel";
import { ApiKeysPanel } from "./ApiKeysPanel";
import { ProvidersPanel } from "./ProvidersPanel";
import { DefaultsPanel } from "./DefaultsPanel";
import { SafetyPanel } from "./SafetyPanel";
import { DataStoragePanel } from "./DataStoragePanel";
import { UpdatesPanel } from "./UpdatesPanel";
import { ConfigPanel } from "./ConfigPanel";
import { AboutPanel } from "./AboutPanel";
import { ProfilePanel } from "./ProfilePanel";
import { BackupSyncPanel } from "./BackupSyncPanel";
import { AudioSpeechPanel } from "./AudioSpeechPanel";
import { FontSettingsPanel } from "./FontSettingsPanel";
import type { PendingConfirm } from "./types";
import { modelSupportsEdit } from "../../constants/venice";

// i18n-allow-next-line: toast is ephemeral, matches the api-key dialog message
const API_KEY_SAVED_OFFLINE_TOAST = "API key saved. Venice is unreachable — try the connection test when the network is back.";
// i18n-allow-next-line: toast is ephemeral, matches the api-key dialog message
const API_KEY_INVALID_TOAST = "API key stored, but Venice rejected it. Delete and re-enter, or test again.";
// i18n-allow-next-line: toast is ephemeral, matches the api-key dialog message
const API_KEY_SAVED_UNVERIFIED_TOAST = "API key saved, but Venice connectivity could not be verified.";

export function SettingsView() {
  const { t } = useTranslation(['settings', 'common']);
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

  const pendingSettingsSection = useSettingsStore((s) => s.pendingSettingsSection);
  const setPendingSettingsSection = useSettingsStore((s) => s.setPendingSettingsSection);
  const [activeSection, setActiveSection] = useState<string>(
    pendingSettingsSection ?? "api-keys",
  );
  // Honour a one-shot deep-link from outside (e.g. onboarding "Create Profile").
  // When the user navigates away from settings elsewhere, the pending field
  // is cleared by the next user-driven section change.
  useEffect(() => {
    if (!pendingSettingsSection) return;
    setActiveSection(pendingSettingsSection);
    setPendingSettingsSection(null);
  }, [pendingSettingsSection, setPendingSettingsSection]);

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
  const { clearLocalSettings, clearAllHistory, exportData } = useDataStorageActions({
    setSystemPrompt,
    setVeniceParams,
    setPendingConfirm,
  });

  // Load models
  const { data: textModels } = useModels("text");
  const { data: imageModels } = useModels("image");
  // Exclude image-edit models from the text-to-image selector.
  // Edit models appear only in the Image Tools panel's own model picker.
  const textToImageModels = imageModels?.filter((m) => !modelSupportsEdit(m));

  const currentChatModel = selectedModels["chat"] || textModels?.[0]?.id || "";
  const currentImageModel = selectedModels["image"] || textToImageModels?.[0]?.id || "";

  async function updateSafetySetting(
    key: "local_family_safe_mode_enabled" | "venice_api_safe_mode",
    enabled: boolean,
    masterPassword?: string
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
      let result;
      if (key === "local_family_safe_mode_enabled") {
        const { desktopSafety } = await import('../../services/desktopBridge');
        result = await desktopSafety.setFamilySafeMode(enabled, masterPassword);
      } else {
        result = await desktopConfig.writeSanitized({ safety: { [key]: enabled } });
      }
      if (!result.ok) {
        if (key === "local_family_safe_mode_enabled") setLocalFamilySafeModeEnabled(previousFamily);
        else setVeniceApiSafeMode(previousVenice);
        toast.error(result.error || t('settings:errors.persistSafety', "Failed to persist safety setting."));
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
        setUpdateStatus(t('settings:updates.available', { defaultValue: 'Update available: v{{version}}', version: info?.version || "new" }));
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onUpdateNotAvailable(() => {
        updateEventSeenRef.current = true;
        setUpdateStatus(t('settings:updates.upToDate', 'App is up to date.'));
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onDownloadProgress((progress: ProgressInfo) => {
        updateEventSeenRef.current = true;
        setUpdateStatus(t('settings:updates.downloading', { defaultValue: 'Downloading update: {{percent}}%', percent: Math.round(progress?.percent || 0) }));
      }),
      desktopUpdates.onUpdateDownloaded(() => {
        updateEventSeenRef.current = true;
        setUpdateStatus(t('settings:updates.downloaded', 'Update downloaded and ready to install.'));
        setUpdateDownloaded(true);
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onUpdateError((err: string) => {
        updateEventSeenRef.current = true;
        setUpdateStatus(t('settings:updates.error', { defaultValue: 'Update error: {{error}}', error: err }));
        setIsUpdateChecking(false);
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [t]);

  async function checkForUpdates() {
    setIsUpdateChecking(true);
    updateEventSeenRef.current = false;
    setUpdateStatus(t('settings:updates.checking', "Checking for updates..."));
    try {
      const res = await desktopUpdates.checkForUpdates();
      if (!res.ok) {
        const raw = res.error ?? "Unknown error";
        const msg = raw.startsWith("Error: ") ? raw.slice(7) : raw;
        setUpdateStatus(msg === "Update checks are only available in production builds."
          ? t('settings:updates.devBuild', "Development build — update checks run only in packaged production builds.")
          : t('settings:updates.checkFailed', { defaultValue: "Update check failed: {{error}}", error: msg }));
      } else if (!updateEventSeenRef.current) {
        setUpdateStatus(t('settings:updates.checkCompleted', "Update check completed."));
      }
    } catch (err: unknown) {
      const message = redactErrorMessage(err);
      setUpdateStatus(t('settings:updates.checkFailed', { defaultValue: "Update check failed: {{error}}", error: message }));
    } finally {
      setIsUpdateChecking(false);
    }
  }

  async function installUpdate() {
    try {
      await desktopUpdates.installUpdate();
    } catch (err: unknown) {
      const message = redactErrorMessage(err);
      setUpdateStatus(t('settings:updates.installFailed', { defaultValue: "Install failed: {{error}}", error: message }));
    }
  }

  // Key operations
  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return;
    const outcome = await setApiKey(apiKeyInput.trim());
    setApiKeyInput("");
    if (!outcome.stored) {
      toast.error(t('settings:apiKeys.saveFailed', "Failed to save API key."), outcome.safeMessage);
      return;
    }
    if (outcome.validation === "valid") {
      toast.success(isElectron()
        ? t('settings:apiKeys.savedElectron', "Venice API key saved securely.")
        : t('settings:apiKeys.savedWeb', "Venice API key saved for this development session."));
      return;
    }
    if (outcome.validation === "network-error") {
      toast.info(API_KEY_SAVED_OFFLINE_TOAST);
      return;
    }
    if (outcome.validation === "invalid") {
      toast.error(API_KEY_INVALID_TOAST);
      return;
    }
    toast.info(API_KEY_SAVED_UNVERIFIED_TOAST);
  }

  async function handleDeleteApiKey() {
    setPendingConfirm({
      message: t('settings:apiKeys.deleteConfirm.title', "Delete Venice API key?"),
      detail: isElectron()
        ? t('settings:apiKeys.deleteConfirm.electron', "This will remove your Venice API key from OS secure storage. You will need to re-enter it to make requests.")
        : t('settings:apiKeys.deleteConfirm.web', "This will remove the Venice API key from the current development session."),
      onConfirm: async () => {
        try {
          await clearApiKey();
          toast.success(t('settings:apiKeys.deleted', "Venice API key deleted."));
        } catch (err) {
          toast.error(t('settings:apiKeys.deleteFailed', "Failed to delete API key."), redactErrorMessage(err));
        }
      },
    });
  }

  async function handleTestApiKey() {
    setApiKeyTesting(true);
    try {
      const result = await desktopApiKey.test();
      if (result.ok) {
        toast.success(t('settings:apiKeys.testSuccess', { defaultValue: 'Connection successful{{status}}.', status: result.status ? ` (HTTP ${result.status})` : "" }));
      } else {
        toast.error(t('settings:apiKeys.testFailed', { defaultValue: 'Connection failed: {{message}}', message: result.message }));
      }
    } catch (err) {
      toast.error(t('settings:apiKeys.testError', "Test connection failed."), redactErrorMessage(err));
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
      toast.success(isElectron() ? t('settings:jinaKeys.savedElectron', "Jina API key saved securely.") : t('settings:jinaKeys.savedWeb', "Jina API key saved for this browser session."));
    } catch (err) {
      toast.error(t('settings:jinaKeys.saveFailed', "Failed to save Jina API key."), redactErrorMessage(err));
    }
  }

  async function handleDeleteJinaKey() {
    setPendingConfirm({
      message: t('settings:jinaKeys.deleteConfirm.title', "Delete Jina API key?"),
      detail: isElectron()
        ? t('settings:jinaKeys.deleteConfirm.electron', "This will remove your Jina API key from OS secure storage.")
        : t('settings:jinaKeys.deleteConfirm.web', "This will remove the in-memory Jina API key for this browser session."),
      onConfirm: async () => {
        try {
          await desktopJinaApiKey.delete();
          setJinaKeyConfigured(false);
          toast.success(t('settings:jinaKeys.deleted', "Jina API key deleted."));
        } catch (err) {
          toast.error(t('settings:jinaKeys.deleteFailed', "Failed to delete Jina API key."), redactErrorMessage(err));
        }
      },
    });
  }

  async function handleTestJinaKey() {
    setJinaKeyTesting(true);
    try {
      const result = await desktopJinaApiKey.test();
      useAuthStore.getState().recordJinaValidation(result.ok ? "valid" : "invalid");
      if (result.ok) {
        toast.success(t('settings:jinaKeys.testSuccess', { defaultValue: 'Jina connection successful{{status}}.', status: result.status ? ` (HTTP ${result.status})` : "" }));
      } else {
        toast.error(t('settings:jinaKeys.testFailed', { defaultValue: 'Jina connection failed: {{message}}', message: result.message }));
      }
    } catch (err) {
      useAuthStore.getState().recordJinaValidation("network-error");
      toast.error(t('settings:jinaKeys.testError', "Jina test connection failed."), redactErrorMessage(err));
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
            <h2 className="text-[17px] font-semibold text-text-primary">{t('settings:header.title', 'Config')}</h2>
            <p className="text-[12.5px] text-text-muted mt-0.5">
              {isElectron() ? t('settings:header.description.electron', 'Manage API endpoints, defaults, and appearance styles.') : t('settings:header.description.web', 'Configure default prompts and styling templates.')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Navigation Rail */}
        <div className="w-52 border-r border-border/50 p-3 space-y-1 overflow-y-auto shrink-0 hidden sm:block">
          <button onClick={() => setActiveSection("language")} className={sectionButtonClass("language")}>
            <div className="flex items-center gap-2.5">
              <GlobeIcon className="w-4 h-4 opacity-75" />
              <span className="font-medium">{t('settings:tabs.languageRegion', 'Language & Region')}</span>
            </div>
          </button>
          <button onClick={() => setActiveSection("profiles")} className={sectionButtonClass("profiles")}>
            {t('settings:tabs.profiles', 'Profiles')}
          </button>
          <button onClick={() => setActiveSection("api-keys")} className={sectionButtonClass("api-keys")}>
            <div className="flex items-center gap-2.5">
              <KeyIcon className="w-4 h-4 opacity-75" />
              <span className="font-medium">{t('settings:tabs.apiKeys', 'Venice API Key')}</span>
            </div>
          </button>

          <button onClick={() => setActiveSection("providers")} className={sectionButtonClass("providers")}>
            <div className="flex items-center gap-2.5">
              <CloudIcon className="w-4 h-4 opacity-75" />
              <span className="font-medium">{t('settings:tabs.providers', 'Fallback Providers')}</span>
            </div>
          </button>

          <button onClick={() => setActiveSection("defaults")} className={sectionButtonClass("defaults")}>
            {t('settings:tabs.defaults', 'Defaults & Behavior')}
          </button>
          <button onClick={() => setActiveSection("safety")} className={sectionButtonClass("safety")}>
            {t('settings:tabs.safety', 'Safety')}
          </button>
          {isElectron() && (
            <button onClick={() => setActiveSection("vault")} className={sectionButtonClass("vault")}>
              {t('settings:tabs.vault', 'Conversation Vault')}
            </button>
          )}
          <button onClick={() => setActiveSection("appearance")} className={sectionButtonClass("appearance")}>
            {t('settings:tabs.appearance', 'Appearance')}
          </button>
          <button onClick={() => setActiveSection("data")} className={sectionButtonClass("data")}>
            {t('settings:tabs.data', 'Data & Storage')}
          </button>
          <button onClick={() => setActiveSection("backup-sync")} className={sectionButtonClass("backup-sync")}>
            {t('settings:tabs.backupSync', 'Backup & Sync')}
          </button>
          <button onClick={() => setActiveSection("about")} className={sectionButtonClass("about")}>
            {t('settings:tabs.about', 'About & Legal')}
          </button>
          {isElectron() && (
            <button onClick={() => setActiveSection("updates")} className={sectionButtonClass("updates")}>
              {t('settings:tabs.updates', 'Updates')}
              {updateDownloaded && <span className="ml-2 inline-flex w-1.5 h-1.5 rounded-full bg-success"></span>}
            </button>
          )}
          {isElectron() && (
            <button onClick={() => setActiveSection("config")} className={sectionButtonClass("config")}>
              {t('settings:tabs.config', 'Local Config')}
            </button>
          )}
          <button onClick={() => setActiveSection("audio-speech")} className={sectionButtonClass("audio-speech")}>
            {t('settings:tabs.audioSpeech', 'Audio & Speech')}
          </button>
        </div>

        {/* Content panel */}
        <div className="flex-1 overflow-y-auto p-6 w-full">
          {activeSection === "language" && (
            <LanguageRegionPanel />
          )}

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

          {activeSection === "providers" && <ProvidersPanel />}

          {activeSection === "defaults" && (
            <DefaultsPanel
              currentChatModel={currentChatModel}
              currentImageModel={currentImageModel}
              textModels={textModels}
              imageModels={textToImageModels}
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
            <div className="space-y-6">
              <FontSettingsPanel />
              <ThemeMaker />
            </div>
          )}

          {activeSection === "data" && (
            <DataStoragePanel
              exportData={exportData}
              clearLocalSettings={clearLocalSettings}
              clearAllHistory={clearAllHistory}
            />
          )}

          {activeSection === "backup-sync" && (
            <BackupSyncPanel />
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

          {activeSection === "audio-speech" && <AudioSpeechPanel />}
        </div>
      </div>

      <ConfirmModal
        open={!!pendingConfirm}
        message={pendingConfirm?.message || ""}
        detail={pendingConfirm?.detail}
        confirmLabel={t('common:actions.importAll', 'Import all')}
        cancelLabel={t('common:actions.cancel', 'Cancel')}
        tertiaryAction={
          applySafetyTertiaryRef.current
            ? { label: t('settings:safety.keepCurrent', 'Keep current safety'), onClick: () => applySafetyTertiaryRef.current?.() }
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
