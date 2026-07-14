import React from "react";

export interface DataStoragePanelProps {
  exportData: (password: string) => Promise<void> | void;
  importData: (password: string) => Promise<void> | void;
  clearLocalSettings: () => Promise<void> | void;
  clearAllHistory: () => Promise<void> | void;
}

export function DataStoragePanel({
  exportData,
  importData,
  clearLocalSettings,
  clearAllHistory,
}: DataStoragePanelProps): React.ReactElement {
  const [password, setPassword] = React.useState("");

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/50 bg-surface p-5 shadow-sm space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">Manual Backup</h3>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          Create an encrypted, portable backup of your local history, character cards, and workflows. You can import this backup on any device.
        </p>
        <div className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Backup Password"
            className="w-64 px-3 py-1.5 rounded-lg border border-border bg-surface text-[13px] text-text-primary focus:outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => exportData(password)}
              disabled={!password}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-foreground hover:bg-accent-light transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export Backup
            </button>
            <button
              onClick={() => importData(password)}
              disabled={!password}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import Backup
            </button>
          </div>
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
            Clear IndexedDB Data
          </button>
        </div>
      </div>
    </div>
  );
}
