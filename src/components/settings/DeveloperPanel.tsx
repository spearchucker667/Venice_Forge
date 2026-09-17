import React from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings-store";
import { getModelById } from "../../services/modelService";
import { modelSupportsResponsesApi } from "../../shared/veniceResponses";

/** Developer / experimental settings surface (handoff §19 maps the Responses
 *  API to "Advanced/Developer" settings). Everything here is opt-in and off
 *  by default; nothing on this panel changes behavior unless explicitly
 *  enabled. */
export function DeveloperPanel(): React.ReactElement {
  const { t } = useTranslation(["settings", "common"]);
  const responsesApiEnabled = useSettingsStore((s) => s.responsesApiEnabled);
  const setResponsesApiEnabled = useSettingsStore((s) => s.setResponsesApiEnabled);
  const selectedChatModelId = useSettingsStore((s) => s.selectedModels["chat"]);

  const chatModel = selectedChatModelId ? getModelById(selectedChatModelId) : undefined;
  const modelEligible = modelSupportsResponsesApi(chatModel);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[14.5px] font-medium text-text-primary">
              {t("settings:developer.responsesApi.title", "Responses API (Alpha)")}
              <span className="ml-2 inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-accent">
                {t("settings:developer.experimentalBadge", "Experimental")}
              </span>
            </h3>
            <p className="mt-1 text-[12.5px] text-text-secondary leading-relaxed">
              {t(
                "settings:developer.responsesApi.description",
                "Use Venice's alpha Responses API (POST /responses) as the chat transport for new messages. Stateless: the full conversation is sent with every request. Streaming, typed output blocks, and reasoning blocks are supported. Family Safe Mode and mandatory safety protections still apply to every request.",
              )}
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={responsesApiEnabled}
              onChange={(event) => setResponsesApiEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-vf-panel-border bg-vf-panel-bg-inset text-accent"
            />
            <span className="text-[12.5px] font-medium text-text-primary">
              {responsesApiEnabled
                ? t("settings:developer.responsesApi.on", "ON: Responses API")
                : t("settings:developer.responsesApi.off", "OFF: Chat Completions (default)")}
            </span>
          </label>
        </div>

        <p className="text-[12px] text-text-muted leading-relaxed">
          {t(
            "settings:developer.responsesApi.modelGate",
            "Only models confirmed as non-E2EE are eligible; E2EE-capable models and models without capability metadata automatically keep using /chat/completions. Fallback providers are never routed through Responses.",
          )}
        </p>

        {selectedChatModelId ? (
          <p
            className="text-[12px] leading-relaxed"
            data-support-eligible={modelEligible ? "true" : "false"}
          >
            {modelEligible
              ? t("settings:developer.responsesApi.support.eligible", {
                  defaultValue:
                    "Current chat model ({{model}}) is eligible for the Responses transport.",
                  model: chatModel?.name ?? chatModel?.id ?? selectedChatModelId,
                })
              : t("settings:developer.responsesApi.support.ineligible", {
                  defaultValue:
                    "Current chat model ({{model}}) is not eligible; it will keep using /chat/completions.",
                  model: chatModel?.name ?? chatModel?.id ?? selectedChatModelId,
                })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
