import React from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation(['settings', 'common']);
  return (
    <div className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-4">
      <h3 className="text-[14.5px] font-medium text-text-primary font-semibold">{t('settings:updatesPanel.title', 'Application Updates')}</h3>
      <p className="text-[12.5px] text-text-secondary leading-relaxed">
        {t('settings:updatesPanel.description', 'Check for desktop application updates securely via GitHub Releases.')}
      </p>
      <div className="space-y-4">
        <div className="text-[13px] text-text-secondary">
          <span className="text-text-muted mr-2">{t('settings:updatesPanel.status', 'Status:')}</span>
          <span className="font-mono bg-vf-panel-bg border border-vf-panel-border rounded px-2 py-0.5 text-text-primary">
            {updateStatus || t('common:status.idle', 'Idle')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={onCheckForUpdates}
            disabled={isUpdateChecking || updateDownloaded}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-primary hover:bg-vf-panel-bg-raised transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isUpdateChecking ? t('settings:updatesPanel.checking', 'Checking...') : t('settings:updatesPanel.checkForUpdates', 'Check for updates')}
          </button>
          {updateDownloaded && (
            <button
              onClick={onInstallUpdate}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-success text-accent-fg hover:opacity-90 transition-colors cursor-pointer"
            >
              {t('settings:updatesPanel.restartAndInstall', 'Restart and Install')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
