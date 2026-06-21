import React from "react";

export interface UpdatesPanelProps {
  updateStatus: string;
  isUpdateChecking: boolean;
  updateDownloaded: boolean;
  onCheckForUpdates: () => Promise<void> | void;
  onInstallUpdate: () => Promise<void> | void;
}

export function UpdatesPanel({
  updateStatus,
  isUpdateChecking,
  updateDownloaded,
  onCheckForUpdates,
  onInstallUpdate,
}: UpdatesPanelProps): React.ReactElement {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
      <h3 className="text-[14.5px] font-medium text-text-primary font-semibold">Application Updates</h3>
      <p className="text-[12.5px] text-text-secondary leading-relaxed">
        Check for desktop application updates securely via GitHub Releases.
      </p>
      <div className="space-y-4">
        <div className="text-[13px] text-text-secondary">
          <span className="text-text-muted mr-2">Status:</span>
          <span className="font-mono bg-surface border border-border rounded px-2 py-0.5 text-text-primary">
            {updateStatus || "Idle"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={onCheckForUpdates}
            disabled={isUpdateChecking || updateDownloaded}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isUpdateChecking ? "Checking..." : "Check for updates"}
          </button>
          {updateDownloaded && (
            <button
              onClick={onInstallUpdate}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-success text-accent-fg hover:opacity-90 transition-colors cursor-pointer"
            >
              Restart and Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
