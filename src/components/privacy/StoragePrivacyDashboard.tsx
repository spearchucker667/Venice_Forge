import { useEffect } from "react";
import { useStoragePrivacyStore } from "../../stores/storage-privacy-store";
import { useSettingsStore, type Tab } from "../../stores/settings-store";
import { 
  type StoragePrivacySeverity,
  type StoragePrivacyCategory,
  type StorageStoreInventoryItem,
  type StorageReferenceIssue,
} from "../../types/storage-privacy";
import { askDecision } from "../ui/modal-requests";

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

export function StoragePrivacyDashboard() {
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
      <div className="flex h-full items-center justify-center p-8 text-text-secondary" data-testid="privacy-error">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-10 w-10 text-danger opacity-80">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="font-medium text-text-primary">Failed to load storage inventory</h3>
            <p className="text-sm text-text-muted">{error}</p>
          </div>
          <button
            onClick={() => void refreshInventory()}
            className="mt-2 px-4 py-2 rounded-md bg-surface-muted hover:bg-surface text-text-primary text-sm font-medium border border-border transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!inventory) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-text-secondary" data-testid="privacy-loading">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-text-muted border-t-accent" />
          <p>Analyzing local storage...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden" data-testid="storage-privacy-dashboard">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Storage & Privacy</h1>
          <p className="text-sm text-text-secondary">Inspect and manage local data boundaries.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void refreshInventory()}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-md bg-surface-muted hover:bg-surface text-text-secondary text-sm transition-colors disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh Inventory"}
          </button>
          <button
            onClick={() => void copySafeSummary()}
            className="px-3 py-1.5 rounded-md bg-surface-muted hover:bg-surface text-text-secondary text-sm transition-colors"
          >
            Copy Safe Summary
          </button>
          <button
            onClick={() => exportSafeSummary()}
            className="px-3 py-1.5 rounded-md bg-surface-muted hover:bg-surface text-text-secondary text-sm transition-colors"
          >
            Export JSON
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
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">{store.label}</span>
                {store.encrypted === true && (
                    <span className="px-1.5 py-0.5 rounded bg-success/20 text-success text-[12px] font-bold">ENCRYPTED</span>
                )}
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-text-primary">{store.count ?? 0}</span>
                <p className="text-xs text-text-secondary mt-1">{store.summary}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Store Inventory Table */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-widest px-1">Detailed Inventory</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-left text-sm text-text-secondary">
              <thead className="bg-surface-muted text-text-muted text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Store</th>
                  <th className="px-4 py-3 font-medium text-right">Items</th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventory.stores.map((store: StorageStoreInventoryItem) => (
                  <tr key={store.id} className="hover:bg-surface-muted">
                    <td className="px-4 py-4">
                      <div className="font-medium text-text-primary">{store.label}</div>
                      <div className="text-[12px] text-text-muted font-mono">{store.storeName}</div>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      {store.count ?? 0}
                      {store.archivedCount ? (
                          <div className="text-[12px] text-text-muted">{store.archivedCount} archived</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5">
                        {store.containsSecrets && <Badge color="amber">Secrets</Badge>}
                        {store.containsUserContent && <Badge color="blue">User Content</Badge>}
                        {!store.exportableInSafeSummary && <Badge color="red">Sensitive</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className={`flex items-center gap-1.5 ${SEVERITY_COLOR[store.severity as keyof typeof SEVERITY_COLOR]}`}>
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
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-widest px-1">Reference Issues</h2>
            {inventory.issues.length === 0 ? (
              <div className="p-8 rounded-lg border border-border bg-surface-muted text-center text-text-muted text-sm">
                No storage health issues detected.
              </div>
            ) : (
              <div className="space-y-2">
                {inventory.issues.map((issue: StorageReferenceIssue) => (
                  <div key={issue.id} className="p-3 rounded-lg border border-warning/20 bg-warning/5 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-warning">{issue.message}</p>
                      <div className="flex gap-2 text-[12px] text-warning/60 uppercase font-bold">
                        <span>Source: {issue.sourceCategory}</span>
                        <span>·</span>
                        <span>Target: {issue.targetCategory}</span>
                      </div>
                    </div>
                    {issue.repairable && (
                        <button
                            onClick={() => setActiveTab(mapPrivacyCategoryToTab(issue.sourceCategory))}
                            className="px-2 py-1 rounded border border-warning/30 text-warning hover:bg-warning/10 text-xs whitespace-nowrap"
                        >
                            Review
                        </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-widest px-1">Maintenance Plan</h2>
            <div className="space-y-2">
                {maintenancePlan?.actions.map((action) => (
                    <div key={action.id} className="p-3 rounded-lg border border-border bg-surface-muted flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-text-primary">{action.label}</span>
                                {action.destructive && <span className="text-[9px] px-1 bg-danger/20 text-danger rounded font-bold uppercase">Destructive</span>}
                                {action.dryRunOnly && <span className="text-[9px] px-1 bg-info/20 text-info rounded font-bold uppercase">Dry Run</span>}
                            </div>
                            <p className="text-[12px] text-text-muted">{action.description}</p>
                        </div>
                        <button
                            onClick={async () => {
                                if (action.destructive) {
                                    const shouldRun = await askDecision({
                                        title: "Run destructive action?",
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
                                    : "bg-surface-muted text-text-secondary hover:bg-surface border border-border"
                            } disabled:opacity-50`}
                        >
                            {action.dryRunOnly ? "Preview only" : "Run Action"}
                        </button>
                    </div>
                ))}
            </div>
          </section>
        </div>

        {/* Exclusions */}
        <section className="p-4 rounded-lg bg-surface-muted border border-border space-y-2">
            <h3 className="text-xs font-bold text-text-muted uppercase">Privacy Exclusions</h3>
            <p className="text-[12px] text-text-secondary leading-relaxed">
                The following data is strictly local and <strong>never</strong> included in safe summaries or exports:
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {["API Keys", "Bearer Tokens", "Raw Prompt Text", "Full Message History", "Media Blobs", "Absolute Local Paths"].map(ex => (
                    <li key={ex} className="text-[12px] text-text-muted flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-text-muted" />
                        {ex}
                    </li>
                ))}
            </ul>
        </section>
      </main>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: 'blue' | 'amber' | 'red' | 'emerald' }) {
    const colors = {
        blue: "bg-info/10 text-info border-info/20",
        amber: "bg-warning/10 text-warning border-warning/20",
        red: "bg-danger/10 text-danger border-danger/20",
        emerald: "bg-success/10 text-success border-success/20",
    };
    return (
        <span className={`px-1.5 py-0.5 rounded border text-[12px] font-bold uppercase ${colors[color]}`}>
            {children}
        </span>
    );
}
