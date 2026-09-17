import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { getModelById } from "../../services/modelService";
import {
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  supportsReasoningEffort,
  type ReasoningEffort,
} from "../../shared/modelCapabilities";

/** Phase 4C.2 — reasoning-effort selector for the chat composer.
 *
 *  The selector offers only effort values the selected model advertises via
 *  live `model_spec.capabilities.reasoningEffortOptions` metadata (Swagger
 *  `TextModelCapabilities`); when the model supports the parameter but
 *  advertises no restriction, the full documented enum is offered. Models
 *  that explicitly do not support `reasoning_effort` (or have no metadata —
 *  fail closed) disable the control with an explanatory notice.
 *
 *  Model-switch repair: when the persisted preference is no longer valid for
 *  the selected model, it is reset to the model's advertised
 *  `defaultReasoningEffort` (or provider default) with a non-blocking
 *  notice. The switch itself is never blocked. The canonical payload
 *  boundary (`resolveReasoningEffort` in chat-stream-manager) independently
 *  guarantees an invalid value never reaches the wire. */
export function ReasoningEffortControl() {
  const { t } = useTranslation("chat");
  const { reasoningEffort, setReasoningEffort, activeConversationId, conversations } =
    useChatStore(
      useShallow((s) => ({
        reasoningEffort: s.reasoningEffort,
        setReasoningEffort: s.setReasoningEffort,
        activeConversationId: s.activeConversationId,
        conversations: s.conversations,
      })),
    );

  const activeConv = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : undefined;

  // Mirror the stream-model resolution: the conversation model wins,
  // otherwise the global chat selection (see chat-view / use-chat).
  const selectedChatModel = useSettingsStore((s) => s.selectedModels.chat);
  const chatModel = activeConv?.model || selectedChatModel;
  const modelInfo = getModelById(chatModel ?? "");
  const options = getReasoningEffortOptions(modelInfo);
  const metadataKnown = Boolean(modelInfo?.model_spec);
  const effortSupported = supportsReasoningEffort(modelInfo);

  const [repairedNotice, setRepairedNotice] = useState<{
    effort: string;
    model: string;
    resetTo: string;
  } | null>(null);
  const repairedForModel = useRef<string | null>(null);

  // Non-blocking repair on model switch: an invalid persisted preference is
  // reset to the model default once per (model, invalid-value) combination.
  // Never blocks the switch; the notice is informational only.
  useEffect(() => {
    if (!options || !reasoningEffort) return;
    if ((options as readonly string[]).includes(reasoningEffort)) {
      repairedForModel.current = null;
      return;
    }
    const repairKey = `${chatModel}:${reasoningEffort}`;
    if (repairedForModel.current === repairKey) return;
    repairedForModel.current = repairKey;
    const modelDefault = getDefaultReasoningEffort(modelInfo);
    setReasoningEffort(modelDefault ?? undefined);
    setRepairedNotice({
      effort: reasoningEffort,
      model: chatModel ?? "",
      resetTo: modelDefault
        ? t(`reasoningEffort.options.${modelDefault}`, {
            defaultValue: modelDefault,
          })
        : t("reasoningEffort.providerDefault", { defaultValue: "Provider default" }),
    });
  }, [options, reasoningEffort, chatModel, modelInfo, setReasoningEffort, t]);

  const selectClass =
    "bg-vf-panel-bg-raised border border-vf-panel-border rounded px-2 py-0.5 vf-meta text-text-muted outline-none hover:text-text-secondary transition-colors max-w-[200px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";
  const labelClass =
    "vf-meta text-text-muted/40 font-medium uppercase tracking-[0.08em]";

  const disabledReason = !metadataKnown
    ? t("reasoningEffort.unknownMetadata", {
        defaultValue:
          "Model capabilities aren't available, so reasoning effort won't be sent.",
      })
    : !effortSupported
      ? t("reasoningEffort.unsupported", {
          defaultValue:
            "The selected model doesn't advertise reasoning-effort support.",
        })
      : undefined;

  return (
    <div data-testid="chat-reasoning-effort-control">
      <div className="flex items-center justify-between mb-1 gap-2">
        <label htmlFor="chat-reasoning-effort" className={labelClass}>
          {t("reasoningEffort.label", { defaultValue: "Reasoning effort" })}
        </label>
        <select
          id="chat-reasoning-effort"
          data-testid="chat-reasoning-effort"
          className={selectClass}
          value={reasoningEffort ?? ""}
          disabled={!options}
          title={disabledReason}
          onChange={(e) => {
            const value = e.target.value;
            setReasoningEffort(value === "" ? undefined : (value as ReasoningEffort));
          }}
        >
          <option value="">
            {t("reasoningEffort.providerDefault", {
              defaultValue: "Provider default",
            })}
          </option>
          {(options ?? []).map((option) => (
            <option key={option} value={option}>
              {t(`reasoningEffort.options.${option}`, { defaultValue: option })}
            </option>
          ))}
        </select>
      </div>
      <p className="vf-meta text-text-muted/50">
        {t("reasoningEffort.hint", {
          defaultValue:
            "Higher effort means deeper reasoning, more tokens, and more latency.",
        })}
      </p>
      {disabledReason && (
        <p className="vf-meta text-warning mt-0.5" role="status">
          {disabledReason}
        </p>
      )}
      {repairedNotice && (
        <p className="vf-meta text-warning mt-0.5" role="status">
          {t("reasoningEffort.repaired", {
            effort: repairedNotice.effort,
            model: repairedNotice.model,
            resetTo: repairedNotice.resetTo,
            defaultValue:
              "“{{effort}}” isn't supported by {{model}} — reset to {{resetTo}}.",
          })}
        </p>
      )}
    </div>
  );
}
