import { useShallow } from "zustand/shallow";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { getModelById } from "../../services/modelService";
import { supportsE2EE } from "../../shared/modelCapabilities";
import type { E2eeOverride, PromptCacheRetention } from "../../types/venice";

/** FEAT-003 / FEAT-004 — compact privacy controls for the chat composer area.
 *
 *  Two selectors:
 *   - E2EE override (`provider-default` | `on` | `off`), capability-gated on
 *     the selected model's advertised `supportsE2EE` metadata. The control is
 *     a *request preference*; it never claims E2EE is active — the wire field
 *     `venice_parameters.enable_e2ee` is resolved at the canonical payload
 *     boundary (`resolveE2eeParam`) only for models that advertise support.
 *   - Prompt-cache retention (`default` | `extended` | `24h`), Venice-only,
 *     emitted top-level as `prompt_cache_retention` (omitted on `default`).
 *
 *  Conversation semantics: with an active conversation the selectors edit the
 *  conversation override (`metadata.privacy.*`); a non-default value writes
 *  the override and `default`/`provider-default` clears it, falling back to
 *  the profile-level default. Without a conversation the selectors edit the
 *  profile default directly.
 *
 *  Fallback providers (`settings-store` fallback chain) cannot preserve E2EE;
 *  when any fallback route is active the control surfaces an informational
 *  notice. It never blocks the selection. */

const E2EE_OPTIONS: readonly E2eeOverride[] = [
  "provider-default",
  "on",
  "off",
];

const RETENTION_OPTIONS: readonly PromptCacheRetention[] = [
  "default",
  "extended",
  "24h",
];

export function PrivacyControls() {
  const { t } = useTranslation("chat");
  const {
    e2eeOverride,
    setE2eeOverride,
    promptCacheRetention,
    setPromptCacheRetention,
    activeConversationId,
    conversations,
    updateConversationMetadata,
  } = useChatStore(
    useShallow((s) => ({
      e2eeOverride: s.e2eeOverride,
      setE2eeOverride: s.setE2eeOverride,
      promptCacheRetention: s.promptCacheRetention,
      setPromptCacheRetention: s.setPromptCacheRetention,
      activeConversationId: s.activeConversationId,
      conversations: s.conversations,
      updateConversationMetadata: s.updateConversationMetadata,
    })),
  );

  const activeConv = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : undefined;
  const privacy = activeConv?.metadata?.privacy;

  // Mirror the stream-model resolution: the character-bound conversation
  // model wins, otherwise the global chat selection (see chat-view / use-chat).
  const selectedChatModel = useSettingsStore((s) => s.selectedModels.chat);
  const chatModel = activeConv?.model || selectedChatModel;
  const e2eeSupported = supportsE2EE(getModelById(chatModel ?? ""));

  const autoFallbackEnabled = useSettingsStore((s) => s.autoFallbackEnabled);
  const enabledProviders = useSettingsStore((s) => s.enabledProviders);
  const fallbackActive =
    autoFallbackEnabled || Object.values(enabledProviders).some(Boolean);

  const effectiveE2ee: E2eeOverride = privacy?.e2eeOverride ?? e2eeOverride;

  const writeE2ee = (value: E2eeOverride) => {
    if (activeConv) {
      updateConversationMetadata(activeConv.id, {
        privacy: { ...privacy, e2eeOverride: value === "provider-default" ? undefined : value },
      });
    } else {
      setE2eeOverride(value);
    }
  };

  const writeRetention = (value: PromptCacheRetention) => {
    if (activeConv) {
      updateConversationMetadata(activeConv.id, {
        privacy: {
          ...privacy,
          promptCacheRetention: value === "default" ? undefined : value,
        },
      });
    } else {
      setPromptCacheRetention(value);
    }
  };

  const selectClass =
    "bg-vf-panel-bg-raised border border-vf-panel-border rounded px-2 py-0.5 vf-meta text-text-muted outline-none hover:text-text-secondary transition-colors max-w-[200px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";
  const labelClass =
    "vf-meta text-text-muted/40 font-medium uppercase tracking-[0.08em]";

  return (
    <div className="flex flex-col gap-2.5" data-testid="chat-privacy-controls">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1 gap-2">
            <label htmlFor="chat-privacy-e2ee" className={labelClass}>
              {t("privacy.e2eeLabel", { defaultValue: "End-to-end encryption" })}
            </label>
            <select
              id="chat-privacy-e2ee"
              data-testid="chat-privacy-e2ee"
              className={selectClass}
              value={activeConv ? (privacy?.e2eeOverride ?? "provider-default") : e2eeOverride}
              disabled={!e2eeSupported}
              title={
                e2eeSupported
                  ? undefined
                  : t("privacy.e2eeUnavailable", {
                      defaultValue:
                        "The selected model doesn't advertise E2EE support.",
                    })
              }
              onChange={(e) => writeE2ee(e.target.value as E2eeOverride)}
            >
              {E2EE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`privacy.e2eeOptions.${option}`, {
                    defaultValue:
                      option === "provider-default"
                        ? "Provider default"
                        : option === "on"
                          ? "On"
                          : "Off",
                  })}
                </option>
              ))}
            </select>
          </div>
          <p className="vf-meta text-text-muted/50">
            {t("privacy.e2eeEffective", {
              value: t(`privacy.e2eeOptions.${effectiveE2ee}`, {
                defaultValue:
                  effectiveE2ee === "provider-default"
                    ? "Provider default"
                    : effectiveE2ee === "on"
                      ? "On"
                      : "Off",
              }),
              defaultValue: "Effective for this chat: {{value}}",
            })}
            {privacy?.e2eeOverride !== undefined && (
              <span className="ml-2">{t("privacy.conversationOverride")}</span>
            )}
          </p>
          {!e2eeSupported && (
            <p className="vf-meta text-warning mt-0.5" role="status">
              {t("privacy.e2eeUnavailable", {
                defaultValue:
                  "The selected model doesn't advertise E2EE support.",
              })}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1 gap-2">
            <label htmlFor="chat-privacy-retention" className={labelClass}>
              {t("privacy.retentionLabel", {
                defaultValue: "Prompt cache retention",
              })}
            </label>
            <select
              id="chat-privacy-retention"
              data-testid="chat-privacy-retention"
              className={selectClass}
              value={
                activeConv
                  ? (privacy?.promptCacheRetention ?? "default")
                  : promptCacheRetention
              }
              onChange={(e) =>
                writeRetention(e.target.value as PromptCacheRetention)
              }
            >
              {RETENTION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`privacy.retentionOptions.${option}`, {
                    defaultValue:
                      option === "default"
                        ? "Default"
                        : option === "extended"
                          ? "Extended"
                          : "24h",
                  })}
                </option>
              ))}
            </select>
          </div>
          <p className="vf-meta text-text-muted/50">
            {t("privacy.retentionHint", {
              defaultValue:
                "Venice-only cache hint. Fallback providers ignore it.",
            })}
          </p>
        </div>
      </div>

      {fallbackActive && (
        <p className="vf-meta text-text-muted/60" role="status">
          {t("privacy.fallbackNotice", {
            defaultValue:
              "Fallback providers are enabled. They cannot preserve E2EE — a chat routed to a fallback provider is sent without E2EE.",
          })}
        </p>
      )}
    </div>
  );
}
