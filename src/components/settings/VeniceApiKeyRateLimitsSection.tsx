import React from "react";
import { useTranslation } from "react-i18next";
import {
  useVeniceApiKeyRateLimitLog,
  useVeniceApiKeyRateLimits,
} from "../../hooks/use-venice-api-keys";
import type { VeniceApiKeyRateLimitLogEntry } from "../../types/venice-api-keys";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString();
}

/** Friendly labels for the typed rate-limit reasons upstream documents
 *  (RPD/RPM/TPM are throughput limits; the FAILED_* values are quotas). */
function rateLimitTypeLabel(
  type: VeniceApiKeyRateLimitLogEntry["rateLimitType"],
  t: (key: string, fallback: string) => string,
): string {
  switch (type) {
    case "RPM":
      return t('settings:veniceApiKeys.rateLimits.types.rpm', 'Requests per minute limit');
    case "TPM":
      return t('settings:veniceApiKeys.rateLimits.types.tpm', 'Tokens per minute limit');
    case "RPD":
      return t('settings:veniceApiKeys.rateLimits.types.rpd', 'Daily request limit');
    case "FAILED_REQUESTS":
      return t('settings:veniceApiKeys.rateLimits.types.failedRequests', 'Failed-request quota');
    case "UNSUPPORTED_FEATURE_REQUESTS":
      return t('settings:veniceApiKeys.rateLimits.types.unsupportedFeature', 'Unsupported-feature request quota');
    default:
      return type;
  }
}

/** Rate-limit state and the account's last 50 rate-limit events, rendered as
 *  a sub-section of the Venice API Keys panel. All data is read-only. */
export function VeniceApiKeyRateLimitsSection(): React.ReactElement {
  const { t } = useTranslation(['settings', 'common']);
  const rateLimits = useVeniceApiKeyRateLimits();
  const log = useVeniceApiKeyRateLimitLog();
  const data = rateLimits.data;

  return (
    <section aria-labelledby="venice-keys-ratelimits-heading" className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-5">
      <h3 id="venice-keys-ratelimits-heading" className="text-[14.5px] font-medium text-text-primary">
        {t('settings:veniceApiKeys.rateLimits.heading', 'Rate Limits')}
      </h3>

      {rateLimits.isLoading && (
        <p className="text-[13px] text-text-muted">{t('settings:veniceApiKeys.list.loading', 'Loading…')}</p>
      )}
      {rateLimits.isError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3">
          <p className="text-[13px] text-danger">
            {t('settings:veniceApiKeys.rateLimits.loadFailed', 'Failed to load rate-limit details.')}
          </p>
          <button
            type="button"
            onClick={() => void rateLimits.refetch()}
            className="mt-2 px-3 py-1 rounded-md text-[12.5px] font-medium border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
          >
            {t('common:actions.retry', 'Retry')}
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`text-[12px] px-2 py-0.5 rounded font-medium border ${
                data.accessPermitted
                  ? "bg-success/10 text-success border-success/20"
                  : "bg-warning/10 text-warning border-warning/20"
              }`}
            >
              {data.accessPermitted
                ? t('settings:veniceApiKeys.rateLimits.accessPermitted', 'Inference access permitted')
                : t('settings:veniceApiKeys.rateLimits.accessDenied', 'Inference access blocked')}
            </span>
            <span className="text-[12px] px-2 py-0.5 rounded font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary">
              {t('settings:veniceApiKeys.rateLimits.tier', { defaultValue: 'Tier: {{tier}} ({{billing}})', tier: data.apiTier.id, billing: data.apiTier.isCharged ? t('settings:veniceApiKeys.rateLimits.charged', 'pay per use') : t('settings:veniceApiKeys.rateLimits.notCharged', 'not charged') })}
            </span>
            <span className="text-[12px] px-2 py-0.5 rounded font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary">
              {t('settings:veniceApiKeys.rateLimits.balances', { defaultValue: 'Balance: {{usd}} USD / {{diem}} DIEM', usd: data.balances.USD, diem: data.balances.DIEM })}
            </span>
          </div>
          <div className="grid gap-x-6 gap-y-1 text-[12px] text-text-secondary sm:grid-cols-2">
            <div>
              <span className="text-text-muted">{t('settings:veniceApiKeys.rateLimits.keyExpiration', 'Key expiration')}: </span>
              {formatDateTime(data.keyExpiration)}
            </div>
            <div>
              <span className="text-text-muted">{t('settings:veniceApiKeys.rateLimits.nextEpoch', 'Next epoch begins')}: </span>
              {formatDateTime(data.nextEpochBegins)}
            </div>
          </div>

          {data.rateLimits.length > 0 && (
            <div className="overflow-x-auto">
              <h4 className="text-[12.5px] font-medium text-text-secondary mb-2">
                {t('settings:veniceApiKeys.rateLimits.perModel', 'Per-model limits')}
              </h4>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-text-muted border-b border-vf-panel-border">
                    <th scope="col" className="py-2 pr-3 font-medium">{t('settings:veniceApiKeys.rateLimits.columnModel', 'Model')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('settings:veniceApiKeys.rateLimits.columnLimit', 'Limit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rateLimits.map((group, index) => (
                    <tr key={`${group.apiModelId ?? "account"}-${index}`} className="border-b border-vf-panel-border/60 text-text-secondary">
                      <td className="py-2 pr-3 text-text-primary">{group.apiModelId ?? t('settings:veniceApiKeys.rateLimits.accountWide', 'Account-wide')}</td>
                      <td className="py-2 pr-3">
                        {group.rateLimits.map((limit) => `${limit.amount} ${limit.type}`).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Rate-limit log (last 50 events) ─────────────────────────── */}
      <div className="space-y-2">
        <h4 className="text-[12.5px] font-medium text-text-secondary">
          {t('settings:veniceApiKeys.rateLimits.logHeading', 'Recent rate-limit events')}
        </h4>
        {log.isLoading && (
          <p className="text-[13px] text-text-muted">{t('settings:veniceApiKeys.list.loading', 'Loading…')}</p>
        )}
        {log.isError && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3">
            <p className="text-[13px] text-danger">
              {t('settings:veniceApiKeys.rateLimits.logLoadFailed', 'Failed to load rate-limit events.')}
            </p>
            <button
              type="button"
              onClick={() => void log.refetch()}
              className="mt-2 px-3 py-1 rounded-md text-[12.5px] font-medium border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
            >
              {t('common:actions.retry', 'Retry')}
            </button>
          </div>
        )}
        {log.isSuccess && log.data.length === 0 && (
          <p className="text-[13px] text-text-muted">
            {t('settings:veniceApiKeys.rateLimits.logEmpty', 'No rate-limit events in the recent log.')}
          </p>
        )}
        {log.data && log.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-text-muted border-b border-vf-panel-border">
                  <th scope="col" className="py-2 pr-3 font-medium">{t('settings:veniceApiKeys.rateLimits.columnTime', 'Time')}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t('settings:veniceApiKeys.rateLimits.columnModel', 'Model')}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t('settings:veniceApiKeys.rateLimits.columnType', 'Limit type')}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t('settings:veniceApiKeys.rateLimits.columnTier', 'Tier')}</th>
                </tr>
              </thead>
              <tbody>
                {log.data.map((entry, index) => (
                  <tr key={`${entry.timestamp}-${index}`} className="border-b border-vf-panel-border/60 text-text-secondary">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(entry.timestamp)}</td>
                    <td className="py-2 pr-3 text-text-primary">{entry.modelId}</td>
                    <td className="py-2 pr-3">{rateLimitTypeLabel(entry.rateLimitType, (key, fallback) => t(key, fallback))}</td>
                    <td className="py-2 pr-3">{entry.rateLimitTier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
