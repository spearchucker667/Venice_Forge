import React, { useEffect, useRef } from "react";
import type { Theme } from "../theme/themeTypes";
import { contrastRatio } from "../theme/contrast";

export function ThemePreview({ theme }: { theme: Theme }) {
  const t = theme.tokens;
  const containerRef = useRef<HTMLDivElement>(null);
  const warnings: string[] = [];
  const ratios = [
    { name: "Primary text / Background", fg: t.textPrimary, bg: t.background },
    { name: "Secondary text / Surface", fg: t.textSecondary, bg: t.surface },
    { name: "Accent foreground / Accent", fg: t.accentForeground, bg: t.accent },
  ];
  ratios.forEach((r) => {
    const ratio = contrastRatio(r.fg, r.bg);
    if (ratio < 4.5) {
      warnings.push(`${r.name}: ${ratio.toFixed(2)}:1 (AA: 4.5:1)`);
    }
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.setProperty("--preview-bg", t.background);
    el.style.setProperty("--preview-border", t.border);
    el.style.setProperty("--preview-surface", t.surface);
    el.style.setProperty("--preview-text-primary", t.textPrimary);
    el.style.setProperty("--preview-text-muted", t.textMuted);
    el.style.setProperty("--preview-accent", t.accent);
    el.style.setProperty("--preview-accent-fg", t.accentForeground);
    el.style.setProperty("--preview-text-secondary", t.textSecondary);
    el.style.setProperty("--preview-surface-elevated", t.surfaceElevated);
    el.style.setProperty("--preview-danger", t.danger);
    el.style.setProperty("--preview-danger-bg", `${t.danger}20`);
    el.style.setProperty("--preview-danger-border", `${t.danger}40`);
  }, [t]);

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="rounded-xl border p-4 space-y-3 bg-[var(--preview-bg)] border-[var(--preview-border)]"
      >
        {/* Header mock */}
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2 bg-[var(--preview-surface)] border border-[var(--preview-border)]"
        >
          <span className="text-[var(--preview-text-primary)] font-semibold">Forge</span>
          <span className="text-[var(--preview-text-muted)] text-[12px]">Status</span>
        </div>
        {/* Sidebar + Content mock */}
        <div className="flex gap-2">
          <div
            className="w-1/3 rounded-lg p-2 space-y-1 bg-[var(--preview-surface)] border border-[var(--preview-border)]"
          >
            <div className="rounded px-2 py-1 text-xs bg-[var(--preview-accent)] text-[var(--preview-accent-fg)]">
              Active
            </div>
            <div className="rounded px-2 py-1 text-xs text-[var(--preview-text-secondary)]">
              Inactive
            </div>
          </div>
          <div
            className="flex-1 rounded-lg p-2 space-y-2 bg-[var(--preview-surface-elevated)] border border-[var(--preview-border)]"
          >
            <div className="h-2 rounded w-3/4 bg-[var(--preview-text-muted)]" />
            <div className="h-2 rounded w-1/2 bg-[var(--preview-text-muted)]" />
            <div
              className="mt-2 inline-block rounded px-3 py-1 text-xs font-medium bg-[var(--preview-accent)] text-[var(--preview-accent-fg)]"
            >
              Button
            </div>
          </div>
        </div>
        {/* Input mock */}
        <div
          className="rounded-lg px-3 py-2 text-sm bg-[var(--preview-surface)] border border-[var(--preview-border)] text-[var(--preview-text-primary)]"
        >
          Input text…
        </div>
        {/* Alert mock */}
        <div
          className="rounded-lg px-3 py-2 text-xs bg-[var(--preview-danger-bg)] border border-[var(--preview-danger-border)] text-[var(--preview-danger)]"
        >
          Alert message
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning" aria-live="polite">
          <strong>Contrast warnings:</strong>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
