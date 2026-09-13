import React, { useState } from "react";
import { useTranslation , Trans} from "react-i18next";
import { useConfigStore, reloadConfig } from "../../stores/config-store";
import { toast } from "../../stores/toast-store";
import { askDecision } from "../ui/modal-requests";
import { redactErrorMessage } from "../../shared/redaction";
import { desktopFiles, desktopConfig } from "../../services/desktopBridge";
import { FontSettingsPanel } from "./FontSettingsPanel";

/** Settings panel that surfaces the local master YAML config. */
export function ConfigPanel(): React.ReactElement {
  const { t } = useTranslation(['settings', 'common']);
  const config = useConfigStore((s) => s.config);
  const status = useConfigStore((s) => s.status);
  const loading = useConfigStore((s) => s.loading);
  const error = useConfigStore((s) => s.error);
  const [working, setWorking] = useState(false);

  const handleReload = async (): Promise<void> => {
    setWorking(true);
    try {
      await reloadConfig();
      toast.success(t('settings:configPanel.toasts.reloaded', "Local config reloaded."));
    } catch (err) {
      toast.error(t('settings:configPanel.toasts.reloadFailed', "Failed to reload config."), redactErrorMessage(err));
    } finally {
      setWorking(false);
    }
  };

  const handleOpenFolder = async (): Promise<void> => {
    setWorking(true);
    try {
      const res = await desktopConfig.openFolder();
      if (!res.ok) toast.error(res.error || t('settings:configPanel.toasts.openFolderFailed', "Failed to open config folder."));
    } catch (err) {
      toast.error(t('settings:configPanel.toasts.openFolderFailed', "Failed to open config folder."), redactErrorMessage(err));
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
        filename,
      );
      if (ok) toast.success(t('settings:configPanel.toasts.templateExported', "Template exported."));
      else toast.info(t('settings:configPanel.toasts.exportCancelled', "Export cancelled."));
    } catch (err) {
      toast.error(t('settings:configPanel.toasts.exportFailed', "Failed to export config template."), redactErrorMessage(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      <FontSettingsPanel />
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-3">
        <h3 className="text-[15px] font-semibold text-text-primary">{t('settings:configPanel.masterConfig.title', 'Local Master Config')}</h3>
        <p className="text-[12.5px] text-text-secondary">
          {t('settings:configPanel.masterConfig.description1', 'Edit ')}<code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]"><Trans i18nKey="common:surface.componentsSettingsConfigpanel.text.configYaml" /></code>{t('settings:configPanel.masterConfig.description2', ' and ')}
          <code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]"><Trans i18nKey="common:surface.componentsSettingsConfigpanel.text.themesYaml" /></code>{t('settings:configPanel.masterConfig.description3', ' on disk to configure Venice Forge without touching the UI. See ')}
          <code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]">docs/CONFIG.md</code>{t('settings:configPanel.masterConfig.description4', ' for the full schema.')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">{t('settings:configPanel.masterConfig.configPath', 'Config path')}</div>
            <div className="text-text-primary font-mono break-all">{status?.configPath || t('settings:configPanel.masterConfig.unavailable', '(unavailable)')}</div>
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">{t('settings:configPanel.masterConfig.themesPath', 'Themes path')}</div>
            <div className="text-text-primary font-mono break-all">{status?.themesPath || t('settings:configPanel.masterConfig.unavailable', '(unavailable)')}</div>
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">{t('settings:configPanel.masterConfig.loadedFrom', 'Loaded from')}</div>
            <div className="text-text-primary">{status?.source || "—"}</div>
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">{t('settings:configPanel.masterConfig.profile', 'Profile')}</div>
            <div className="text-text-primary">
              {status?.configName || "default"} / {status?.profile || "default"}
            </div>
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-[12px] text-danger">{error}</div>
        )}
        {status?.parseError && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[12px] text-warning">
            {t('settings:configPanel.masterConfig.parseError', 'Parse error:')} {status.parseError}
          </div>
        )}
        {status?.warnings && status.warnings.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[12px] space-y-1">
            <div className="font-medium text-warning">{t('settings:configPanel.masterConfig.validationWarnings', 'Validation warnings')}</div>
            <ul className="list-disc list-inside text-text-secondary">
              {status.warnings.map((w, i) => (
                <li key={i}>
                  <span className="font-mono">{w.field}</span>: {w.message} ({w.severity})
                </li>
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
            {working ? t('common:status.working', 'Working…') : t('settings:configPanel.actions.reload', 'Reload Config')}
          </button>
          <button
            onClick={handleOpenFolder}
            disabled={working}
            className="px-3 py-1.5 rounded-md border border-border bg-surface text-text-primary text-[12.5px] hover:bg-surface-elevated disabled:opacity-50"
          >
            {t('settings:configPanel.actions.openFolder', 'Open Config Folder')}
          </button>
          <button
            onClick={handleExport}
            disabled={working}
            className="px-3 py-1.5 rounded-md border border-border bg-surface text-text-primary text-[12.5px] hover:bg-surface-elevated disabled:opacity-50"
          >
            {t('settings:configPanel.actions.exportTemplate', 'Export Sanitized Template')}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-3">
        <h3 className="text-[15px] font-semibold text-text-primary">{t('settings:configPanel.apiKeyImport.title', 'API Key Import')}</h3>
        <p className="text-[12.5px] text-text-secondary">
          {t('settings:configPanel.apiKeyImport.description1', 'Plaintext keys in ')}<code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]"><Trans i18nKey="common:surface.componentsSettingsConfigpanel.text.configYaml" /></code>{t('settings:configPanel.apiKeyImport.description2', ' are imported into OS secure storage on startup and redacted from the file (unless ')}
          <code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]"><Trans i18nKey="common:surface.componentsSettingsConfigpanel.text.secretsKeepPlaintextKeysTrue" /></code>{t('settings:configPanel.apiKeyImport.description3', ' is set).')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">{t('settings:configPanel.apiKeyImport.veniceKey', 'Venice key')}</div>
            <div className="text-text-primary">
              {status?.secureStore.venice ? t('settings:configPanel.apiKeyImport.configured', 'Configured (secure store)') : t('settings:configPanel.apiKeyImport.notConfigured', 'Not configured')}
            </div>
            {status?.keysImported.venice && <div className="text-success mt-1">{t('settings:configPanel.apiKeyImport.imported', 'Imported this run')}</div>}
            {status?.keysRedacted.venice && <div className="text-text-muted mt-1">{t('settings:configPanel.apiKeyImport.redacted', 'Plaintext redacted')}</div>}
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">{t('settings:configPanel.apiKeyImport.jinaKey', 'Jina key')}</div>
            <div className="text-text-primary">
              {status?.secureStore.jina ? t('settings:configPanel.apiKeyImport.configured', 'Configured (secure store)') : t('settings:configPanel.apiKeyImport.notConfigured', 'Not configured')}
            </div>
            {status?.keysImported.jina && <div className="text-success mt-1">{t('settings:configPanel.apiKeyImport.imported', 'Imported this run')}</div>}
            {status?.keysRedacted.jina && <div className="text-text-muted mt-1">{t('settings:configPanel.apiKeyImport.redacted', 'Plaintext redacted')}</div>}
          </div>
        </div>
        <p className="text-[12px] text-text-muted">
          {t('settings:configPanel.apiKeyImport.note', 'Raw keys are never sent to the renderer. Reset the secure store to clear stored keys; you can then re-enter them via the API Keys tab.')}
        </p>
        <button
          onClick={async () => {
            const shouldReset = await askDecision({
              title: t('settings:configPanel.apiKeyImport.clearConfirm.title', 'Clear secure store keys?'),
              detail: t('settings:configPanel.apiKeyImport.clearConfirm.detail', 'This removes all stored API keys from the secure store. This cannot be undone.'),
              actionLabel: t('settings:configPanel.apiKeyImport.clearConfirm.action', 'Clear keys'),
              danger: true,
            });
            if (!shouldReset) return;
            setWorking(true);
            try {
              const res = await desktopConfig.resetSecureStoreKeys();
              if (res.ok) {
                toast.success(t('settings:configPanel.toasts.secureStoreCleared', "Secure store cleared."));
                await reloadConfig();
              } else {
                toast.error(res.error || t('settings:configPanel.toasts.secureStoreClearFailed', "Failed to clear secure store."));
              }
            } finally {
              setWorking(false);
            }
          }}
          disabled={working || (!status?.secureStore.venice && !status?.secureStore.jina)}
          className="px-3 py-1.5 rounded-md border border-danger/40 bg-danger/10 text-danger text-[12.5px] hover:bg-danger/20 disabled:opacity-50"
        >
          {t('settings:configPanel.actions.clearSecureStore', 'Clear Secure Store')}
        </button>
      </div>

      {config && (
        <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-3">
          <h3 className="text-[15px] font-semibold text-text-primary">{t('settings:configPanel.effectiveSettings.title', 'Effective Settings (preview)')}</h3>
          <p className="text-[12.5px] text-text-secondary">
            {t('settings:configPanel.effectiveSettings.description1', 'Read-only preview of the merged config currently in memory. The ')}
            <code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]">YAML</code>{t('settings:configPanel.effectiveSettings.description2', ' source remains the canonical source of truth — edit it on disk and click ')}<em>{t('settings:configPanel.actions.reload', 'Reload Config')}</em>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
            <div>
              <div className="text-text-muted mb-1">{t('settings:configPanel.effectiveSettings.activeTheme', 'Active theme')}</div>
              <div className="text-text-primary font-mono">{config.theme.active || "builtin-dark"}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">{t('settings:configPanel.effectiveSettings.defaultChatModel', 'Default chat model')}</div>
              <div className="text-text-primary font-mono">{config.models.chat || t('settings:configPanel.effectiveSettings.useUiDefault', '(use UI default)')}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">{t('settings:configPanel.effectiveSettings.temperature', 'Temperature')}</div>
              <div className="text-text-primary">{config.chat.temperature}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">{t('settings:configPanel.effectiveSettings.topP', 'Top-p')}</div>
              <div className="text-text-primary">{config.chat.top_p}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">{t('settings:configPanel.effectiveSettings.maxTokens', 'Max tokens')}</div>
              <div className="text-text-primary">{config.chat.max_tokens}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">{t('settings:configPanel.effectiveSettings.webSearch', 'Web search')}</div>
              <div className="text-text-primary">{config.chat.enable_web_search}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
