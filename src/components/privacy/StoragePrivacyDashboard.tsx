import { useEffect } from "react";
import { useStoragePrivacyStore } from "../../stores/storage-privacy-store";
import { useSettingsStore, type Tab } from "../../stores/settings-store";
import {
  type StoragePrivacySeverity,
  type StoragePrivacyCategory,
  type StorageStoreInventoryItem,
  type StorageReferenceIssue,
  type ActiveApiKeyEntry,
} from "../../types/storage-privacy";
import { askDecision } from "../ui/modal-requests";
import { Trans, useTranslation } from "react-i18next";
import { PROVIDER_REGISTRY } from "../../types/provider";

/** Map a storage-privacy category to the canonical tab id for manual review. */
export function mapPrivacyCategoryToTab(category: StoragePrivacyCategory): Tab {
  switch (category) {
    case "conversations":
      return "history";
    case "projects":
      return "settings";
    case "media":
      return "media";
    case "prompts":
      return "prompts";
    case "scenes":
      return "scenes";
    case "rp":
      return "rp-studio";
    case "workflows":
      return "workflows";
    case "settings":
    case "api_keys":
      return "settings";
    case "diagnostics":
      return "status";
    case "cache":
    case "unknown":
      return "privacy";
  }
}

const SEVERITY_COLOR: Record<StoragePrivacySeverity, string> = {
  ok: "text-success",
  info: "text-info",
  warn: "text-warning",
  error: "text-danger",
};

const SEVERITY_BG: Record<StoragePrivacySeverity, string> = {
  ok: "bg-success/10 border-success/20",
  info: "bg-info/10 border-info/20",
  warn: "bg-warning/10 border-warning/20",
  error: "bg-danger/10 border-danger/20",
};

/** Returns a friendly provider label, preferring the registry definition
 *  when the provider is recognised; falls back to a readable provider id. */
function providerLabel(providerId: string): string {
  const def = PROVIDER_REGISTRY[providerId as keyof typeof PROVIDER_REGISTRY];
  return def?.label ?? formatAuditToken(providerId);
}

/** Converts stable audit/schema tokens into readable labels without adding
 *  another set of untranslated UI literals. */
function formatAuditToken(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

const VALIDATION_BADGE: Record<ActiveApiKeyEntry["lastValidationStatus"], string> = {
  "not-configured": "bg-vf-panel-bg-inset text-text-muted border-vf-panel-border",
  "configured-not-validated": "bg-info/10 text-info border-info/20",
  valid: "bg-success/10 text-success border-success/20",
  invalid: "bg-danger/10 text-danger border-danger/20",
  "network-error": "bg-warning/10 text-warning border-warning/20",
  "bridge-error": "bg-warning/10 text-warning border-warning/20",
  unknown: "bg-vf-panel-bg-inset text-text-muted border-vf-panel-border",
};

// i18n-allow-next-line: aria-label is metadata for assistive tech, built from canonical issue data
const formatIssueRegionLabel = (message: string): string =>
  `Storage reference issue: ${message}`;

// i18n-allow-next-line: aria-label is metadata for assistive tech, built from canonical issue data
const formatReviewAriaLabel = (sourceCategory: string): string =>
  `Review ${sourceCategory} reference`;

export function StoragePrivacyDashboard() {
  const { t: tRuntime } = useTranslation("common");
  const {
    inventory,
    maintenancePlan,
    refreshing,
    error,
    refreshInventory,
    copySafeSummary,
    exportSafeSummary,
    runMaintenanceAction,
  } = useStoragePrivacyStore();

  const setActiveTab = useSettingsStore((s) => s.setActiveTab);

  useEffect(() => {
    void refreshInventory();
  }, [refreshInventory]);

  if (error) {
    return (
      <div
        className="flex h-full items-center justify-center p-8 text-text-secondary"
        data-testid="privacy-error"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-10 w-10 text-danger opacity-80">
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="font-medium text-text-primary">
              <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.heading.failedToLoadStorageInventory" />
            </h3>
            <p className="text-sm text-text-muted">{error}</p>
          </div>
          <button
            onClick={() => void refreshInventory()}
            className="mt-2 px-4 py-2 rounded-md bg-vf-panel-bg-inset hover:bg-vf-panel-bg text-text-primary text-sm font-medium border border-vf-panel-border transition-colors"
          >
            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.action.retry" />
          </button>
        </div>
      </div>
    );
  }

  if (!inventory) {
    return (
      <div
        className="flex h-full items-center justify-center p-8 text-text-secondary"
        data-testid="privacy-loading"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-text-muted border-t-accent" />
          <p>
            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.description.analyzingLocalStorage" />
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-vf-panel-bg overflow-hidden"
      data-testid="storage-privacy-dashboard"
    >
      <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-b border-vf-panel-border">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-text-primary">
            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.heading.storagePrivacy" />
          </h1>
          <p className="text-sm text-text-secondary">
            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.description.inspectAndManageLocalDataBoundaries" />
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            onClick={() => void refreshInventory()}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-md bg-vf-panel-bg-inset hover:bg-vf-panel-bg text-text-secondary text-sm transition-colors disabled:opacity-50"
          >
            {refreshing
              ? tRuntime(
                  "runtimeGenerated.components.privacy.storageprivacydashboard.text.refreshing",
                )
              : tRuntime(
                  "runtimeGenerated.components.privacy.storageprivacydashboard.text.refreshInventory",
                )}
          </button>
          <button
            onClick={() => void copySafeSummary()}
            className="px-3 py-1.5 rounded-md bg-vf-panel-bg-inset hover:bg-vf-panel-bg text-text-secondary text-sm transition-colors"
          >
            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.action.copySafeSummary" />
          </button>
          <button
            onClick={() => exportSafeSummary()}
            className="px-3 py-1.5 rounded-md bg-vf-panel-bg-inset hover:bg-vf-panel-bg text-text-secondary text-sm transition-colors"
          >
            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.action.exportJson" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Overview Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {inventory.stores.map((store: StorageStoreInventoryItem) => (
            <div
              key={store.id}
              className={`p-4 rounded-xl border ${SEVERITY_BG[store.severity as keyof typeof SEVERITY_BG]} flex flex-col justify-between h-32`}
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  {store.label}
                </span>
                {store.encrypted === true && (
                  <span className="px-1.5 py-0.5 rounded bg-success/20 text-success text-[12px] font-bold">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.encrypted" />
                  </span>
                )}
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-text-primary">
                  {store.count ?? 0}
                </span>
                <p className="text-xs text-text-secondary mt-1">
                  {store.summary}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Active API Keys — dedicated per-provider audit surface. */}
        <section
          className="space-y-3"
          data-testid="privacy-active-api-keys"
        >
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-widest">
              {tRuntime("runtimeGenerated.services.storageprivacyservice.metadata.apiKeys")}
            </h2>
            <span className="text-[11px] text-text-muted">
              {inventory.activeApiKeys.length}{" "}
              <Trans i18nKey="settings:apiKeys.status.configured" />
            </span>
          </div>
          <div className="rounded-lg border border-vf-panel-border overflow-x-auto">
            <table className="w-full text-left text-sm text-text-secondary">
              <thead className="bg-vf-panel-bg-inset text-text-muted text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    <Trans i18nKey="settings:sections.providers" />
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <Trans i18nKey="settings:sections.data" />
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.column.status" />
                  </th>
                  <th className="px-4 py-3 font-medium text-right">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.action.review" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventory.activeApiKeys.map((entry) => (
                  <tr key={entry.id} className="hover:bg-vf-panel-bg-inset">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">
                        {providerLabel(entry.providerId)}
                      </div>
                      <div className="text-[12px] text-text-muted font-mono">
                        {entry.providerId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-text-secondary">
                        {formatAuditToken(entry.storage)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`self-start inline-block text-[11px] px-2 py-0.5 rounded border font-bold uppercase ${VALIDATION_BADGE[entry.lastValidationStatus]}`}
                        >
                          {formatAuditToken(entry.lastValidationStatus)}
                        </span>
                        {entry.lastValidationAt && (
                          <span className="text-[11px] text-text-muted">
                            {new Date(entry.lastValidationAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveTab("settings")}
                        className="text-[12px] px-3 py-1 rounded border border-vf-panel-border bg-vf-panel-bg hover:bg-vf-panel-bg-inset text-text-primary"
                      >
                        <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.action.review" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-text-muted">
            <Trans i18nKey="settings:configPanel.apiKeyImport.note" />
          </p>
        </section>

        {/* Store Inventory Table */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-widest px-1">
            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.heading.detailedInventory" />
          </h2>
          <div className="rounded-lg border border-vf-panel-border overflow-hidden">
            <table className="w-full text-left text-sm text-text-secondary">
              <thead className="bg-vf-panel-bg-inset text-text-muted text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.column.store" />
                  </th>
                  <th className="px-4 py-3 font-medium text-right">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.column.items" />
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.column.flags" />
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.column.status" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventory.stores.map((store: StorageStoreInventoryItem) => (
                  <tr key={store.id} className="hover:bg-vf-panel-bg-inset">
                    <td className="px-4 py-4">
                      <div className="font-medium text-text-primary">
                        {store.label}
                      </div>
                      <div className="text-[12px] text-text-muted font-mono">
                        {store.storeName}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      {store.count ?? 0}
                      {store.archivedCount ? (
                        <div className="text-[12px] text-text-muted">
                          {store.archivedCount}{" "}
                          <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.archived" />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5">
                        {store.containsSecrets && (
                          <Badge color="amber">
                            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.secrets" />
                          </Badge>
                        )}
                        {store.containsUserContent && (
                          <Badge color="blue">
                            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.userContent" />
                          </Badge>
                        )}
                        {!store.exportableInSafeSummary && (
                          <Badge color="red">
                            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.sensitive" />
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div
                        className={`flex items-center gap-1.5 ${SEVERITY_COLOR[store.severity as keyof typeof SEVERITY_COLOR]}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {store.severity.toUpperCase()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Issues & Maintenance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-widest px-1">
              <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.heading.referenceIssues" />
            </h2>
            {inventory.issues.length === 0 ? (
              <div className="p-8 rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset text-center text-text-muted text-sm">
                <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.noStorageHealthIssuesDetected" />
              </div>
            ) : (
              <div className="space-y-2">
                {inventory.issues.map((issue: StorageReferenceIssue) => (
                  <div
                    key={issue.id}
                    role="group"
                    aria-label={formatIssueRegionLabel(issue.message)}
                    data-testid={`privacy-issue-${issue.id}`}
                    className="p-3 rounded-lg border border-warning/20 bg-warning/5 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <p className="text-sm text-warning">{issue.message}</p>
                      <div className="flex gap-2 text-[12px] text-warning/60 uppercase font-bold">
                        <span>
                          <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.source" />{" "}
                          {issue.sourceCategory}
                        </span>
                        <span>·</span>
                        <span>
                          <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.target" />{" "}
                          {issue.targetCategory}
                        </span>
                      </div>
                    </div>
                    {issue.repairable && (
                      <button
                        type="button"
                        aria-label={formatReviewAriaLabel(issue.sourceCategory)}
                        onClick={() =>
                          setActiveTab(
                            mapPrivacyCategoryToTab(issue.sourceCategory),
                          )
                        }
                        className="px-2 py-1 rounded border border-warning/30 text-warning hover:bg-warning/10 text-xs whitespace-nowrap"
                      >
                        <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.action.review" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-widest px-1">
              <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.heading.maintenancePlan" />
            </h2>
            <div className="space-y-2">
              {maintenancePlan?.actions.map((action) => (
                <div
                  key={action.id}
                  className="p-3 rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset flex items-center justify-between gap-4"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {action.label}
                      </span>
                      {action.destructive && (
                        <span className="text-[9px] px-1 bg-danger/20 text-danger rounded font-bold uppercase">
                          <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.destructive" />
                        </span>
                      )}
                      {action.dryRunOnly && (
                        <span className="text-[9px] px-1 bg-info/20 text-info rounded font-bold uppercase">
                          <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.dryRun" />
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-text-muted">
                      {action.description}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (action.destructive) {
                        const shouldRun = await askDecision({
                          title: tRuntime(
                            "runtimeGenerated.components.privacy.storageprivacydashboard.metadata.runDestructiveAction",
                          ),
                          detail: action.label,
                          actionLabel: "Run action",
                          danger: true,
                        });
                        if (!shouldRun) return;
                      }
                      void runMaintenanceAction(action.id);
                    }}
                    disabled={refreshing || action.dryRunOnly}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      action.destructive
                        ? "bg-danger/10 text-danger hover:bg-danger/20 border border-danger/30"
                        : "bg-vf-panel-bg-inset text-text-secondary hover:bg-vf-panel-bg border border-vf-panel-border"
                    } disabled:opacity-50`}
                  >
                    {action.dryRunOnly
                      ? tRuntime(
                          "runtimeGenerated.components.privacy.storageprivacydashboard.text.previewOnly",
                        )
                      : tRuntime(
                          "runtimeGenerated.components.privacy.storageprivacydashboard.text.runAction",
                        )}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Exclusions — VERIFY-131: 4-row truth table replacing false "never" claim (P1 #8) */}
        <section
          className="p-4 rounded-lg bg-vf-panel-bg-inset border border-vf-panel-border space-y-3"
          data-testid="privacy-exclusions-section"
        >
          <h3 className="text-xs font-bold text-text-muted uppercase">
            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.heading.privacyExclusions" />
          </h3>
          <p className="text-[12px] text-text-secondary leading-relaxed">
            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.description.differentSurfacesHaveDifferentRedactionBoundariesInspect" />
          </p>
          <div className="overflow-x-auto mt-2">
            <table
              className="w-full text-[12px] text-left border-collapse"
              data-testid="privacy-exclusions-table"
            >
              <thead>
                <tr className="text-text-muted uppercase text-[10px] tracking-wide">
                  <th className="font-bold px-2 py-1 border-vf-panel-border">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.column.surface" />
                  </th>
                  <th className="font-bold px-2 py-1 border-vf-panel-border">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.column.prompts" />
                  </th>
                  <th className="font-bold px-2 py-1 border-vf-panel-border">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.column.history" />
                  </th>
                  <th className="font-bold px-2 py-1 border-vf-panel-border">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.column.mediaBlobs" />
                  </th>
                  <th className="font-bold px-2 py-1 border-vf-panel-border">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.column.pathsAmpKeys" />
                  </th>
                </tr>
              </thead>
              <tbody data-testid="privacy-exclusions-rows">
                <tr>
                  <td className="px-2 py-1 border-b border-vf-panel-border font-mono">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.cell.safePrivacySummary" />
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="emerald">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.alwaysRedacted" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="emerald">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.alwaysRedacted" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="emerald">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.alwaysRedacted" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="emerald">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.alwaysRedacted" />
                    </Badge>
                  </td>
                </tr>
                <tr>
                  <td className="px-2 py-1 border-b border-vf-panel-border font-mono">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.cell.safeDiagnosticsJson" />
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="emerald">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.alwaysRedacted" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="emerald">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.alwaysRedacted" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="emerald">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.alwaysRedacted" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="emerald">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.alwaysRedacted" />
                    </Badge>
                  </td>
                </tr>
                <tr>
                  <td className="px-2 py-1 border-b border-vf-panel-border font-mono">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.cell.encryptedBackup" />
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="amber">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.included" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="amber">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.included" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="amber">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.optInOnly" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="emerald">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.keysNeverExported" />
                    </Badge>
                  </td>
                </tr>
                <tr>
                  <td className="px-2 py-1 border-b border-vf-panel-border font-mono">
                    <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.cell.syncFolder" />
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="amber">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.included" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="amber">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.included" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="amber">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.optInOnly" />
                    </Badge>
                  </td>
                  <td className="px-2 py-1 border-vf-panel-border">
                    <Badge color="emerald">
                      <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.text.keysNeverSynced" />
                    </Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            <Trans i18nKey="common:surface.componentsPrivacyStorageprivacydashboard.description.promptsAndHistoryAppearInEncryptedBackups" />
          </p>
        </section>
      </main>
    </div>
  );
}

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "blue" | "amber" | "red" | "emerald";
}) {
  const colors = {
    blue: "bg-info/10 text-info border-info/20",
    amber: "bg-warning/10 text-warning border-warning/20",
    red: "bg-danger/10 text-danger border-danger/20",
    emerald: "bg-success/10 text-success border-success/20",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded border text-[12px] font-bold uppercase ${colors[color]}`}
    >
      {children}
    </span>
  );
}
