import { useEffect, useMemo, useRef, useState } from "react";
import { useAgentModels, type AgentModel } from "../../hooks/use-agent-models";
import { cn } from "../../lib/utils";
import { Trans, useTranslation } from "react-i18next";

interface Props {
  value: string;
  onChange: (modelId: string) => void;
}

export function AgentModelPicker({ value, onChange }: Props) {
  const { t: tRuntime } = useTranslation("common");
  const { models, isLoading } = useAgentModels();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const base = showAll ? models : models.filter((m) => m.tier <= 2);
    if (!search) return base;
    const q = search.toLowerCase();
    return base.filter(
      (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    );
  }, [models, search, showAll]);

  const grouped = useMemo(() => {
    const tiers: Array<{ label: string; items: AgentModel[] }> = [
      {
        label: tRuntime(
          "runtimeGenerated.components.playground.agentModelPicker.metadata.recommendedForAgents",
        ),
        items: [],
      },
      {
        label: tRuntime(
          "runtimeGenerated.components.playground.agentModelPicker.metadata.capable",
        ),
        items: [],
      },
      {
        label: tRuntime(
          "runtimeGenerated.components.playground.agentModelPicker.metadata.other",
        ),
        items: [],
      },
    ];
    for (const m of filtered) {
      if (m.tier === 0) tiers[0].items.push(m);
      else if (m.tier === 1 || m.tier === 2) tiers[1].items.push(m);
      else tiers[2].items.push(m);
    }
    return tiers.filter((g) => g.items.length > 0);
  }, [filtered, tRuntime]);

  const current = models.find((m) => m.id === value);
  const label = isLoading
    ? "Loading…"
    : current?.name || value || "Pick agent model";

  return (
    <div ref={ref} className="relative w-56 shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between gap-2 bg-surface-elevated border border-border rounded-md px-2.5 py-1.5 text-[13px] hover:border-accent transition-colors text-left",
          open && "border-border",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="truncate text-text-secondary">{label}</span>
          {current?.recommended && (
            <span className="shrink-0 text-[12px] px-1 py-px rounded bg-success/15 text-success font-medium uppercase tracking-wider">
              <Trans i18nKey="common:surface.playgroundAgentModelPicker.text.rec" />
            </span>
          )}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className={cn(
            "shrink-0 text-text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        >
          <path d="M2.5 3.75L5 6.25L7.5 3.75" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-[340px] z-50 bg-surface-elevated border border-border rounded-lg shadow-2xl shadow-none animate-scale-in overflow-hidden">
          <div className="px-2 py-2 border-b border-border/50 flex items-center gap-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tRuntime(
                "runtimeGenerated.components.playground.agentModelPicker.attribute.searchModels",
              )}
              className="flex-1 bg-surface-elevated border border-border rounded px-2 py-1 text-[13px] text-text-secondary outline-none focus:border-accent placeholder:text-text-muted"
            />
            <button
              onClick={() => setShowAll(!showAll)}
              className={cn(
                "text-[12px] px-1.5 py-1 rounded border transition-colors",
                showAll
                  ? "bg-surface-elevated border-border text-text-secondary"
                  : "border-border text-text-muted hover:text-text-secondary",
              )}
              title={
                showAll
                  ? tRuntime(
                      "runtimeGenerated.components.playground.agentModelPicker.attribute.showingAllModels",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.playground.agentModelPicker.attribute.showingOnlySchemaCapableModels",
                    )
              }
            >
              {showAll
                ? tRuntime(
                    "runtimeGenerated.components.playground.agentModelPicker.text.all",
                  )
                : tRuntime(
                    "runtimeGenerated.components.playground.agentModelPicker.text.capable",
                  )}
            </button>
          </div>
          <div className="max-h-[380px] overflow-y-auto py-1">
            {grouped.length === 0 && (
              <div className="px-3 py-6 text-center text-[13px] text-text-muted">
                <Trans i18nKey="common:surface.playgroundAgentModelPicker.text.noMatches" />
              </div>
            )}
            {grouped.map((group) => (
              <div key={group.label}>
                <div className="px-3 pt-2 pb-1 text-[12px] uppercase tracking-[0.08em] text-text-muted font-medium">
                  {group.label}
                </div>
                {group.items.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-surface-muted transition-colors",
                      m.id === value && "bg-surface-elevated",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] text-text-secondary font-medium truncate flex-1">
                        {m.name}
                      </span>
                      {m.id === value && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-success shrink-0"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {m.recommended && (
                        <Badge tone="emerald">
                          <Trans i18nKey="common:surface.playgroundAgentModelPicker.text.recommended" />
                        </Badge>
                      )}
                      {m.capabilities.supportsResponseSchema && (
                        <Badge tone="sky">JSON</Badge>
                      )}
                      {m.capabilities.supportsFunctionCalling && (
                        <Badge tone="violet">
                          <Trans i18nKey="common:surface.playgroundAgentModelPicker.text.tools" />
                        </Badge>
                      )}
                      {m.reasoning && (
                        <Badge tone="amber">
                          <Trans i18nKey="common:surface.playgroundAgentModelPicker.text.reasoning" />
                        </Badge>
                      )}
                      {m.capabilities.supportsVision && (
                        <Badge tone="pink">
                          <Trans i18nKey="common:surface.playgroundAgentModelPicker.text.vision" />
                        </Badge>
                      )}
                      {m.capabilities.supportsWebSearch && (
                        <Badge tone="slate">
                          <Trans i18nKey="common:surface.playgroundAgentModelPicker.text.web" />
                        </Badge>
                      )}
                      {m.uncensored && (
                        <Badge tone="rose">
                          <Trans i18nKey="common:surface.playgroundAgentModelPicker.text.uncensored" />
                        </Badge>
                      )}
                    </div>
                    <div className="text-[12px] text-text-muted mt-1 font-mono truncate">
                      {m.id}
                      {m.contextTokens
                        ? tRuntime(
                            "runtimeGenerated.components.playground.agentModelPicker.text.value1Ctx",
                            { value1: formatCtx(m.contextTokens) },
                          )
                        : ""}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  emerald: "bg-success/15 text-success",
  success: "bg-success/15 text-success",
  sky: "bg-accent/15 text-accent",
  accent: "bg-accent/15 text-accent",
  violet: "bg-accent/15 text-accent",
  amber: "bg-warning/15 text-warning",
  warning: "bg-warning/15 text-warning",
  pink: "bg-danger/15 text-danger",
  slate: "bg-surface-elevated text-text-secondary",
  neutral: "bg-surface-elevated text-text-secondary",
  rose: "bg-danger/15 text-danger",
  danger: "bg-danger/15 text-danger",
};

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE | string;
}) {
  return (
    <span
      className={cn(
        "text-[12px] px-1.5 py-px rounded font-medium uppercase tracking-wider",
        TONE[tone] ?? TONE.slate,
      )}
    >
      {children}
    </span>
  );
}

function formatCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}
