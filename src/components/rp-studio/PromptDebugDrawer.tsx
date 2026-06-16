/**
 * @fileoverview Prompt Debug Drawer — show the prompt builder trace.
 *
 * Lists every block the builder considered with its `included` flag and the
 * reason it was excluded (if any). Lets users see exactly which lorebook
 * entries and memories were injected.
 */

import { useMemo, useRef, useState } from "react";
import type { PromptAssemblyResult, PromptAssemblyTraceEntry } from "../../types/rp";
import { cn } from "../../lib/utils";
import { GhostButton, PillGroup, TextArea } from "../ui/shared";
import { truncate } from "./_shared";
import { useFocusTrap } from "../../hooks/useFocusTrap";

const KIND_TONE: Record<PromptAssemblyTraceEntry["kind"], string> = {
  "safety-preamble": "border-emerald-400/30 text-emerald-300",
  "model-identity": "border-sky-400/30 text-sky-300",
  "persona": "border-teal-400/30 text-[var(--color-accent)]",
  "character": "border-violet-400/30 text-violet-300",
  "scenario": "border-amber-400/30 text-amber-300",
  "lorebook-entry": "border-pink-400/30 text-pink-300",
  "memory": "border-rose-400/30 text-rose-300",
  "recent-message": "border-border text-text-secondary",
  "active-turn-instruction": "border-emerald-400/30 text-emerald-300",
  "user-message": "border-border text-text-primary",
};

interface Props {
  assembly: PromptAssemblyResult;
  onClose: () => void;
}

export function PromptDebugDrawer({ assembly, onClose }: Props) {
  const [view, setView] = useState<"trace" | "system" | "recent" | "user">("trace");
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const totalIncludedChars = useMemo(
    () => assembly.trace.filter((t) => t.included).reduce((acc, t) => acc + t.chars, 0),
    [assembly],
  );

  useFocusTrap(dialogRef, true, onClose);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Prompt debug drawer"
      className="absolute inset-0 z-30 flex bg-bg/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ml-auto h-full w-full max-w-xl mesh-surface soft-separator-x flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 soft-separator-y mesh-header mesh-surface">
          <h2 className="text-[14px] font-semibold text-text-primary">Prompt trace</h2>
          <span className="text-[11px] text-text-muted">
            {totalIncludedChars.toLocaleString()} chars · {assembly.budgetExceeded ? "budget exceeded" : "within budget"}
          </span>
          <div className="ml-auto">
            <GhostButton onClick={onClose}>Close</GhostButton>
          </div>
        </div>
        <div className="px-4 py-2 soft-separator-y mesh-surface">
          <PillGroup
            options={[
              { value: "trace", label: "Trace" },
              { value: "system", label: "System" },
              { value: "recent", label: "Recent" },
              { value: "user", label: "User" },
            ]}
            value={view}
            onChange={(v) => setView(v as "trace" | "system" | "recent" | "user")}
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
                    KIND_TONE[entry.kind] ?? "border-border text-text-secondary",
                    !entry.included && "opacity-50",
                  )}
                >
                  <span className="font-mono text-[10.5px] shrink-0 mt-0.5">{entry.kind}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{entry.label}</div>
                    {entry.reason && (
                      <div className="text-[10.5px] text-text-muted mt-0.5">excluded: {entry.reason}</div>
                    )}
                  </div>
                  <span className="text-[10.5px] text-text-muted shrink-0">{entry.chars}ch</span>
                </li>
              ))}
            </ul>
          )}
          {view === "system" && (
            <div className="space-y-3">
              {assembly.systemMessages.map((m, i) => (
                <TextArea key={i} value={m.content} onChange={() => { /* read-only */ }} rows={6} ariaLabel={`System block ${i + 1}`} />
              ))}
            </div>
          )}
          {view === "recent" && (
            <div className="space-y-2">
              {assembly.recentMessages.length === 0 ? (
                <div className="text-[12px] text-text-muted italic">No recent messages.</div>
              ) : (
                assembly.recentMessages.map((m, i) => (
                  <div key={i} className="bg-surface-elevated border border-border rounded-md p-2">
                    <div className="text-[10.5px] uppercase tracking-wider text-text-muted">{m.role}{m.name ? ` · ${m.name}` : ""}</div>
                    <div className="text-[12.5px] text-text-primary mt-1 whitespace-pre-wrap">{truncate(m.content, 600)}</div>
                  </div>
                ))
              )}
            </div>
          )}
          {view === "user" && (
            <TextArea value={assembly.userMessage.content} onChange={() => { /* read-only */ }} rows={6} ariaLabel="User message" />
          )}
        </div>
      </div>
    </div>
  );
}
