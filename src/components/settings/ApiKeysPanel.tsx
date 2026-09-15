import React from "react";
import { useTranslation } from "react-i18next";
import { isElectron } from "../../services/desktopBridge";

export interface ApiKeysPanelProps {
  veniceConfigured: boolean;
  apiKeyInput: string;
  setApiKeyInput: (value: string) => void;
  apiKeyTesting: boolean;
  jinaKeyInput: string;
  setJinaKeyInput: (value: string) => void;
  jinaKeyTesting: boolean;
  jinaKeyConfigured: boolean | null;
  onSaveApiKey: () => Promise<void> | void;
  onDeleteApiKey: () => void;
  onTestApiKey: () => Promise<void> | void;
  onSaveJinaKey: () => Promise<void> | void;
  onDeleteJinaKey: () => void;
  onTestJinaKey: () => Promise<void> | void;
}

export function ApiKeysPanel({
  veniceConfigured,
  apiKeyInput,
  setApiKeyInput,
  apiKeyTesting,
  jinaKeyInput,
  setJinaKeyInput,
  jinaKeyTesting,
  jinaKeyConfigured,
  onSaveApiKey,
  onDeleteApiKey,
  onTestApiKey,
  onSaveJinaKey,
  onDeleteJinaKey,
  onTestJinaKey,
}: ApiKeysPanelProps): React.ReactElement {
  const { t } = useTranslation(['settings', 'common']);
  return (
    <div className="space-y-6">
      {/* Venice key */}
      <div className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[14.5px] font-medium text-text-primary">{t('settings:apiKeys.veniceTitle', 'Venice.ai Integration')}</h3>
          <span
            className={`text-[12px] px-2 py-0.5 rounded font-medium ${
              veniceConfigured
                ? "bg-success/10 text-success border border-success/20"
                : "bg-warning/10 text-warning border border-warning/20"
            }`}
          >
            {veniceConfigured ? t('settings:apiKeys.status.configured', 'Configured') : t('settings:apiKeys.status.unset', 'Unset')}
          </span>
        </div>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          {t('settings:apiKeys.veniceDescription', 'Your API key is saved using secure storage encryption and is never exposed to the web sandbox.')}
        </p>
        <div className="space-y-3">
          {!veniceConfigured ? (
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                className="flex-1 bg-vf-panel-bg border border-vf-panel-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-all font-mono placeholder:text-text-muted/50"
              />
              <button
                onClick={onSaveApiKey}
                disabled={!apiKeyInput.trim()}
                className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
              >
                {t('common:actions.saveKey', 'Save Key')}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                disabled
                value="••••••••••••••••••••••••••••••••"
                className="flex-1 bg-vf-panel-bg-raised border border-vf-panel-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-muted font-mono"
              />
              <button
                onClick={onTestApiKey}
                disabled={apiKeyTesting}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors disabled:opacity-50 cursor-pointer"
              >
                {apiKeyTesting ? t('common:actions.testing', 'Testing...') : t('common:actions.testKey', 'Test Key')}
              </button>
              <button
                onClick={onDeleteApiKey}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/25 transition-colors cursor-pointer"
              >
                {t('common:actions.delete', 'Delete')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Jina key */}
      <div className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[14.5px] font-medium text-text-primary">{t('settings:apiKeys.jinaTitle', 'Jina.ai Integration')}</h3>
          <span
            className={`text-[12px] px-2 py-0.5 rounded font-medium ${
              jinaKeyConfigured
                ? "bg-success/10 text-success border border-success/20"
                : "bg-vf-panel-bg border border-vf-panel-border text-text-muted"
            }`}
          >
            {jinaKeyConfigured ? t('settings:apiKeys.status.configured', 'Configured') : t('settings:apiKeys.status.optional', 'Optional')}
          </span>
        </div>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          {t('settings:apiKeys.jinaDescription.prefix', 'Provides deep web searching, scraping, and social profile discovery mapping capabilities.')}{" "}
          {isElectron()
            ? t('settings:apiKeys.jinaDescription.electron', "Jina API keys are saved with the same OS secure storage.")
            : t('settings:apiKeys.jinaDescription.web', "Jina API keys are kept only in memory for this browser session; use the server environment for persistent web configuration.")}
        </p>
        <div className="space-y-3">
          {!jinaKeyConfigured ? (
            <div className="flex gap-2">
              <input
                type="password"
                value={jinaKeyInput}
                onChange={(e) => setJinaKeyInput(e.target.value)}
                placeholder="jina_..."
                autoComplete="off"
                className="flex-1 bg-vf-panel-bg border border-vf-panel-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-all font-mono placeholder:text-text-muted/50"
              />
              <button
                onClick={onSaveJinaKey}
                disabled={!jinaKeyInput.trim()}
                className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
              >
                {t('common:actions.saveKey', 'Save Key')}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                disabled
                value="••••••••••••••••••••••••••••••••"
                className="flex-1 bg-vf-panel-bg-raised border border-vf-panel-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-muted font-mono"
              />
              <button
                onClick={onTestJinaKey}
                disabled={jinaKeyTesting}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors disabled:opacity-50 cursor-pointer"
              >
                {jinaKeyTesting ? t('common:actions.testing', 'Testing...') : t('common:actions.testKey', 'Test Key')}
              </button>
              <button
                onClick={onDeleteJinaKey}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/25 transition-colors cursor-pointer"
              >
                {t('common:actions.delete', 'Delete')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
