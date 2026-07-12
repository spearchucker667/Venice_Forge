import React, { useState } from "react";
import { useConfigStore, reloadConfig } from "../../stores/config-store";
import { toast } from "../../stores/toast-store";
import { askDecision } from "../ui/modal-requests";
import { redactErrorMessage } from "../../shared/redaction";
import { desktopFiles, desktopConfig } from "../../services/desktopBridge";

/** Settings panel that surfaces the local master YAML config. */
export function ConfigPanel(): React.ReactElement {
  const config = useConfigStore((s) => s.config);
  const status = useConfigStore((s) => s.status);
  const loading = useConfigStore((s) => s.loading);
  const error = useConfigStore((s) => s.error);
  const [working, setWorking] = useState(false);

  const handleReload = async (): Promise<void> => {
    setWorking(true);
    try {
      await reloadConfig();
      toast.success("Local config reloaded.");
    } catch (err) {
      toast.error("Failed to reload config.", redactErrorMessage(err));
    } finally {
      setWorking(false);
    }
  };

  const handleOpenFolder = async (): Promise<void> => {
    setWorking(true);
    try {
      const res = await desktopConfig.openFolder();
      if (!res.ok) toast.error(res.error || "Failed to open config folder.");
    } catch (err) {
      toast.error("Failed to open config folder.", redactErrorMessage(err));
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
      if (ok) toast.success("Template exported.");
      else toast.info("Export cancelled.");
    } catch (err) {
      toast.error("Failed to export config template.", redactErrorMessage(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-3">
        <h3 className="text-[15px] font-semibold text-text-primary">Local Master Config</h3>
        <p className="text-[12.5px] text-text-secondary">
          Edit <code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]">config.yaml</code> and{" "}
          <code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]">themes.yaml</code> on disk to configure Venice Forge without touching the UI. See{" "}
          <code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]">docs/CONFIG.md</code> for the full schema.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Config path</div>
            <div className="text-text-primary font-mono break-all">{status?.configPath || "(unavailable)"}</div>
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Themes path</div>
            <div className="text-text-primary font-mono break-all">{status?.themesPath || "(unavailable)"}</div>
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Loaded from</div>
            <div className="text-text-primary">{status?.source || "—"}</div>
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Profile</div>
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
            Parse error: {status.parseError}
          </div>
        )}
        {status?.warnings && status.warnings.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[12px] space-y-1">
            <div className="font-medium text-warning">Validation warnings</div>
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
            {working ? "Working…" : "Reload Config"}
          </button>
          <button
            onClick={handleOpenFolder}
            disabled={working}
            className="px-3 py-1.5 rounded-md border border-border bg-surface text-text-primary text-[12.5px] hover:bg-surface-elevated disabled:opacity-50"
          >
            Open Config Folder
          </button>
          <button
            onClick={handleExport}
            disabled={working}
            className="px-3 py-1.5 rounded-md border border-border bg-surface text-text-primary text-[12.5px] hover:bg-surface-elevated disabled:opacity-50"
          >
            Export Sanitized Template
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-3">
        <h3 className="text-[15px] font-semibold text-text-primary">API Key Import</h3>
        <p className="text-[12.5px] text-text-secondary">
          Plaintext keys in <code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]">config.yaml</code> are imported into OS secure storage on startup and redacted from the file (unless{" "}
          <code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]">secrets.keep_plaintext_keys: true</code> is set).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Venice key</div>
            <div className="text-text-primary">
              {status?.secureStore.venice ? "Configured (secure store)" : "Not configured"}
            </div>
            {status?.keysImported.venice && <div className="text-success mt-1">Imported this run</div>}
            {status?.keysRedacted.venice && <div className="text-text-muted mt-1">Plaintext redacted</div>}
          </div>
          <div className="rounded-lg border border-border p-3 bg-surface">
            <div className="text-text-muted mb-1">Jina key</div>
            <div className="text-text-primary">
              {status?.secureStore.jina ? "Configured (secure store)" : "Not configured"}
            </div>
            {status?.keysImported.jina && <div className="text-success mt-1">Imported this run</div>}
            {status?.keysRedacted.jina && <div className="text-text-muted mt-1">Plaintext redacted</div>}
          </div>
        </div>
        <p className="text-[12px] text-text-muted">
          Raw keys are never sent to the renderer. Reset the secure store to clear stored keys; you can then re-enter them via the API Keys tab.
        </p>
        <button
          onClick={async () => {
            const shouldReset = await askDecision({
              title: "Clear secure store keys?",
              detail: "This removes all stored API keys from the secure store. This cannot be undone.",
              actionLabel: "Clear keys",
              danger: true,
            });
            if (!shouldReset) return;
            setWorking(true);
            try {
              const res = await desktopConfig.resetSecureStoreKeys();
              if (res.ok) {
                toast.success("Secure store cleared.");
                await reloadConfig();
              } else {
                toast.error(res.error || "Failed to clear secure store.");
              }
            } finally {
              setWorking(false);
            }
          }}
          disabled={working || (!status?.secureStore.venice && !status?.secureStore.jina)}
          className="px-3 py-1.5 rounded-md border border-danger/40 bg-danger/10 text-danger text-[12.5px] hover:bg-danger/20 disabled:opacity-50"
        >
          Clear Secure Store
        </button>
      </div>

      {config && (
        <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-3">
          <h3 className="text-[15px] font-semibold text-text-primary">Effective Settings (preview)</h3>
          <p className="text-[12.5px] text-text-secondary">
            Read-only preview of the merged config currently in memory. The{" "}
            <code className="px-1 py-0.5 rounded bg-surface border border-border text-[12px]">YAML</code> source remains the canonical source of truth — edit it on disk and click <em>Reload Config</em>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
            <div>
              <div className="text-text-muted mb-1">Active theme</div>
              <div className="text-text-primary font-mono">{config.theme.active || "builtin-dark"}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Default chat model</div>
              <div className="text-text-primary font-mono">{config.models.chat || "(use UI default)"}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Temperature</div>
              <div className="text-text-primary">{config.chat.temperature}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Top-p</div>
              <div className="text-text-primary">{config.chat.top_p}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Max tokens</div>
              <div className="text-text-primary">{config.chat.max_tokens}</div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Web search</div>
              <div className="text-text-primary">{config.chat.enable_web_search}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
