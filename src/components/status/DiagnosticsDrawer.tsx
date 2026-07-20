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

const SECTION_ORDER: Array<{ key: keyof AppStatusSnapshot; label: string }> = [
  { key: "diagnostics", label: "Overview" },
  { key: "api", label: "API" },
  { key: "apiKey", label: "API Key" },
  { key: "model", label: "Model" },
  { key: "storage", label: "Storage" },
  { key: "storage", label: "Privacy" },
  { key: "project", label: "Project" },
  { key: "safety", label: "Safety" },
  { key: "provider", label: "Research" },
  { key: "desktop", label: "Mode" },
  { key: "diagnostics", label: "Repair" },
];

const SEVERITY_BADGE: Record<StatusSeverity, string> = {
  ok: "bg-success/15 text-success border-success/30",
  warn: "bg-warning/15 text-warning border-warning/30",
  error: "bg-danger/15 text-danger border-danger/30",
  unknown: "bg-surface-muted text-text-muted border-border",
};

const SEVERITY_LABEL: Record<StatusSeverity, string> = {
  ok: "OK",
  warn: "Warning",
  error: "Error",
  unknown: "Unknown",
};

function SeverityBadge({ severity }: { severity: StatusSeverity }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] font-medium ${SEVERITY_BADGE[severity]}`}
      data-severity-badge={severity}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  )
}

interface SectionProps {
  sectionId: string;
  title: string;
  item: AppStatusItem;
  focused: boolean;
  children?: React.ReactNode;
}

function Section({ sectionId, title, item, focused, children }: SectionProps) {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (focused && ref.current) {
      ref.current.scrollIntoView({ block: "start" })
    }
  }, [focused])
  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      id={`diagnostics-section-${sectionId}`}
      data-testid={`diagnostics-section-${sectionId}`}
      data-focused={focused}
      className="rounded-lg border border-border bg-surface-muted p-3 space-y-1.5"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] uppercase tracking-wide text-text-secondary">
          {title}
        </h3>
        <SeverityBadge severity={item.severity} />
      </header>
      <p className="text-[12.5px] text-text-primary leading-relaxed">
        {item.summary}
      </p>
      {item.detail && (
        <p className="text-[12px] text-text-muted leading-relaxed">
          {item.detail}
        </p>
      )}
      {children}
    </section>
  )
}

function safeRouteTab(id: string): TabId | null {
  return isTabId(id) ? (id as TabId) : null
}

export function DiagnosticsDrawer() {
  const drawerRef = useRef<HTMLDivElement>(null)
  const drawerOpen = useStatusStore((s) => s.drawerOpen)
  const closeDrawer = useStatusStore((s) => s.closeDrawer)
  useFocusTrap(drawerRef, drawerOpen, closeDrawer)
  const status = useStatusStore((s) => s.status)
  const focusedSectionId = useStatusStore((s) => s.focusedSectionId)
  const setFocusedSection = useStatusStore((s) => s.setFocusedSection)
  const refresh = useStatusStore((s) => s.refresh)
  const isRefreshing = useStatusStore((s) => s.isRefreshing)
  const lastRefreshedAt = useStatusStore((s) => s.lastRefreshedAt)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)

  // The model status is the only category that benefits from a
  // manual catalog refresh. We use the existing useModels hook so
  // we do not introduce a parallel model service.
  const models = useModels("text", { enabled: drawerOpen })

  // Track a small transient status string for the "Copy safe
  // diagnostics" button so the test can observe the click handler
  // without depending on global toast side-effects.
  const [lastCopyAt, setLastCopyAt] = useState<string | null>(null)

  const handleCopySafeDiagnostics = useCallback(async () => {
    // Use the snapshot from the status store so the user gets the
    // exact same data they see in the drawer. The service builder
    // re-runs only when the underlying stores have changed (via
    // the store's `recompute` action), so this is cheap.
    const currentStatus = useStatusStore.getState().status
    const safe = computeSafeDiagnosticsSnapshot(currentStatus)
    const json = serialiseSafeDiagnosticsSnapshot(safe)
    const ok = await copyText(json)
    if (ok) {
      setLastCopyAt(new Date().toISOString())
      toast.success("Safe diagnostics copied to clipboard")
    } else {
      toast.error("Could not copy safe diagnostics")
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    try {
      await refresh()
      toast.success("Diagnostics refreshed")
    } catch {
      toast.error("Diagnostics refresh failed")
    }
  }, [refresh])

  // We deliberately do NOT auto-trigger a /models refetch here —
  // the existing useModels hook keeps a 5-minute cache and the
  // user can pull-to-refresh via the dedicated "Refresh Models"
  // button below. The hook's existing error state is surfaced via
  // the Models state.
  const modelsError = models.error ? redactErrorMessage(models.error) : null
  const refreshModels = useCallback(async () => {
    const result = await models.refetch()
    useStatusStore.getState().recompute()
    if (result.isSuccess) {
      const catalog = useModelCatalogRuntimeStore.getState()
      const liveCount = catalog.countsByType.text ?? catalog.totalCount
      toast.success(`${liveCount} live models refreshed`)
    } else {
      toast.error(redactErrorMessage(result.error ?? "Model catalog refresh failed"))
    }
  }, [models])

  // Build a unique ordered list of (id, label, item) for the
  // sections we actually want to render. The SECTION_ORDER has
  // a duplicate "diagnostics" key (Overview + Repair) so we
  // dedupe to a stable order.
  const sections = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ key: keyof AppStatusSnapshot; label: string; item: AppStatusItem }> = []
    for (const { key, label } of SECTION_ORDER) {
      if (seen.has(`${key}::${label}`)) continue
      seen.add(`${key}::${label}`)
      const item = status[key]
      if (!item) continue
      out.push({ key, label, item })
    }
    return out
  }, [status])

  if (!drawerOpen) return null

  return (
    <div
      ref={drawerRef}
      className="fixed inset-0 z-[170] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Diagnostics"
      data-testid="diagnostics-drawer"
    >
      {/* Backdrop click closes the drawer. */}
      <button
        type="button"
        aria-label="Close diagnostics"
        data-testid="diagnostics-backdrop"
        onClick={closeDrawer}
        className="flex-1 bg-overlay backdrop-blur-sm"
      />
      <aside
        className="w-[420px] max-w-[92vw] h-full bg-surface border-l border-border/50 overflow-y-auto p-3 space-y-3 animate-slide-in-right"
        data-testid="diagnostics-drawer-panel"
      >
        <header className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[14px] font-semibold text-text-primary">
              Diagnostics
            </h2>
            <p className="text-[12px] text-text-muted mt-0.5">
              App health, model catalog, storage, safety, and provider state.
            </p>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close"
            data-testid="diagnostics-close"
            className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
          >
            Close
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="diagnostics-refresh"
            className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {isRefreshing ? "Refreshing…" : "Refresh Diagnostics"}
          </button>
          <button
            type="button"
            onClick={handleCopySafeDiagnostics}
            data-testid="diagnostics-copy-safe"
            className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
          >
            Copy Safe Diagnostics
          </button>
          {lastCopyedAt(lastCopyAt) && (
            <span className="text-[12px] text-text-muted">copied at {lastCopyedAt(lastCopyAt)}</span>
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
          className="flex items-start gap-2 rounded-md border border-border/50 px-2 py-1.5 text-[12px] text-text-secondary"
          data-testid="diagnostics-prompt-opt-in"
        >
          <input
            type="checkbox"
            checked={useSettingsStore.getState().diagnosticsIncludePrompts}
            onChange={(e) =>
              useSettingsStore.getState().setDiagnosticsIncludePrompts(e.target.checked)
            }
            aria-label="Include redacted prompt excerpts in safe diagnostics"
            className="mt-0.5"
          />
          <span>
            Include redacted prompt excerpts in safe diagnostics
            <span className="block text-[11px] text-text-muted">
              Truncated (≤80 chars) and secret-stripped prompt snippets from the
              Prompt Library. Off by default.
            </span>
          </span>
        </label>

        {lastRefreshedAt && (
          <p className="text-[12px] text-text-muted">last refresh: {lastRefreshedAt}</p>
        )}

        {sections.map(({ key, label, item }) => {
          const sectionId = `${String(key)}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
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
                    const tab = safeRouteTab(item.actionTargetTabId!)
                    if (tab) setActiveTab(tab)
                    closeDrawer()
                  }}
                  data-testid="diagnostics-action-apiKey"
                  className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                >
                  {item.actionLabel ?? "Open Config"}
                </button>
              )}
              {key === "api" && (
                <button
                  type="button"
                  onClick={() => void refreshModels()}
                  data-testid="diagnostics-action-api-refresh"
                  className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                >
                  {models.isFetching ? "Refreshing models…" : "Refresh Models"}
                </button>
              )}
              {key === "model" && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => void refreshModels()}
                    data-testid="diagnostics-action-model-refresh"
                    className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                  >
                    {models.isFetching ? "Refreshing models…" : "Refresh Models"}
                  </button>
                  {modelsError && (
                    <p className="text-[12px] text-danger break-words">
                      Last refresh error: {modelsError}
                    </p>
                  )}
                </div>
              )}
              {key === "storage" && item.actionTargetTabId && (
                <button
                  type="button"
                  onClick={() => {
                    const tab = safeRouteTab(item.actionTargetTabId!)
                    if (tab) setActiveTab(tab)
                    closeDrawer()
                  }}
                  data-testid="diagnostics-action-storage"
                  className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                >
                  Open Status
                </button>
              )}
              {key === "storage" && label === "Privacy" && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("privacy" as Tab)
                    closeDrawer()
                  }}
                  data-testid="diagnostics-action-privacy"
                  className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                >
                  Open Privacy Dashboard
                </button>
              )}
              {key === "project" && (
                <button
                  type="button"
                  onClick={() => {
                    const tab = safeRouteTab(
                      item.actionTargetTabId ?? "status",
                    )
                    if (tab) setActiveTab(tab)
                    closeDrawer()
                  }}
                  data-testid="diagnostics-action-project"
                  className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                >
                  {item.actionLabel ?? "Open Status"}
                </button>
              )}
              {key === "safety" && item.actionTargetTabId && (
                <button
                  type="button"
                  onClick={() => {
                    const tab = safeRouteTab(item.actionTargetTabId!)
                    if (tab) setActiveTab(tab)
                    closeDrawer()
                  }}
                  data-testid="diagnostics-action-safety"
                  className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                >
                  Open Config
                </button>
              )}
              {key === "provider" && item.actionTargetTabId && (
                <button
                  type="button"
                  onClick={() => {
                    const tab = safeRouteTab(item.actionTargetTabId!)
                    if (tab) setActiveTab(tab)
                    closeDrawer()
                  }}
                  data-testid="diagnostics-action-provider"
                  className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                >
                  Open Config
                </button>
              )}
              {key === "desktop" && !isElectron() && (
                <p className="text-[12px] text-text-muted">
                  Web mode: filesystem, reveals, and the system shell are
                  unavailable. Some desktop-only features (audio routing,
                  local YAML config) are disabled.
                </p>
              )}
              {key === "diagnostics" && label === "Repair" && (
                <div className="space-y-1.5">
                  <p className="text-[12px] text-text-muted">
                    Phase 2C ships read-only diagnostics. Destructive
                    repairs (reset keys, clear storage, delete all data)
                    are out of scope and live in their dedicated tabs.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFocusedSection("model")}
                    data-testid="diagnostics-action-jump-model"
                    className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                  >
                    Jump to Model
                  </button>
                </div>
              )}
            </Section>
          )
        })}
      </aside>
    </div>
  )
}

function lastCopyedAt(iso: string | null): string | null {
  if (!iso) return null
  // Trim to HH:MM:SS so the UI is compact.
  return iso.slice(11, 19)
}
