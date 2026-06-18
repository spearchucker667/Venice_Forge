import React from "react";
import { useAuthStore } from "../../stores/auth-store";
import { useSettingsStore } from "../../stores/settings-store";
import { isElectron } from "../../services/desktopBridge";

interface ProviderStatus {
  id: string;
  label: string;
  status: "configured" | "missing" | "test-failed" | "disabled" | "unavailable";
  message: string;
}

export function ResearchProviderStatus({ onOpenApiKeyDialog }: { onOpenApiKeyDialog?: () => void }) {
  const isConfigured = useAuthStore((s) => s.isConfigured);
  const jinaIsConfigured = useAuthStore((s) => s.jinaIsConfigured);
  const jinaEnabled = useSettingsStore((s) => {
    const config = (s as unknown as Record<string, unknown>).config as Record<string, unknown> | undefined;
    return config?.enable_jina !== false;
  });

  const providers: ProviderStatus[] = [
    {
      id: "venice",
      label: "Venice",
      status: isConfigured ? "configured" : "missing",
      message: isConfigured ? "API key configured" : "Venice API key missing",
    },
    {
      id: "jina",
      label: "Jina AI",
      status: jinaEnabled ? (jinaIsConfigured ? "configured" : "missing") : "disabled",
      message: jinaEnabled
        ? jinaIsConfigured
          ? "API key configured"
          : "Jina API key optional (unauthenticated use supported)"
        : "Disabled by config",
    },
    {
      id: "generic",
      label: "Generic Scrape",
      status: "configured",
      message: "Enabled (no key required)",
    },
    {
      id: "browser",
      label: "Live Browser",
      status: isElectron() ? "configured" : "unavailable",
      message: isElectron() ? "Desktop available" : "Web mode unavailable",
    },
  ];

  const statusDot = (status: ProviderStatus["status"]) => {
    switch (status) {
      case "configured":
        return <span className="w-2 h-2 rounded-full bg-success inline-block" aria-label="Configured" />;
      case "missing":
        return <span className="w-2 h-2 rounded-full bg-warning inline-block" aria-label="Missing" />;
      case "test-failed":
        return <span className="w-2 h-2 rounded-full bg-danger inline-block" aria-label="Test failed" />;
      case "disabled":
        return <span className="w-2 h-2 rounded-full bg-text-muted inline-block" aria-label="Disabled" />;
      case "unavailable":
        return <span className="w-2 h-2 rounded-full bg-text-muted inline-block" aria-label="Unavailable" />;
    }
  };

  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {providers.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-elevated border border-border"
          title={p.message}
        >
          {statusDot(p.status)}
          <span className="text-text-secondary">{p.label}</span>
          {p.status === "missing" && p.id === "venice" && onOpenApiKeyDialog && (
            <button
              type="button"
              onClick={onOpenApiKeyDialog}
              className="ml-1 text-accent hover:text-accent-hover underline"
            >
              Add key
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
