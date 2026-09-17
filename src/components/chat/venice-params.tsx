import { useState, useEffect } from "react";
import { useShallow } from "zustand/shallow";
import { useChatStore } from "../../stores/chat-store";
import { usePromptLibraryStore } from "../../stores/prompt-library-store";
import { useSettingsStore } from "../../stores/settings-store";
import { uiSoundController } from "../../services/uiSoundController";
import { cn } from "../../lib/utils";
import {
  checkSystemPromptLimit,
  SYSTEM_PROMPT_LIMITS,
} from "../../shared/promptLimits";
import { Trans, useTranslation } from "react-i18next";
import { supportsFunctionCalling } from "../../shared/modelCapabilities";
import { getModelById } from "../../services/modelService";
import { PrivacyControls } from "./privacy-controls";
import { ReasoningEffortControl } from "./reasoning-effort-control";

export function VeniceParams() {
  const { t } = useTranslation("chat");
  const allPrompts = usePromptLibraryStore((s) => s.prompts);
  const hydrated = usePromptLibraryStore((s) => s.hydrated);
  const loading = usePromptLibraryStore((s) => s.loading);
  const loadError = usePromptLibraryStore((s) => s.loadError);
  const ensureLoaded = usePromptLibraryStore((s) => s.ensureLoaded);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const customPrompts = allPrompts.filter(
    (p) =>
      !p.archivedAt &&
      (p.kind === "system" || p.kind === "chat" || p.kind === "general"),
  );
  const {
    veniceParams,
    setVeniceParams,
    systemPrompt,
    setSystemPrompt,
    temperature,
    setTemperature,
    topP,
    setTopP,
    maxTokens,
    setMaxTokens,
    activeConversationId,
    setActiveConversation,
    conversations,
  } = useChatStore(
    useShallow((s) => ({
      veniceParams: s.veniceParams,
      setVeniceParams: s.setVeniceParams,
      systemPrompt: s.systemPrompt,
      setSystemPrompt: s.setSystemPrompt,
      temperature: s.temperature,
      setTemperature: s.setTemperature,
      topP: s.topP,
      setTopP: s.setTopP,
      maxTokens: s.maxTokens,
      setMaxTokens: s.setMaxTokens,
      activeConversationId: s.activeConversationId,
      setActiveConversation: s.setActiveConversation,
      conversations: s.conversations,
    })),
  );
  const [showSettings, setShowSettings] = useState(false);

  const activeConv = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : null;
  const hasMessages = (activeConv?.messages?.length ?? 0) > 0;

  // P1-005 truthful state: the canonical request builder only sends tools
  // for models that explicitly advertise `supportsFunctionCalling`. Mirror
  // the same runtime metadata here so the Document Tools pill is disabled
  // (not silently ignored) when the active model cannot call tools.
  const chatModel = activeConv?.metadata?.character && activeConv.model
    ? activeConv.model
    : useSettingsStore.getState().selectedModels.chat;
  const toolsSupported = supportsFunctionCalling(getModelById(chatModel ?? ""));

  const systemPromptLimitResult = checkSystemPromptLimit(systemPrompt);

  return (
    <div className="px-4 py-1.5">
      <div className="flex items-center gap-1">
        <SearchPill
          value={veniceParams.enable_web_search || "off"}
          onChange={(v) => setVeniceParams({ enable_web_search: v })}
        />
        <Pill
          label={t("controls.citations")}
          active={veniceParams.enable_web_citations === true}
          onClick={() =>
            setVeniceParams({
              enable_web_citations: !veniceParams.enable_web_citations,
            })
          }
        />
        <Pill
          label={t("controls.scrape")}
          active={veniceParams.enable_web_scraping === true}
          onClick={() =>
            setVeniceParams({
              enable_web_scraping: !veniceParams.enable_web_scraping,
            })
          }
        />
        <Pill
          label={t("controls.xSearch")}
          active={veniceParams.enable_x_search === true}
          onClick={() =>
            setVeniceParams({ enable_x_search: !veniceParams.enable_x_search })
          }
        />
        <Pill
          label={t("controls.searchInStream")}
          active={veniceParams.include_search_results_in_stream === true}
          onClick={() =>
            setVeniceParams({
              include_search_results_in_stream:
                !veniceParams.include_search_results_in_stream,
            })
          }
        />
        <Pill
          label={t("controls.documentTools")}
          active={veniceParams.enable_document_tools === true}
          disabled={!toolsSupported}
          title={toolsSupported ? undefined : t("controls.documentToolsUnavailableTitle")}
          onClick={() =>
            setVeniceParams({
              enable_document_tools: !veniceParams.enable_document_tools,
            })
          }
        />
        <div className="ml-auto flex items-center gap-2">
          {activeConversationId !== null && hasMessages && (
            <button
              onClick={() => setActiveConversation(null)}
              className="flex items-center gap-1 vf-meta font-medium px-2.5 py-[2px] rounded-full bg-vf-panel-bg-raised/40 text-text-muted/60 hover:text-text-secondary hover:bg-vf-panel-bg-raised/50 transition-colors duration-100 cursor-pointer"
              title={t("controls.newChatShortcut")}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <Trans i18nKey="common:surface.componentsChatVeniceParams.action.newChat" />
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "flex items-center gap-1 vf-meta font-medium px-2 py-[2px] rounded-full transition-colors duration-100",
              showSettings
                ? "bg-text-primary text-bg"
                : "bg-vf-panel-bg-raised/40 text-text-muted/40 hover:text-text-muted/60 hover:bg-vf-panel-bg-raised/50 cursor-pointer",
            )}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <Trans i18nKey="common:surface.componentsChatVeniceParams.action.settings" />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="mt-2.5 pb-1 flex flex-col gap-2.5">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="venice-params-1" className="vf-meta text-text-muted/40 font-medium block uppercase tracking-[0.08em]">
                <Trans i18nKey="common:surface.componentsChatVeniceParams.label.appSystemPrompt" />
              </label>
              {!hydrated || loading ? (
                <select
                  disabled id="venice-params-1" 
                  className="bg-vf-panel-bg-raised border border-vf-panel-border rounded px-2 py-0.5 vf-meta text-text-muted outline-none max-w-[200px] cursor-not-allowed"
                >
                  <option>
                    <Trans i18nKey="common:surface.componentsChatVeniceParams.option.loadingLibrary" />
                  </option>
                </select>
              ) : loadError ? (
                <select
                  disabled
                  className="bg-vf-panel-bg-raised border border-vf-panel-border rounded px-2 py-0.5 vf-meta text-danger outline-none max-w-[200px] cursor-not-allowed"
                >
                  <option>
                    <Trans i18nKey="common:surface.componentsChatVeniceParams.option.errorLoadingLibrary" />
                  </option>
                </select>
              ) : (
                customPrompts.length > 0 && (
                  <select
                    className="bg-vf-panel-bg-raised border border-vf-panel-border rounded px-2 py-0.5 vf-meta text-text-muted outline-none hover:text-text-secondary transition-colors max-w-[200px] cursor-pointer"
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) {
                        const store = usePromptLibraryStore.getState();
                        const version = store.getCurrentVersion(id);
                        if (version && version.content) {
                          setSystemPrompt(version.content);
                        }
                      }
                      // Reset selection immediately to allow re-selection
                      e.target.value = "";
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      <Trans i18nKey="common:surface.componentsChatVeniceParams.option.loadFromLibrary" />
                    </option>
                    {customPrompts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                )
              )}
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t("controls.systemPromptPlaceholder")}
              rows={2}
              className="w-full bg-vf-panel-bg-inset border border-vf-panel-border rounded-lg px-3 py-2 vf-body text-text-secondary outline-none resize-none placeholder:text-text-muted/30 focus:border-vf-panel-border-strong transition-colors"
            />
            {systemPromptLimitResult.isWarning && (
              <div className="vf-meta text-warning mt-1">
                {t("common:surface.componentsChatVeniceParams.text.approachingSystemPromptSizeLimit", {
                  estimatedTokenCount: systemPromptLimitResult.estimatedTokenCount.toLocaleString(),
                  maximumTokens: SYSTEM_PROMPT_LIMITS.maxTokens.toLocaleString(),
                  codePointCount: systemPromptLimitResult.codePointCount.toLocaleString(),
                  maximumCodePoints: SYSTEM_PROMPT_LIMITS.maxCodePoints.toLocaleString(),
                })}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <ParamSlider
              label={t("controls.temperature")}
              value={temperature}
              onChange={setTemperature}
              min={0}
              max={2}
              step={0.1}
            />
            <ParamSlider
              label={t("controls.topP")}
              value={topP}
              onChange={setTopP}
              min={0}
              max={1}
              step={0.05}
            />
            <ParamSlider
              label={t("controls.maxTokens")}
              value={maxTokens}
              onChange={setMaxTokens}
              min={256}
              max={32768}
              step={256}
              format={(v) =>
                v >= 1000
                  ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
                  : String(v)
              }
            />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Toggle
              label={t("controls.veniceDefaultPrompt")}
              active={veniceParams.include_venice_system_prompt !== false}
              onChange={(v) =>
                setVeniceParams({ include_venice_system_prompt: v })
              }
            />
            <Toggle
              label={t("controls.disableThinking")}
              active={veniceParams.disable_thinking === true}
              onChange={(v) => setVeniceParams({ disable_thinking: v })}
            />
            <Toggle
              label={t("controls.stripThinking")}
              active={veniceParams.strip_thinking_response === true}
              onChange={(v) => setVeniceParams({ strip_thinking_response: v })}
            />
          </div>

          {/* FEAT-003 / FEAT-004 — per-conversation E2EE override and
              prompt-cache retention. Conversation override wins over the
              profile default; the canonical wire fields are emitted by the
              chat-stream-manager payload builder. */}
          <PrivacyControls />

          {/* Phase 4C.2 — model-aware reasoning-effort selector. The offered
              options come from the selected model's advertised
              `reasoningEffortOptions`; the canonical wire field is emitted
              (validated) by the chat-stream-manager payload builder. */}
          <ReasoningEffortControl />
        </div>
      )}
    </div>
  );
}

function ParamSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}) {
  const display = format ? format(value) : String(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <label htmlFor="venice-params-2" className="vf-meta text-text-muted/40 font-medium uppercase tracking-[0.08em]">
          {label}
        </label>
        <span className="vf-meta text-text-muted/50 font-mono">
          {display}
        </span>
      </div>
      <input
        type="range" id="venice-params-2" 
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
  disabled,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-disabled={disabled === true}
      className={cn(
        "transition-colors duration-100",
        active
          ? "bg-accent/15 text-accent border border-accent/40 shadow-[0_0_8px_var(--color-vf-accent-glow-subtle)] rounded-md px-2 py-0.5 vf-meta font-medium"
          : disabled
            ? "bg-vf-panel-bg-inset border border-vf-panel-border/50 text-text-muted/40 cursor-not-allowed rounded-md px-2 py-0.5 vf-meta font-medium"
            : "bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover rounded-md px-2 py-0.5 vf-meta font-medium",
      )}
    >
      {label}
    </button>
  );
}

const SEARCH_MODES = ["off", "on", "auto"] as const;
type SearchMode = (typeof SEARCH_MODES)[number];

function SearchPill({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: SearchMode) => void;
}) {
  const { t } = useTranslation("chat");
  const current = SEARCH_MODES.indexOf(value as SearchMode);
  const next = () =>
    onChange(SEARCH_MODES[(current + 1) % SEARCH_MODES.length]);
  const label = t("controls.searchMode", {
    mode: t(`controls.searchModes.${value as SearchMode}`),
  });
  const active = value !== "off";

  return (
    <button
      onClick={next}
      className={cn(
        "transition-colors duration-100",
        active
          ? "bg-accent/15 text-accent border border-accent/40 shadow-[0_0_8px_var(--color-vf-accent-glow-subtle)] rounded-md px-2 py-0.5 vf-meta font-medium"
          : "bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover rounded-md px-2 py-0.5 vf-meta font-medium",
      )}
    >
      {label}
    </button>
  );
}

function Toggle({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => {
        uiSoundController.play(!active ? "toggleOn" : "toggleOff");
        onChange(!active);
      }}
      className="flex items-center gap-2 vf-meta text-text-muted/60 hover:text-text-secondary transition-colors"
    >
      <div
        className={cn(
          "w-6 h-3.5 rounded-full transition-colors duration-150 relative",
          active ? "bg-text-primary" : "bg-border",
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all duration-150",
            active ? "left-3 bg-bg" : "left-0.5 bg-text-muted/40",
          )}
        />
      </div>
      {label}
    </button>
  );
}
