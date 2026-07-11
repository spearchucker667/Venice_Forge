import React, { useEffect, useState } from "react";
import { isElectron, desktopSync } from "../../services/desktopBridge";
import { useSettingsStore } from "../../stores/settings-store";
import { toast } from "../../stores/toast-store";
import { FolderOpen, HardDrive, ShieldCheck, Activity } from "lucide-react";
import { initSyncEngine, pauseSyncEngine } from "../../services/syncEngine";
import type { SyncRuntimeStatus } from "../../types/desktop";

const OFFLINE_STATUS: SyncRuntimeStatus = {
  configured: false,
  mainWatcher: "stopped",
  rendererSessionAttached: false,
  authenticated: false,
};

export function BackupSyncPanel() {
  const settingsSyncFolder = useSettingsStore((s) => s.syncFolderPath);
  const setSettingsSyncFolder = useSettingsStore((s) => s.setSyncFolderPath);
  const [syncFolder, setSyncFolder] = useState<string | null>(settingsSyncFolder || null);
  const [runtimeStatus, setRuntimeStatus] = useState<SyncRuntimeStatus>(OFFLINE_STATUS);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const passphraseRef = React.useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        if (res.ok) {
          if (res.path) {
            setSyncFolder(res.path);
            setSettingsSyncFolder(res.path);
          }
          setRuntimeStatus({
            configured: res.configured,
            mainWatcher: res.mainWatcher,
            rendererSessionAttached: res.rendererSessionAttached,
            authenticated: res.authenticated,
            degradedReason: res.degradedReason,
          });
        }
      } catch (err) {
        console.error("Failed to load sync folder:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSyncState();
  }, [setSettingsSyncFolder]);

  const isSyncActive = runtimeStatus.mainWatcher === "running" && runtimeStatus.rendererSessionAttached;
  const isRendererDetached = runtimeStatus.mainWatcher === "running" && !runtimeStatus.rendererSessionAttached;

  const handleChooseFolder = async () => {
    try {
      const res = await desktopSync.chooseSyncFolder();
      if (res.canceled) return;
      if (!res.ok || !res.path) {
        toast.error(res.error || "Failed to choose sync folder.");
        return;
      }
      setSyncFolder(res.path);
      setSettingsSyncFolder(res.path);
      toast.success("Encrypted sync folder configured.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to set sync folder: ${msg}`);
    }
  };

  const handleStartSync = async () => {
    const passphrase = passphraseRef.current?.value ?? "";
    if (!passphrase) {
      toast.error("Please enter a sync passphrase.");
      return;
    }
    setIsTransitioning(true);
    try {
      const result = await initSyncEngine(passphrase);
      if (!result.ok) {
        toast.error(result.error || "Failed to start sync.");
        setRuntimeStatus((prev) => ({
          ...prev,
          mainWatcher: "error",
          rendererSessionAttached: false,
          authenticated: false,
          degradedReason: result.error || "Failed to start sync.",
        }));
        return;
      }
      setRuntimeStatus((prev) => ({
        ...prev,
        mainWatcher: "running",
        rendererSessionAttached: true,
        authenticated: true,
        degradedReason: undefined,
      }));
      if (passphraseRef.current) passphraseRef.current.value = "";
      toast.success("Sync started.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to start sync: ${msg}`);
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
        toast.error(result.error || "Failed to pause sync.");
        setRuntimeStatus((prev) => ({
          ...prev,
          mainWatcher: "error",
          rendererSessionAttached: false,
          authenticated: false,
          degradedReason: result.error || "Failed to pause sync.",
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
      toast.success("Sync paused. Re-enter the passphrase to resume.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to pause sync: ${msg}`);
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
      toast.error("Please enter the sync passphrase to reattach.");
      return;
    }
    setIsTransitioning(true);
    try {
      const result = await initSyncEngine(passphrase);
      if (!result.ok) {
        toast.error(result.error || "Failed to reattach sync session.");
        return;
      }
      setRuntimeStatus((prev) => ({
        ...prev,
        mainWatcher: "running",
        rendererSessionAttached: true,
        authenticated: true,
        degradedReason: undefined,
      }));
      if (passphraseRef.current) passphraseRef.current.value = "";
      toast.success("Sync session reattached.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to reattach sync: ${msg}`);
    } finally {
      setIsTransitioning(false);
    }
  };

  if (!isElectron()) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-text-primary">Backup & Sync</h3>
          <p className="text-sm text-text-muted mt-1">
            Local-first Sync is currently only available on the Desktop app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-text-primary">Backup & Sync</h3>
        <p className="text-sm text-text-muted mt-1">
          Keep your local data securely synced across your devices without forcing a central cloud account.
        </p>
      </div>

      {/* Sync Folder Section */}
      <div className="border border-border/50 rounded-xl bg-surface-elevated overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-surface-elevated/50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-accent/10 rounded-lg">
              <FolderOpen size={18} className="text-accent" />
            </div>
            <div>
              <h4 className="text-[14.5px] font-medium text-text-primary">Sync Folder</h4>
              <p className="text-[13px] text-text-secondary mt-0.5">
                Continuously sync encrypted data to a folder (e.g. iCloud Drive, Dropbox).
              </p>
            </div>
          </div>
          <div className="px-3 py-1 bg-surface rounded text-xs font-medium text-text-secondary border border-border/50">
            {isSyncActive
              ? "Active"
              : runtimeStatus.mainWatcher === "error"
                ? "Error"
                : syncFolder
                  ? "Paused"
                  : "Off"}
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm text-text-primary truncate">
              {isLoading ? "Loading..." : (syncFolder || "No sync folder selected")}
            </div>
            <button
              onClick={handleChooseFolder}
              disabled={isTransitioning}
              className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent-light transition-colors disabled:opacity-50"
            >
              {syncFolder ? "Change Folder" : "Choose Folder"}
            </button>
          </div>

          {syncFolder && (
            <div className="pt-2 flex items-center space-x-4">
              <input
                ref={passphraseRef}
                type="password"
                placeholder="Enter Encryption Passphrase"
                disabled={isSyncActive || isTransitioning}
                className="flex-1 bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
              />
              {isSyncActive ? (
                <button
                  onClick={handlePauseSync}
                  disabled={isTransitioning}
                  className="px-4 py-2 bg-surface text-error rounded-lg text-sm font-medium hover:bg-surface-elevated transition-colors border border-border/50 whitespace-nowrap disabled:opacity-50"
                >
                  Pause Sync
                </button>
              ) : isRendererDetached ? (
                <button
                  onClick={handleReattachSession}
                  disabled={isTransitioning}
                  className="px-4 py-2 bg-warning/15 text-warning rounded-lg text-sm font-medium hover:bg-warning/25 transition-colors border border-warning/30 whitespace-nowrap disabled:opacity-50"
                >
                  Reattach Session
                </button>
              ) : (
                <button
                  onClick={handleStartSync}
                  disabled={isTransitioning}
                  className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent-light transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  Start Sync
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 p-3 bg-accent/5 border border-accent/10 rounded-lg text-sm text-text-secondary">
            <div className="flex items-center space-x-2">
              <ShieldCheck size={16} className="text-success" />
              <span>All data is AES-256-GCM encrypted before being written to this folder.</span>
            </div>
            <div className="flex items-center space-x-2 text-text-muted text-xs">
              <HardDrive size={14} />
              <span>Your API keys and absolute machine paths are NEVER synced.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Conflicts & Logs section (Phase 5 UI) */}
      <div className="border border-border/50 rounded-xl bg-surface-elevated overflow-hidden">
         <div className="p-4 border-b border-border/50 bg-surface-elevated/50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-warning/10 rounded-lg">
              <Activity size={18} className="text-warning" />
            </div>
            <div>
              <h4 className="text-[14.5px] font-medium text-text-primary">Sync Status & Conflicts</h4>
              <p className="text-[13px] text-text-secondary mt-0.5">
                Monitor sync activity and resolve data conflicts.
              </p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <p className="text-sm text-text-secondary italic">
            {isSyncActive
              ? "Sync is active. New changes will be automatically merged. (Conflict resolution UI is under development)."
              : runtimeStatus.mainWatcher === "error"
                ? `Sync error: ${runtimeStatus.degradedReason}`
                : isRendererDetached
                  ? "The main process watcher is running but the renderer session is detached. Re-enter the passphrase to reattach."
                  : syncFolder
                    ? "Sync is configured but not fully active. Enter the passphrase and start sync."
                    : "Enable sync to monitor activity."}
          </p>
        </div>
      </div>
    </div>
  );
}
