import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import {
  getVeniceErrorStatus,
  useBillingBalance,
  useBillingUsageAnalytics,
  useBillingUsageHistory,
} from "../../hooks/use-billing";
import { selectHasVeniceKey, useAuthStore } from "../../stores/auth-store";
import type { VeniceBillingCurrency } from "../../types/billing";

const LOOKBACK_OPTIONS = ["7d", "30d", "90d"] as const;
const CURRENCY_OPTIONS: Array<VeniceBillingCurrency | ""> = ["", "USD", "DIEM", "BUNDLED_CREDITS"];

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString();
}

/** Shared inline error surface for billing queries. A 401 means the stored
 *  Venice key is missing/invalid and points the user at API key settings. */
function BillingError({
  error,
  onRetry,
  retryLabel,
  authErrorLabel,
  genericErrorLabel,
}: {
  error: unknown;
  onRetry: () => void;
  retryLabel: string;
  authErrorLabel: string;
  genericErrorLabel: string;
}) {
  const status = getVeniceErrorStatus(error);
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 space-y-2">
      <p className="text-[13px] text-danger">{status === 401 ? authErrorLabel : genericErrorLabel}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1 rounded-md text-[12.5px] font-medium border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
      >
        {retryLabel}
      </button>
    </div>
  );
}

export function BillingPanel(): React.ReactElement {
  const { t } = useTranslation(['settings', 'common']);
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);

  // Usage-history filters. Dates are YYYY-MM-DD from date inputs; they feed
  // the query keys directly (no apply-step state mirror).
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currency, setCurrency] = useState<VeniceBillingCurrency | "">("");
  const [lookback, setLookback] = useState<string>(LOOKBACK_OPTIONS[0]);

  const balance = useBillingBalance();
  const history = useBillingUsageHistory({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    currency: currency || undefined,
  });
  const analytics = useBillingUsageAnalytics({
    lookback,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const historyEntries = history.data?.pages.flatMap((page) => page.data) ?? [];
  const analyticsData = analytics.data;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-text-primary">
          {t('settings:billing.title', 'Billing & Usage')}
        </h2>
        <p className="text-sm text-text-secondary">
          {t('settings:billing.description', 'Review your Venice account balance, usage history, and per-model usage analytics. Billing data reflects the account behind your active Venice API key.')}
        </p>
      </div>

      {!hasVeniceKey && (
        <div className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5">
          <p className="text-[13.5px] text-text-secondary">
            {t('settings:billing.needsKey', 'Add a Venice API key in the Venice API Key section to view balance and usage.')}
          </p>
        </div>
      )}

      {hasVeniceKey && (
        <>
          {/* ── Balance card ─────────────────────────────────────────── */}
          <section aria-labelledby="billing-balance-heading" className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 id="billing-balance-heading" className="text-[14.5px] font-medium text-text-primary">
                {t('settings:billing.balance.heading', 'Account Balance')}
              </h3>
              <div className="flex items-center gap-3">
                {balance.dataUpdatedAt > 0 && (
                  <span className="text-[11.5px] text-text-muted">
                    {t('settings:billing.balance.updated', { defaultValue: 'Updated {{time}}', time: formatDateTime(new Date(balance.dataUpdatedAt).toISOString()) })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void balance.refetch()}
                  disabled={balance.isFetching}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${balance.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
                  {t('settings:billing.balance.refresh', 'Refresh')}
                </button>
              </div>
            </div>

            {balance.isLoading && (
              <p className="text-[13px] text-text-muted">{t('settings:billing.loading', 'Loading…')}</p>
            )}
            {balance.isError && (
              <BillingError
                error={balance.error}
                onRetry={() => void balance.refetch()}
                retryLabel={t('common:actions.retry', 'Retry')}
                authErrorLabel={t('settings:billing.errors.auth', 'Venice rejected the request (401). Check that your Venice API key in the Venice API Key section is valid.')}
                genericErrorLabel={t('settings:billing.errors.loadFailed', 'Failed to load billing balance.')}
              />
            )}
            {balance.data && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`text-[12px] px-2 py-0.5 rounded font-medium border ${
                      balance.data.canConsume
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-warning/10 text-warning border-warning/20"
                    }`}
                  >
                    {balance.data.canConsume
                      ? t('settings:billing.balance.canConsume', 'Can make API requests')
                      : t('settings:billing.balance.cannotConsume', 'Insufficient balance')}
                  </span>
                  {balance.data.consumptionCurrency && (
                    <span className="text-[12px] px-2 py-0.5 rounded font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary">
                      {t('settings:billing.balance.consumptionCurrency', { defaultValue: 'Consumption currency: {{currency}}', currency: balance.data.consumptionCurrency })}
                    </span>
                  )}
                </div>

                {balance.data.balances.diem === null && balance.data.balances.usd === null ? (
                  <p className="text-[13px] text-text-muted">
                    {t('settings:billing.balance.noBalances', 'No balance information is available for this account.')}
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {balance.data.balances.diem !== null && (
                      <div className="rounded-lg border border-vf-panel-border bg-vf-panel-bg px-4 py-3">
                        <div className="text-[11.5px] uppercase tracking-wide text-text-muted">
                          {t('settings:billing.balance.diem', 'DIEM balance')}
                        </div>
                        <div className="text-xl font-semibold text-text-primary">
                          {formatAmount(balance.data.balances.diem)}
                        </div>
                        {balance.data.diemEpochAllocation > 0 && (
                          <div className="mt-1 text-[11.5px] text-text-muted">
                            {t('settings:billing.balance.diemEpoch', { defaultValue: '{{used}}% of {{allocation}} epoch allocation used', used: Math.round(((balance.data.diemEpochAllocation - balance.data.balances.diem) / balance.data.diemEpochAllocation) * 100), allocation: formatAmount(balance.data.diemEpochAllocation) })}
                          </div>
                        )}
                      </div>
                    )}
                    {balance.data.balances.usd !== null && (
                      <div className="rounded-lg border border-vf-panel-border bg-vf-panel-bg px-4 py-3">
                        <div className="text-[11.5px] uppercase tracking-wide text-text-muted">
                          {t('settings:billing.balance.usd', 'USD balance')}
                        </div>
                        <div className="text-xl font-semibold text-text-primary">
                          ${formatAmount(balance.data.balances.usd)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Usage history ────────────────────────────────────────── */}
          <section aria-labelledby="billing-history-heading" className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-4">
            <h3 id="billing-history-heading" className="text-[14.5px] font-medium text-text-primary">
              {t('settings:billing.history.heading', 'Usage History')}
            </h3>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="billing-history-start" className="block text-[12px] font-medium text-text-secondary mb-1">
                  {t('settings:billing.history.startDate', 'Start date')}
                </label>
                <input
                  id="billing-history-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor="billing-history-end" className="block text-[12px] font-medium text-text-secondary mb-1">
                  {t('settings:billing.history.endDate', 'End date')}
                </label>
                <input
                  id="billing-history-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor="billing-history-currency" className="block text-[12px] font-medium text-text-secondary mb-1">
                  {t('settings:billing.history.currency', 'Currency')}
                </label>
                <select
                  id="billing-history-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as VeniceBillingCurrency | "")}
                  className="px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                >
                  <option value="">{t('settings:billing.history.currencyAll', 'All')}</option>
                  {CURRENCY_OPTIONS.filter((c) => c !== "").map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {(startDate || endDate || currency) && (
                <button
                  type="button"
                  onClick={() => { setStartDate(""); setEndDate(""); setCurrency(""); }}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
                >
                  {t('settings:billing.history.clearFilters', 'Clear filters')}
                </button>
              )}
            </div>

            {history.isLoading && (
              <p className="text-[13px] text-text-muted">{t('settings:billing.loading', 'Loading…')}</p>
            )}
            {history.isError && (
              <BillingError
                error={history.error}
                onRetry={() => void history.refetch()}
                retryLabel={t('common:actions.retry', 'Retry')}
                authErrorLabel={t('settings:billing.errors.auth', 'Venice rejected the request (401). Check that your Venice API key in the Venice API Key section is valid.')}
                genericErrorLabel={t('settings:billing.errors.loadFailed', 'Failed to load usage history.')}
              />
            )}
            {history.isSuccess && historyEntries.length === 0 && (
              <p className="text-[13px] text-text-muted">
                {t('settings:billing.history.empty', 'No usage recorded for the selected period.')}
              </p>
            )}
            {historyEntries.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-text-muted border-b border-vf-panel-border">
                      <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.history.columnTime', 'Time')}</th>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.history.columnProduct', 'Product')}</th>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.history.columnUnits', 'Units')}</th>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.history.columnPrice', 'Price / unit (USD)')}</th>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.history.columnAmount', 'Amount')}</th>
                      <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.history.columnRequest', 'Request ID')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyEntries.map((entry, index) => (
                      <tr key={`${entry.timestamp}-${index}`} className="border-b border-vf-panel-border/60 text-text-secondary">
                        <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(entry.timestamp)}</td>
                        <td className="py-2 pr-3">
                          <div className="text-text-primary">{entry.sku}</div>
                          {entry.notes && <div className="text-[11.5px] text-text-muted">{entry.notes}</div>}
                        </td>
                        <td className="py-2 pr-3">{formatAmount(entry.units)}</td>
                        <td className="py-2 pr-3">{formatAmount(entry.pricePerUnitUsd)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatAmount(entry.amount)} {entry.currency}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[11.5px]">{entry.inferenceDetails?.requestId ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {history.hasNextPage && (
              <button
                type="button"
                onClick={() => void history.fetchNextPage()}
                disabled={history.isFetchingNextPage}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors disabled:opacity-50 cursor-pointer"
              >
                {history.isFetchingNextPage
                  ? t('settings:billing.history.loadingMore', 'Loading more…')
                  : t('settings:billing.history.loadMore', 'Load more')}
              </button>
            )}
          </section>

          {/* ── Usage analytics ──────────────────────────────────────── */}
          <section aria-labelledby="billing-analytics-heading" className="rounded-xl border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="billing-analytics-heading" className="text-[14.5px] font-medium text-text-primary">
                {t('settings:billing.analytics.heading', 'Usage Analytics')}
              </h3>
              <div>
                <label htmlFor="billing-analytics-lookback" className="sr-only">
                  {t('settings:billing.analytics.lookbackLabel', 'Lookback period')}
                </label>
                <select
                  id="billing-analytics-lookback"
                  value={lookback}
                  onChange={(e) => setLookback(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-vf-panel-border bg-vf-panel-bg text-[13px] text-text-primary outline-none focus:border-accent"
                >
                  {LOOKBACK_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {t('settings:billing.analytics.lookbackOption', { defaultValue: 'Last {{days}} days', days: option.replace("d", "") })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {analytics.isLoading && (
              <p className="text-[13px] text-text-muted">{t('settings:billing.loading', 'Loading…')}</p>
            )}
            {analytics.isError && (
              <BillingError
                error={analytics.error}
                onRetry={() => void analytics.refetch()}
                retryLabel={t('common:actions.retry', 'Retry')}
                authErrorLabel={t('settings:billing.errors.auth', 'Venice rejected the request (401). Check that your Venice API key in the Venice API Key section is valid.')}
                genericErrorLabel={t('settings:billing.errors.analyticsFailed', 'Failed to load usage analytics.')}
              />
            )}
            {analyticsData && (
              <div className="space-y-5">
                {analyticsData.byModel.length > 0 && (
                  <div className="overflow-x-auto">
                    <h4 className="text-[12.5px] font-medium text-text-secondary mb-2">
                      {t('settings:billing.analytics.byModel', 'By model')}
                    </h4>
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="text-left text-text-muted border-b border-vf-panel-border">
                          <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.analytics.columnModel', 'Model')}</th>
                          <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.analytics.columnType', 'Type')}</th>
                          <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.analytics.columnUnits', 'Units')}</th>
                          <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.analytics.columnUsd', 'USD')}</th>
                          <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.analytics.columnDiem', 'DIEM')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.byModel.map((model) => (
                          <tr key={model.modelName} className="border-b border-vf-panel-border/60 text-text-secondary">
                            <td className="py-2 pr-3 text-text-primary">{model.modelName}</td>
                            <td className="py-2 pr-3">{model.modelType ?? model.unitType}</td>
                            <td className="py-2 pr-3">
                              {formatAmount(model.totalUnits)}
                              <span className="text-[11px] text-text-muted"> {model.unitType}</span>
                            </td>
                            <td className="py-2 pr-3">${formatAmount(model.totalUsd)}</td>
                            <td className="py-2 pr-3">{formatAmount(model.totalDiem)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {analyticsData.byKey.length > 0 && (
                  <div className="overflow-x-auto">
                    <h4 className="text-[12.5px] font-medium text-text-secondary mb-2">
                      {t('settings:billing.analytics.byKey', 'By API key')}
                    </h4>
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="text-left text-text-muted border-b border-vf-panel-border">
                          <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.analytics.columnKey', 'API key')}</th>
                          <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.analytics.columnUnits', 'Units')}</th>
                          <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.analytics.columnUsd', 'USD')}</th>
                          <th scope="col" className="py-2 pr-3 font-medium">{t('settings:billing.analytics.columnDiem', 'DIEM')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.byKey.map((key) => (
                          <tr key={key.apiKeyId ?? key.description} className="border-b border-vf-panel-border/60 text-text-secondary">
                            <td className="py-2 pr-3 text-text-primary">{key.description}</td>
                            <td className="py-2 pr-3">{formatAmount(key.totalUnits)}</td>
                            <td className="py-2 pr-3">${formatAmount(key.totalUsd)}</td>
                            <td className="py-2 pr-3">{formatAmount(key.totalDiem)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {analyticsData.byModel.length === 0 && analyticsData.byKey.length === 0 && (
                  <p className="text-[13px] text-text-muted">
                    {t('settings:billing.analytics.empty', 'No usage recorded for the selected period.')}
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
