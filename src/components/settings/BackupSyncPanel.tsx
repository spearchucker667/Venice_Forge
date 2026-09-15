import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isElectron, desktopSync } from "../../services/desktopBridge";
import { useSettingsStore } from "../../stores/settings-store";
import { toast } from "../../stores/toast-store";
import { FolderOpen, HardDrive } from "lucide-react";
import { Meteocon } from "../ui/Meteocon";
import { initSyncEngine, pauseSyncEngine, reattachSyncEngine } from "../../services/syncEngine";
import type { SyncRuntimeStatus } from "../../types/desktop";
import { useConflicts } from "../../hooks/use-conflicts";

const OFFLINE_STATUS: SyncRuntimeStatus = {
  configured: false,
  mainWatcher: "stopped",
  rendererSessionAttached: false,
  authenticated: false,
  includeMedia: false,
};

export function BackupSyncPanel() {
  const { t } = useTranslation(['settings', 'common']);
  const settingsSyncFolder = useSettingsStore((s) => s.syncFolderPath);
  const setSettingsSyncFolder = useSettingsStore((s) => s.setSyncFolderPath);
  // VERIFY-130: sync media opt-in. Defaults to false — media blobs are
  // never auto-synced without an explicit user checkbox tick.
  const syncIncludeMedia = useSettingsStore((s) => s.syncIncludeMedia);
  const setSyncIncludeMedia = useSettingsStore((s) => s.setSyncIncludeMedia);
  const [syncFolder, setSyncFolder] = useState<string | null>(settingsSyncFolder || null);
  const [runtimeStatus, setRuntimeStatus] = useState<SyncRuntimeStatus>(OFFLINE_STATUS);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const passphraseRef = React.useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { conflicts, loading: conflictsLoading, loadConflicts, resolveConflict } = useConflicts();

  useEffect(() => {
    setSyncFolder(settingsSyncFolder || null);
  }, [settingsSyncFolder]);

  useEffect(() => {
    async function loadSyncState() {
      if (!isElectron()) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await desktopSync.getSyncFolder();
        if (!res.ok) {
          setIsLoading(false);
          return;
        }
        if (res.path) {
          setSyncFolder(res.path);
          setSettingsSyncFolder(res.path);
        }
        const initialStatus: SyncRuntimeStatus = {
          configured: res.configured,
          mainWatcher: res.mainWatcher,
          rendererSessionAttached: res.rendererSessionAttached,
          authenticated: res.authenticated,
          degradedReason: res.degradedReason,
          includeMedia: res.includeMedia === true,
        };
        setRuntimeStatus(initialStatus);

        // After a renderer reload, the main watcher may still be running but
        // the renderer session is detached. Reattach automatically if the main
        // process still holds the passphrase; otherwise fall back to the manual
        // "Reattach Session" button.
        if (res.mainWatcher === "running" && !res.rendererSessionAttached) {
          setIsTransitioning(true);
          try {
            const result = await reattachSyncEngine();
            if (result.ok) {
              setRuntimeStatus((prev) => ({
                ...prev,
                rendererSessionAttached: true,
                degradedReason: undefined,
              }));
              toast.success(t('settings:backupSync.toasts.sessionReattached', "Sync session reattached."));
            } else {
              console.warn("[BackupSyncPanel] Automatic reattach failed:", result.error);
            }
          } catch (err) {
            console.error("[BackupSyncPanel] Automatic reattach error:", err);
          } finally {
            setIsTransitioning(false);
          }
        }
      } catch (err) {
        console.error("Failed to load sync folder:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSyncState();
  }, [setSettingsSyncFolder, t]);

  const isSyncActive = runtimeStatus.mainWatcher === "running" && runtimeStatus.rendererSessionAttached;
  const isRendererDetached = runtimeStatus.mainWatcher === "running" && !runtimeStatus.rendererSessionAttached;

  useEffect(() => {
    if (isSyncActive) {
      loadConflicts();
      // Listen for window event venice:backup-imported or similar? 
      // Continuous sync imports might happen anytime.
      const interval = setInterval(loadConflicts, 10000);
      return () => clearInterval(interval);
    }
  }, [isSyncActive, loadConflicts]);

  const handleChooseFolder = async () => {
    try {
      const res = await desktopSync.chooseSyncFolder();
      if (res.canceled) return;
      if (!res.ok || !res.path) {
        toast.error(res.error || t('settings:backupSync.toasts.chooseFolderFailed', "Failed to choose sync folder."));
        return;
      }
      setSyncFolder(res.path);
      setSettingsSyncFolder(res.path);
      toast.success(t('settings:backupSync.toasts.folderConfigured', "Encrypted sync folder configured."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(t('settings:backupSync.toasts.setFolderFailed', { defaultValue: "Failed to set sync folder: {{error}}", error: msg }));
    }
  };

  const handleStartSync = async () => {
    const passphrase = passphraseRef.current?.value ?? "";
    if (!passphrase) {
      toast.error(t('settings:backupSync.toasts.enterPassphrase', "Please enter a sync passphrase."));
      return;
    }
    setIsTransitioning(true);
    try {
      const result = await initSyncEngine(passphrase, syncIncludeMedia);
      if (!result.ok) {
        toast.error(result.error || t('settings:backupSync.toasts.startFailed', "Failed to start sync."));
        setRuntimeStatus((prev) => ({
          ...prev,
          mainWatcher: "error",
          rendererSessionAttached: false,
          authenticated: false,
          degradedReason: result.error || t('settings:backupSync.toasts.startFailed', "Failed to start sync."),
        }));
        return;
      }
      setRuntimeStatus((prev) => ({
        ...prev,
        mainWatcher: "running",
        rendererSessionAttached: true,
        authenticated: true,
        degradedReason: undefined,
        includeMedia: syncIncludeMedia,
      }));
      if (passphraseRef.current) passphraseRef.current.value = "";
      toast.success(syncIncludeMedia
        ? t('settings:backupSync.toasts.syncStartedMedia', "Sync started — media blobs will be synced.")
        : t('settings:backupSync.toasts.syncStartedOptIn', "Sync started — media is opt-in."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(t('settings:backupSync.toasts.startFailedReason', { defaultValue: "Failed to start sync: {{error}}", error: msg }));
      setRuntimeStatus((prev) => ({
        ...prev,
        mainWatcher: "error",
        rendererSessionAttached: false,
        authenticated: false,
        degradedReason: msg,
      }));
    } finally {
      setIsTransitioning(false);
    }
  };

  const handlePauseSync = async () => {
    setIsTransitioning(true);
    try {
      const result = await pauseSyncEngine();
      if (!result.ok) {
        toast.error(result.error || t('settings:backupSync.toasts.pauseFailed', "Failed to pause sync."));
        setRuntimeStatus((prev) => ({
          ...prev,
          mainWatcher: "error",
          rendererSessionAttached: false,
          authenticated: false,
          degradedReason: result.error || t('settings:backupSync.toasts.pauseFailed', "Failed to pause sync."),
        }));
        return;
      }
      setRuntimeStatus((prev) => ({
        ...prev,
        mainWatcher: "paused",
        rendererSessionAttached: false,
        authenticated: false,
        degradedReason: undefined,
      }));
      toast.success(t('settings:backupSync.toasts.syncPaused', "Sync paused. Re-enter the passphrase to resume."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(t('settings:backupSync.toasts.pauseFailedReason', { defaultValue: "Failed to pause sync: {{error}}", error: msg }));
      setRuntimeStatus((prev) => ({
        ...prev,
        mainWatcher: "error",
        rendererSessionAttached: false,
        authenticated: false,
        degradedReason: msg,
      }));
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleReattachSession = async () => {
    const passphrase = passphraseRef.current?.value ?? "";
    if (!passphrase) {
      toast.error(t('settings:backupSync.toasts.enterPassphraseReattach', "Please enter the sync passphrase to reattach."));
      return;
    }
    setIsTransitioning(true);
    try {
      const result = await initSyncEngine(passphrase, syncIncludeMedia);
      if (!result.ok) {
        toast.error(result.error || t('settings:backupSync.toasts.reattachFailed', "Failed to reattach sync session."));
        return;
      }
      setRuntimeStatus((prev) => ({
        ...prev,
        mainWatcher: "running",
        rendererSessionAttached: true,
        authenticated: true,
        degradedReason: undefined,
        includeMedia: syncIncludeMedia,
      }));
      if (passphraseRef.current) passphraseRef.current.value = "";
      toast.success(t('settings:backupSync.toasts.sessionReattached', "Sync session reattached."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(t('settings:backupSync.toasts.reattachFailedReason', { defaultValue: "Failed to reattach sync: {{error}}", error: msg }));
    } finally {
      setIsTransitioning(false);
    }
  };

  if (!isElectron()) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-text-primary">{t('settings:backupSync.title', 'Backup & Sync')}</h3>
          <p className="text-sm text-text-muted mt-1">
            {t('settings:backupSync.desktopOnly', 'Local-first Sync is currently only available on the Desktop app.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-text-primary">{t('settings:backupSync.title', 'Backup & Sync')}</h3>
        <p className="text-sm text-text-muted mt-1">
          {t('settings:backupSync.description', 'Keep your local data securely synced across your devices without forcing a central cloud account.')}
        </p>
      </div>

      {/* Sync Folder Section */}
      <div className="border border-vf-panel-border rounded-xl bg-vf-panel-bg-raised overflow-hidden">
        <div className="p-4 border-b border-vf-panel-border bg-vf-panel-bg-raised flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-accent/10 rounded-lg">
              <FolderOpen size={18} className="text-accent" />
            </div>
            <div>
              <h4 className="text-[14.5px] font-medium text-text-primary">{t('settings:backupSync.syncFolder.title', 'Sync Folder')}</h4>
              <p className="text-[13px] text-text-secondary mt-0.5">
                {t('settings:backupSync.syncFolder.description', 'Continuously sync encrypted data to a folder (e.g. iCloud Drive, Dropbox).')}
              </p>
            </div>
          </div>
          <div className="px-3 py-1 bg-vf-panel-bg rounded text-xs font-medium text-text-secondary border border-vf-panel-border">
            {isSyncActive
              ? t('settings:backupSync.status.active', 'Active')
              : runtimeStatus.mainWatcher === "error"
                ? t('settings:backupSync.status.error', 'Error')
                : syncFolder
                  ? t('settings:backupSync.status.paused', 'Paused')
                  : t('settings:backupSync.status.off', 'Off')}
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 bg-vf-panel-bg border border-vf-panel-border rounded-lg px-3 py-2 text-sm text-text-primary truncate">
              {isLoading ? t('common:status.loading', 'Loading...') : (syncFolder || t('settings:backupSync.syncFolder.none', 'No sync folder selected'))}
            </div>
            <button
              onClick={handleChooseFolder}
              disabled={isTransitioning}
              className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent-light transition-colors disabled:opacity-50"
            >
              {syncFolder ? t('settings:backupSync.syncFolder.change', 'Change Folder') : t('settings:backupSync.syncFolder.choose', 'Choose Folder')}
            </button>
          </div>

          {syncFolder && (
            <div className="pt-2 flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-sm text-text-secondary select-none">
                <input
                  type="checkbox"
                  checked={syncIncludeMedia}
                  disabled={isSyncActive || isTransitioning}
                  onChange={(e) => setSyncIncludeMedia(e.target.checked)}
                  className="h-4 w-4 rounded border-vf-panel-border bg-vf-panel-bg accent-accent"
                  aria-label={t('settings:backupSync.syncFolder.includeMedia', 'Include media blobs in sync packets')}
                />
                <span>
                  {t('settings:backupSync.syncFolder.includeMedia', 'Include media blobs')} <span className="text-text-muted">{t('settings:backupSync.syncFolder.includeMediaNote', '(images, files, RP assets)')}</span>
                </span>
              </label>
            </div>
          )}

          {syncFolder && (
            <div className="pt-1 flex items-center space-x-4">
              <input
                ref={passphraseRef}
                type="password"
                placeholder={t('settings:backupSync.syncFolder.passphrasePlaceholder', 'Enter Encryption Passphrase')}
                disabled={isSyncActive || isTransitioning}
                className="flex-1 bg-vf-panel-bg border border-vf-panel-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
              />
              {isSyncActive ? (
                <button
                  onClick={handlePauseSync}
                  disabled={isTransitioning}
                  className="px-4 py-2 bg-vf-panel-bg text-error rounded-lg text-sm font-medium hover:bg-vf-panel-bg-raised transition-colors border border-vf-panel-border whitespace-nowrap disabled:opacity-50"
                >
                  {t('settings:backupSync.syncFolder.pause', 'Pause Sync')}
                </button>
              ) : isRendererDetached ? (
                <button
                  onClick={handleReattachSession}
                  disabled={isTransitioning}
                  className="px-4 py-2 bg-warning/15 text-warning rounded-lg text-sm font-medium hover:bg-warning/25 transition-colors border border-warning/30 whitespace-nowrap disabled:opacity-50"
                >
                  {t('settings:backupSync.syncFolder.reattach', 'Reattach Session')}
                </button>
              ) : (
                <button
                  onClick={handleStartSync}
                  disabled={isTransitioning}
                  className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent-light transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {t('settings:backupSync.syncFolder.start', 'Start Sync')}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 p-3 bg-accent/5 border border-accent/10 rounded-lg text-sm text-text-secondary">
            <div className="flex items-center space-x-2">
              <Meteocon name="umbrella" size={16} className="text-success" />
              <span>{t('settings:backupSync.security.encryption', 'Sync packets use Argon2id-derived XChaCha20-Poly1305 encryption before being written to this folder.')}</span>
            </div>
            <div className="flex items-center space-x-2 text-text-muted text-xs">
              <HardDrive size={14} />
              <span>{t('settings:backupSync.security.noKeys', 'Your API keys and absolute machine paths are NEVER synced.')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Conflicts & Logs section (Phase 5 UI) */}
      <div className="border border-vf-panel-border rounded-xl bg-vf-panel-bg-raised overflow-hidden">
         <div className="p-4 border-b border-vf-panel-border bg-vf-panel-bg-raised flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-warning/10 rounded-lg">
              <Meteocon name="humidity" size={18} className="text-warning" />
            </div>
            <div>
              <h4 className="text-[14.5px] font-medium text-text-primary">{t('settings:backupSync.conflicts.title', 'Sync Status & Conflicts')}</h4>
              <p className="text-[13px] text-text-secondary mt-0.5">
                {t('settings:backupSync.conflicts.description', 'Monitor sync activity and resolve data conflicts.')}
              </p>
            </div>
          </div>
        </div>
        <div className="p-4">
          {!isSyncActive ? (
            <p className="text-sm text-text-secondary italic">
              {runtimeStatus.mainWatcher === "error"
                ? t('settings:backupSync.conflicts.statusError', { defaultValue: 'Sync error: {{error}}', error: runtimeStatus.degradedReason })
                : isRendererDetached
                  ? t('settings:backupSync.conflicts.statusDetached', 'The main process watcher is running but the renderer session is detached. Re-enter the passphrase to reattach.')
                  : syncFolder
                    ? t('settings:backupSync.conflicts.statusConfigured', 'Sync is configured but not fully active. Enter the passphrase and start sync.')
                    : t('settings:backupSync.conflicts.statusDisabled', 'Enable sync to monitor activity.')}
            </p>
          ) : conflictsLoading && conflicts.length === 0 ? (
            <p className="text-sm text-text-secondary">{t('settings:backupSync.conflicts.checking', 'Checking for conflicts...')}</p>
          ) : conflicts.length === 0 ? (
            <p className="text-sm text-text-secondary italic text-success">
              {t('settings:backupSync.conflicts.noConflicts', 'Sync is active. No conflicts found.')}
              {runtimeStatus.includeMedia
                ? t('settings:backupSync.conflicts.mediaIncluded', ' Media blobs are included.')
                : t('settings:backupSync.conflicts.mediaExcluded', ' Media blobs are excluded (opt-in).')}
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary font-medium mb-2">
                {t('settings:backupSync.conflicts.found', { defaultValue: 'Found {{count}} conflict(s). Resolve them below:', count: conflicts.length })}
              </p>
              {conflicts.map((conflict) => {
                const winnerLabel =
                  conflict.provenance?.winningDeviceId ||
                  (typeof conflict.originalRecord?.deviceId === "string"
                    ? conflict.originalRecord.deviceId
                    : "current");
                const loserLabel =
                  conflict.provenance?.losingDeviceId ||
                  (typeof conflict.conflictRecord?.deviceId === "string"
                    ? conflict.conflictRecord.deviceId
                    : "incoming");
                const winnerTitle = conflict.originalRecord?.name || conflict.originalRecord?.title || t('common:status.untitled', 'Untitled');
                const loserTitleRaw =
                  conflict.conflictRecord?.name || conflict.conflictRecord?.title || t('common:status.untitledLowercase', '(untitled)');
                const loserTitle = String(loserTitleRaw).replace(/ \(Conflict from .*\)$/, "");
                return (
                  <div key={conflict.conflictId} className="bg-vf-panel-bg border border-vf-panel-border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <h5 className="text-[13px] font-medium text-text-primary">
                          {conflict.storeName} — {winnerTitle}
                        </h5>
                        <p className="text-[11px] text-text-muted">ID: {conflict.originalId}</p>
                        <p className="text-[11px] text-text-secondary mt-1">
                          {t('settings:backupSync.conflicts.resolutionNote', { defaultValue: 'Sync kept {{winner}}; the conflicting {{loser}} revision ({{loserTitle}}) is preserved until you resolve the conflict.', winner: winnerLabel, loser: loserLabel, loserTitle: loserTitle })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => resolveConflict(conflict, "keep_original")}
                        className="px-3 py-1.5 bg-vf-panel-bg-raised hover:bg-accent/10 hover:text-accent text-text-secondary rounded text-[12px] font-medium border border-vf-panel-border transition-colors flex-1"
                        title={t('settings:backupSync.conflicts.keepOriginalTitle', 'Keep the revision currently saved at this id and discard the conflicting copy.')}
                      >
                        {t('settings:backupSync.conflicts.keepOriginal', { defaultValue: 'Keep {{winner}} copy', winner: winnerLabel })}
                      </button>
                      <button
                        onClick={() => resolveConflict(conflict, "keep_conflict")}
                        className="px-3 py-1.5 bg-vf-panel-bg-raised hover:bg-warning/10 hover:text-warning text-text-secondary rounded text-[12px] font-medium border border-vf-panel-border transition-colors flex-1"
                        title={t('settings:backupSync.conflicts.keepConflictTitle', { defaultValue: 'Replace the current revision with the {{loser}} copy.', loser: loserLabel })}
                      >
                        {t('settings:backupSync.conflicts.keepConflict', { defaultValue: 'Use {{loser}} copy', loser: loserLabel })}
                      </button>
                      <button
                        onClick={() => resolveConflict(conflict, "keep_both")}
                        className="px-3 py-1.5 bg-vf-panel-bg-raised hover:bg-success/10 hover:text-success text-text-secondary rounded text-[12px] font-medium border border-vf-panel-border transition-colors flex-1"
                        title={t('settings:backupSync.conflicts.keepBothTitle', { defaultValue: 'Keep the current revision and save the {{loser}} copy as a separate record.', loser: loserLabel })}
                      >
                        {t('settings:backupSync.conflicts.keepBoth', { defaultValue: 'Save {{loser}} as copy', loser: loserLabel })}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
