import React from "react";

export interface DataStoragePanelProps {
  exportData: () => Promise<void> | void;
  importData: () => Promise<void> | void;
  clearLocalSettings: () => Promise<void> | void;
  clearAllHistory: () => Promise<void> | void;
}

export function DataStoragePanel({
  exportData,
  importData,
  clearLocalSettings,
  clearAllHistory,
}: DataStoragePanelProps): React.ReactElement {
  return (
    <div className="space-y-5">
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
  );
}
