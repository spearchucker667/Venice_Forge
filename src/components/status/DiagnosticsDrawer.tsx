import { translateRuntime } from "../../i18n/runtimeTranslator";
/** @fileoverview Phase 2C diagnostics drawer.
 *
 * A right-side drawer rendered when the user clicks a status
 * indicator in the header cluster. Sections are organised by status
 * category. Each section shows the live status, a one-sentence
 * summary, the optional detail, and a canonical action (Open
 * Config / Refresh Models / Copy safe diagnostics / etc.).
 *
 * All actions route through the canonical tab registry
 * (`useSettingsStore.setActiveTab`) or through the status store
 * (`useStatusStore.openDrawer / refresh`). No destructive repair
 * actions live in this drawer (per Phase 2C constraints).
 *
 * Safety:
 *   - "Copy safe diagnostics" never includes the API key, bearer
 *     tokens, auth headers, raw prompts, or base64 media data.
 *   - Sections are skipped when the corresponding status item is not
 *     present in the snapshot.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useStatusStore } from "../../stores/status-store";
import { useModelCatalogRuntimeStore } from "../../stores/model-catalog-runtime-store";
import { useSettingsStore, type Tab } from "../../stores/settings-store";
import { useModels } from "../../hooks/use-models";
import { toast } from "../../stores/toast-store";
import { isTabId, type TabId } from "../../config/tabs";
import { isElectron } from "../../services/desktopBridge";
import { redactErrorMessage } from "../../shared/redaction";
import {
  computeSafeDiagnosticsSnapshot,
  serialiseSafeDiagnosticsSnapshot,
} from "../../services/diagnosticsService";
import { copyText } from "../../stores/media-send-to";
import type {
  AppStatusItem,
  AppStatusSnapshot,
  StatusSeverity,
} from "../../types/status";
import { Trans, useTranslation } from "react-i18next";

const SECTION_ORDER: Array<{
  id: string;
  key: keyof AppStatusSnapshot;
  label: string;
}> = [
  {
    id: "diagnostics-overview",
    key: "diagnostics",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.metadata.overview",
        "Overview",
      );
    },
  },
  { id: "api-api", key: "api", label: "API" },
  {
    id: "apiKey-api-key",
    key: "apiKey",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.metadata.apiKey",
        "API Key",
      );
    },
  },
  {
    id: "model-model",
    key: "model",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.metadata.model",
        "Model",
      );
    },
  },
  {
    id: "storage-storage",
    key: "storage",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.metadata.storage",
        "Storage",
      );
    },
  },
  {
    id: "storage-privacy",
    key: "storage",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.metadata.privacy",
        "Privacy",
      );
    },
  },
  {
    id: "project-project",
    key: "project",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.metadata.project",
        "Project",
      );
    },
  },
  {
    id: "safety-safety",
    key: "safety",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.metadata.safety",
        "Safety",
      );
    },
  },
  {
    id: "provider-research",
    key: "provider",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.metadata.research",
        "Research",
      );
    },
  },
  {
    id: "desktop-mode",
    key: "desktop",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.metadata.mode",
        "Mode",
      );
    },
  },
  {
    id: "diagnostics-repair",
    key: "diagnostics",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.metadata.repair",
        "Repair",
      );
    },
  },
];

const SEVERITY_BADGE: Record<StatusSeverity, string> = {
  ok: "bg-success/15 text-success border-success/30 font-mono",
  warn: "bg-warning/15 text-warning border-warning/30 font-mono",
  error: "bg-danger/15 text-danger border-danger/30 font-mono",
  unknown: "bg-surface text-text-muted border-border font-mono",
};

const SEVERITY_LABEL: Record<StatusSeverity, string> = {
  ok: "OK",
  warn: "Warning",
  error: "Error",
  unknown: "Unknown",
};

function SeverityBadge({ severity }: { severity: StatusSeverity }) {
  const { t } = useTranslation("common");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] font-medium ${SEVERITY_BADGE[severity]}`}
      data-severity-badge={severity}
    >
      {t(`statusCluster.severities.${severity}`, {
        defaultValue: SEVERITY_LABEL[severity],
      })}
    </span>
  );
}

interface SectionProps {
  sectionId: string;
  title: string;
  item: AppStatusItem;
  focused: boolean;
  children?: React.ReactNode;
}

function Section({ sectionId, title, item, focused, children }: SectionProps) {
  const { t } = useTranslation("common");
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (focused && ref.current) {
      ref.current.scrollIntoView({ block: "start" });
    }
  }, [focused]);
  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      id={`diagnostics-section-${sectionId}`}
      data-testid={`diagnostics-section-${sectionId}`}
      data-focused={focused}
      className={`rounded-lg border p-3 space-y-1.5 transition-all vf-utility-rail-section ${
        focused
          ? "border-accent/60 bg-surface shadow-[0_0_0_1px_var(--color-accent),0_0_12px_var(--color-vf-accent-glow-subtle)]"
          : "border-border bg-surface"
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] uppercase tracking-wider font-semibold text-text-secondary">
          {title}
        </h3>
        <SeverityBadge severity={item.severity} />
      </header>
      <p className="text-[12.5px] text-text-primary leading-relaxed">
        {t(item.summary.key, item.summary.values)}
      </p>
      {item.detail && (
        <p className="text-[12px] text-text-muted leading-relaxed">
          {t(item.detail.key, item.detail.values)}
        </p>
      )}
      {children}
    </section>
  );
}

function safeRouteTab(id: string): TabId | null {
  return isTabId(id) ? (id as TabId) : null;
}

export function DiagnosticsDrawer() {
  const { t: tRuntime } = useTranslation("common");
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerOpen = useStatusStore((s) => s.drawerOpen);
  const closeDrawer = useStatusStore((s) => s.closeDrawer);
  useFocusTrap(drawerRef, drawerOpen, closeDrawer);
  const status = useStatusStore((s) => s.status);
  const focusedSectionId = useStatusStore((s) => s.focusedSectionId);
  const setFocusedSection = useStatusStore((s) => s.setFocusedSection);
  const refresh = useStatusStore((s) => s.refresh);
  const isRefreshing = useStatusStore((s) => s.isRefreshing);
  const lastRefreshedAt = useStatusStore((s) => s.lastRefreshedAt);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);

  // The model status is the only category that benefits from a
  // manual catalog refresh. We use the existing useModels hook so
  // we do not introduce a parallel model service.
  const models = useModels("text", { enabled: drawerOpen });

  // Track a small transient status string for the "Copy safe
  // diagnostics" button so the test can observe the click handler
  // without depending on global toast side-effects.
  const [lastCopyAt, setLastCopyAt] = useState<string | null>(null);

  const handleCopySafeDiagnostics = useCallback(async () => {
    // Use the snapshot from the status store so the user gets the
    // exact same data they see in the drawer. The service builder
    // re-runs only when the underlying stores have changed (via
    // the store's `recompute` action), so this is cheap.
    const currentStatus = useStatusStore.getState().status;
    const safe = computeSafeDiagnosticsSnapshot(currentStatus);
    const json = serialiseSafeDiagnosticsSnapshot(safe);
    const ok = await copyText(json);
    if (ok) {
      setLastCopyAt(new Date().toISOString());
      toast.success(
        tRuntime(
          "runtimeGenerated.components.status.diagnosticsdrawer.notification.safeDiagnosticsCopiedToClipboard",
        ),
      );
    } else {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.status.diagnosticsdrawer.notification.couldNotCopySafeDiagnostics",
        ),
      );
    }
  }, [tRuntime]);

  const handleRefresh = useCallback(async () => {
    try {
      await refresh();
      toast.success(
        tRuntime(
          "runtimeGenerated.components.status.diagnosticsdrawer.notification.diagnosticsRefreshed",
        ),
      );
    } catch {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.status.diagnosticsdrawer.notification.diagnosticsRefreshFailed",
        ),
      );
    }
  }, [refresh, tRuntime]);

  // We deliberately do NOT auto-trigger a /models refetch here —
  // the existing useModels hook keeps a 5-minute cache and the
  // user can pull-to-refresh via the dedicated "Refresh Models"
  // button below. The hook's existing error state is surfaced via
  // the Models state.
  const modelsError = models.error ? redactErrorMessage(models.error) : null;
  const refreshModels = useCallback(async () => {
    const result = await models.refetch();
    useStatusStore.getState().recompute();
    if (result.isSuccess) {
      const catalog = useModelCatalogRuntimeStore.getState();
      const liveCount = catalog.countsByType.text ?? catalog.totalCount;
      toast.success(
        tRuntime(
          "runtimeGenerated.components.status.diagnosticsdrawer.notification.livecountLiveModelsRefreshed",
          { liveCount: liveCount },
        ),
      );
    } else {
      toast.error(
        redactErrorMessage(result.error ?? "Model catalog refresh failed"),
      );
    }
  }, [models, tRuntime]);

  // Build a unique ordered list of (id, label, item) for the
  // sections we actually want to render. The SECTION_ORDER has
  // a duplicate "diagnostics" key (Overview + Repair) so we
  // dedupe to a stable order.
  const sections = useMemo(() => {
    void tRuntime;
    const seen = new Set<string>();
    const out: Array<{
      id: string;
      key: keyof AppStatusSnapshot;
      label: string;
      item: AppStatusItem;
    }> = [];
    for (const { id, key, label } of SECTION_ORDER) {
      if (seen.has(id)) continue;
      seen.add(id);
      const item = status[key];
      if (!item) continue;
      out.push({ id, key, label, item });
    }
    return out;
  }, [status, tRuntime]);

  if (!drawerOpen) return null;

  return (
    <div
      ref={drawerRef}
      className="fixed inset-0 z-[170] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={tRuntime(
        "runtimeGenerated.components.status.diagnosticsdrawer.attribute.diagnostics",
      )}
      data-testid="diagnostics-drawer"
    >
      {/* Backdrop click closes the drawer. */}
      <button
        type="button"
        aria-label={tRuntime(
          "runtimeGenerated.components.status.diagnosticsdrawer.attribute.closeDiagnostics",
        )}
        data-testid="diagnostics-backdrop"
        onClick={closeDrawer}
        className="flex-1 bg-overlay/80 backdrop-blur-[2px]"
      />
      <aside
        className="w-[420px] max-w-[92vw] h-full bg-surface-elevated border-l border-border overflow-y-auto p-4 space-y-4 animate-slide-in-right shadow-2xl"
        data-testid="diagnostics-drawer-panel"
      >
        <header className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h2 className="text-[14px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.heading.diagnostics" />
            </h2>
            <p className="text-[12px] text-text-muted mt-0.5">
              <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.description.appHealthModelCatalogStorageSafetyAnd" />
            </p>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label={tRuntime(
              "runtimeGenerated.components.status.diagnosticsdrawer.attribute.close",
            )}
            data-testid="diagnostics-close"
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.action.close" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="diagnostics-refresh"
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isRefreshing
              ? tRuntime(
                  "runtimeGenerated.components.status.diagnosticsdrawer.text.refreshing",
                )
              : tRuntime(
                  "runtimeGenerated.components.status.diagnosticsdrawer.text.refreshDiagnostics",
                )}
          </button>
          <button
            type="button"
            onClick={handleCopySafeDiagnostics}
            data-testid="diagnostics-copy-safe"
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.action.copySafeDiagnostics" />
          </button>
          {lastCopyedAt(lastCopyAt) && (
            <span className="text-[12px] text-text-muted">
              <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.text.copiedAt" />{" "}
              {lastCopyedAt(lastCopyAt)}
            </span>
          )}
        </div>

        {/*
          Phase 9 Developer-Portal Error Intake: prompt opt-in toggle.
          Off by default — raw prompt text never leaves the safe
          diagnostics snapshot unless the user opts in. The toggle
          flips a settings-store boolean; the snapshot builder reads
          it on every recompute. We never persist raw prompt content.
        */}
        <label
          className="flex items-start gap-2 rounded-md border border-border bg-surface-muted/60 p-2.5 text-[12px] text-text-secondary"
          data-testid="diagnostics-prompt-opt-in"
        >
          <input
            type="checkbox"
            checked={useSettingsStore.getState().diagnosticsIncludePrompts}
            onChange={(e) =>
              useSettingsStore
                .getState()
                .setDiagnosticsIncludePrompts(e.target.checked)
            }
            aria-label={tRuntime(
              "runtimeGenerated.components.status.diagnosticsdrawer.attribute.includeRedactedPromptExcerptsInSafeDiagnostics",
            )}
            className="mt-0.5"
          />
          <span>
            <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.text.includeRedactedPromptExcerptsInSafeDiagnostics" />
            <span className="block text-[11px] text-text-muted">
              <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.text.truncated80CharsAndSecretStrippedPrompt" />
            </span>
          </span>
        </label>

        {lastRefreshedAt && (
          <p className="text-[12px] text-text-muted">
            <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.description.lastRefresh" />{" "}
            {lastRefreshedAt}
          </p>
        )}

        {sections.map(({ id: sectionId, key, label, item }) => {
          return (
            <Section
              key={sectionId}
              sectionId={sectionId}
              title={label}
              item={item}
              focused={focusedSectionId === String(key)}
            >
              {/* Per-section actions. Each uses canonical tab routing
                  via setActiveTab or the status store actions. */}
              {key === "apiKey" && item.actionTargetTabId && (
                <button
                  type="button"
                  onClick={() => {
                    const tab = safeRouteTab(item.actionTargetTabId!);
                    if (tab) setActiveTab(tab);
                    closeDrawer();
                  }}
                  data-testid="diagnostics-action-apiKey"
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  {(item.actionLabelKey && tRuntime(item.actionLabelKey)) ??
                    tRuntime(
                      "runtimeGenerated.components.status.diagnosticsdrawer.text.openConfig",
                    )}
                </button>
              )}
              {key === "api" && (
                <button
                  type="button"
                  onClick={() => void refreshModels()}
                  data-testid="diagnostics-action-api-refresh"
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  {models.isFetching
                    ? tRuntime(
                        "runtimeGenerated.components.status.diagnosticsdrawer.text.refreshingModels",
                      )
                    : tRuntime(
                        "runtimeGenerated.components.status.diagnosticsdrawer.text.refreshModels",
                      )}
                </button>
              )}
              {key === "model" && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => void refreshModels()}
                    data-testid="diagnostics-action-model-refresh"
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
                  >
                    {models.isFetching
                      ? tRuntime(
                          "runtimeGenerated.components.status.diagnosticsdrawer.text.refreshingModels",
                        )
                      : tRuntime(
                          "runtimeGenerated.components.status.diagnosticsdrawer.text.refreshModels",
                        )}
                  </button>
                  {modelsError && (
                    <p className="text-[12px] text-danger break-words">
                      <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.description.lastRefreshError" />{" "}
                      {modelsError}
                    </p>
                  )}
                </div>
              )}
              {key === "storage" && item.actionTargetTabId && (
                <button
                  type="button"
                  onClick={() => {
                    const tab = safeRouteTab(item.actionTargetTabId!);
                    if (tab) setActiveTab(tab);
                    closeDrawer();
                  }}
                  data-testid="diagnostics-action-storage"
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.action.openStatus" />
                </button>
              )}
              {key === "storage" && label === "Privacy" && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("privacy" as Tab);
                    closeDrawer();
                  }}
                  data-testid="diagnostics-action-privacy"
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.action.openPrivacyDashboard" />
                </button>
              )}
              {key === "project" && (
                <button
                  type="button"
                  onClick={() => {
                    const tab = safeRouteTab(
                      item.actionTargetTabId ?? "status",
                    );
                    if (tab) setActiveTab(tab);
                    closeDrawer();
                  }}
                  data-testid="diagnostics-action-project"
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  {(item.actionLabelKey && tRuntime(item.actionLabelKey)) ??
                    tRuntime(
                      "runtimeGenerated.components.status.diagnosticsdrawer.text.openStatus",
                    )}
                </button>
              )}
              {key === "safety" && item.actionTargetTabId && (
                <button
                  type="button"
                  onClick={() => {
                    const tab = safeRouteTab(item.actionTargetTabId!);
                    if (tab) setActiveTab(tab);
                    closeDrawer();
                  }}
                  data-testid="diagnostics-action-safety"
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.action.openConfig" />
                </button>
              )}
              {key === "provider" && item.actionTargetTabId && (
                <button
                  type="button"
                  onClick={() => {
                    const tab = safeRouteTab(item.actionTargetTabId!);
                    if (tab) setActiveTab(tab);
                    closeDrawer();
                  }}
                  data-testid="diagnostics-action-provider"
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.action.openConfig" />
                </button>
              )}
              {key === "desktop" && !isElectron() && (
                <p className="text-[12px] text-text-muted">
                  <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.description.webModeFilesystemRevealsAndTheSystem" />
                </p>
              )}
              {key === "diagnostics" && label === "Repair" && (
                <div className="space-y-1.5">
                  <p className="text-[12px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.description.phase2cShipsReadOnlyDiagnosticsDestructive" />
                  </p>
                  <button
                    type="button"
                    onClick={() => setFocusedSection("model")}
                    data-testid="diagnostics-action-jump-model"
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors cursor-pointer"
                  >
                    <Trans i18nKey="common:surface.componentsStatusDiagnosticsdrawer.action.jumpToModel" />
                  </button>
                </div>
              )}
            </Section>
          );
        })}
      </aside>
    </div>
  );
}

function lastCopyedAt(iso: string | null): string | null {
  if (!iso) return null;
  // Trim to HH:MM:SS so the UI is compact.
  return iso.slice(11, 19);
}
