import React from "react";
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
  return (
    <div className="space-y-6">
      {/* Venice key */}
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[14.5px] font-medium text-text-primary">Venice.ai Integration</h3>
          <span
            className={`text-[12px] px-2 py-0.5 rounded font-medium ${
              veniceConfigured
                ? "bg-success/10 text-success border border-success/20"
                : "bg-warning/10 text-warning border border-warning/20"
            }`}
          >
            {veniceConfigured ? "Configured" : "Unset"}
          </span>
        </div>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          Your API key is saved using secure storage encryption and is never exposed to the web sandbox.
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
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-all font-mono placeholder:text-text-muted/50"
              />
              <button
                onClick={onSaveApiKey}
                disabled={!apiKeyInput.trim()}
                className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
              >
                Save Key
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                disabled
                value="••••••••••••••••••••••••••••••••"
                className="flex-1 bg-surface-elevated border border-border/40 rounded-lg px-3 py-1.5 text-[13.5px] text-text-muted font-mono"
              />
              <button
                onClick={onTestApiKey}
                disabled={apiKeyTesting}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50 cursor-pointer"
              >
                {apiKeyTesting ? "Testing..." : "Test Key"}
              </button>
              <button
                onClick={onDeleteApiKey}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/25 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Jina key */}
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[14.5px] font-medium text-text-primary">Jina.ai Integration</h3>
          <span
            className={`text-[12px] px-2 py-0.5 rounded font-medium ${
              jinaKeyConfigured
                ? "bg-success/10 text-success border border-success/20"
                : "bg-surface border border-border text-text-muted"
            }`}
          >
            {jinaKeyConfigured ? "Configured" : "Optional"}
          </span>
        </div>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          Provides deep web searching, scraping, and social profile discovery mapping capabilities.{" "}
          {isElectron()
            ? "Jina API keys are saved with the same OS secure storage."
            : "Jina API keys are kept only in memory for this browser session; use the server environment for persistent web configuration."}
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
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-all font-mono placeholder:text-text-muted/50"
              />
              <button
                onClick={onSaveJinaKey}
                disabled={!jinaKeyInput.trim()}
                className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
              >
                Save Key
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                disabled
                value="••••••••••••••••••••••••••••••••"
                className="flex-1 bg-surface-elevated border border-border/40 rounded-lg px-3 py-1.5 text-[13.5px] text-text-muted font-mono"
              />
              <button
                onClick={onTestJinaKey}
                disabled={jinaKeyTesting}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50 cursor-pointer"
              >
                {jinaKeyTesting ? "Testing..." : "Test Key"}
              </button>
              <button
                onClick={onDeleteJinaKey}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/25 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
