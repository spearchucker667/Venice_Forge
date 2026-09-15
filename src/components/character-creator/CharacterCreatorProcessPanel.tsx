/**
 * @fileoverview Visible AI Design Process Panel for Character Creator.
 * Displays real event-driven creation progress, decisions, validation, and summaries.
 * Does NOT expose private chain-of-thought or raw internal reasoning tokens.
 */

import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";
import type {
  CharacterCreatorProcessEvent,
  CharacterCreatorProcessSummary,
} from "../../types/character-creator";
import { toast } from "../../stores/toast-store";
import { Trans, useTranslation } from "react-i18next";
import { copyText } from "../../utils/download";

interface Props {
  events: CharacterCreatorProcessEvent[];
  processSummary?: CharacterCreatorProcessSummary;
  designSummary?: string;
  isGenerating?: boolean;
  onCancel?: () => void;
  className?: string;
}

export function CharacterCreatorProcessPanel({
  events,
  processSummary,
  designSummary,
  isGenerating = false,
  onCancel,
  className = "",
}: Props) {
  const { t: tRuntime } = useTranslation("common");
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(
    new Set(),
  );
  const [copied, setCopied] = useState(false);

  const toggleEventExpanded = (id: string) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopyProcessSummary = async () => {
    const lines: string[] = [
      "# Character Creator — AI Design Process Summary",
      "",
    ];

    if (designSummary) {
      lines.push(`## Design Overview`, designSummary, "");
    }

    if (processSummary) {
      if (processSummary.concept_interpretation) {
        lines.push(
          `## Concept Interpretation`,
          processSummary.concept_interpretation,
          "",
        );
      }
      if (processSummary.design_direction) {
        lines.push(`## Design Direction`, processSummary.design_direction, "");
      }
      if (processSummary.originality_strategy?.length) {
        lines.push(`## Originality Strategy`);
        processSummary.originality_strategy.forEach((item) =>
          lines.push(`- ${item}`),
        );
        lines.push("");
      }
      if (processSummary.major_decisions?.length) {
        lines.push(`## Major Design Decisions`);
        processSummary.major_decisions.forEach((d) => {
          lines.push(`- **${d.area.toUpperCase()}**: ${d.summary}`);
        });
        lines.push("");
      }
    }

    if (events.length > 0) {
      lines.push(`## Creation Event Log`);
      events.forEach((ev) => {
        lines.push(`- [${ev.status.toUpperCase()}] ${ev.title}: ${ev.summary}`);
      });
    }

    const textToCopy = lines.join("\n");
    // copyText never rejects and falls back to execCommand when the
    // async Clipboard API is denied. Treat the boolean result as success
    // or failure for the user-visible toast.
    const ok = await copyText(textToCopy);
    if (ok) {
      setCopied(true);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorprocesspanel.notification.designProcessSummaryCopiedToClipboard",
        ),
      );
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorprocesspanel.notification.couldNotCopyToClipboard",
        ),
      );
    }
  };

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;

  return (
    <div
      className={`flex flex-col bg-vf-panel-bg/60 rounded-xl border border-vf-panel-border p-5 shadow-sm ${className}`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-vf-panel-border">
        <div>
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorprocesspanel.text.aiDesignProcess" />
            </span>
            {isGenerating && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorprocesspanel.text.active" />
              </span>
            )}
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorprocesspanel.description.thisLogShowsUserFacingDesignDecisions" />
          </p>
        </div>

        {(processSummary || designSummary || events.length > 0) &&
          !isGenerating && (
            <button
              type="button"
              onClick={handleCopyProcessSummary}
              className="px-3 py-1.5 rounded-md bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium text-text-secondary hover:text-text-primary flex items-center gap-1.5 transition-colors shrink-0"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-success" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>
                {copied
                  ? tRuntime(
                      "runtimeGenerated.components.characterCreator.charactercreatorprocesspanel.text.copied",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.characterCreator.charactercreatorprocesspanel.text.copyLog",
                    )}
              </span>
            </button>
          )}
      </div>

      {/* Accessible Live Region for Active Event */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {latestEvent
          ? tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatorprocesspanel.text.value1Value2",
              { value1: latestEvent.title, value2: latestEvent.summary },
            )
          : ""}
      </div>

      {/* Authoring Design Decisions Summary (if available) */}
      {processSummary && (
        <div className="my-4 p-3.5 rounded-lg bg-accent/5 border border-accent/20 flex flex-col gap-2">
          <div className="text-xs font-semibold text-accent uppercase tracking-wider">
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorprocesspanel.text.designDirectionSummary" />
          </div>
          {processSummary.concept_interpretation && (
            <p className="text-xs text-text-secondary leading-relaxed">
              <strong className="text-text-primary">
                <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorprocesspanel.text.interpretation" />
              </strong>{" "}
              {processSummary.concept_interpretation}
            </p>
          )}
          {processSummary.major_decisions &&
            processSummary.major_decisions.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 pt-2 border-t border-accent/10">
                {processSummary.major_decisions.map((d) => (
                  <div
                    key={d.area}
                    className="text-[11px] bg-vf-panel-bg/50 p-2 rounded-md border border-vf-panel-border"
                  >
                    <span className="font-bold text-accent capitalize">
                      {d.area}:
                    </span>{" "}
                    <span className="text-text-secondary">{d.summary}</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* Event Stream */}
      <div className="flex flex-col gap-2 mt-3 max-h-[320px] overflow-y-auto pr-1">
        {events.length === 0 ? (
          <div className="text-xs text-text-muted italic py-4 text-center">
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorprocesspanel.text.initializingAiProcessPipeline" />
          </div>
        ) : (
          events.map((ev) => {
            const isExpanded = expandedEventIds.has(ev.id);
            const hasDetails = Boolean(ev.details && ev.details.length > 0);

            let IconComponent = Loader2;
            let iconClass = "text-accent animate-spin";

            if (ev.status === "complete") {
              IconComponent = CheckCircle2;
              iconClass = "text-success";
            } else if (ev.status === "warning") {
              IconComponent = AlertTriangle;
              iconClass = "text-warning";
            } else if (ev.status === "failed") {
              IconComponent = XCircle;
              iconClass = "text-danger";
            }

            return (
              <div
                key={ev.id}
                className={`p-3 rounded-lg border transition-colors ${
                  ev.status === "active"
                    ? "bg-accent/5 border-accent/30"
                    : ev.status === "warning"
                      ? "bg-warning/5 border-warning/30"
                      : ev.status === "failed"
                        ? "bg-danger/5 border-danger/30"
                        : "bg-vf-panel-bg/40 border-vf-panel-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <IconComponent
                      className={`w-4 h-4 shrink-0 mt-0.5 ${iconClass}`}
                    />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-semibold text-text-primary truncate">
                        {ev.title}
                      </span>
                      <p className="text-[11px] text-text-secondary leading-normal">
                        {ev.summary}
                      </p>
                    </div>
                  </div>

                  {hasDetails && (
                    <button
                      type="button"
                      onClick={() => toggleEventExpanded(ev.id)}
                      className="p-1 rounded text-text-muted hover:text-text-primary shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {isExpanded && ev.details && (
                  <div className="mt-2 pt-2 border-t border-vf-panel-border pl-6 flex flex-col gap-1">
                    {ev.details.map((detail, idx) => (
                      <div
                        key={`${idx}-${detail.slice(0, 20)}`}
                        className="text-[11px] text-text-muted font-mono bg-vf-panel-bg/60 p-1.5 rounded"
                      >
                        {detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Cancel Action during generation */}
      {isGenerating && onCancel && (
        <div className="mt-4 pt-3 border-t border-vf-panel-border flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-md bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium text-danger hover:opacity-80 flex items-center gap-1.5 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorprocesspanel.text.cancelGeneration" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
