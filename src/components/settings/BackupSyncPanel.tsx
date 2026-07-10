import React, { useEffect, useState } from "react";
import { isElectron, desktopSync } from "../../services/desktopBridge";
import { toast } from "../../stores/toast-store";
import { FolderOpen, HardDrive, ShieldCheck, Activity } from "lucide-react";

export function BackupSyncPanel() {
  const [syncFolder, setSyncFolder] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSyncFolder() {
      if (!isElectron()) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await desktopSync.getSyncFolder() as { ok: boolean; path?: string; error?: string };
        if (res.ok && res.path) {
          setSyncFolder(res.path);
        }
      } catch (err) {
        console.error("Failed to load sync folder:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSyncFolder();
  }, []);

  const handleChooseFolder = async () => {
    try {
      const res = await desktopSync.chooseSyncFolder() as { ok: boolean; path?: string; canceled?: boolean; error?: string };
      if (res.canceled) return;
      if (!res.ok || !res.path) {
        toast.error(res.error || "Failed to choose sync folder.");
        return;
      }
      setSyncFolder(res.path);
      toast.success(`Sync folder set to: ${res.path}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to set sync folder: ${msg}`);
    }
  };

  const handleClearFolder = async () => {
    try {
      const res = await desktopSync.setSyncFolder({ path: "" });
      if (!res.ok) {
        toast.error(res.error || "Failed to clear sync folder.");
        return;
      }
      setSyncFolder(null);
      toast.success("Sync disabled.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to clear sync folder: ${msg}`);
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
            {syncFolder ? "Active" : "Off"}
          </div>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm text-text-primary truncate">
              {isLoading ? "Loading..." : (syncFolder || "No sync folder selected")}
            </div>
            <button
              onClick={handleChooseFolder}
              className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent-light transition-colors"
            >
              {syncFolder ? "Change Folder" : "Choose Folder"}
            </button>
            {syncFolder && (
              <button
                onClick={handleClearFolder}
                className="px-4 py-2 bg-surface text-error rounded-lg text-sm font-medium hover:bg-surface-elevated transition-colors border border-border/50"
              >
                Disable
              </button>
            )}
          </div>
          
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
            {syncFolder 
              ? "Sync is active. New changes will be automatically merged. (Conflict resolution UI is under development)." 
              : "Enable sync to monitor activity."}
          </p>
        </div>
      </div>
    </div>
  );
}
