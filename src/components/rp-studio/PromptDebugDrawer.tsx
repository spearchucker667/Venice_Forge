/**
 * @fileoverview Prompt Debug Drawer — show the prompt builder trace.
 *
 * Lists every block the builder considered with its `included` flag and the
 * reason it was excluded (if any). Lets users see exactly which lorebook
 * entries and memories were injected.
 */

import { useMemo, useRef, useState } from "react";
import type {
  PromptAssemblyResult,
  PromptAssemblyTraceEntry,
} from "../../types/rp";
import { cn } from "../../lib/utils";
import { GhostButton, PillGroup, TextArea } from "../ui/shared";
import { truncate } from "./_shared";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Trans, useTranslation } from "react-i18next";

const KIND_TONE: Record<PromptAssemblyTraceEntry["kind"], string> = {
  "safety-preamble": "border-emerald-400/30 text-emerald-300",
  "model-identity": "border-sky-400/30 text-sky-300",
  persona: "border-teal-400/30 text-[var(--color-accent)]",
  character: "border-violet-400/30 text-violet-300",
  scenario: "border-amber-400/30 text-amber-300",
  "lorebook-entry": "border-pink-400/30 text-pink-300",
  memory: "border-rose-400/30 text-rose-300",
  "recent-message": "border-vf-panel-border text-text-secondary",
  "post-history-instruction": "border-orange-400/30 text-orange-300",
  "active-turn-instruction": "border-emerald-400/30 text-emerald-300",
  "user-message": "border-vf-panel-border text-text-primary",
};

interface Props {
  assembly: PromptAssemblyResult;
  onClose: () => void;
}

export function PromptDebugDrawer({ assembly, onClose }: Props) {
  const { t: tRuntime } = useTranslation("common");
  const [view, setView] = useState<"trace" | "system" | "recent" | "user">(
    "trace",
  );
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const totalIncludedChars = useMemo(
    () =>
      assembly.trace
        .filter((t) => t.included)
        .reduce((acc, t) => acc + t.chars, 0),
    [assembly],
  );

  useFocusTrap(dialogRef, true, onClose);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={tRuntime(
        "runtimeGenerated.components.rpStudio.promptdebugdrawer.attribute.promptDebugDrawer",
      )}
      className="absolute inset-0 z-30 flex bg-bg/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ml-auto h-full w-full max-w-xl bg-vf-panel-bg border-x border-vf-panel-border flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-y border-vf-panel-border bg-vf-shell-bg bg-vf-panel-bg">
          <h2 className="text-[14px] font-semibold text-text-primary">
            <Trans i18nKey="common:surface.componentsRpStudioPromptdebugdrawer.heading.promptTrace" />
          </h2>
          <span className="text-[12px] text-text-muted">
            {totalIncludedChars.toLocaleString()}{" "}
            <Trans i18nKey="common:surface.componentsRpStudioPromptdebugdrawer.text.chars" />{" "}
            {assembly.budgetExceeded
              ? tRuntime(
                  "runtimeGenerated.components.rpStudio.promptdebugdrawer.text.budgetExceeded",
                )
              : tRuntime(
                  "runtimeGenerated.components.rpStudio.promptdebugdrawer.text.withinBudget",
                )}
          </span>
          <div className="ml-auto">
            <GhostButton onClick={onClose}>
              <Trans i18nKey="common:surface.componentsRpStudioPromptdebugdrawer.text.close" />
            </GhostButton>
          </div>
        </div>
        <div className="px-4 py-2 border-y border-vf-panel-border bg-vf-panel-bg">
          <PillGroup
            options={[
              {
                value: "trace",
                label: tRuntime(
                  "runtimeGenerated.components.rpStudio.promptdebugdrawer.metadata.trace",
                ),
              },
              {
                value: "system",
                label: tRuntime(
                  "runtimeGenerated.components.rpStudio.promptdebugdrawer.metadata.system",
                ),
              },
              {
                value: "recent",
                label: tRuntime(
                  "runtimeGenerated.components.rpStudio.promptdebugdrawer.metadata.recent",
                ),
              },
              {
                value: "user",
                label: tRuntime(
                  "runtimeGenerated.components.rpStudio.promptdebugdrawer.metadata.user",
                ),
              },
            ]}
            value={view}
            onChange={(v) =>
              setView(v as "trace" | "system" | "recent" | "user")
            }
            ariaLabel="View"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {view === "trace" && (
            <ul className="space-y-1.5">
              {assembly.trace.map((entry) => (
                <li
                  key={entry.id}
                  className={cn(
                    "flex items-start gap-2 text-[12px] border rounded-md px-2.5 py-1.5",
                    KIND_TONE[entry.kind] ??
                      "border-vf-panel-border text-text-secondary",
                    !entry.included && "opacity-50",
                  )}
                >
                  <span className="font-mono text-[12px] shrink-0 mt-0.5">
                    {entry.kind}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{entry.label}</div>
                    {entry.reason && (
                      <div className="text-[12px] text-text-muted mt-0.5">
                        <Trans i18nKey="common:surface.componentsRpStudioPromptdebugdrawer.text.excluded" />{" "}
                        {entry.reason}
                      </div>
                    )}
                  </div>
                  <span className="text-[12px] text-text-muted shrink-0">
                    {entry.chars}ch
                  </span>
                </li>
              ))}
            </ul>
          )}
          {view === "system" && (
            <div className="space-y-3">
              {assembly.systemMessages.map((m, i) => (
                <TextArea
                  key={i}
                  value={m.content}
                  onChange={() => {
                    /* read-only */
                  }}
                  rows={6}
                  ariaLabel={`System block ${i + 1}`}
                />
              ))}
            </div>
          )}
          {view === "recent" && (
            <div className="space-y-2">
              {assembly.recentMessages.length === 0 ? (
                <div className="text-[12px] text-text-muted italic">
                  <Trans i18nKey="common:surface.componentsRpStudioPromptdebugdrawer.text.noRecentMessages" />
                </div>
              ) : (
                assembly.recentMessages.map((m, i) => (
                  <div
                    key={i}
                    className="bg-vf-panel-bg-raised border border-vf-panel-border rounded-md p-2"
                  >
                    <div className="text-[12px] uppercase tracking-wider text-text-muted">
                      {m.role}
                      {m.name
                        ? tRuntime(
                            "runtimeGenerated.components.rpStudio.promptdebugdrawer.text.value1",
                            { value1: m.name },
                          )
                        : ""}
                    </div>
                    <div className="text-[12.5px] text-text-primary mt-1 whitespace-pre-wrap">
                      {truncate(m.content, 600)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {view === "user" && (
            <TextArea
              value={assembly.userMessage.content}
              onChange={() => {
                /* read-only */
              }}
              rows={6}
              ariaLabel="User message"
            />
          )}
        </div>
      </div>
    </div>
  );
}
