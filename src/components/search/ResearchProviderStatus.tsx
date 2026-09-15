import React from "react";
import { useAuthStore } from "../../stores/auth-store";
import { useSettingsStore } from "../../stores/settings-store";
import { isElectron } from "../../services/desktopBridge";
import { Trans, useTranslation } from "react-i18next";

interface ProviderStatus {
  id: string;
  label: string;
  status: "configured" | "missing" | "test-failed" | "disabled" | "unavailable";
  message: string;
}

export function ResearchProviderStatus({
  onOpenApiKeyDialog,
}: {
  onOpenApiKeyDialog?: () => void;
}) {
  const { t: tRuntime } = useTranslation("common");
  const isConfigured = useAuthStore((s) => s.isConfigured);
  const jinaIsConfigured = useAuthStore((s) => s.jinaIsConfigured);
  const jinaEnabled = useSettingsStore((s) => {
    const config = (s as unknown as Record<string, unknown>).config as
      Record<string, unknown> | undefined;
    return config?.enable_jina !== false;
  });

  const providers: ProviderStatus[] = [
    {
      id: "venice",
      label: "Venice",
      status: isConfigured ? "configured" : "missing",
      message: isConfigured
        ? tRuntime(
            "runtimeGenerated.components.search.researchproviderstatus.metadata.apiKeyConfigured",
          )
        : tRuntime(
            "runtimeGenerated.components.search.researchproviderstatus.metadata.veniceApiKeyMissing",
          ),
    },
    {
      id: "jina",
      label: tRuntime(
        "runtimeGenerated.components.search.researchproviderstatus.metadata.jinaAi",
      ),
      status: jinaEnabled
        ? jinaIsConfigured
          ? "configured"
          : "missing"
        : "disabled",
      message: jinaEnabled
        ? jinaIsConfigured
          ? tRuntime(
              "runtimeGenerated.components.search.researchproviderstatus.metadata.apiKeyConfigured",
            )
          : tRuntime(
              "runtimeGenerated.components.search.researchproviderstatus.metadata.jinaApiKeyOptionalUnauthenticatedUseSupported",
            )
        : tRuntime(
            "runtimeGenerated.components.search.researchproviderstatus.metadata.disabledByConfig",
          ),
    },
    {
      id: "generic",
      label: tRuntime(
        "runtimeGenerated.components.search.researchproviderstatus.metadata.genericScrape",
      ),
      status: "configured",
      message: tRuntime(
        "runtimeGenerated.components.search.researchproviderstatus.metadata.enabledNoKeyRequired",
      ),
    },
    {
      id: "browser",
      label: tRuntime(
        "runtimeGenerated.components.search.researchproviderstatus.metadata.liveBrowser",
      ),
      status: isElectron() ? "configured" : "unavailable",
      message: isElectron()
        ? tRuntime(
            "runtimeGenerated.components.search.researchproviderstatus.metadata.desktopAvailable",
          )
        : tRuntime(
            "runtimeGenerated.components.search.researchproviderstatus.metadata.webModeUnavailable",
          ),
    },
  ];

  const statusDot = (status: ProviderStatus["status"]) => {
    switch (status) {
      case "configured":
        return (
          <span
            className="w-2 h-2 rounded-full bg-success inline-block"
            aria-label={tRuntime(
              "runtimeGenerated.components.search.researchproviderstatus.attribute.configured",
            )}
          />
        );
      case "missing":
        return (
          <span
            className="w-2 h-2 rounded-full bg-warning inline-block"
            aria-label={tRuntime(
              "runtimeGenerated.components.search.researchproviderstatus.attribute.missing",
            )}
          />
        );
      case "test-failed":
        return (
          <span
            className="w-2 h-2 rounded-full bg-danger inline-block"
            aria-label={tRuntime(
              "runtimeGenerated.components.search.researchproviderstatus.attribute.testFailed",
            )}
          />
        );
      case "disabled":
        return (
          <span
            className="w-2 h-2 rounded-full bg-text-muted inline-block"
            aria-label={tRuntime(
              "runtimeGenerated.components.search.researchproviderstatus.attribute.disabled",
            )}
          />
        );
      case "unavailable":
        return (
          <span
            className="w-2 h-2 rounded-full bg-text-muted inline-block"
            aria-label={tRuntime(
              "runtimeGenerated.components.search.researchproviderstatus.attribute.unavailable",
            )}
          />
        );
    }
  };

  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {providers.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-vf-panel-bg-raised border border-vf-panel-border"
          title={p.message}
        >
          {statusDot(p.status)}
          <span className="text-text-secondary">{p.label}</span>
          {p.status === "missing" &&
            p.id === "venice" &&
            onOpenApiKeyDialog && (
              <button
                type="button"
                onClick={onOpenApiKeyDialog}
                className="ml-1 text-accent hover:text-accent-hover underline"
              >
                <Trans i18nKey="common:surface.componentsSearchResearchproviderstatus.action.addKey" />
              </button>
            )}
        </div>
      ))}
    </div>
  );
}
