import React from "react";
import { useTranslation , Trans} from "react-i18next";
import { APP_NAME, OFFICIAL_LINKS, FIRST_RUN_ACK_KEY } from "../../shared/legal";
import { toast } from "../../stores/toast-store";
import { version } from "../../../package.json";

export function AboutPanel(): React.ReactElement {
  const { t } = useTranslation(['settings', 'common']);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="text-[17px] font-semibold text-text-primary">{APP_NAME}</div>
        <span className="text-[12px] px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 uppercase tracking-wider font-semibold">
          {t('settings:aboutPanel.unofficial', 'Unofficial')}
        </span>
        <span className="text-[12px] text-text-muted">v{version} <Trans i18nKey="common:surface.componentsSettingsAboutpanel.text.beta" /></span>
      </div>

      <div className="text-[13px] text-text-secondary leading-relaxed space-y-4">
        <p>
          {t('settings:aboutPanel.disclaimer', 'Venice Forge is a third-party desktop client configured to interface directly with the Venice.ai inference API endpoints. It is not affiliated with, endorsed by, sponsored by, or approved by Venice.ai, Inc.')}
        </p>

        <div className="p-3 bg-vf-panel-bg-raised border border-vf-panel-border rounded-lg">
          <div className="text-[12px] uppercase tracking-wider text-text-muted font-bold mb-1">{t('settings:aboutPanel.officialLinks', 'Official Links')}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <a href={OFFICIAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {t('settings:aboutPanel.termsOfService', 'Terms of Service')}
            </a>
            <a href={OFFICIAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {t('settings:aboutPanel.privacyPolicy', 'Privacy Policy')}
            </a>
            <a href={OFFICIAL_LINKS.apiDocs} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {t('settings:aboutPanel.apiDocs', 'API Documentation')}
            </a>
          </div>
        </div>

        <div className="text-[12px] text-text-muted space-y-2">
          <p>
            {t('settings:aboutPanel.trademarks', 'Venice , Venice.ai , and related logos are trademarks of Venice.ai, Inc. Use of these names is solely for nominative identification of API compatibility.')}
          </p>
          <p>{t('settings:aboutPanel.resetGate', 'Reset legal acknowledgment gate:')}</p>
          <button
            onClick={() => {
              try {
                localStorage.removeItem(FIRST_RUN_ACK_KEY) /* localStorage-allowed: first-run legal ack */;
                toast.success(t('settings:aboutPanel.toasts.resetSuccess', "Legal acknowledgment reset. It will appear on next reload."));
              } catch {
                toast.error(t('settings:aboutPanel.toasts.resetFailed', "Could not reset acknowledgment."));
              }
            }}
            className="px-3 py-1 rounded bg-vf-panel-bg-raised border border-vf-panel-border hover:bg-vf-panel-bg text-text-primary cursor-pointer transition-colors"
          >
            {t('settings:aboutPanel.resetGateBtn', 'Reset gate')}
          </button>
        </div>
      </div>
    </div>
  );
}
