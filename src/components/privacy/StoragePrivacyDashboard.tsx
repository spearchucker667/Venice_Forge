import { useEffect } from "react";
import { useStoragePrivacyStore } from "../../stores/storage-privacy-store";
import { useSettingsStore, type Tab } from "../../stores/settings-store";
import { 
  type StoragePrivacySeverity, 
  type StorageStoreInventoryItem,
  type StorageReferenceIssue,
} from "../../types/storage-privacy";

const SEVERITY_COLOR: Record<StoragePrivacySeverity, string> = {
  ok: "text-emerald-400",
  info: "text-blue-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

const SEVERITY_BG: Record<StoragePrivacySeverity, string> = {
  ok: "bg-emerald-500/10 border-emerald-500/20",
  info: "bg-blue-500/10 border-blue-500/20",
  warn: "bg-amber-500/10 border-amber-500/20",
  error: "bg-red-500/10 border-red-500/20",
};

export function StoragePrivacyDashboard() {
  const {
    inventory,
    maintenancePlan,
    refreshing,
    refreshInventory,
    copySafeSummary,
    exportSafeSummary,
    runMaintenanceAction,
  } = useStoragePrivacyStore();

  const setActiveTab = useSettingsStore((s) => s.setActiveTab);

  useEffect(() => {
    void refreshInventory();
  }, [refreshInventory]);

  if (!inventory) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-white/50" data-testid="privacy-loading">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p>Analyzing local storage...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden" data-testid="storage-privacy-dashboard">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div>
          <h1 className="text-lg font-semibold text-white">Storage & Privacy</h1>
          <p className="text-sm text-white/50">Inspect and manage local data boundaries.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void refreshInventory()}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/80 text-sm transition-colors disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh Inventory"}
          </button>
          <button
            onClick={() => void copySafeSummary()}
            className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/80 text-sm transition-colors"
          >
            Copy Safe Summary
          </button>
          <button
            onClick={() => exportSafeSummary()}
            className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/80 text-sm transition-colors"
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
                <span className="text-xs font-medium uppercase tracking-wider text-white/40">{store.label}</span>
                {store.encrypted === true && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">ENCRYPTED</span>
                )}
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-white">{store.count ?? 0}</span>
                <p className="text-xs text-white/60 mt-1">{store.summary}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Store Inventory Table */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest px-1">Detailed Inventory</h2>
          <div className="rounded-lg border border-white/5 overflow-hidden">
            <table className="w-full text-left text-sm text-white/80">
              <thead className="bg-white/5 text-white/40 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Store</th>
                  <th className="px-4 py-3 font-medium text-right">Items</th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {inventory.stores.map((store: StorageStoreInventoryItem) => (
                  <tr key={store.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-4">
                      <div className="font-medium text-white">{store.label}</div>
                      <div className="text-[11px] text-white/30 font-mono">{store.storeName}</div>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      {store.count ?? 0}
                      {store.archivedCount ? (
                          <div className="text-[10px] text-white/30">{store.archivedCount} archived</div>
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
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest px-1">Reference Issues</h2>
            {inventory.issues.length === 0 ? (
              <div className="p-8 rounded-lg border border-white/5 bg-white/[0.02] text-center text-white/30 text-sm">
                No storage health issues detected.
              </div>
            ) : (
              <div className="space-y-2">
                {inventory.issues.map((issue: StorageReferenceIssue) => (
                  <div key={issue.id} className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-amber-200">{issue.message}</p>
                      <div className="flex gap-2 text-[10px] text-amber-500/60 uppercase font-bold">
                        <span>Source: {issue.sourceCategory}</span>
                        <span>·</span>
                        <span>Target: {issue.targetCategory}</span>
                      </div>
                    </div>
                    {issue.repairable && (
                        <button
                            onClick={() => setActiveTab(issue.sourceCategory as Tab)}
                            className="px-2 py-1 rounded border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 text-xs whitespace-nowrap"
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
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest px-1">Maintenance Plan</h2>
            <div className="space-y-2">
                {maintenancePlan?.actions.map((action) => (
                    <div key={action.id} className="p-3 rounded-lg border border-white/5 bg-white/[0.02] flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-white/90">{action.label}</span>
                                {action.destructive && <span className="text-[9px] px-1 bg-red-500/20 text-red-400 rounded font-bold uppercase">Destructive</span>}
                                {action.dryRunOnly && <span className="text-[9px] px-1 bg-blue-500/20 text-blue-400 rounded font-bold uppercase">Dry Run</span>}
                            </div>
                            <p className="text-[12px] text-white/40">{action.description}</p>
                        </div>
                        <button
                            onClick={() => {
                                if (action.destructive && !confirm(`Are you sure you want to run: ${action.label}?`)) return;
                                void runMaintenanceAction(action.id);
                            }}
                            disabled={refreshing || action.dryRunOnly}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                                action.destructive 
                                    ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30" 
                                    : "bg-white/5 text-white/70 hover:bg-white/10 border border-white/10"
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
        <section className="p-4 rounded-lg bg-black/20 border border-white/5 space-y-2">
            <h3 className="text-xs font-bold text-white/40 uppercase">Privacy Exclusions</h3>
            <p className="text-[12px] text-white/60 leading-relaxed">
                The following data is strictly local and <strong>never</strong> included in safe summaries or exports:
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {["API Keys", "Bearer Tokens", "Raw Prompt Text", "Full Message History", "Media Blobs", "Absolute Local Paths"].map(ex => (
                    <li key={ex} className="text-[11px] text-white/30 flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-white/20" />
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
        blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        red: "bg-red-500/10 text-red-400 border-red-500/20",
        emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    };
    return (
        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase ${colors[color]}`}>
            {children}
        </span>
    );
}
